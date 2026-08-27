# Assumptions and Limitations

This skill governs a platform build sequenced in phases. This file
documents what's live, what's deferred and why, and what a future revision
would need to close.

## Current build stage

- **Live now, full depth:** ZenC SIEM (telemetry through detection
  engineering and ATT&CK×D3FEND coverage) and ZenC SOC (agentic
  triage-to-response, all 12 agents, playbooks, approvals).
- **Phase 1.5, explicitly deferred:** UEBA, threat-intel feed management,
  full threat hunting as modules. The Hunt Agent and a minimal
  threat-intel lookup exist in the agentic layer already, reserved for
  this — don't expand them without being asked.
- **Phase 2, fully designed but dormant:** ZenC Assessment. Its spec
  (`references/assessment-spec.md`), schemas, and the SOC→Assessment
  suggestion pathway (`inter-product-contracts.md`) already exist and don't
  need redesigning — reactivating it is wiring and UI work, not
  architecture work. Build its UI only on explicit request.
- **Deliberately out of scope, full stop:** ZenC Intelligence (Digital
  Twin, Security Intelligence Graph, Digital Advisor beyond the SOC-scoped
  agent, Executive/MSSP Command Centers), full white-label branding system,
  multi-sector demo-pack library. A single demo brand and a single demo
  sector are assumed throughout.

## Assumptions made without asking

- **Frontend-only, mock-data build** is the default target unless a
  conversation says otherwise. No real backend, real credentials, or real
  tenant data are assumed anywhere.
- **JSON Schema draft-07** for all schemas, for broad tool compatibility.
- **5–6 synthetic telemetry source families** (Windows, Linux/syslog,
  firewall, cloud, identity, email) are demo-authentic without being
  exhaustive; the full 13-family list from the original platform vision is
  not required to make the demo credible.
- **One independent human approver** satisfies the "independent approval"
  requirement for A4 by default; a stricter two-named-approver rule is
  something a specific tenant's policy can add, not this skill's default.
  The same single-independent-approver bar applies to rule promotion to
  `enabled`.
- **MITRE ATT&CK and MITRE D3FEND are seeded, static reference data.** The
  platform maps to them; it doesn't author, edit, or version them itself.
- **BFSI-style generic enterprise context** is a reasonable default sector
  if a demo needs *a* sector and the user hasn't specified one.
- **The Assessment Assistant agent's suggestions to Assessment** (Phase 2)
  reuse Assessment's existing manual-submission review-queue shape (tagged
  `origin: "soc"`) rather than introducing a parallel review pathway.

## Known gaps a future revision of this skill should close

- No design for what real (non-dry-run) action execution or real rule
  enforcement requires beyond the contract and safety pattern — wiring a
  real executor or a real detection pipeline against real infrastructure is
  explicitly future work.
- No tuning pipeline for the analyst-feedback loop described in
  `agentic-architecture.md` — this skill defines the structured record, not
  what consumes it.
- No multi-region / data-residency design, despite the full platform vision
  calling for residency metadata as a shared service.
- No localization/i18n design for either product's UI or reports.
- No explicit performance/scale targets (telemetry volume, alert throughput,
  concurrent agent runs, query latency under load) — treat any number you
  generate for these as illustrative, not a spec, unless a user gives you
  one.
- Detection coverage and defensive coverage percentages are computed over
  whatever technique set the demo seeds — they are not claims about
  coverage against the full ATT&CK matrix unless the seed data actually
  spans it. Don't let generated copy imply more than the seeded scope
  supports.

## Validation performed when this package was built/updated

JSON Schema validity (all files in `schemas/` parse and are valid draft-07
schemas), example-against-schema validation (every file in `examples/`
validates against its matching schema via a custom draft-07-subset
validator, since network access to install the standard `jsonschema`
package wasn't available), cross-reference check (every file path
referenced from `SKILL.md`, `README.md`, or another reference file exists
in the package), YAML frontmatter validity for `SKILL.md`, a
synthetic-data-only scan of `examples/` (no real-looking credentials, card
numbers, IPs, or production-style endpoints), and a dry-run-only check on
every example action request. See the conversation in which this package
was built/updated for the specific results; re-run these checks after
future edits.
