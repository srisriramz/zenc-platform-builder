# Template: Define or Add a Bounded Agent

Use this before writing any agent's logic — new agent or a material change
to an existing one's scope. Read `references/agentic-architecture.md` in
full first; this template is a fill-in-the-blanks over that reference, not a
substitute for it.

```
Agent name: [must match a row in agentic-architecture.md's agent table, or
             be a proposed new row — don't add capability to an existing
             agent that changes its scope beyond its documented purpose]

Purpose (one sentence): [what it decides or drafts, not what it "handles"]

Default autonomy level: [L0-L4 — must default to L1 or L2 unless a specific,
                          documented tenant policy says otherwise]

Tool allowlist (exhaustive — anything not listed is unreachable):
  - [tool 1, read or write, with its own scope/volume/time bound]
  - [tool 2, ...]

Output schema: agent-message.schema.json (do not invent a parallel shape)

Escalation triggers (when this agent hands off instead of proceeding):
  - confidence below [tenant-configured threshold]
  - next step's action class >= A3
  - evidence contradictory or a required field missing
  - policy ambiguous or absent for this case/tenant
  - needs a tool outside its allowlist

What this agent must NEVER do:
  - execute any action with external effect directly
  - approve its own or another agent's output/request
  - write to Assessment directly (if SOC-side)
  - expand its own tool allowlist or autonomy level
  - [anything else specific to this agent's blast radius]

Version pinning: this agent's prompt/tool version is recorded on every
agent-message it produces; a tenant may pin to a prior version after an
update.
```

## Before shipping

Run `templates/review-agent-safety.md` against the finished design. If the
agent proposes actions, confirm every action class it can produce maps
correctly into the approval table in `agentic-architecture.md` — don't let
an agent "round down" an action's class to avoid triggering approval.
