# ZenC Platform — build notes

Frontend-only demo built from the `zenc-platform-builder` skill. No backend,
no real credentials, seeded mock data throughout. Build order and checkpoints
follow `templates/claude-code-bootstrap.md`.

## Milestone status

| Milestone | Scope | State |
|---|---|---|
| **M0** | Scaffold + platform shell | ✅ done |
| **M1** | SIEM foundation: telemetry, normalization, Log Explorer | ✅ done |
| **M2** | Correlation engine + ATT&CK-mapped rules → alert-envelope | ✅ done |
| **M3** | Detection engineering workflow — Detection Engineer Agent, rule lifecycle, /agents | ✅ done |
| **M4a** | SOAR intake & triage — envelope intake, dedup, grouping, Triage Agent, cases | ✅ done |
| **M4b** | SOAR investigation — evidence + custody, timeline, tasks/SLA, Enrichment/Investigation/Hunt/Advisor agents | ✅ done |
| **M4c** | SOAR response — playbooks, Response Planner, approval queue, dry-run executor, kill switches, Supervisor + QA/Governance | ✅ done |
| **M5** | ATT&CK × D3FEND coverage matrix (`/coverage`) + SOC reporting (`/reporting`, Reporting Agent) + role-aware analytics presets | ✅ done |
| **Hardening** | Agent-safety + security review passes, guided-demo controller, persona sweep, nav/palette audit | ✅ done |

Phase 2 (ZenC Assessment) stays dormant — not built.

## Stack

Next.js 16 (App Router, Turbopack), strict TypeScript, Tailwind v4,
hand-rolled shadcn/ui-style primitives (`components/ui/`), TanStack Query for
simulated server state, Zustand for the allowed slices only (session, tenant,
product, theme, sim, sidebar), Recharts, Zod runtime schemas mirroring
`../schemas/`.

## Design system

Dark-first enterprise SOC surface, fully theme-aware (dark / light / system).
- Tokens in `app/globals.css` — one `:root` (light) definition per color,
  `.dark` re-points the same names. shadcn-compatible names + a severity ramp
  (`--sev-*`), elevation (`--card` / `--card-elevated` / `--popover`), and a
  shadow scale keyed to a per-theme shadow color.
- Primitives: `Card` (hairline top-highlight + optional `interactive` lift),
  `Badge`, `Button`, `Table` (sticky headers via `<TableHeader sticky>`,
  scroll container), `Tabs`, `Menu`/`Dialog`/`Sheet` (scale-in / slide-in,
  focus trap, Esc + backdrop), `Timeline`, `StatTile` + `StatGrid`.
- Motion: `.anim-rise` / `.anim-fade` / `.anim-scale-in` / `.anim-slide-in-left`
  + `shimmer` skeletons, all disabled under `prefers-reduced-motion`. Page
  content re-animates on route change (keyed on pathname).
- Charts follow the `dataviz` skill: single-series histogram → no legend,
  4px rounded data-ends on the baseline, recessive grid, per-bar hover
  tooltip, validated bar-vs-surface contrast. Severity is a status ramp that
  always ships with a text label + dot, never color alone.
- Chrome: glass sticky top bar, command palette (⌘K) with grouped results,
  responsive left nav that collapses into a `Sheet` drawer below `lg`,
  skip-to-content link, visible focus rings, keyboard nav in menus/palette.

The shadcn CLI in this environment is pre-release and crashes on `init`, so
the primitives are written directly against the same token names — same
component API, no dependency on the CLI.

## M0 — what's in

- **App shell**: top bar with product switcher, command palette (⌘K), tenant
  switcher, role display, theme toggle, environment + simulation indicators,
  and a **kill-switch status** badge (visible in chrome, not settings).
- **Non-removable "Interactive Demo with Mock Data" notice** on every screen
  (`components/shell/demo-notice.tsx`) — do not remove.
- **Shared services (mock)**: Identity/RBAC-ABAC (`mock/rbac.ts`), tenants +
  partners, per-tenant entitlements (`has_siem`/`has_soc`/`has_assessment`),
  Policy Engine with locked non-negotiable fields, append-only Audit, Feature
  flags via the sim control, Observability via connector health.
- **RBAC**: 9 roles (analyst, senior analyst, approver, SOC manager, CISO,
  admin, reviewer, auditor, super admin); permissions are checked in the mock
  API, not just hidden in the UI. `rule.enable` / `action.approve` are
  separate permissions; agents are never modelled as holding them.
  `super_admin` is a documented break-glass exception — it holds every
  permission (including combinations no operational role may bundle) and
  bypasses tenant product entitlements, but still cannot self-approve its own
  action requests since that check is identity-based, not permission-based.
- **Seeded ATT&CK + D3FEND libraries** as static data
  (`data/frameworks/`) — 24 techniques / 11 tactics, 16 D3FEND techniques.
  The product maps to them; it never edits them.
- **Simulation control**: normal / slow / timeout / server error / degraded
  source / partial results — every required UI state is reachable on demand.
- **Routes**: all SIEM + SOC + platform routes exist. SOC and later-SIEM
  screens render an honest roadmap stub that still enforces the real
  entitlement + RBAC gates.

## M1 — what's in

- **Telemetry**: 6 synthetic source families for Northwind Bank, 4 for
  Northwind Markets, 0 for Summit Credit Union (SOAR-only tenant — proves SIEM
  can be absent). Health states cover healthy / degraded / stale / unknown.
- **Stream vs. sample.** The demo separates two things: the *stream* (real-rate
  ingestion — millions of events / GB per day, summarised as 24h counters on
  Telemetry and shown live on `/ingestion`, all from `data/ingestion-profile.ts`),
  and the *sample* — a deterministic ~72h slice materialised by
  `data/events.ts` (~2,400 events, linked **raw + normalized** via
  `raw_payload_ref`, ~2% **quarantined on arrival**) that backs the Log
  Explorer, the quarantine review queue, and (in M2) correlation. Every screen
  labels which one it's showing.
- **Log Explorer** (`app/(app)/log-explorer`):
  - **Safe bounded query parser** (`lib/query/`): tokenizer + recursive
    descent → typed AST → pure evaluator. **Never** `eval`, `new Function`,
    SQL, shell, or a user RegExp (wildcards compile to a linear two-pointer
    matcher). Field allowlist, operator allowlist per field, hard bounds
    (query length, condition count, group depth, wildcard count, result rows,
    90-day time range). Injection characters (`; $ { } \` -- /* */`) are
    rejected with a specific, positioned error.
  - Free-text + structured search over the same query; visual query builder
    (no code editor); time histogram; field statistics with click-to-filter;
    raw/normalized side-by-side with parser + schema version; event lineage
    and related-events; saved searches + history (versioned, tenant-scoped
    localStorage); tenant-safe CSV/JSON export.
  - **Required states** all implemented: loading, no-results, malformed
    query, timeout, server error, partial results, stale data, degraded
    source, access denied, success.
- **SIEM Dashboard** and **Telemetry & Connectors** screens with connector
  health, ingestion lag, 24h volume, schema-validation failures, and the
  quarantine queue.
## M3 — what's in

- **Detection Engineer Agent** — the first agent. L2 autonomy, tool allowlist
  `rule-read` / `rule-test` (synthetic corpus only) / `rule-draft` (draft
  state only). It proposes and tests; it **cannot** enable a rule.
- **`lib/detection/lifecycle.ts`** — the single enforcement point.
  `validateTransition(rule, to, actor)`: an agent principal can only
  draft → test → submit-for-review; the transition to `enabled` needs a
  human with `rule.enable` who is **neither the proposer nor the approver**
  (no self-approval, segregation of duties). The API calls this; the UI only
  reflects what it returns (`allowed_transitions` on the rule view). 12
  tests pin the enforcement.
- **Regression** (`lib/detection/regression.ts`) — re-runs the engine for one
  rule against the ~72h sample and reports evaluated / expected / observed /
  missed / unexpected / noise / time / health, with an honest verdict.
- **Mutable session state** (`mock/session-store.ts`) — rule transitions,
  agent-proposed drafts, agent runs, analyst feedback, and a session audit
  log, layered over the immutable seed; resets on reload (the demo's reset).
- **Agent contract** — Zod mirrors for `agent-message` / `agent-run`;
  `agent-run` gains an optional `subject_type` (`case` | `detection_rule`)
  so a non-case agent run is representable (JSON schema bumped too). Audit
  gains `rule_state_changed` / `correlation_rule`.
- **Screens:**
  - `/detections` — "Propose a rule" (structured builder, no code field),
    "Ask the agent" (proposes a rule for an uncovered ATT&CK technique →
    creates a run + a `peer_review` draft), and per-rule workflow actions
    driven by `allowed_transitions`.
  - `/agents` — the 12-agent roster (autonomy, exhaustive tool allowlist,
    never-does). Only the Detection Engineer Agent is `live`.
  - `/agents/runs` + `/agents/runs/[id]` — the explainability screen:
    rationale, supporting vs contradictory evidence, tool calls (flagged if
    outside the allowlist), escalation reason, policy outcome,
    prompt/tool/rule versions, human touchpoints, and a structured
    analyst-feedback form.
- 12 lifecycle-enforcement tests + v1.2 schema tests. **99 tests total.**

## M4a — what's in

- **Intake boundary** (`lib/soc/intake.ts`) — every inbound alert-envelope,
  native or third-party, passes through `runIntake`. Version negotiation
  first (supported: `1.1` + `1.2`), then full schema validation. A malformed
  or unsupported envelope is **quarantined**, a repeat `dedupe_key` is kept
  as a **duplicate** — nothing is ever dropped. The source health is tagged;
  no other branch on `source.system`.
- **Case grouping** (`lib/soc/grouping.ts`) — deterministic union-find. Two
  accepted alerts group when they are within 12h AND share an entity AND the
  link is a strong pivot (shared ATT&CK technique, or a shared user/host).
  Order-independent; a lone alert is still a candidate.
- **Triage Agent** (`lib/soc/triage.ts`) — a deterministic heuristic stands
  in for the model, but the output is a real agent message (claim,
  confidence, supporting + contradictory evidence) carrying an
  **open-vs-suppress recommendation the agent cannot act on**. A human
  confirms at L2 (`confirmCaseOpen` / `suppressCandidate`, both require
  `case.work`). Suppression needs a documented reason.
- **Third-party fixtures** (`data/third-party-alerts.ts`) — seeded
  `third-party-edr` / `-cloud-sec` / `-email-sec` / `-identity` envelopes for
  Summit Credit Union (SOC-only, no SIEM — its whole stream is third-party)
  and Northwind Bank (alongside native). Their technique claims cite the
  source's own opaque event ids; the case ATT&CK breakdown shows those as
  "source-provided" (not resolvable in the Log Explorer), while native refs
  stay clickable through to it.
- **Cases** — `schemas/case.ts` Zod mirror with `.refine` guards (a closed
  case needs `closed_at` + a classification with `closed_by`; a suppressed
  closure needs a reason). Additive `triaged_at` for the pipeline-latency
  SOC-ack stage. `closeCase` re-validates the whole case against the contract.
  Case status flow `new → triaged → investigating → contained → recovering →
  closed → reopened` enforced server-side (`CASE_TRANSITIONS`); closing is a
  separate path because the classification is required.
- **Seeded state** (`data/soc-seed.ts`) — runs the full intake → grouping →
  triage path once at store assembly. A few candidates start as Cases (mix of
  investigating / triaged / closed-TP / closed-FP), the rest sit pending in
  the queue. Every candidate gets a Triage Agent run visible on `/agents/runs`.
- **Mutable session state** — `openedCases`, `caseOverrides`, and
  `intakeDecisions` layered over the seed. Audit gains `case_created` /
  `case_status_changed` / `alert_suppressed` and target type `alert` (JSON +
  Zod).
- **Screens:**
  - `/alerts` — intake queue: pending candidates with the Triage Agent
    recommendation, an Actioned list, and a "Not accepted" section showing
    quarantine reasons + duplicates. Confirm-open / suppress inline (L2).
  - `/cases` + `/cases/[id]` — case list with filters; detail with linked
    alerts (origin badge, no logic branch), the ATT&CK technique breakdown
    (traceable vs source-provided), the Triage Agent advisory, linked agent
    runs, a workflow rail (status transitions, owner, close-with-
    classification), and a pipeline-latency panel. Investigation / evidence /
    timeline are stubbed for M4b.
  - `/soc-dashboard` — real dashboard: pending triage, open cases, SLA
    breach, quarantine; MTTD / MTTA / MTTR; open-by-status, closure mix,
    recent cases. All tiles drill through.
- 20 SOAR tests (intake dedup/quarantine/no-source-branch, deterministic
  grouping, triage open-vs-suppress). **117 tests total.**

## M4b — what's in

- **Evidence + chain of custody** — `schemas/evidence.ts` (Zod mirror of the
  Assessment-shaped `evidence.schema.json`) with `.refine` guards: approved
  evidence needs a reviewer + timestamp; SOC-origin evidence must link to a
  case. Every item is immutable — a correction is a NEW item with a
  `supersedes_evidence_id` link, never an edit. Each carries a `content_hash`
  tamper marker and records who/what submitted it (human or named agent).
- **Evidence review** (`/evidence`) — one approve/reject queue. `evidence.review`
  is held by the `reviewer` role (Lena) and — as the same second-set-of-eyes
  function — the `approver` role (Dana, present in every SOC tenant). No role
  bundles `case.work` + `evidence.review`, so the reviewer is always a second
  person; the API also blocks reviewing your own submission explicitly.
- **Tasks + SLA** — new `schemas/task.schema.json` + Zod mirror (a done task
  needs `completed_at`/`completed_by`). Assignable, due-clocked; overdue tasks
  roll into the case SLA panel. Agent-proposed tasks are labelled and still
  worked/closed by a human.
- **Case timeline** — `lib/soc/timeline.ts` `buildCaseTimeline(...)` — a pure
  derived view over the case's alerts, evidence, tasks, agent runs, and status
  changes. Nothing stored.
- **Four investigation-phase agents**, all deterministic heuristics shaped as
  real agent messages:
  - **Enrichment Agent** (L1, `lib/soc/enrichment.ts`) — asset registry
    (`data/assets.ts`), identity directory, deterministic TI reputation,
    prior-sightings counts. Recomputed live; never persisted as evidence,
    never touches case status.
  - **Investigation Agent** (L1/L2, `lib/soc/investigation.ts`) — bounded,
    source-cited queries via the M1 safe parser (`≤24h`, `≤5000` events,
    tenant-scoped). Findings become `submitted` evidence citing the exact
    events they rest on.
  - **Hunt Agent** (L1, `lib/soc/hunt.ts` + `/hunt`) — analyst-initiated
    bounded query (`≤7d`). Never auto-creates a case — the analyst selects
    events and opens one.
  - **Digital Advisor Agent** (L1, `lib/soc/advisor.ts`) — answers "what next"
    from a seeded lessons base (`data/soc-knowledge.ts`) + the case's
    *approved* evidence only. Every output carries the advisory-only / dry-run
    caveats.
- **On-demand** — the case detail page can re-run any of enrichment /
  investigation / advisor; each records a fresh agent run.
- **Screens** — `/cases/[id]` gains Timeline / Evidence / Tasks / Context
  (enrichment + advisor) / Agents tabs plus a live task-SLA rollup; `/evidence`
  and `/hunt` are new; `/soc-dashboard` gains evidence-pending-review,
  tasks-overdue, and analyst-workload.
- Audit gains `task_created` / `task_updated` and target types `task` (+
  `alert` from M4a). 27 new SOAR tests (enrichment, investigation, advisor,
  hunt bounds, timeline). **144 tests total.**

## M4c — what's in

- **Playbooks** — `schemas/playbook.ts` (Zod); `lib/soc/playbook-lifecycle.ts`
  is the single enforcement point, the response-side mirror of the rule
  lifecycle: the Response Planner is confined to draft→test→peer_review;
  `enabled` needs a human who is neither the proposer nor the reviewer who
  approved it. 5 seeded playbooks per SOC tenant (contain endpoint,
  compromised account, block C2, phishing, and an agent-proposed **A4
  bulk-disable stuck at peer_review**). Every A2+ step carries a D3FEND
  response mapping or an explicit `unmapped` marker.
- **Response Planner Agent** (L2, `lib/soc/response-planner.ts`) —
  deterministic. Matches the case's ATT&CK techniques to an enabled playbook,
  resolves each step's target from the case entities, labels every step's
  action class + approval requirement, and escalates every A3+ step to the
  approval queue. Never enables a playbook, never executes.
- **Action requests + approval queue** — `schemas/action-request.ts` with the
  invariants as `.refine`s AND re-checked in `lib/soc/action-approval.ts`:
  **requester ≠ approver** (no self-approval), `approved_by` must be human,
  **A4 always needs a human approver regardless of policy**, an A3 skips
  approval only if the tenant policy names that exact `action_type` (L3) and
  then must cite `policy_basis`. `/approvals` shows A2/A3/A4 with escalating
  colour; an approver who is the requester (or, for A4, the playbook author)
  is blocked with the reason shown. Approved requests carry `expires_at` (4h)
  and read back as `expired` once past it.
- **Deterministic Response Executor** (`lib/soc/executor.ts`) — NOT an agent.
  Only runs an `approved`, non-expired request: precondition re-check → 
  **kill-switch halt** (global / partner / tenant — each stops pending AND
  in-flight, so a multi-step playbook stops between steps) → idempotent
  dry-run (re-execute = no-op returning the same result) → verification
  record → rollback marker (reversible up front; irreversible flagged
  before). Non-removable "DRY RUN" marker on every executed action.
  `/actions` is the execution / verification / rollback log.
- **Kill switches — live** — `toggleKillSwitch` (`admin.policy`; engaging
  needs a documented reason), session overlay, audited. `/policies` toggles;
  the executor reads the merged state.
- **Supervisor + QA & Governance** (the last two of the 12, both read-only).
  Supervisor summarises a case's agent routing and checks the invariants (no
  agent approved/executed; no self-approval; every A3+ has a human approver
  or policy basis). QA & Governance runs a schema / escalation / tool-allowlist
  / evidence / handoff / outcome-consistency check on every agent run,
  shown as pass/flag on `/agents/runs/[id]`.
- **`evidence.review` → approver** so every SOC tenant has a reviewer; no
  role bundles `case.work` + `evidence.review` (test-pinned).
- **Screens** — `/playbooks`, `/actions` new; `/approvals` real;
  `/cases/[id]` Response tab (Supervisor summary + plan + per-step request +
  execute); `/policies` kill switches toggle; `/agents` marks Response
  Planner / Supervisor / QA & Governance **live** (at this point only the
  Reporting Agent — landed in M5 — and the Phase 2 Assessment Assistant
  were still dormant).
- Audit gains `action_requested` / `action_verified` / `action_expired`. 34
  new SOAR tests (playbook lifecycle, approval, executor incl. kill-switch
  halt + idempotency + rollback, planner, QA verdicts, schema invariants). **184 tests.**

## M5 — what's in

- **ATT&CK × D3FEND coverage matrix** (`lib/coverage/matrix.ts`, `/coverage`)
  — per-technique staging along an honest pipeline: `no_telemetry →
  telemetry → activity → detected → correlated`. A technique only reaches
  `detected` if an **enabled** rule targets it, `correlated` only if an
  alert actually fired. The response side is a separate axis: covered only
  by an **enabled** playbook with a D3FEND-mapped step for that technique.
  Derived KPIs — detection coverage % and defensive (response) coverage %
  — and a per-tactic heat strip. SIEM-gated; the response column shows
  "—" for a SIEM-only tenant. `store.frameworks` gains `attackVersion` /
  `d3fendVersion`.
- **SOC reporting** (`lib/soc/reporting.ts`, `/reporting`) — `buildSocReport`
  rolls up the M4 pipeline: MTTD / MTTA / MTTR, a 5-stage pipeline-latency
  breakdown (collection → SIEM detection → handoff → SOC ack → resolve),
  alert-to-case conversion, closure mix, SLA compliance, agent-assisted
  ratio, top ATT&CK techniques, and the coverage KPIs when the tenant has
  SIEM. Native stages show "—" for a SOC-only tenant (no SIEM to measure).
- **Reporting Agent** — the 11th live agent. `draftReportNarrative`
  composes a deterministic narrative from the KPI aggregate; it is always
  a **draft** and always closes "External-facing copy requires human
  review and sign-off." `runReportingAgent` records a `run-report-*` run.
- **Analytics presets now real** (`components/analytics/`) — the **SOC
  Manager** view (queue/backlog, analyst workload, closure mix,
  detection-engineering throughput by lifecycle state, agent acceptance)
  and the **Executive / CISO** view (detection + defensive coverage %,
  MTTD→MTTR, open critical incidents, pipeline latency, top adversary
  techniques, SLA, response success, Reporting Agent draft) replace their
  stubs. Each recomposes the same SIEM/SOAR KPIs at a higher altitude and
  degrades — "—" / "needs ZenC SIEM" — when a product is absent for the
  tenant. `top_techniques` was added to `SocReport` so it works for every
  SOC tenant regardless of SIEM entitlement.
- `/agents` now marks eleven of the twelve **live**; only the Assessment
  Assistant (Phase 2) is dormant.
- New tests: coverage matrix staging + KPIs, `buildSocReport` latency /
  conversion / SLA / technique tally, `draftReportNarrative` disclaimer.

## Hardening — what's in

- **Agent-safety review pass** — 6 findings fixed, one commit each:
  runtime-produced agent messages/runs are now schema-validated at
  creation (not just at seed time); the Investigation Agent escalates to a
  human below 0.4 confidence instead of completing silently; the kill
  switch blocks `planCaseResponse` / `requestAction` / `approveAction`,
  not only execution; seeded cases/evidence/tasks/playbooks/action-requests
  are contract-validated at store assembly; stale pending approvals are
  flagged after 48h.
- **Security review pass** — 4 findings fixed: `fetchKillSwitches` and
  `recordAnalystFeedback` permission gates tightened; evidence-immutability
  / tamper-marker copy made explicit; `fetchCaseOrchestration` rejects a
  cross-tenant case id.
- **Guided-demo controller** (`/demo`, `lib/demo/`, `components/demo/`) —
  a docked step controller over the real screens, driven by a non-persisted
  `guidedDemo` session slice. Two scoped walkthroughs: a 12-minute
  technical run that opens a case from intake, runs the enrichment and
  investigation agents, plans + requests an A3 response, **approves it as
  a different principal**, executes the dry-run and closes the case; and a
  read-only 5-minute executive run. Autoplay, kiosk mode and the other
  spec walkthroughs are follow-on work that reuses the controller.
- **Persona sweep** — every screen loaded as each of the 9 personas
  (analyst, senior analyst, approver, SOC manager, CISO, admin, reviewer,
  auditor, super admin) across all three tenant types; no crashes,
  access-denied and entitlement-missing states correct.
- **Nav / palette audit** — every route present and correctly grouped in
  the command palette; the shipped-milestone badge/scaffolding removed
  from the navigation layer.

## M2 — what's in

- **Correlation engine** (`lib/correlation/`) — deterministic, LLM-free. Rule
  types: single-event, threshold (sliding window, group-by), sequence
  (ordered, per-step `min_count`, entity-joined), entity-join. Matching goes
  through a small typed `EventMatch` spec against *normalized* events only —
  no eval / SQL / shell / user-RegExp; wildcards reuse the Log Explorer's
  linear glob matcher.
- **8 seeded rules** (`data/correlation-rules.ts`) across the lifecycle —
  6 enabled (each with a human `enabled_by` + D3FEND mapping + seeded
  regression results + history), 1 `peer_review` (proposed by the Detection
  Engineer Agent, **cannot fire — a human must enable it**), 1 `disabled`.
- **Deterministic attack scenarios** planted in the event generator
  (`injectAttackScenarios`) so threshold/sequence rules have real bursts to
  fire on — a password spray + success, an external port scan, an SSH
  brute-then-accept. ~26 alerts over the 72h sample.
- **Real `alert-envelope` v1.2 objects** — `schema_version` is now
  `1.1 | 1.2`; 1.2 adds optional `correlated_at`, `confidence`, `sector_tags`
  (additive, both JSON + Zod schemas bumped). Every `attack_techniques`
  entry cites the specific contributing normalized-event IDs (SKILL.md #10).
- **`/correlation`** — alert stream + detail with the clickable ATT&CK
  technique breakdown (technique → contributing events → Log Explorer),
  detection latency shown as the MTTD pipeline stage.
- **`/detections`** — rule catalog + detail: structured logic rendered
  readably, ATT&CK/D3FEND mappings, regression results, lifecycle rail +
  history. The authoring workflow (agent proposal, live regression) is M3.
- **Analytics → Detection Analytics** now shows detection activity (alerts
  by severity / by rule) and **MTTD** (mean occurred→correlated latency).
- 5 engine tests (rule-type semantics, envelope validity, contributing-event
  tracing, determinism) + v1.2 schema tests.

## M1 — what's in

- **Entities at Risk** (`/entities`) — the seeded, *indicative* UEBA
  stand-in. Per-user/host risk score derived transparently from signal
  *ratios* in the sample (not ML, not baselining — that stays Phase 1.5);
  every signal drills to its contributing events. Risk badges also appear on
  entities in the Log Explorer.
- **Analytics** (`/analytics`) — a role-aware reporting layer (a contract
  consumer, not a cross-product god-view) with three presets: **Detection
  Analytics** (SIEM — volume trend, connector reliability, telemetry-family
  coverage staging, quarantine causes, event-type mix, entity-risk
  distribution), **SOC Manager**, and **Executive/CISO** (all three real
  as of M5; each degrades to whatever the tenant is entitled to). Default
  preset follows the viewer's role. New roles `ciso` + `soc_manager`
  (read-only, `reporting.view` + `audit.view`) with matching demo personas.
- **Interactive drill-down** — dashboards are URL-param driven: stat tiles,
  chart marks, table rows, legend items, and degraded-source names all link
  into the filtered operational screens; the Log Explorer hydrates a query
  from the URL and auto-runs; histogram bars are click-to-zoom.
- **Traffic & Ingestion** (`/ingestion`) — a *simulated-live* throughput
  dashboard: rolling events/sec and bandwidth area charts, per-source stream
  table with 90-second sparklines, bandwidth-by-family bars, an ingestion-
  health donut, and 24h projections. Driven by a pure deterministic sampler
  (`lib/live-feed.ts`) advanced by a timer (`hooks/use-live-ingestion.ts`),
  pausable, honours `prefers-reduced-motion` (slower tick). Steady-state
  rates come from `data/ingestion-profile.ts` (family rate × `volume_weight`);
  this view models the *rate*, the Log Explorer holds the materialised sample.

## Checkpoint notes (against the bootstrap template)

1. Nothing in SIEM depends on SOC being present. `tenant-summit-cu` has
   `has_siem:false` and every SIEM screen correctly shows "not entitled".
2. Query + rule-authoring surfaces are structured/bounded — verified by the
   parser rejecting `event_type = "foo" OR $(rm -rf /)` and
   `event_type:'; DROP TABLE events;--` with a clear reason.
3. `alert-envelope` / `correlation-rule` Zod schemas are defined (with the
   human-only-`enabled` and no-empty-`contributing_event_refs` refinements)
   ahead of M2/M3 so producers share one shape.
4. Detection coverage (M5) is staged along a pipeline, never a binary
   covered/not-covered flag — `no_telemetry → telemetry → activity →
   detected → correlated`, with `detected` gated on an enabled rule.

## Tests

Vitest, pure-function coverage on the load-bearing pieces (224 tests, 25 files):

- `src/lib/query/parser.test.ts` — the safe query parser: valid grammar,
  injection/code rejection (`;`, `$(…)`, backticks, `--`, `/* */`, `\x`),
  allowlist errors, every bound (length, condition count, group depth,
  wildcard stars), and the linear glob matcher's ReDoS-immunity.
- `src/lib/query/evaluate.test.ts` — operator semantics, boolean composition,
  `source.family` resolution, time-window filtering, limit/truncation,
  time-range caps.
- `src/mock/rbac.test.ts` — role → permission mapping, `assertCan` /
  `assertEntitlement` failure codes, separation of duties (no operational
  role holds both `rule.propose` and `rule.enable`), auditor is read-only,
  and `super_admin`'s documented break-glass exception (holds the
  conflicting pairs, bypasses entitlements, still cannot self-approve).
- `src/lib/soc/reporting.test.ts`, `src/lib/coverage/matrix.test.ts` — the
  M5 roll-ups: pipeline-latency stages, alert-to-case conversion, SLA
  compliance, technique tally, the not-published disclaimer; coverage
  staging and the derived detection / response coverage %.
- `src/lib/demo/scripts.test.ts` — each guided-demo step's persona holds a
  role in the script tenant and the permission its route needs; the
  technical run approves as a different principal than it requests.
- `src/schemas/schemas.test.ts` — every Zod schema accepts its
  `examples/sample-*.json` fixture and rejects a broken one; the
  non-negotiable refinements (no empty `contributing_event_refs`, enabled
  rule needs D3FEND + `enabled_by`, quarantine needs a reason).
- `src/lib/correlation/engine.test.ts`, `src/lib/detection/lifecycle.test.ts`
  — deterministic correlation firing per rule type; rule-lifecycle
  enforcement (agent confined to draft→peer_review, no self-approval,
  segregation of duties).
- `src/lib/soc/{intake,grouping,triage}.test.ts` — envelope quarantine vs
  drop, dedup by key, identical disposition for native and third-party
  (no `source.system` branch); deterministic order-independent grouping;
  triage never suppresses a corroborated candidate.

## Running

```bash
cd app
npm install
npm run dev       # http://localhost:3000
npm run build     # production build — passes clean
npm run lint      # ESLint — passes clean
npm test          # Vitest — 224 tests, passes clean
```
