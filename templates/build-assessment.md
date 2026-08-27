# Template: Build an Assessment Feature

Use this as a starting prompt/checklist whenever scaffolding a new ZenC
Assessment feature. Fill in the bracketed parts.

```
Build [feature] for ZenC Assessment.

Context to load first:
- references/assessment-spec.md
- references/domain-model.md (Assessment entities)
- schemas/assessment.schema.json, schemas/evidence.schema.json
- references/frontend-ux-spec.md (Assessment-specific UI notes + required states)

Requirements:
1. Confirm this feature does not assume SOC is present or healthy.
2. Confirm scoring stays deterministic and transparent — no LLM-computed
   score, no blending of maturity and evidence-confidence.
3. If this touches evidence review, use the existing submitted → under
   review → approved/rejected flow — don't invent a parallel one.
4. If this renders ZSIS anywhere, confirm the indicative label is present
   in that render path (screen, export, and report, as applicable).
5. Cover the required UI states from frontend-ux-spec.md — loading, empty,
   malformed input, timeout, partial, stale, degraded, access-denied,
   success.
6. If this is new schema surface, extend schemas/assessment.schema.json or
   schemas/evidence.schema.json rather than introducing an untyped shape.

Deliverable: [component/route/schema — be specific]
Backend assumption: frontend-only, seeded mock data, no real backend unless
stated otherwise.
```

## Reminders specific to Assessment

- Applicability logic (applicable / not-applicable-with-reason) and evidence
  requirement (none/optional/required) live on the *question*, not the
  assessment instance — don't duplicate them per-instance.
- Reassessment comparison is read-only over two instances; it must not be
  able to mutate the prior assessment.
- If the feature is a SOC-suggested item landing in the reviewer queue,
  confirm it's tagged `origin: "soc"` and goes through the identical
  approve/reject UI as a manual submission — see `domain-model.md`.
