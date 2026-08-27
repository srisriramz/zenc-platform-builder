# Template: Build/Promote a Detection Rule

Use this whenever authoring a new correlation rule or changing an existing
one — walks the full lifecycle so it's repeatable rather than ad hoc each
time. Read `references/native-siem-spec.md`'s Detection Engineering section
first.

```
Rule name: [descriptive, e.g. "Encoded PowerShell spawned from Office process"]

Rule type: [single_event | sequence | threshold | aggregation | field_join |
            entity_join | time_window | suppression]

Definition: [structured logic — never raw code/eval/SQL. Sketch the match
             conditions and, if sequence/time_window, the ordering/window.]

ATT&CK mapping (required, at least one):
  - tactic: [...]
  - technique_id: [...]
  - technique_name: [...]

D3FEND mapping (required — or explicitly mark unmapped with a reason):
  - d3fend_technique_id: [...]
  - d3fend_technique_name: [...]
  - category: [detect]

Severity: [informational | low | medium | high | critical]

Proposed by: [detection-engineer-agent, or a human — either is fine at
              draft/test stage]
```

## Lifecycle steps (in order — don't skip)

1. **Draft** — author the rule against the schema in
   `schemas/correlation-rule.schema.json`. The Detection Engineer Agent may
   author or propose changes at this stage.
2. **Test** — run regression testing against the deterministic synthetic
   corpus. Record: events evaluated, expected matches, observed matches,
   missed expected detections, unexpected matches, noise indicator,
   execution time, and a rule-health verdict. A rule existing and matching
   in test does not by itself prove detection quality — say so if the
   result is ambiguous rather than declaring victory.
3. **Peer review** — a human (not the proposing agent, not the same person
   who wrote it if your tenant policy requires stricter separation) reviews
   the rule definition, mapping, and test results.
4. **Approved** — reviewer sign-off recorded in `history`.
5. **Enabled** — a human sets this state. **The Detection Engineer Agent
   can never do this step itself, regardless of autonomy level or tenant
   policy** (`SKILL.md` principle #3). If a build seems to need the agent
   to skip straight to enabled "for the demo," that's a sign to adjust the
   demo script, not the rule, per `templates/review-agent-safety.md`.
6. Once enabled, the rule appears in the ATT&CK × D3FEND coverage matrix
   (`native-siem-spec.md`) and starts contributing `attack_techniques`
   claims to any alert it fires — confirm those claims cite real
   `contributing_event_refs`, not just the rule's canonical mapping.

## Disabling / retiring

Disabling or retiring a rule must not delete its `history` or prior
`regression_test_results` — those stay as audit trail. Version comparison
and rollback to a prior `version` must both be exercised, not just
theoretically supported.
