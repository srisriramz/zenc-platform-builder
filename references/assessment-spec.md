# ZenC Assessment Spec

**Phase 2 — fully designed, not part of the current SIEM/SOC build.** Build
this only on explicit request; don't pull it into a generic SIEM or SOC
task. It's kept complete here so reactivating it later is wiring and UI
work, not a redesign.

ZenC Assessment must run completely without ZenC SOC. Nothing below may be
implemented as a dependency on SOC being present or healthy.

## Core object model

- **Template** — versioned; has sections → questions → response options.
  Questions carry applicability logic (applicable / not-applicable-with-reason)
  and an evidence requirement (none / optional / required).
- **Assessment (instance)** — a template applied to a tenant/scope at a point
  in time. Holds answers, evidence links, reviewer state, and computed score.
- **Evidence** — an uploaded file or reference, with a **confidence** value
  set by the submitter/reviewer, separate from the assessment's maturity
  score. Evidence has its own review state: submitted → reviewer-approved /
  reviewer-rejected.
- **Finding / Gap** — derived from an unmet or partially-met question,
  linked back to the question and to any relevant risk register entry.
- **Risk Register entry** — likelihood × impact, owner, due date, treatment
  plan (accept/mitigate/transfer/avoid), residual risk after treatment.
- **Control Mapping** — links a question/finding to one or more control
  framework references (framework name + control ID; treat the framework
  library itself as external reference data, not something this skill
  designs).
- **Roadmap item** — a recommended improvement action, bucketed into
  30/90/180/365-day horizons, optionally linked to one or more gaps.

See `schemas/assessment.schema.json` and `schemas/evidence.schema.json` for
the machine-readable shapes, and `references/domain-model.md` for how these
relate to each other and to SOC's objects.

## Scoring rules (non-negotiable)

- Scoring must be **transparent and deterministic** — a documented formula
  from answers/evidence to score, not a black-box or LLM-generated number.
  If an LLM assists with evidence review or roadmap drafting, it never
  computes the score itself.
- **ZSIF** is the framework/methodology name; **ZSIS** is the resulting
  score. ZSIS must always render with an "indicative" label wherever it
  appears (UI, PDF/report export, API response) and must never be described
  as an audit, certification, legal opinion, or compliance guarantee — this
  is a hard constraint, not a copy-editing preference.
- **Maturity score** and **evidence-confidence score** are two distinct
  numbers, computed and displayed separately. Never average or blend them
  into one figure.

## Reviewer workflow

Every question with submitted evidence goes through: submitted → under
review → approved / rejected (with reviewer comment). Only an approved
evidence item counts toward score. A rejected item blocks completion of that
question until resubmitted or marked not-applicable with justification.

## Reassessment

A reassessment is a new Assessment instance linked to a prior one for
comparison (score delta, closed gaps, new gaps, control-mapping drift).
Comparison is a read-only view over two Assessment instances — it does not
mutate the prior instance.

## What SOC is allowed to contribute (and no more)

If SOC is present and connected, it may **suggest** — via the
`AssessmentFindingPublished`-adjacent suggestion path defined in
`inter-product-contracts.md` — evidence or observations to a human reviewer
(e.g., "this closed incident suggests control X may need retesting"). SOC
integration must never, under any circumstance:

- auto-answer an assessment question
- auto-approve evidence
- alter a score
- auto-close a gap
- change risk status

A suggestion from SOC lands in a review queue identical in shape to a
manually-submitted item; the reviewer approves or dismisses it like any
other. If SOC is disconnected or absent, this queue is simply always empty —
Assessment functions identically either way.

## Required screens (frontend-ux-spec.md governs states/components)

Template builder · Template library · Assessment runner (question-by-question
or grid view) · Evidence upload & review queue · Findings/Gaps list · Risk
register · Control mapping view · Roadmap board (by horizon) · Reassessment
comparison · Assessment history · Executive report (indicative-ZSIS-labeled)
· Detailed report · Import/export.

## Explicit out of scope here

Benchmarking against other tenants/industry, full compliance-framework
authoring tools, and multi-language template localization are not part of
this skill's Assessment scope. Treat framework/control libraries as static
reference data you seed, not something the product edits.
