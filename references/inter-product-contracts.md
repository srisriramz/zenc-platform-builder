# Inter-Product Contracts

No product reads another product's store directly. Everything crossing the
SOC ↔ Assessment boundary — or entering SOC from an external alert source —
goes through a versioned event or API call matching one of the schemas in
`schemas/`.

## Common envelope fields (every event)

Every event, regardless of type, carries:

- `event_id`, `event_type`, `schema_version`
- `occurred_at` (timestamp)
- `producer` (which product/service emitted it)
- `tenant_id` (and `partner_id` where applicable)
- `correlation_id`, `causation_id`
- `idempotency_key`
- `data_classification`
- `provenance`
- `payload_integrity_hash`

See `schemas/inter-product-event.schema.json` for the full shape. Don't add
a new cross-boundary interaction without an event/API matching this
envelope — a "quick" direct call that skips it is exactly the kind of
coupling the independence rules in `product-architecture.md` exist to
prevent.

## Canonical events in this skill's scope

| Event | Producer | Consumer | Notes |
|---|---|---|---|
| `AlertReceived` | External source or ZenC SIEM (future) | ZenC SOC | Normalized into `alert-envelope` at intake |
| `CaseOpened` | ZenC SOC | (internal to SOC; also feeds KPIs) | |
| `CaseClosed` | ZenC SOC | (internal; optionally triggers `AssessmentFindingPublished` proposal) | Carries closure taxonomy |
| `ResponseActionVerified` | ZenC SOC (Response Executor) | (internal; audit) | |
| `AssessmentFindingPublished` | ZenC Assessment (only — never SOC) | ZenC Intelligence / reporting (out of scope) | SOC may **propose** content for this; only Assessment, after reviewer approval, actually emits it |
| `ApprovedLessonPublished` | ZenC SOC (post-review) | Any consumer that wants approved lessons | Only reviewed/approved content — never raw agent output |

Events not in this table (e.g., `TelemetryQualityChanged`,
`DetectionRuleChanged`, `BusinessServiceChanged`) belong to the out-of-scope
SIEM/Intelligence products from `product-architecture.md` — don't implement
them here; extend this table first if a real need arises.

## SOC → Assessment suggestion path (the one intentional one-way channel)

1. A case closes with a closure classification that suggests a control gap
   or evidence opportunity (human- or Assessment Assistant agent-drafted).
2. SOC emits a proposal — **not** `AssessmentFindingPublished` itself — into
   an Assessment-owned review queue.
3. An Assessment reviewer approves or dismisses it exactly like a
   manually-submitted item (`assessment-spec.md`).
4. Only on approval does Assessment itself emit `AssessmentFindingPublished`
   or update evidence — SOC's proposal never mutates Assessment state
   directly.

## Validation and failure handling (every consumer must do all of these)

- validate event schema against the version it declares
- validate tenant scope matches the caller's authorization
- validate authorization/entitlement (does this tenant have the producing
  and consuming product both enabled, where relevant)
- treat duplicate `idempotency_key` as a no-op, not an error
- support at least the current and previous schema `MAJOR` version
  simultaneously during a migration window
- quarantine (not silently drop, not crash) any event that fails validation,
  with a visible integration-health indicator
- expose integration/connector health so a degraded or absent producer is
  visible, not silently treated as "no data"
- fail safely: a consumer that can't reach a producer continues operating on
  its own data — see the independence rules in `product-architecture.md`

## Alert source contract (external SIEM/EDR/XDR/NDR/etc. → SOC)

This is the contract that lets SOC be built and demoed without a native
SIEM. Any source — a real third-party product, a future ZenC SIEM, or a
static seeded fixture — must produce the `alert-envelope` shape
(`schemas/alert-envelope.schema.json`). SOC's Intake Agent and downstream
triage never special-case a specific source system's raw format; adapting a
new source into the envelope is a boundary concern, not a SOC-internal one.
