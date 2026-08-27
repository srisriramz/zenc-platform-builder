# Template: Agent Safety Review

Run this against any agent — new or modified — before it ships. Answer each
item explicitly; "probably fine" is not an answer.

## Autonomy and action class

- [ ] Does this agent's default autonomy level match its row in
      `agentic-architecture.md` (L1 or L2 unless explicitly, documentedly
      raised per tenant policy)?
- [ ] Can this agent, directly or through a tool it calls, cause an A3 or A4
      action to execute without going through an approval request?
      (Answer must be no.)
- [ ] For every action this agent can propose, is the action class declared
      *before* an approval is requested, not inferred after?

## Self-approval and independence

- [ ] Can the entity that requested/drafted an action (this agent, or a
      human using it) also be recorded as the approver? (Must be
      structurally impossible, not just discouraged.)
- [ ] For A4-class proposals from this agent, is independent human approval
      enforced regardless of any tenant policy setting?
- [ ] If this agent is the Detection Engineer Agent (or touches rule/
      playbook lifecycle at all): can it set a rule's or playbook's
      `lifecycle_state` to `enabled` under any code path? (Must be no —
      this is a human-only transition regardless of autonomy level or
      tenant policy, per `SKILL.md` principle #3.)

## Tool allowlist

- [ ] Is this agent's tool allowlist exhaustive and documented in
      `agentic-architecture.md`'s table?
- [ ] Does every tool on the list have its own scope/volume/time bound?
- [ ] Can this agent reach any write tool that submits for execution,
      enables a playbook/rule, or writes to Assessment? (Must be no.)

## Escalation

- [ ] Does this agent actually hand off (not just note internally) when
      confidence drops below threshold, evidence is contradictory/missing,
      policy is ambiguous, or it needs an out-of-allowlist tool?

## Untrusted data

- [ ] Can any field in this agent's inputs (alert payload, evidence content,
      enrichment/TI results, prior agent output) change this agent's own
      tool access, autonomy level, or approval requirement? (Must be no.)

## Explainability

- [ ] Does every output from this agent validate against
      `agent-message.schema.json`, including rationale, evidence,
      contradictory evidence, provenance/freshness, and version fields?
- [ ] Is raw chain-of-thought excluded from what's shown as "rationale"?

## Kill switch and expiry

- [ ] Does an active kill switch (global/partner/tenant) actually block this
      agent from producing new action requests, and does it affect
      in-flight requests too?
- [ ] Do this agent's action requests expire per policy if left unapproved?

If any box is unchecked, the agent is not ready to ship — fix the gap or
document why it's an accepted, reviewed exception (and who reviewed it),
rather than shipping silently.
