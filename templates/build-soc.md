# Template: Build a SOC Feature

Use this as a starting prompt/checklist whenever scaffolding a new ZenC SOC
feature (case management, triage, playbooks, evidence, reporting — for a new
*agent*, use `build-agent.md` instead).

```
Build [feature] for ZenC SOC.

Context to load first:
- references/soc-spec.md
- references/agentic-architecture.md (if this touches agents/actions at all)
- references/domain-model.md (SOC entities)
- relevant schema(s) in schemas/
- references/frontend-ux-spec.md (SOC-specific UI notes + required states)

Requirements:
1. Confirm this feature does not assume Assessment is present or healthy.
2. Confirm this feature does not assume a specific alert source system —
   it should work against the alert-envelope shape regardless of origin.
3. If this touches case closure, the closure-classification field is
   required, not optional — no path to close a case without it.
4. If this touches evidence, preserve immutability + chain-of-custody
   metadata — corrections are new linked items, never in-place edits.
5. If this touches actions/approvals, confirm: no self-approval is possible
   even at the schema/validation level (not just disabled in UI), action
   class is declared before approval is requested, and A4 always requires
   approval regardless of any policy setting.
6. Cover the required UI states from frontend-ux-spec.md.

Deliverable: [component/route/schema — be specific]
Backend assumption: frontend-only, seeded mock data, no real backend unless
stated otherwise. Any response action in seed data is dry-run only.
```

## Reminders specific to SOC

- The Response Executor is deterministic, not an agent — don't let an agent
  call it directly; it only accepts an approved `action-request`.
- If this feature surfaces KPIs, use the list in `soc-spec.md` (MTTD/MTTA/
  MTTR + pipeline-latency breakdown, alert-to-case conversion, closure mix,
  agent-assisted ratio, SLA compliance, analyst workload, detection/
  defensive coverage %) rather than inventing new ones ad hoc.
- If this feature is playbook-related, respect the lifecycle (draft → test
  → peer review → approved → enabled → disabled → retired) — an agent may
  propose a playbook or step but never move it to `enabled`. Each step
  needs a D3FEND response mapping or an explicit `unmapped` state.
- If this feature is case-related, confirm the ATT&CK technique breakdown
  panel is present and every technique traces to real contributing events
  from the linked alerts — see `native-siem-spec.md` and
  `schemas/alert-envelope.schema.json`.
