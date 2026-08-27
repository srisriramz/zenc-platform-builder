# Product Architecture

## Products and build stage

```
ZenC Security Intelligence Platform
|
|-- ZenC SIEM  (Detect)  -- LIVE, full depth
|   |-- Telemetry Collection & Connectors
|   |-- Parsing / Normalization / Enrichment
|   |-- Log Explorer
|   |-- Correlation Engine
|   |-- Detection Engineering (rule builder, versioning, regression testing, peer review)
|   |-- Detection Coverage (ATT&CK x D3FEND)
|
|-- ZenC SOC  (Respond)  -- LIVE, full depth
|   |-- Alert Intake
|   |-- Triage
|   |-- Case Management (incl. ATT&CK technique breakdown per case)
|   |-- Evidence Management
|   |-- Timelines
|   |-- Tasks and SLA
|   |-- Agentic Investigation  (see agentic-architecture.md)
|   |-- SOAR / Playbooks (incl. D3FEND response mapping)
|   |-- Approvals
|   |-- Response Execution (deterministic)
|   |-- Verification and Rollback
|   |-- SOC Reporting (incl. pipeline-latency and coverage KPIs)
|
|-- ZenC Assessment  (Measure)  -- PHASE 2, designed but dormant
|   |-- ZSIF / ZSIS, Templates, Evidence, Risk Register, Roadmap, Reports
|   |-- (see assessment-spec.md; do not build UI without explicit request)
|
|-- Shared Platform Services
    |-- Identity and Access (users, roles, RBAC/ABAC)
    |-- Partner and Tenant Management
    |-- Product Entitlements
    |-- Policy Engine  (approval rules, autonomy policy, rule-promotion policy, kill switches)
    |-- Audit
    |-- Notifications
    |-- Feature Flags
    |-- Observability (SIEM connector/rule health + SOC integration health)
```

## Deferred scope

- **Phase 1.5** — UEBA, threat-intel feed management, full threat hunting as modules. The Hunt Agent and a Threat Intelligence lookup tool exist in the agentic layer with minimal defined roles; don't expand them into full modules without being asked.
- **Phase 2** — ZenC Assessment. Fully speced (`assessment-spec.md`), schemas exist, SOC's suggestion pathway to it exists. Reactivate only on explicit request.
- **Out of scope, full stop** — ZenC Intelligence (Digital Twin, Security Intelligence Graph, Digital Advisor beyond the SOC-scoped agent, Executive/MSSP Command Centers), full white-label system, multi-sector demo-pack library. Assume one demo brand, one demo sector.

## Independence rules

- SIEM must start, run, and be demoed with SOC entirely absent — ingestion, parsing, Log Explorer, correlation, and detection engineering all work standalone.
- SOC must start, run, and be demoed with SIEM entirely absent — third-party alert sources prove this; SOC never special-cases "native" vs "third-party" in its own logic.
- Neither product reads the other's database/store directly. All crossing traffic goes through `inter-product-contracts.md`.
- A SIEM outage must not prevent SOC from completing triage/case work on alerts already received, and must not block third-party-sourced alerts at all. A SOC outage must not prevent SIEM from ingesting, parsing, searching, or correlating.
- In a mock/demo build: don't let a SOC screen block-render on a SIEM API call, and vice versa — degrade gracefully (see the "degraded source" state in `frontend-ux-spec.md`).

## Shared services — what each one actually needs to do here

| Service | Minimum scope for this skill |
|---|---|
| Identity and Access | Login, role assignment, RBAC (who can view/approve/execute/enable-a-rule), simple ABAC by tenant |
| Partner and Tenant Management | Tenant switcher, tenant-scoped data isolation in mock store |
| Product Entitlements | Flags per tenant: has_siem, has_soc, has_assessment (independently toggleable; assessment defaults off until Phase 2) |
| Policy Engine | Per-tenant autonomy-level, action-class, and rule-promotion policy; approval routing |
| Audit | Append-only log of approvals, actions, rule state changes, role changes, evidence changes |
| Notifications | In-app only for demo purposes; no real email/SMS integration required |
| Feature Flags | Toggle demo-only vs "full" UI surfaces per environment |
| Observability | Connector health per telemetry/alert source, rule health, integration health used by degraded-state UI |

Do not build Data Residency Metadata, full Branding/White-Labeling service, or Metering as first-class shared services in this version.
