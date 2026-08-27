# Template: Build a SIEM Feature

Use this as a starting prompt/checklist whenever scaffolding a new ZenC SIEM
feature (telemetry, Log Explorer, correlation, coverage — for authoring a
*specific detection rule*, use `build-detection-rule.md` instead).

```
Build [feature] for ZenC SIEM.

Context to load first:
- references/native-siem-spec.md
- references/domain-model.md (SIEM entities)
- relevant schema(s) in schemas/ (normalized-event, correlation-rule,
  telemetry-source, alert-envelope)
- references/frontend-ux-spec.md (SIEM-specific UI notes + required states)
- references/security-governance.md (query/rule-authoring safety)

Requirements:
1. Confirm this feature does not assume SOC is present or healthy.
2. If this touches search or rule authoring, confirm it never compiles to
   eval, arbitrary SQL, arbitrary shell, or unsafe regex — structured/
   bounded surfaces only.
3. If this produces or displays an alert, confirm attack_techniques is a
   structured claim citing real contributing_event_refs, never a flat tag.
4. If this touches detection coverage, stage it honestly (telemetry
   available → collected → parsed → correlated → investigation ready →
   response ready) rather than a binary covered/not-covered flag.
5. Cover the required UI states from frontend-ux-spec.md — loading, empty,
   malformed query, timeout, partial, stale, degraded source, access
   denied, success.
6. If this is new schema surface, extend the relevant schemas/*.json rather
   than introducing an untyped shape.

Deliverable: [component/route/schema — be specific]
Backend assumption: frontend-only, seeded mock data, no real backend unless
stated otherwise.
```

## Reminders specific to SIEM

- Detection and correlation logic is deterministic — never let an LLM
  decide whether a rule matches or what severity an event gets.
- A rule reaching `enabled` always requires a human, never the Detection
  Engineer Agent, regardless of any tenant policy.
- Reference frameworks (ATT&CK, D3FEND) are static seeded data the product
  maps to — don't build authoring/editing UI for the frameworks themselves.
