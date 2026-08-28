# Acceptance coverage

Maps every row of [`references/testing-acceptance.md`](../references/testing-acceptance.md)
to the test(s) that cover it, or to a documented manual check where the stack
can't automate it. Run `npm test` (271 tests, 31 files) for the automated set.

Legend: **A** automated · **M** manual (with the mechanism that makes it checkable) · **N/A** Phase 2 / not in scope · **gap** not covered, see note.

---

## Independence

| Row | | Covering test |
|---|---|---|
| SIEM completes telemetry→alert with SOC absent | **A** | `mock/api.independence.test.ts` — "the detect path works" (tenant-northwind-markets: telemetry, enabled rules, and a fired alert from the seeded markets brute-force scenario, plus a coverage matrix) |
| SOC completes a full case lifecycle with SIEM absent | **A** | `mock/api.independence.test.ts` — "intake → case → agents → close, entirely on third-party envelopes" (tenant-summit-cu) |
| Assessment completes with SOC absent | **N/A** | Phase 2 — Assessment Assistant dormant, `has_assessment:false` for every tenant (`data/seed-integrity.test.ts`) |
| SOC triages a third-party-shaped alert via the envelope contract only | **A** | `lib/soc/intake.test.ts` — "does not branch on source.system — a native and third-party envelope get the same disposition"; independence test drives Summit CU's entirely-third-party stream |
| No product's screens block-render on the other's absence | **A** | `mock/api.independence.test.ts` — every SOAR endpoint on a SIEM-only tenant (and every SIEM endpoint on a SOC-only tenant) rejects with `entitlement_missing`, no hang/throw; `mock/api.sim-states.test.ts` proves timeouts surface as a state, not a crash. Visual confirmation: persona sweep (BUILD-NOTES → Hardening). |

## Detection and correlation

| Row | | Covering test |
|---|---|---|
| Every enabled rule went draft→…→enabled, human set `enabled` | **A** | `lib/detection/lifecycle.test.ts` (12 tests on `validateTransition`); `data/seed-integrity.test.ts` — every seeded enabled rule has a human `enabled_by` who is not the proposer |
| Regression reports evaluated / expected / observed / missed / unexpected / noise / health | **A** | `lib/detection/regression.test.ts` — asserts all eight fields, the healthy path, the missed-detection path, tenant scoping, and determinism |
| Rule version comparison and rollback function, exercised by a test | **A (partial)** | Rollback is modeled as `enabled → disabled → enabled` and is covered by `lifecycle.test.ts` ("allows disable → enable → retire"). A dedicated side-by-side **version diff** view was not in M2/M3 scope — **gap (feature, not a defect)**. |
| Every enabled rule carries a D3FEND mapping or explicit `unmapped` | **A** | `schemas/schemas.test.ts` (refine); `data/seed-integrity.test.ts` over the assembled corpus |
| Every enabled playbook step carries a D3FEND mapping or `unmapped` | **A** | `schemas/schemas.test.ts` (playbook step refine); `data/seed-integrity.test.ts` — every A2+ step in an enabled playbook |
| Query parser rejects eval / SQL / shell / unsafe regex — human **and** agent | **A** | `lib/query/parser.test.ts` (injection + bounds + ReDoS suite); `lib/soc/investigation.test.ts` — "the query is built from the safe field allowlist — never raw text" |
| Every `attack_techniques` entry resolves to ≥1 real `normalized_event` | **A** | `data/seed-integrity.test.ts` — "every contributing_event_ref on a native alert is a real normalized event"; the third-party envelopes are the only ones with opaque refs (asserted separately) |

## Contracts

| Row | | Covering test |
|---|---|---|
| Every cross-boundary event validates; malformed → quarantine, not drop/crash | **A** | `lib/soc/intake.test.ts` — "quarantines a malformed envelope instead of dropping it" |
| Duplicate idempotency/dedupe key is a no-op, not a duplicate write | **A** | `lib/soc/intake.test.ts` — "deduplicates by dedupe_key, first occurrence wins, keeps the repeat as a duplicate" |
| Unsupported / future schema version quarantined, not ignored | **A** | `lib/soc/intake.test.ts` — "rejects an unsupported schema version without throwing" |
| SOC→Assessment suggestion never changes Assessment without reviewer approval | **N/A** | Phase 2 |

## Agents and autonomy

| Row | | Covering test |
|---|---|---|
| Every agent stays within its tool allowlist (assert no other tool reachable) | **A (partial)** | The agents are deterministic functions with no tool-calling loop; the enforcement surface is the QA & Governance reviewer, covered by `lib/soc/qa-governance.test.ts` — "flags a tool call outside the agent's allowlist". The declared allowlists live in `data/agents.ts`. |
| No action request approved by its own requester — hard validation failure | **A** | `lib/soc/action-approval.test.ts` — "rejects when the requester tries to approve their own request"; `schemas/schemas.test.ts` — the refine rejects it too (double-enforced) |
| A4 always requires approval, even under a maximally permissive policy | **A** | `lib/soc/action-approval.test.ts` — "A4 ALWAYS needs approval, even if someone tries to pre-authorize it" |
| A3 requires approval unless policy pre-authorizes that exact type — both branches | **A** | `lib/soc/action-approval.test.ts` — "A3 needs approval unless the EXACT action type is L3 pre-authorized"; `lib/soc/response-planner.test.ts` — "reflects an L3 pre-authorization instead of escalating" |
| Escalation triggers hand off to a human queue | **A** | `lib/soc/investigation.test.ts` — "signals a hand-off when its confidence is below the threshold"; `lib/soc/qa-governance.test.ts` — "flags a low-confidence message that did not escalate" |
| Kill switches halt in-flight, not just new, actions | **A** | `lib/soc/executor.test.ts` — "halts when ANY kill switch is engaged — pending and in-flight both stop"; `mock/api.soc-response.test.ts` — "blocks plan / request / approve while engaged" |
| Action expiry expires an unexecuted approved action | **A** | `lib/soc/action-approval.test.ts` — "rejects an expired approval"; `lib/soc/executor.test.ts` — "refuses a non-approved or expired request" |
| Rule promotion: the agent can never enable | **A** | `lib/detection/lifecycle.test.ts` — "an agent can NEVER enable a rule — even from approved" |

## Case and evidence integrity

| Row | | Covering test |
|---|---|---|
| Every closed case carries a closure classification | **A** | `schemas/schemas.test.ts` (refine); `data/seed-integrity.test.ts` — every seeded closed case has `closed_at` + classification + `closed_by` |
| Evidence immutable once added; a correction is a new linked item | **A** | `mock/api.audit-evidence.test.ts` — "superseding an item leaves the original untouched and links the new one to it" |
| Chain-of-custody (who / what / when / content hash) on every item | **A** | `mock/api.audit-evidence.test.ts` (the API path always stamps `submitted_by` / `submitted_at` / `content_hash`); `data/seed-integrity.test.ts` — every seeded item carries who / when / a `sha256:` hash |

## Assessment scoring and review

**N/A** — Phase 2, dormant.

## Access, isolation, and audit

| Row | | Covering test |
|---|---|---|
| RBAC/ABAC: a role without approval permission cannot approve, full stop | **A** | `mock/rbac.test.ts`; `lib/soc/action-approval.test.ts` — "rejects an actor without action.approve" |
| Tenant isolation: no query or agent tool call returns another tenant's data | **A** | `lib/soc/intake.test.ts` ("only processes envelopes for the requested tenant"); `data/entity-risk.test.ts` ("scopes to a tenant"); `mock/api.soc-response.test.ts` ("fetchCaseOrchestration rejects an unknown / other-tenant case"); `data/seed-integrity.test.ts` — every seeded record's tenant_id is a known tenant; `mock/api.independence.test.ts` — a SIEM-only tenant's alerts are all its own |
| Every approval / execution / evidence / role change produces an audit event; audit not editable in place | **A** | `mock/api.audit-evidence.test.ts` — audit events for open/close/evidence-add/review/request/approve/execute/kill-switch; execution is attributed to `principal_type: "system"`; "the audit trail is append-only"; "exposes no update or delete entry point for audit events" |

## UI states

| Row | | Covering test |
|---|---|---|
| Loading / empty / malformed-input / timeout / partial / stale / degraded / access-denied / success reachable per data-bearing screen | **A + M** | `mock/api.sim-states.test.ts` pins that `timeout`, `server_error`, `slow`, `degraded_source` and `partial` each reach the data layer (driven from the **⌘K → Simulation** menu at runtime). `malformed` = `lib/query/parser.test.ts`. `access-denied` = `mock/rbac.test.ts` + the persona sweep. `empty` / `stale` / `success` are the default render paths, spot-checked screen-by-screen in the persona sweep and the theme QA pass. |

## Build hygiene

| Row | | |
|---|---|---|
| Lint + production build pass | **A** | `npm run lint`, `npm run build` — clean (excluding the in-flight tenant-policy feature branch, tracked separately) |
| No console errors on core flows | **M** | Verified on fresh browser tabs during the persona sweep and theme pass; the dev server's HMR WebSocket noise is an environment proxy artefact, not the app |
| Accessibility — contrast, keyboard nav, focus visibility on primary screens | **M (partial)** | Contrast: computed and verified in both themes during the theme re-skin (fg/bg 17:1, muted 6–8:1, button text 4–8:1). Focus rings: `:focus-visible` token in `globals.css`, menus/palette trap focus. Keyboard-nav of every primary screen — **gap, manual, not yet systematically walked**. |

## Data safety

| Row | | Covering test |
|---|---|---|
| No real credential / identity / IP / card data / production endpoint in any seed, fixture, or example | **A** | `data/data-safety.test.ts` — scans `src/data`, `examples/`, `schemas/` for routable IPs, non-`.example` emails, non-standards URLs, and secret-shaped literals; all clean |
| Every response action in seed/example data is dry-run | **A** | `data/data-safety.test.ts` — every seeded action request is `dry_run: true`; every seeded execution + verification note is marked "DRY RUN" |

---

## Open items

1. **Rule version-diff view** — not built (M2/M3 scope). Rollback exists as disable→re-enable and is tested. Low priority; a diff view is a nice-to-have for the detection-engineering walkthrough.
2. **Systematic keyboard-nav walk** of the primary screens (dashboard, case detail, agents/runs, approval queue) — the focus-management primitives are in place; a deliberate tab-through of each has not been recorded.
3. The **tenant-policy editing feature** currently in the working tree (`/policies` edit, `updateTenantPolicy`, `analyst_feedback.acceptance`) is a separate in-flight change with its own test (`mock/api.policy.test.ts`) and one lint error to clear before it lands.
