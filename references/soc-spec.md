# ZenC SOC Spec

ZenC SOC must run completely without ZenC Assessment, and must accept alerts
from ZenC SIEM or any third-party SIEM, EDR/XDR, NDR, cloud
security, identity security, or email security platform through one
contract. ZenC SIEM is the reference producer of that contract, not a
privileged one — SOC treats a native alert identically to a third-party one.
For the agent layer, autonomy levels, and action-class rules, see
`references/agentic-architecture.md` — this file covers the product/data
layer the agents operate on.

## Alert intake

Every inbound alert, regardless of source, is normalized into the
**alert-envelope** shape (`schemas/alert-envelope.schema.json`) at the
boundary. Nothing downstream of intake should special-case a source system —
triage, correlation-to-case, and agents all operate on the envelope.

Required intake behavior:
- validate envelope schema version; quarantine (don't drop) anything that
  fails validation, with a visible quarantine queue
- deduplicate on source + source alert ID + time window
- tag connector/source health so degraded/stale sources are visibly labeled
  in triage, not silently trusted
- preserve the original raw payload alongside the normalized envelope for
  evidence/lineage purposes

## Triage

Triage assigns initial severity/priority and either auto-groups an alert
into an existing case (same entity + overlapping time window + related
technique) or queues it for case creation. Triage is agent-assisted
(Triage Agent, see agentic-architecture.md) but the **assignment of a case
owner and the decision to open vs. suppress** a case remain human actions at
default autonomy (L2) — the agent recommends, a human confirms, until a
tenant has explicitly raised that specific action to L3.

## Case management

A case has: entities involved, linked alerts, timeline, evidence, tasks,
SLA clock, assigned owner, status, an **ATT&CK technique breakdown**, and —
on close — a **closure classification** (below). Case status:
`new → triaged → investigating → contained → recovering → closed →
reopened(optional)`.

### ATT&CK technique breakdown (required panel, not a report afterthought)

Every case surfaces the union of `attack_techniques` from its linked
alerts, and — critically — each technique is clickable through to the
specific contributing `normalized_event` IDs that justify it (see
`native-siem-spec.md` and `schemas/alert-envelope.schema.json`). This must
never render as a static tag list; if a technique can't be traced to real
contributing events, it shouldn't be shown as detected on that case.

### Case closure taxonomy (required field, not optional)

Every closed case must carry one of:
- `true_positive` — confirmed malicious/policy-violating activity
- `false_positive` — alert did not represent the activity it claimed
- `benign_true_positive` — activity occurred as detected but was authorized/expected
- `duplicate` — subsumed by another case
- `suppressed` — intentionally not investigated (documented reason required)

This taxonomy feeds the analyst-feedback loop and detection-tuning signal
described in `agentic-architecture.md` — it is not just a report field.

## Evidence management and chain of custody

Evidence attached to a case (raw logs, screenshots, exported artifacts,
agent-generated summaries) requires:
- who/what added it (human user or named agent) and when
- immutability once added — corrections are new evidence items with a
  supersedes-link, never in-place edits
- a tamper-evidence marker (content hash) so later review can detect if a
  stored artifact was altered outside the app

This mirrors the evidence-confidence rigor Assessment applies to its own
evidence, but SOC's version emphasizes custody/immutability because case
evidence can feed real response decisions.

## Playbooks (lifecycle mirrors detection-rule rigor)

A playbook is a named, versioned sequence of steps mapping to action
requests (see `schemas/playbook.schema.json`). Lifecycle:

`draft → test (dry-run against synthetic case) → peer review → approved →
enabled → disabled → retired`

- An agent (Response Planner) may **propose** a new playbook or propose steps
  within an existing approved one. It may never move a playbook to
  `enabled` itself.
- Every playbook step declares its action class (`agentic-architecture.md`)
  up front, so approval requirements are known before the playbook runs, not
  discovered mid-execution.
- Every playbook step optionally declares a **D3FEND mapping** — the
  defensive technique category the response action implements (e.g.
  `isolate_host` maps to D3FEND Network Isolation). This is the response
  side of the ATT&CK × D3FEND coverage matrix in `native-siem-spec.md`; a
  step with no meaningful D3FEND mapping is marked `unmapped`, never left
  silently blank.
- Disabling or retiring a playbook must not require deleting its run
  history — history is audit trail, not working state.

## Approvals

An approval request is generated whenever a playbook step or a standalone
proposed action needs one per its action class. See
`agentic-architecture.md` for the class-to-approval mapping and the
no-self-approval rule; see `schemas/action-request.schema.json` for the
object shape.

## Response execution, verification, rollback

Response execution is a **deterministic service**, not an agent (see
non-negotiable principle #2 in `SKILL.md`). It:
1. re-checks preconditions immediately before running (state may have
   changed since approval)
2. executes idempotently (safe to retry / safe if already applied)
3. records a verification step afterward (did the intended state change
   actually occur?)
4. exposes a rollback path for anything reversible, and marks clearly what
   is *not* reversible before execution, not after

All launch-scope response actions are **dry-run/simulation-only** — see
`agentic-architecture.md` for what that means for autonomy defaults.

## Tasks and SLA

Tasks are assignable, have due-by clocks, and roll up into case SLA status
(on-track / at-risk / breached). SLA breach state is a first-class thing the
UI must be able to show (`frontend-ux-spec.md`), not something computed only
in reports.

## SOC KPIs (must be shown somewhere in reporting, not just computed)

- MTTD / MTTA / MTTR (mean time to detect/acknowledge/resolve)
- **pipeline latency breakdown** — the stage-by-stage timing that makes up
  MTTD/MTTR rather than one black-box number:
  `telemetry occurred_at → ingested_at (collection lag) → correlated_at
  (SIEM detection time) → alert received by SOC (handoff time) →
  triaged_at (SOC ack time) → case closed_at (full MTTR)`
- alert-to-case conversion rate
- case closure mix (true positive / false positive / benign / duplicate /
  suppressed, from the taxonomy above)
- agent-assisted vs. fully-manual resolution ratio
- SLA compliance rate
- analyst workload (open cases per assigned owner)
- **detection coverage %** and **defensive coverage %** — sourced from
  `native-siem-spec.md`'s ATT&CK × D3FEND coverage matrix; SOC reporting
  surfaces these, SIEM computes them

These are operational throughput metrics, distinct from any risk/control
scoring Assessment (Phase 2) would produce — don't conflate the two in
reporting.

## Required routes

```
/soc-dashboard
/queue
/cases
/cases/[id]
/evidence
/playbooks
/approvals
/actions
/agents
/agents/runs/[id]
/soc-reports
```

## Explicit out of scope here

Native correlation/detection-rule authoring itself lives in `native-siem-spec.md`
(SOC only consumes and displays the resulting `attack_techniques`, it
doesn't author rules). UEBA and threat-intel feed management are Phase 1.5
(`product-architecture.md`) — SOC consumes alerts and whatever enrichment
context a source system already produced; it does not generate detections
from raw telemetry itself.
