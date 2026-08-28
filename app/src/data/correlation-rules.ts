import type { CorrelationRule } from "@/schemas";
import type { RuleDefinition } from "@/lib/correlation/types";
import { minus } from "@/lib/time";

/**
 * Seeded deterministic correlation rules. No LLM decides a match (SKILL.md #2).
 * `enabled` rules fire against the normalized-event sample; the others exist in
 * the catalog to show the lifecycle. Every `enabled` rule has a human
 * `enabled_by` and a D3FEND mapping; the `peer_review` rule was proposed by the
 * Detection Engineer Agent and is waiting on a human to enable it (SKILL.md #3).
 */
export type SeededRule = Omit<CorrelationRule, "definition"> & {
  definition: RuleDefinition;
  /** alert title + one-line summary the fired alert-envelope inherits */
  alert_title: string;
  alert_summary: (matchCount: number, groupValue: string | undefined) => string;
};

const HUMAN = "user-marcus-senior";
const APPROVER = "user-dana-approver";
const SECTOR = ["BFSI"];

function regression(events: number, expected: number, observed: number, missed = 0, unexpected = 0): CorrelationRule["regression_test_results"] {
  return [
    {
      run_at: minus("2026-08-28T12:00:00.000Z", { days: 3 }),
      corpus_id: "corpus-nwb-2026-08",
      events_evaluated: events,
      expected_matches: expected,
      observed_matches: observed,
      missed_expected: missed,
      unexpected_matches: unexpected,
      noise_indicator: unexpected / Math.max(1, observed),
      execution_time_ms: 40 + (events % 400),
      rule_health: missed > 0 ? "needs_tuning" : unexpected > expected ? "needs_tuning" : "healthy",
    },
  ];
}

function history(states: [string, string, string][]): CorrelationRule["history"] {
  return states.map(([from, to, who], i) => ({
    from_state: from,
    to_state: to,
    changed_by: who,
    changed_at: minus("2026-08-28T12:00:00.000Z", { days: 20 - i * 3 }),
  }));
}

export const CORRELATION_RULES: SeededRule[] = [
  // ---- Northwind Bank ----
  {
    rule_id: "rule-nwb-cred-brute-force",
    tenant_id: "tenant-northwind-bank",
    name: "Credential brute force from a single source",
    version: "2.1.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "threshold",
    severity: "high",
    confidence: 0.7,
    sector_tags: SECTOR,
    attack_mapping: [
      { tactic: "Credential Access", technique_id: "T1110", technique_name: "Brute Force" },
      { tactic: "Credential Access", technique_id: "T1110.001", technique_name: "Brute Force: Password Guessing", sub_technique_id: "T1110.001" },
    ],
    d3fend_mapping: [{ d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 6, 6, 0, 1),
    history: history([
      ["peer_review", "approved", APPROVER],
      ["approved", "enabled", APPROVER],
    ]),
    definition: {
      kind: "threshold",
      match: { event_type: ["windows_security_4625", "linux_sshd_failed", "idp_signin_failure"] },
      group_by: "external_ip",
      threshold: 12,
      window_seconds: 600,
    },
    alert_title: "Credential brute force from a single source address",
    alert_summary: (n, key) => `${n} failed authentications from ${key ?? "one address"} within a 10-minute window.`,
  },
  {
    rule_id: "rule-nwb-brute-then-success",
    tenant_id: "tenant-northwind-bank",
    name: "Failed authentications followed by a success (same account)",
    version: "1.3.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "sequence",
    severity: "critical",
    confidence: 0.62,
    sector_tags: SECTOR,
    attack_mapping: [{ tactic: "Credential Access", technique_id: "T1110", technique_name: "Brute Force" }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 3, 4, 0, 1),
    history: history([
      ["peer_review", "approved", APPROVER],
      ["approved", "enabled", APPROVER],
    ]),
    definition: {
      kind: "sequence",
      steps: [
        { match: { event_type: ["windows_security_4625", "linux_sshd_failed", "idp_signin_failure"] }, min_count: 6 },
        { match: { event_type: ["windows_security_4624", "linux_sshd_accepted", "idp_signin_success"] } },
      ],
      join_by: "entity.user",
      within_seconds: 1800,
    },
    alert_title: "Possible successful brute force",
    alert_summary: (n, key) => `Account ${key ?? "(unknown)"} authenticated successfully after ${n - 1}+ failures within 30 minutes.`,
  },
  {
    rule_id: "rule-nwb-external-port-scan",
    tenant_id: "tenant-northwind-bank",
    name: "External port / service scan against the perimeter",
    version: "1.1.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "threshold",
    severity: "medium",
    confidence: 0.55,
    sector_tags: SECTOR,
    attack_mapping: [{ tactic: "Discovery", technique_id: "T1046", technique_name: "Network Service Discovery" }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-NTA", d3fend_technique_name: "Network Traffic Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 5, 5),
    history: history([["approved", "enabled", APPROVER]]),
    definition: {
      kind: "threshold",
      match: { event_type: ["firewall_deny"], external_ip: true },
      group_by: "external_ip",
      threshold: 18,
      window_seconds: 300,
    },
    alert_title: "External scan against the perimeter firewall",
    alert_summary: (n, key) => `${n} denied connections from ${key ?? "one external address"} in 5 minutes — consistent with scanning.`,
  },
  {
    rule_id: "rule-nwb-cloud-guardrail-off",
    tenant_id: "tenant-northwind-bank",
    name: "Cloud security guardrail disabled",
    version: "1.0.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "single_event",
    severity: "high",
    confidence: 0.9,
    sector_tags: SECTOR,
    attack_mapping: [
      { tactic: "Defense Evasion", technique_id: "T1562", technique_name: "Impair Defenses" },
      { tactic: "Defense Evasion", technique_id: "T1562.001", technique_name: "Impair Defenses: Disable or Modify Tools", sub_technique_id: "T1562.001" },
    ],
    d3fend_mapping: [{ d3fend_technique_id: "D3-ACA", d3fend_technique_name: "Application Configuration Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 2, 2),
    history: history([["approved", "enabled", APPROVER]]),
    definition: { kind: "single_event", match: { event_type: ["cloud_guardrail_disabled"] } },
    alert_title: "Cloud security guardrail disabled",
    alert_summary: (_n, key) => `${key ?? "A principal"} disabled a configuration recorder, trail, or retention policy.`,
  },
  {
    rule_id: "rule-nwb-mailbox-forwarding",
    tenant_id: "tenant-northwind-bank",
    name: "External mailbox forwarding rule created",
    version: "1.2.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "single_event",
    severity: "high",
    confidence: 0.75,
    sector_tags: SECTOR,
    attack_mapping: [{ tactic: "Exfiltration", technique_id: "T1114", technique_name: "Email Collection" }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-MA", d3fend_technique_name: "Message Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 3, 3),
    history: history([["approved", "enabled", APPROVER]]),
    definition: { kind: "single_event", match: { event_type: ["email_forwarding_rule_created"] } },
    alert_title: "Mailbox auto-forwarding rule created",
    alert_summary: (_n, key) => `${key ?? "A mailbox"} created an inbox rule that forwards mail to an external address.`,
  },
  {
    rule_id: "rule-nwb-iam-then-download",
    tenant_id: "tenant-northwind-bank",
    name: "IAM change followed by bulk object retrieval (same principal)",
    version: "1.0.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "entity_join",
    severity: "high",
    confidence: 0.6,
    sector_tags: SECTOR,
    attack_mapping: [
      { tactic: "Privilege Escalation", technique_id: "T1078.004", technique_name: "Valid Accounts: Cloud Accounts", sub_technique_id: "T1078.004" },
      { tactic: "Exfiltration", technique_id: "T1567", technique_name: "Exfiltration Over Web Service" },
    ],
    d3fend_mapping: [{ d3fend_technique_id: "D3-UAN", d3fend_technique_name: "User Behavior Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 2, 3, 0, 1),
    history: history([["approved", "enabled", APPROVER]]),
    definition: {
      kind: "entity_join",
      left: { event_type: ["cloud_iam_policy_change"] },
      right: { event_type: ["cloud_storage_download"] },
      join_by: "entity.user",
      within_seconds: 3600,
    },
    alert_title: "Privilege change then bulk retrieval by the same principal",
    alert_summary: (_n, key) => `${key ?? "A principal"} changed IAM policy and then retrieved objects from sensitive storage within the hour.`,
  },
  {
    // agent-proposed, NOT enabled — a human must do that (SKILL.md #3)
    rule_id: "rule-nwb-offhours-role-grant",
    tenant_id: "tenant-northwind-bank",
    name: "Privileged role granted outside business hours",
    version: "0.2.0",
    lifecycle_state: "peer_review",
    proposed_by: "detection-engineer-agent",
    rule_type: "single_event",
    severity: "medium",
    confidence: 0.5,
    sector_tags: SECTOR,
    attack_mapping: [{ tactic: "Persistence", technique_id: "T1078", technique_name: "Valid Accounts" }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 4, 5, 1, 2),
    history: history([
      ["draft", "test", "detection-engineer-agent"],
      ["test", "peer_review", "detection-engineer-agent"],
    ]),
    definition: {
      kind: "single_event",
      match: { event_type: ["idp_role_grant", "cloud_iam_policy_change"], time_of_day: { after_hour: 0, before_hour: 5 } },
    },
    alert_title: "Off-hours privileged role grant",
    alert_summary: (_n, key) => `${key ?? "A principal"} was granted a privileged role between 00:00 and 05:00 UTC.`,
  },
  {
    rule_id: "rule-nwb-powershell-download",
    tenant_id: "tenant-northwind-bank",
    name: "PowerShell script activity on multiple hosts (broad)",
    version: "1.4.0",
    lifecycle_state: "disabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "threshold",
    severity: "low",
    confidence: 0.35,
    sector_tags: SECTOR,
    attack_mapping: [
      { tactic: "Execution", technique_id: "T1059", technique_name: "Command and Scripting Interpreter" },
      { tactic: "Execution", technique_id: "T1059.001", technique_name: "Command and Scripting Interpreter: PowerShell", sub_technique_id: "T1059.001" },
    ],
    d3fend_mapping: [{ d3fend_technique_id: "D3-PSA", d3fend_technique_name: "Process Spawn Analysis", category: "Detect" }],
    regression_test_results: regression(48000, 8, 26, 0, 18),
    history: history([
      ["enabled", "disabled", HUMAN],
    ]),
    definition: {
      kind: "threshold",
      match: { event_type: ["windows_powershell_4104"] },
      group_by: "entity.user",
      threshold: 3,
      window_seconds: 3600,
    },
    alert_title: "Broad PowerShell activity",
    alert_summary: (n, key) => `${n} PowerShell script-block events for ${key ?? "one account"} in an hour.`,
  },

  // ---- Northwind Markets ----
  {
    rule_id: "rule-nwm-cred-brute-force",
    tenant_id: "tenant-northwind-markets",
    name: "Credential brute force from a single source",
    version: "2.1.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "threshold",
    severity: "high",
    confidence: 0.7,
    sector_tags: SECTOR,
    attack_mapping: [{ tactic: "Credential Access", technique_id: "T1110", technique_name: "Brute Force" }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-IAA", d3fend_technique_name: "Identity and Access Analysis", category: "Detect" }],
    regression_test_results: regression(31000, 4, 4),
    history: history([["approved", "enabled", APPROVER]]),
    definition: {
      kind: "threshold",
      match: { event_type: ["windows_security_4625", "idp_signin_failure"] },
      group_by: "external_ip",
      threshold: 12,
      window_seconds: 600,
    },
    alert_title: "Credential brute force from a single source address",
    alert_summary: (n, key) => `${n} failed authentications from ${key ?? "one address"} within a 10-minute window.`,
  },
  {
    rule_id: "rule-nwm-external-port-scan",
    tenant_id: "tenant-northwind-markets",
    name: "External port / service scan against the perimeter",
    version: "1.1.0",
    lifecycle_state: "enabled",
    proposed_by: HUMAN,
    enabled_by: APPROVER,
    rule_type: "threshold",
    severity: "medium",
    confidence: 0.55,
    sector_tags: SECTOR,
    attack_mapping: [{ tactic: "Discovery", technique_id: "T1046", technique_name: "Network Service Discovery" }],
    d3fend_mapping: [{ d3fend_technique_id: "D3-NTA", d3fend_technique_name: "Network Traffic Analysis", category: "Detect" }],
    regression_test_results: regression(31000, 3, 3),
    history: history([["approved", "enabled", APPROVER]]),
    definition: {
      kind: "threshold",
      match: { event_type: ["firewall_deny"], external_ip: true },
      group_by: "external_ip",
      threshold: 18,
      window_seconds: 300,
    },
    alert_title: "External scan against the perimeter firewall",
    alert_summary: (n, key) => `${n} denied connections from ${key ?? "one external address"} in 5 minutes.`,
  },
];
