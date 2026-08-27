# Domain Model

Canonical entity names and relationships. Use these names consistently
across schemas, UI copy, and code — don't rename an entity mid-build (e.g.
"Case" vs "Incident") without updating this file first.

## ZenC SIEM entities

```
TelemetrySource  1---*  NormalizedEvent (via a Connector)
NormalizedEvent  *---*  CorrelationRule (matched by, during evaluation)
CorrelationRule  1---1  RuleLifecycleState (draft/test/peer_review/approved/enabled/disabled/retired)
CorrelationRule  *---*  AttackTechnique (canonical mapping, set at authoring time)
CorrelationRule  *---*  D3fendTechnique (detect-side mapping)
CorrelationRule  1---*  RegressionTestResult
CorrelationRule  --(fires)-->  AlertEnvelope
AlertEnvelope  1---*  AttackTechniqueClaim
AttackTechniqueClaim  *---*  NormalizedEvent (contributing_event_refs — every claim must trace to real events)
```

## ZenC SOC entities

```
AlertEnvelope  --(grouped into)-->  Case
Case  1---*  Evidence
Case  1---*  Task
Case  1---1  Timeline (derived view over Case's alerts/evidence/tasks/actions)
Case  *---1  ClosureClassification (on close)
Case  *---*  AgentRun (agents that touched this case)
Case  --(derives)-->  AttackTechniqueBreakdown (union of linked alerts' AttackTechniqueClaims)
AgentRun  1---*  AgentMessage
Playbook  1---*  PlaybookStep
PlaybookStep  1---1  ActionClass
PlaybookStep  *---*  D3fendTechnique (response-side mapping, or explicitly unmapped)
ActionRequest  *---1  PlaybookStep (optional; may also be ad hoc)
ActionRequest  1---1  RequestedBy (principal)
ActionRequest  1---0..1  ApprovedBy (principal, must differ from RequestedBy)
ActionRequest  *---0..1  Execution (deterministic; created only after approval)
Execution  1---0..1  Verification
Execution  1---0..1  Rollback
```

## ZenC Assessment entities

```
Template  1---*  Section
Section  1---*  Question
Question  1---*  ResponseOption
Assessment  *---1  Template (version-pinned)
Assessment  1---*  Answer
Answer  *---0..1  Evidence
Evidence  1---1  ReviewState (submitted / approved / rejected)
Assessment  1---*  Finding
Finding  *---0..1  RiskRegisterEntry
RiskRegisterEntry  1---0..1  Treatment
Finding  *---*  ControlMapping
Assessment  1---*  RoadmapItem (bucketed 30/90/180/365)
Assessment  *---0..1  PriorAssessment (for reassessment comparison)
```

## Cross-boundary relationship (the only one)

```
Case (SOC, closed)  --(may propose)-->  AssessmentSuggestion
AssessmentSuggestion  --(reviewed by human)-->  Finding | Evidence (Assessment)
```

`AssessmentSuggestion` is not a first-class schema of its own beyond what's
needed to carry a proposal into Assessment's existing review queue shape —
model it as a tagged variant of the same intake shape Assessment already
uses for manually-submitted findings/evidence, with an `origin: "soc"` field
rather than inventing a parallel entity.

## Identity/tenancy (shared, minimal)

```
Tenant  1---*  User
User  *---*  Role
Tenant  1---1  Entitlements (has_assessment: bool, has_soc: bool)
Tenant  1---1  Policy (autonomy defaults, approval rules, action-class overrides)
```
