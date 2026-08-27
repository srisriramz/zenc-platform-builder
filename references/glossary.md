# Glossary

**ZSIF** — ZenC Security Index Framework. The scoring *methodology* used by
ZenC Assessment. Deterministic, documented, never LLM-computed.

**ZSIS** — ZenC Security Index Score. The *output* of applying ZSIF to a
given assessment instance. Always indicative; never described as an audit,
certification, legal opinion, or compliance guarantee.

**Maturity score** — how well-implemented a control/practice is, per
assessment answers. Distinct from evidence-confidence score.

**Evidence-confidence score** — how much confidence the reviewer has in the
*evidence* backing an answer. Never blended with maturity score.

**Alert envelope** — the normalized shape every inbound alert is converted
to at SOC intake, regardless of source system. See
`schemas/alert-envelope.schema.json`.

**Case** — SOC's unit of investigation/response work, grouping one or more
alerts plus evidence, tasks, and a timeline.

**Playbook** — a named, versioned sequence of steps mapping to action
requests, with its own approve/enable/disable/retire lifecycle.

**Action request** — a proposed action (from a playbook step or ad hoc)
awaiting approval before the deterministic Response Executor can run it.

**Action class (A0–A4)** — how impactful/risky a proposed action is, from
reasoning-only (A0) to broad/destructive/hard-to-reverse (A4). Determines
approval requirements. See `agentic-architecture.md`.

**Autonomy level (L0–L4)** — how much an agent is allowed to do without a
human in the loop, from assist-only (L0) to narrow pre-approved emergency
execution (L4). See `agentic-architecture.md`.

**Agent message** — one agent's single turn: inputs, tool calls, claim,
confidence, evidence citations. See `schemas/agent-message.schema.json`.

**Agent run** — the full trace of an end-to-end agentic task, aggregating
one or more agent messages. See `schemas/agent-run.schema.json`.

**Closure classification** — required field on every closed case:
true_positive / false_positive / benign_true_positive / duplicate /
suppressed. See `soc-spec.md`.

**MITRE ATT&CK** — the tactics/techniques framework used to classify
adversary behavior. Treated as static, seeded reference data the platform
maps *to*, not something the product authors or edits.

**Contributing events** — the specific `normalized_event` records that
justify a technique claim on an alert. A technique claim without
contributing events is not valid — see `SKILL.md` principle #10.

**MITRE D3FEND** — the defensive-technique framework used to classify how a
detection or a response action actually defends (e.g. Network Traffic
Analysis, Network Isolation). Correlation rules map to D3FEND on the detect
side; playbook steps map to D3FEND on the response side. Same
seeded-reference-data treatment as ATT&CK.

**Detection coverage %** — techniques with an enabled, mapped rule ÷
techniques in scope.

**Defensive coverage %** — techniques with a mapped D3FEND control (detect
or response side) ÷ techniques in scope.

**Rule lifecycle** — `draft → test → peer review → approved → enabled →
disabled → retired`, identical in shape to the playbook lifecycle. A rule
only reaches `enabled` after human peer review and approval, always.

**Pipeline latency breakdown** — the stage-by-stage timing (collection lag,
SIEM detection time, handoff time, SOC ack time, full MTTR) that makes up
the single MTTD/MTTR numbers, kept visible rather than collapsed.

**Telemetry source / connector** — a configured feed of raw events into
ZenC SIEM, with its own health state (`healthy | degraded | stale |
unknown`) surfaced in both the Log Explorer and detection coverage views.

**Normalized event** — a raw telemetry event after parsing, normalization,
and enrichment, linked back to its raw form for lineage. What correlation
rules actually evaluate against.

**MTTD / MTTA / MTTR** — mean time to detect / acknowledge / resolve. SOC
operational KPIs, distinct from Assessment's risk/maturity scoring.

**Chain of custody** — the record of who/what added a piece of evidence,
when, and a content hash proving it wasn't altered outside the app.

**Kill switch** — a global, partner, or tenant-scoped control that halts all
pending and in-flight action execution for its scope.

**Dry-run / simulation-only** — an action request that runs the full
approve → execute → verify → rollback path without producing any real
external effect. The default (and, per this skill's scope, the only) mode
for response actions.
