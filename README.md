# zenc-platform-builder

A reusable Claude Skill governing the design, build, testing, demonstration,
and evolution of the ZenC Security Intelligence Platform:

- **ZenC SIEM** (Detect) — live, full depth, including detection engineering
- **ZenC SOC** (Respond) — live, full depth, the agentic layer
- **ZenC Assessment** (Measure) — fully designed, Phase 2 (dormant; build
  only on explicit request)

See "Scope and non-goals" in `SKILL.md` for exactly what's in each bucket,
including Phase 1.5 items (UEBA, threat-intel, hunting) and what's out of
scope entirely (ZenC Intelligence, full white-labeling, sector-pack
library).

## What's in the package

```
zenc-platform-builder/
├── SKILL.md                     Entry point Claude reads first — principles, scope, routing
├── README.md                    This file
├── references/  (13 files)      Detailed specs, loaded only as needed
├── templates/   (9 files)       Reusable prompts for recurring build/review tasks
├── schemas/     (14 files)      JSON Schema (draft-07) contracts for every shared object
└── examples/    (15 files)      Synthetic instances matching each schema
```

See `SKILL.md` → "Reference index" and "Template index" for what each file
covers and when to read it.

## Installing this skill

**Claude.ai / Claude apps (skills feature):** upload or drag the
`zenc-platform-builder` folder (or the packaged `.zip`) into your skills
library, or use the "Save skill" action if you received this as a file card.

**Claude Code / API:** place the `zenc-platform-builder/` folder under your
project's skills directory so `SKILL.md` is discoverable alongside your
other project skills. `templates/claude-code-bootstrap.md` is written as a
ready-to-paste first prompt for exactly this use.

No dependencies, API keys, or network access are required by the skill
itself. Any application you build *from* it has its own dependencies (see
`references/frontend-ux-spec.md`).

## First prompt to use this skill

For Claude Code specifically, use `templates/claude-code-bootstrap.md`
as-is — it already encodes the recommended build order (SIEM foundation →
correlation/detection → detection-engineering workflow → SOC → coverage
reporting) and the checkpoints Claude Code should hit before each milestone.

For a narrower ask in any Claude surface:

> Using the zenc-platform-builder skill, scaffold the ZenC SIEM Log
> Explorer and a first correlation rule that feeds a real alert-envelope
> into ZenC SOC. Frontend-only, seeded mock data, no backend.

## Design decisions worth knowing before you extend this

- **SIEM and SOC are both live and full-depth; Assessment is complete but
  dormant.** Its spec, schemas, and the SOC→Assessment suggestion pathway
  already exist — reactivating it later is wiring, not a redesign.
- **SIEM is a peer to SOC, not a prerequisite.** SOC's alert intake treats a
  ZenC SIEM alert identically to a third-party one — both are just
  producers of the versioned `alert-envelope` contract.
- **Detection and correlation are deterministic — no LLM decides a match.**
  The Detection Engineer Agent proposes and tests rules; only a human can
  set a rule to `enabled`, mirroring the no-self-approval pattern already
  used for response actions.
- **Every ATT&CK technique claim on an alert must trace to real contributing
  events**, and every enabled rule/playbook step carries a D3FEND mapping or
  an explicit `unmapped` state — never a silent tag or blank field. This is
  enforced in the schemas, not just described in prose.
- **Everything defaults to L1/L2 autonomy and dry-run execution.** Wiring a
  real action executor or a real production detection pipeline is
  explicitly future work, not part of this package.
- **JSON Schema draft-07** is used throughout for broad tool compatibility.

## Assumptions and limitations

See `references/assumptions-and-limitations.md` for the full list. Headlines:

- Frontend-only, mock-data build assumed throughout; no real infra guidance.
- 5–6 synthetic telemetry source families are demo-authentic, not
  exhaustive — not the full source-family list from the original platform
  vision.
- MITRE ATT&CK and D3FEND are seeded, static reference data — the platform
  maps to them, it doesn't author or edit them.
- ZenC Intelligence, full white-labeling, and the multi-sector demo-pack
  library are out of scope, full stop, not just deferred.

## Validation performed on this package

JSON Schema validity, example-against-schema validation (custom draft-07-
subset validator — no network access to install the standard `jsonschema`
package in the environment this was built in), cross-reference integrity,
SKILL.md frontmatter validity, a synthetic-data-only scan, and a dry-run-
only check on action-request examples. All checks passed as of the last
update to this package — re-run them after any edit that adds new schemas,
examples, or cross-references.
