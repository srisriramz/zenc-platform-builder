# Template: Claude Code Bootstrap Prompt

Use this as the first prompt when handing this skill + an empty (or
existing) repo to Claude Code for the actual build.

```
This repo will implement ZenC SIEM and ZenC SOC using the
zenc-platform-builder skill (already available in this project's skills).
ZenC Assessment is designed (Phase 2) but not part of this build unless I
say otherwise. Before writing any code:

1. Read SKILL.md in full, then references/product-architecture.md.
2. Propose a build order. Default assumption, in this sequence:
   a. ZenC SIEM foundation: telemetry ingestion against 5-6 synthetic
      source families (Windows, Linux/syslog, firewall, cloud, identity,
      email), Log Explorer over seeded data, per
      references/native-siem-spec.md.
   b. Correlation engine + a small set of deterministic, ATT&CK-mapped
      rules producing real alert-envelope objects with structured
      attack_techniques citing contributing_event_refs.
   c. Detection engineering workflow end to end: Detection Engineer Agent
      proposes a rule, regression test runs, peer review, human-only
      enable — use templates/build-detection-rule.md for this.
   d. ZenC SOC: alert intake consuming the alert-envelope contract (prove
      it works with both a native-SIEM-produced alert AND a
      third-party-shaped fixture), triage through response, all 12 agents
      per references/agentic-architecture.md, ending in a first dry-run
      response action with approval.
   e. ATT&CK x D3FEND coverage matrix and the SOC KPI/pipeline-latency
      reporting screen, tying SIEM and SOC data together.
   Assessment is out of this sequence entirely unless explicitly requested.
3. Set up the frontend per references/frontend-ux-spec.md (Next.js App
   Router, strict TypeScript, Tailwind, shadcn/ui, TanStack Query/Table,
   Zustand for the specific slices listed there only).
4. Seed deterministic mock data matching schemas/ and examples/ — don't
   invent parallel shapes. In particular, seed the ATT&CK and D3FEND
   reference libraries as static data before building anything that maps
   to them.
5. Before implementing any agent, use templates/build-agent.md and confirm
   its autonomy level, action-class ceiling, and tool allowlist against
   references/agentic-architecture.md.
6. Before implementing any rule or playbook lifecycle transition, confirm
   the human-only "enabled" transition is enforced at the validation/schema
   layer, not just the UI — see SKILL.md principle #3 and
   schemas/correlation-rule.schema.json / schemas/playbook.schema.json.
7. Before implementing any action/approval flow, confirm the no-self-
   approval rule is enforced at the validation/schema layer, not just the
   UI — see references/agentic-architecture.md and
   schemas/action-request.schema.json.
8. Before implementing the Log Explorer or rule builder, confirm the query/
   rule surface is structured and bounded — never eval, arbitrary SQL,
   arbitrary shell, or unsafe regex — see references/security-governance.md.
9. Run templates/review-security.md and, for any agent work,
   templates/review-agent-safety.md before marking a milestone complete.

Confirm this plan with me before generating the first commit's worth of
code. Ask about anything ambiguous that touches autonomy levels, approval
rules, rule-promotion rules, or product boundaries — everything else, make
a reasonable assumption, note it, and proceed.
```
