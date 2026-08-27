# Agentic SOC Architecture

This is the core of ZenC SOC and the part of this skill that deserves the
most care. Read this in full before adding or modifying any agent — don't
skim to just the agent's own row in the table below.

## Design stance

- Prefer deterministic workflows over free-form agent-to-agent conversation.
  An agent's job is to turn messy inputs into a structured, evidenced
  recommendation — not to negotiate with another agent in natural language.
- Every agent is **bounded**: a fixed tool allowlist, a fixed output schema,
  and a fixed autonomy ceiling it cannot request its way out of.
- The **Response Executor is not an agent.** It's a deterministic service
  that takes an *approved* action request and runs it. It has no reasoning
  step, no free-form input, and cannot be reached except through an approved
  `action-request`.

## The 12 bounded agents

| Agent | Purpose | Default autonomy | Reads | Never does |
|---|---|---|---|---|
| Intake Agent | Normalizes/validates inbound alerts into the envelope shape | L1 | raw alert payload, source health | write to case store directly |
| Triage Agent | Proposes severity, grouping, and case-open/suppress recommendation | L2 | alert envelope, recent case history | open/suppress a case itself |
| Enrichment Agent | Attaches read-only context (asset, identity, prior sightings) to an alert or case | L1 | asset/identity lookups, TI lookups (read-only) | modify case status |
| Investigation Agent | Runs bounded, source-cited investigation queries and drafts findings | L1/L2 | case data, evidence, read-only log/search tools | execute any external action |
| Hunt Agent | Runs analyst-initiated hunt queries against bounded scope/time | L1 | search tools (read-only, volume-bounded) | auto-create a case without analyst confirmation |
| Response Planner | Proposes a playbook or ad hoc action sequence with action classes labeled | L2 | case data, playbook library | enable a playbook, execute an action |
| Detection Engineer Agent | Proposes/tests correlation-rule and playbook changes against the synthetic test corpus in ZenC SIEM | L2 | rule/playbook definitions, synthetic test corpus | publish/enable a rule or playbook |
| Assessment Assistant | Drafts a suggested finding/evidence item for Assessment review from a closed case | L2 | closed-case summary | write to Assessment directly |
| Reporting Agent | Drafts case/executive report content from approved case data | L1/L2 | case data, KPI aggregates | publish a report without human sign-off on external-facing copy |
| Digital Advisor Agent | Answers "what should we do next" for a case using approved evidence only | L1 | case data, approved knowledge/security-memory-equivalent | approve any action, guarantee an outcome |
| QA and Governance Agent | Reviews other agents' outputs for policy/schema/evidence compliance before they reach a human queue | L1 | agent-run records | approve on another agent's behalf |
| Supervisor | Routes work between agents, enforces autonomy/action-class policy | L1 (orchestration only) | agent-run records, policy config | see [Supervisor constraints](#supervisor-constraints) below |

Any agent not on this list is out of scope for this skill — extend the table
(with a documented autonomy default and tool allowlist) before building a
13th agent, rather than adding ad hoc capability to an existing one.

## Agent message and run contract

Every agent call produces an **agent message** and every end-to-end task
produces an **agent run** aggregating one or more messages. These are not
optional logging — they're what powers `/agents/runs/[id]`, the explainability
requirements below, and the analyst-feedback loop.

- `schemas/agent-message.schema.json` — one agent's single turn: what it was
  given, what tools it called, what it claims, its confidence, and its
  evidence citations.
- `schemas/agent-run.schema.json` — the full trace for a task: ordered
  messages, total tool calls, elapsed time, human touchpoints, and final
  outcome.

An agent output that doesn't fit these shapes doesn't ship — this is what
makes `/agents/runs/[id]` and post-hoc audit possible at all.

## Per-agent tool allowlists

Tool access is granted per agent, not per user session. A concrete example
allowlist (adapt per deployment, don't loosen by default):

| Agent | Allowed tools |
|---|---|
| Enrichment Agent | asset-lookup (read), identity-lookup (read), TI-lookup (read) |
| Investigation Agent | case-read, evidence-read, log-search (read, volume/time bounded) |
| Response Planner | case-read, playbook-read, action-request-draft (write, but drafts only — not submit-for-execution) |
| Detection Engineer Agent | rule-read, rule-test (against synthetic corpus only), rule-draft (write, draft state only) |

No agent gets a tool that can submit an approved action for execution,
enable a playbook/rule, or write to Assessment. Those are human- or
policy-engine-gated actions by construction, not by agent self-restraint.

## Escalation criteria (when an agent hands off instead of proceeding)

An agent must stop and hand off to a human (via the Supervisor/approval
queue) rather than proceed when any of:
- its own stated confidence falls below the tenant-configured threshold
- the next step's action class is ≥ A3
- evidence is contradictory or a required evidence field is missing
- the case/tenant policy is ambiguous or absent for this situation
- it would need a tool outside its allowlist to continue

These thresholds are configuration (per tenant/policy), not something each
agent decides independently — the Policy Engine (see
`product-architecture.md`) is the source of truth, agents read it.

## Autonomy levels

| Level | Name | Meaning |
|---|---|---|
| L0 | Assist | Agent drafts text/analysis only; no tool calls with external effect |
| L1 | Read-only investigation | Agent may call read-only tools; cannot write or request execution |
| L2 | Recommend + approval | Agent drafts an action request; a human must approve before anything runs |
| L3 | Bounded reversible execution under explicit tenant policy | A specific, named action type may auto-execute without per-instance approval, only if a tenant has explicitly pre-authorized that exact action type in policy |
| L4 | Narrow emergency action with notification + rollback | Extremely narrow, pre-approved emergency actions that execute immediately and notify + offer rollback after the fact |

**Default for all new functionality is L1 or L2.** Moving anything to L3/L4
is a per-tenant, per-action-type, explicitly documented policy change — never
a global default and never something an agent or this skill enables
silently.

## Action classes

| Class | Name | Examples | Approval rule |
|---|---|---|---|
| A0 | Reasoning only | Drafting a summary, a hypothesis | None needed |
| A1 | Read-only retrieval | Log search, asset lookup | None needed, but logged |
| A2 | Reversible internal change | Case status update, tag, task creation | Per autonomy level (L2 default = approval) |
| A3 | Security-control change | Disable an account, isolate a host, block an IP | Requires approval **unless** a precise tenant policy explicitly pre-authorizes that exact action (L3 case) |
| A4 | Broad/privileged/destructive/hard-to-reverse | Firewall-wide rule change, bulk account disable, data deletion | **Always** requires independent human approval, regardless of any tenant policy |

## Approval and no-self-approval rule

- The requester (human or agent) of an action can never be its approver.
  This is enforced at the schema level: `action-request.schema.json`
  requires `requested_by` and `approved_by` to be different principals, and
  validation must reject a request where they match.
- For A4 specifically, treat "independent human approval" as a
  segregation-of-duties requirement: the approver must not only be a
  different principal but should not be the same person who authored the
  underlying playbook/rule that produced the request, where that's knowable.
  Document this per tenant if a tenant needs a stricter two-named-approvers
  rule — this skill's default is one independent approver, escalate from
  there per policy.
- Approval, once given, is scoped to that specific action request instance —
  it does not blanket-authorize future similar requests (that's what L3
  policy pre-authorization is for, and it's explicit, not implicit from past
  approvals).

## Supervisor constraints

The Supervisor orchestrates but never gains any of the following, under any
circumstance:
- universal/standing credentials across tools
- the ability to override policy engine decisions
- the ability to approve its own or another agent's action request
- the ability to expand a tenant's scope or autonomy level
- a path that bypasses human approval for A3/A4

If a build seems to need the Supervisor to do one of these to "make the demo
smoother," that's a signal to fix the demo script, not to weaken the
Supervisor.

## Kill switches

Global, partner, and tenant-level kill switches must each independently be
able to halt all pending and in-flight action execution (not just new
approvals) for their scope. Kill-switch state is visible in the UI
(`frontend-ux-spec.md` — "simulation indicator" / "kill-switch status") — it
is not a hidden admin-only toggle with no on-screen indication.

Additional required mechanics: action expiry (an approved-but-unexecuted
action expires after a configured window rather than remaining executable
indefinitely), precondition re-check immediately before execution, and
idempotent execution (see `soc-spec.md`).

## Analyst feedback loop

When a human corrects an agent's output — wrong triage severity, false
positive that an agent flagged as true, a rejected playbook suggestion —
that correction is captured as a structured feedback record, not just a free
text comment lost in a chat log:

- what the agent claimed (from its agent-message)
- what the human determined instead
- which case-closure classification (`soc-spec.md`) it maps to, if
  applicable
- whether it implicates a specific rule/playbook/agent version

This feedback record is what a real tuning process (out of scope to
implement here) would consume later — this skill's job is to make sure the
record exists and is structured, not to build the tuning pipeline itself.

## Agent/prompt/tool version pinning

Every agent-message records the prompt version, tool version(s), and (if
applicable) rule/playbook version it ran against. A tenant may pin to a
previous agent version after an update, the same way rule/playbook versions
support rollback — don't design agent updates as a silent, ungoverned swap
for every tenant simultaneously.

## Explainability requirements (what must always be shown)

Per output, at minimum: concise rationale, supporting evidence, contradictory
evidence (if any), evidence provenance and freshness, tool-call history,
policy outcome (approved/denied/why), model/prompt/tool/rule version, and —
once available — analyst feedback and the final human decision. Never expose
raw hidden chain-of-thought as if it were the rationale; the rationale is a
distinct, deliberately-produced explanation, not a reasoning transcript.
Agent output alone is never treated as evidence in its own right — it's a
claim citing evidence, and the evidence is what's authoritative.
