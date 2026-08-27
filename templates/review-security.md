# Template: General Security/Privacy Review

Run this over any feature before shipping — broader than
`review-agent-safety.md`, which is agent-specific.

## Access and isolation

- [ ] Is tenant isolation enforced at the data-access layer, not just
      filtered in the UI?
- [ ] Does RBAC/ABAC actually block a role without permission at the
      write/action layer, not just hide the button?
- [ ] Are product entitlements (has_assessment / has_soc) checked
      independently — enabling one never implicitly enables the other?

## Untrusted data

- [ ] Is every externally-sourced field (alerts, evidence, enrichment
      results, uploads) treated strictly as data, never as instruction to
      any agent or system prompt?
- [ ] Are limits (query scope, time range, result size, token budget,
      iteration count, cost) enforced on every tool call this feature
      introduces?

## Audit

- [ ] Does this feature emit an audit event (`audit-event.schema.json`) for
      every approval, execution, and evidence/role/entitlement change it
      introduces?
- [ ] Are audit events append-only — no in-place edits, only new entries
      referencing prior ones for corrections?

## Secrets and redaction

- [ ] Does this feature avoid exposing credentials/secrets/tokens to any
      model, prompt, tool result, or stored agent-message?
- [ ] Is localStorage usage (if any) limited to non-sensitive demo state —
      never secrets or security evidence?

## Data safety in samples/fixtures

- [ ] Does any seed data, example, or fixture this feature introduces avoid
      real credentials, real customer/patient identities, real IPs, card
      data, or real production endpoints?
- [ ] Is every response action in seed/example data dry-run/simulation-only?

## Claims

- [ ] Does any generated copy (UI text, reports, marketing-adjacent
      language) avoid overstating what a browser-only demo build actually
      provides (production-grade isolation, immutable audit, deployed
      infrastructure, validated resilience, regulatory compliance,
      guaranteed security)?
- [ ] Does ZSIS, wherever it appears, carry its indicative label?

If a box is unchecked, treat it as a blocker, not a note for later.
