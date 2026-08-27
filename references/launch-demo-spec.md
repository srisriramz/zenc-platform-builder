# Launch / Guided Demo Spec

Scope here is deliberately smaller than a full multi-sector, multi-brand
platform demo (see out-of-scope items in `product-architecture.md`). This
covers a single-brand, single-sector guided walkthrough of SIEM and SOC
(both primary now), plus the detection-engineering workflow specifically —
this is the differentiation moment for prospects comparing SIEM/SOAR
vendors on agentic depth.

## Modes

- 5-minute executive walkthrough (dashboard → one case → outcome)
- 12-minute analyst/technical walkthrough (telemetry → detect → triage →
  investigate → approve → dry-run respond → verify)
- Detection-engineering walkthrough (rule proposal → regression test →
  peer review → enable) — standalone, ~5 minutes, aimed at a technical
  buyer specifically
- SIEM-only walkthrough (independent of SOC)
- SOC-with-third-party-alert-source walkthrough (proves the independence
  and alert-envelope contract are real, not just claimed)
- Self-service kiosk mode (same flow, unattended, with reset)
- Assessment-only walkthrough — Phase 2, build only once reactivated

## Guided integrated flow (SIEM → SOC)

1. Select entry point (default: SIEM dashboard)
2. Load seeded tenant/demo data — connector health shown for all synthetic
   telemetry sources
3. Search the Log Explorer live against seeded telemetry to establish the
   data is real and queryable, not a screenshot
4. A correlation rule fires on the seeded telemetry → alert generated with
   a structured `attack_techniques` claim citing specific contributing
   events (click through to prove the trace)
5. Alert flows into SOC via the alert-envelope contract → Intake Agent
   normalizes it (this step is the proof the contract is real — the same
   path a third-party source would use)
6. Triage Agent recommends severity/grouping → analyst confirms → case opens
7. Enrichment Agent attaches context
8. Investigation Agent drafts findings with cited evidence
9. Analyst opens `/agents/runs/[id]` to inspect the agent trail
10. Response Planner proposes a playbook step (labeled with its action
    class and D3FEND response mapping)
11. Approval requested → a **different** principal approves (never the
    requester) → kill-switch/simulation state visibly shown throughout
12. Response Executor runs the action **as dry-run** → verification step
    shown → rollback path demonstrated
13. Case closes with a closure classification
14. Optional (Phase 2 only): case suggests an Assessment finding → switch
    to Assessment → reviewer approves/dismisses the suggestion
15. Executive summary screen: KPIs (`soc-spec.md`), pipeline-latency
    breakdown, and detection/defensive coverage % from the ATT&CK × D3FEND
    matrix

Every step updates real (seeded, deterministic) mock state — no step is a
static screenshot standing in for interaction.

## Detection-engineering walkthrough (standalone beat)

1. Detection Engineer Agent proposes a new correlation rule (or a change to
   an existing one) in response to a stated gap (e.g., an uncovered
   technique from the coverage matrix)
2. Rule builder shows the structured (non-code) rule definition, its ATT&CK
   and D3FEND mappings
3. Regression test runs live against the synthetic corpus → results shown:
   events evaluated, expected vs. observed matches, missed detections,
   false matches, noise indicators, rule health
4. Rule moves to peer review → a **different** human principal reviews and
   approves → rule state moves to `enabled` — explicitly demonstrate that
   the agent could not have done this step itself
5. Coverage matrix updates live to reflect the newly enabled rule

## Controls

Play / pause / previous / next / replay-step / reset, duration selector,
presenter notes per step, and a fallback snapshot to recover from if a step
fails to render live (a fallback is a known-good static state to jump to,
not silent failure).

## What this demo must never claim

Same list as `security-governance.md`: no claims of production-grade
isolation, immutable audit, deployed infrastructure, validated resilience,
regulatory compliance, or guaranteed security. The non-removable demo notice
(`frontend-ux-spec.md`) stays visible through every step and every mode.
