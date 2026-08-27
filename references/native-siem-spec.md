# Native SIEM Spec

ZenC SIEM must run completely without ZenC SOC. Its job ends at producing a
valid `alert-envelope` (`schemas/alert-envelope.schema.json`) — everything
downstream of that boundary belongs to `soc-spec.md`. Detection and
correlation logic here is deterministic by design (see `SKILL.md` principle
#2) — no LLM inference decides whether a rule matches or what severity an
event gets.

## Telemetry collection

Synthetic source families in scope (demo-authentic, not exhaustive):
**Windows, Linux/syslog, firewall, cloud, identity, email.** Each source has
a connector with:

- health state: `healthy | degraded | stale | unknown`
- ingestion lag (time between event `occurred_at` and `ingested_at`)
- schema validation on arrival — malformed events are quarantined (visible
  queue), never silently dropped
- deduplication
- routing, and dead-letter handling for anything that fails normalization
  after quarantine review

Every event is preserved in two forms: raw (as received) and normalized
(post parse/normalize/enrich), linked by `event lineage` so a Log Explorer
user can always trace a normalized event back to its raw source.

## Log Explorer

Required capabilities:

- free-text search and structured search over the same underlying query
- a **safe query parser and query builder** — equality, inequality, exists,
  wildcard, ranges, boolean conditions, time filters. This never compiles to
  eval, arbitrary SQL, arbitrary shell, or unsafe regular expressions — this
  is a hard constraint from `SKILL.md` principle #9, not a style preference.
- time histogram, source/field/sector filters, tenant-scoped visibility
- raw event view and normalized event view side by side, with parser
  version and schema version shown
- event lineage, related events, asset/identity context where available,
  correlation IDs
- field statistics and value distributions, pivots, bookmarks, saved
  searches, search history
- tenant-safe CSV/JSON export (no cross-tenant leakage, no raw secrets in
  export)

Required UI states (see `frontend-ux-spec.md` for the full shared list):
loading, no results, malformed query, timeout, partial results, stale data,
degraded source, access denied, success. A malformed query must produce a
clear, specific error — never a silent empty result set.

## Correlation engine

Deterministic rule types: single-event, multi-event sequence, threshold,
aggregation, field joins, entity joins, time windows, exclusions,
allowlists, suppression, alert grouping, event deduplication.

Every alert a correlation rule produces carries:

- severity, confidence, sector tags
- **structured `attack_techniques`** — not a flat tag list. Each entry
  names a tactic/technique(/sub-technique) and cites the specific
  `normalized_event` IDs that justify it (`SKILL.md` principle #10; see
  `schemas/alert-envelope.schema.json` and `schemas/normalized-event.schema.json`).
  A rule's *canonical* technique mapping (set at authoring time, in
  `schemas/correlation-rule.schema.json`) is what a fired alert inherits,
  but the specific contributing events are always the real events that
  matched — this is what makes the technique breakdown panel in
  `soc-spec.md`/`frontend-ux-spec.md` traceable rather than decorative.
- full event-to-alert evidence lineage

## Detection engineering

Rule lifecycle mirrors the SOC playbook lifecycle exactly, deliberately —
one governance pattern across the platform:

```
draft → test → peer review → approved → enabled → disabled → retired
```

- The **Detection Engineer Agent** may propose a new rule or propose a
  change to an existing one, and may run it against the synthetic test
  corpus. It can move a rule from `draft` to `test` to submit-for-review.
  It can **never** set a rule's state to `enabled` — that is a human action,
  always, regardless of tenant policy (`SKILL.md` principle #3).
- A rule builder is structured/visual — the same "no eval, no arbitrary
  code" constraint from the Log Explorer applies to rule authoring too.
- Regression testing against deterministic synthetic datasets must report:
  events evaluated, expected matches, observed matches, missed expected
  detections, unexpected matches, noise indicators, execution time, schema
  dependencies, and a rule-health verdict. A rule existing and firing in a
  test does not by itself prove detection quality — don't let UI copy imply
  otherwise.
- Version comparison and rollback are required, matching the "load-bearing,
  not decorative" bar for kill switches/rollback in `SKILL.md`.
- Every rule declares a **D3FEND mapping** (one or more D3FEND technique
  IDs/names/categories representing how it detects, e.g. Network Traffic
  Analysis, File Analysis) or is explicitly marked `unmapped` — never
  silently omitted. See `schemas/correlation-rule.schema.json`.

## Detection coverage

Stage a technique's coverage honestly, not as a single "covered/not
covered" flag:

```
telemetry available → telemetry collected → telemetry parsed →
activity detected → events correlated → investigation ready → response ready
```

A rule existing does not automatically mean a technique is fully covered —
show the actual stage.

**ATT&CK × D3FEND coverage matrix**: per technique, is it detected (an
enabled rule with a technique mapping) and is there a mapped response (a
playbook step with a D3FEND response-side mapping, per `soc-spec.md`)? This
is the platform's strongest "what's covered and what responds to it" view —
treat it as a first-class screen, not a report appendix.

Derived KPIs (feed into SOC reporting, see `soc-spec.md`):
- **Detection coverage %** — techniques with an enabled rule ÷ techniques in
  scope
- **Defensive coverage %** — techniques with a mapped D3FEND control ÷
  techniques in scope

## Reference frameworks (seeded, not authored by the product)

Treat the MITRE ATT&CK and MITRE D3FEND libraries as static reference data
you seed into the demo environment, the same way `assessment-spec.md`
treats compliance control frameworks — the product maps *to* them, it does
not edit or author them.

## Required routes

```
/siem-dashboard
/telemetry
/log-explorer
/correlation
/detections
/coverage
```

## Explicit out of scope here

UEBA, threat-intel feed ingestion/management, security data lake
storage-tier concepts (hot/warm/archive), and cost-optimization tooling are
Phase 1.5 or later — see `product-architecture.md`. If a demo needs "UEBA,"
seed a static risk-score fixture rather than building the module.
