# Testing and Acceptance

Before calling any feature "done" in this skill's scope, it should have
coverage (automated where the stack allows, at minimum a documented manual
check otherwise) for the relevant items below. Not every feature touches
every row — use judgment, but don't skip a row that clearly applies.

## Independence

- SIEM starts, runs, and completes telemetry-to-alert with SOC entirely
  absent/disabled
- SOC starts, runs, and completes a full case lifecycle with SIEM entirely
  absent/disabled
- Assessment (Phase 2, once reactivated) starts, runs, and completes a full
  assessment with SOC entirely absent/disabled
- SOC ingests and triages an alert from a third-party-shaped source (not
  just a ZenC-shaped one) using only the alert-envelope contract
- No product's screens block-render on another product's unavailability
  (graceful degradation, not a hang or crash)

## Detection and correlation

- Every enabled correlation rule went through `draft → test → peer review →
  approved → enabled`, with a human (never the Detection Engineer Agent)
  as the principal who set `enabled`
- Regression test results report events evaluated, expected vs. observed
  matches, missed detections, false matches, noise indicators, and rule
  health for every tested rule
- Rule version comparison and rollback both function and are exercised by
  at least one test scenario
- Every enabled rule carries a D3FEND mapping or an explicit `unmapped`
  state — never a silently blank field
- Every step in an enabled playbook carries a D3FEND response mapping or an
  explicit `unmapped` state, mirroring the rule-side requirement
- The Log Explorer's query parser rejects an attempt to inject eval,
  arbitrary SQL, arbitrary shell, or an unsafe regex, with a clear error —
  this applies to both human-entered and agent-issued queries
- Every `attack_techniques` entry on a generated alert resolves to at least
  one real `normalized_event` in `contributing_event_refs` — a technique
  claim with no contributing events is a test failure, not a display
  nicety

## Contracts

- Every cross-boundary event validates against its schema and rejects a
  malformed one into quarantine rather than dropping or crashing
- Duplicate `idempotency_key` is a no-op, not a duplicate write
- An unsupported/future schema version is quarantined, not silently ignored
- SOC's suggestion path to Assessment never results in Assessment state
  changing without reviewer approval (test this by asserting the write
  layer, not just the UI)

## Agents and autonomy

- Every agent stays within its declared tool allowlist (test by asserting
  no other tool is reachable, not just that the happy path uses the right
  ones)
- No action request can be approved by its own requester — this must be a
  hard validation failure, not just a disabled button in the UI
- A4 action requests always require approval, even under a maximally
  permissive synthetic tenant policy
- A3 action requests require approval unless a synthetic policy explicitly
  pre-authorizes that exact action type — test both branches
- Escalation triggers (`agentic-architecture.md`) actually hand off to a
  human queue rather than silently proceeding at lower confidence
- Kill switches (global/partner/tenant) halt in-flight, not just new,
  actions in a test scenario
- Action expiry actually expires an unexecuted approved action after its
  window

## Case and evidence integrity

- Every closed case carries a closure classification from the defined
  taxonomy (no case can close without one)
- Evidence items are immutable once added; a "correction" creates a new
  linked item rather than mutating the original
- Chain-of-custody metadata (who/what added evidence, when, content hash)
  is present on every evidence item

## Assessment scoring and review (Phase 2 — once reactivated)

- Scoring is deterministic: same answers/evidence in, same score out, every
  run
- ZSIS renders with its indicative label in every surface it appears
  (screen, export, report) — test this as a content assertion, not just a
  visual check
- Unapproved evidence never counts toward score
- Reassessment comparison is read-only against the prior instance

## Access, isolation, and audit

- RBAC/ABAC enforcement: a role without approval permission cannot approve,
  full stop, regardless of UI state
- Tenant isolation: no query or agent tool call can return another tenant's
  data
- Every approval, execution, and evidence/role change produces an audit
  event, and audit events cannot be edited in place

## UI states

- Loading, empty, malformed-input, timeout, partial, stale, degraded,
  access-denied, and success states are all reachable and distinguishable
  for each data-bearing screen listed in `frontend-ux-spec.md`

## Build hygiene

Lint and a production build pass; no console errors on the core flows;
accessibility checks (contrast, keyboard nav, focus visibility) pass on the
primary screens (dashboard, case detail, agents/runs, assessment runner,
approval queue).

## Data safety checks (run these on any generated seed/example data too)

No sample, fixture, or seed anywhere in the build or in this skill's own
`examples/` directory contains a real credential, real customer/patient
identity, real IP address belonging to a real organization, card data, or a
real production endpoint. Every response action in seed/example data is
dry-run/simulation-only.
