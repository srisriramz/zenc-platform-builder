# Frontend / UX Spec

## Stack

Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui, TanStack
Query (simulated server state), TanStack Table, Zustand (only for: auth demo
session, active tenant, active product, UI preferences, guided-demo
controller — not for server-shaped data), Recharts, runtime validation
schemas matching the JSON Schemas in `schemas/`, deterministic seeded
fixtures. The demo runs without a real backend. Do not put secrets or
security evidence in localStorage; non-sensitive demo state may use
versioned, tenant-scoped localStorage keys.

## Required states for every data-bearing screen

A screen isn't done until it explicitly handles: loading, empty/no-results,
malformed input (e.g., a bad query), timeout, partial results, stale data,
degraded source (e.g., an alert source or Assessment link that's down),
access denied, and success. This applies across both products — a case list
with only a happy path and a spinner is incomplete.

## Global chrome

Command palette, global search, role switcher, tenant switcher, product
switcher, environment indicator, simulation indicator, kill-switch status.
These are shared-service concerns (`product-architecture.md`) surfaced
consistently in both products' shells.

## Non-removable demo notice

Every build in this skill's scope shows a non-removable (but style-adaptable
to a demo brand) notice: **"Interactive Demo with Mock Data."** This is a
safety/honesty requirement (`security-governance.md`), not a cosmetic
choice — don't let a "clean up the UI for the demo" request remove it.

## SIEM-specific UI notes

- Log Explorer surfaces the query-parser's rejection reason explicitly on a
  malformed query — never a silent empty result. A safe-query-parser error
  state is one of the required states on this screen (see `native-siem-spec.md`).
- Rule builder is structured/visual, never a raw-code editor — consistent
  with the no-eval/no-arbitrary-code constraint.
- Rule detail shows lifecycle state, version history with rollback, latest
  regression-test results (events evaluated/expected/observed/missed/
  unexpected/noise/execution time/rule health), and its D3FEND mapping (or
  an explicit "unmapped" badge — never a blank field).
- The ATT&CK × D3FEND coverage matrix is a first-class screen
  (`/coverage`), not a report appendix — per-technique: detected (yes/no +
  which rule), responded (yes/no + which playbook step).

## SOC-specific UI notes

- Case detail needs: timeline, evidence panel (with chain-of-custody
  metadata visible), tasks/SLA clock, linked alerts, an **ATT&CK technique
  breakdown panel** (click a technique → see the contributing normalized
  events that justify it, per `soc-spec.md`), and an agents/runs panel
  showing agent-message trail for that case.
- `/agents/runs/[id]` renders an agent-run per the explainability
  requirements in `agentic-architecture.md` — rationale, evidence,
  contradictory evidence, versions, and (once present) analyst feedback and
  final human decision. This is a core screen, not an admin afterthought.
- Approval queue must visually distinguish action class (A2/A3/A4) and must
  never let a user approve a request where `requested_by == current_user`.
- Kill-switch status and any active suppression must be visible from the
  SOC dashboard, not buried in settings.
- SOC reporting surfaces the pipeline-latency breakdown and detection/
  defensive coverage percentages sourced from SIEM — don't recompute them
  independently in the SOC layer.

## Assessment-specific UI notes (Phase 2 — build only on explicit request)

- ZSIS must render with an explicit "indicative" label wherever it
  appears, including in exported reports — this is enforced content, not a
  styling nicety (`assessment-spec.md`).
- Maturity score and evidence-confidence score render as two distinct
  values, never merged into one number or one color scale.
- Reviewer queue (evidence, and — if SOC is connected — SOC-suggested
  findings) uses one consistent approve/reject pattern regardless of the
  submission's origin.

## Accessibility and resilience

Accessible contrast, keyboard navigation, visible focus states, and
reduced-motion support are required, not optional polish. Responsive layout
across the routes each product defines (`native-siem-spec.md`,
`soc-spec.md`, and `assessment-spec.md` if Phase 2 is reactivated).

## Routes

See `native-siem-spec.md` for SIEM routes and `soc-spec.md` for SOC routes.
Shared-shell routes (login, tenant/user/entitlement management, audit,
policies) live under the shared-services scope in
`product-architecture.md`; keep them minimal for this skill's scope (e.g.
`/login`, `/tenants`, `/users`, `/entitlements`, `/audit`, `/policies`) —
don't build the full white-label/branding routes described as out of scope.
