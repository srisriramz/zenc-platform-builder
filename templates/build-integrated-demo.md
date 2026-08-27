# Template: Build the Integrated Guided Demo

Use when wiring the guided cross-product demo flow described in
`references/launch-demo-spec.md`. Read that file first — it defines the
step sequence; this template is the build checklist for making each step
real rather than a static screenshot.

```
Build the guided demo flow for [mode: 5-minute executive / 12-minute
technical / detection-engineering / SIEM-only / SOC-with-third-party-source /
kiosk / Assessment-only (Phase 2)].

Context to load first:
- references/launch-demo-spec.md (the step sequence for this mode)
- references/native-siem-spec.md and/or references/soc-spec.md as relevant
- references/agentic-architecture.md (steps involving agents/approvals)
- schemas/ (every object the flow touches should validate against its
  schema, using examples/ as the seed data source)

Requirements:
1. Every step updates real seeded mock state — no step may be a static
   screenshot standing in for interaction.
2. If the flow includes rule promotion, the enable step must use two
   distinct seeded principals (proposer != approver) — a good moment to
   visibly demonstrate the human-only enable rule, not just satisfy it
   silently.
3. The approval step (response actions) must likewise use two distinct
   seeded principals (requester != approver).
4. The response-execution step is dry-run only, with verification and
   rollback both visibly demonstrable, not just claimed in a tooltip.
5. Kill-switch/simulation-indicator state is visible throughout, not just
   on a settings screen.
6. If the flow touches an alert, its attack_techniques must be clickable
   through to real contributing_event_refs — this is often the single most
   convincing moment in a technical demo, don't shortcut it.
7. Provide play/pause/previous/next/replay-step/reset controls, a duration
   selector, presenter notes per step, and a fallback snapshot per step in
   case live state fails to render.
8. The non-removable "Interactive Demo with Mock Data" notice persists
   through every step (frontend-ux-spec.md).

Deliverable: [demo controller component / route / step config]
```

## Reminders

- Don't let the integrated demo secretly require every product to be
  "installed" — a mode that's supposed to demonstrate SIEM-alone or
  SOC-alone must actually run with the other products' routes
  absent/disabled, not just hidden in the nav. Assessment-only mode is
  Phase 2 — build only on explicit request.
- If a step needs data that doesn't fit an existing schema/example, extend
  the schema first (see `SKILL.md` → "Schemas and examples"), then add the
  fixture — don't hand-wave the shape just for the demo.
