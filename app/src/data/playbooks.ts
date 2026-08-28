import type { Playbook } from "@/schemas";
import { minus } from "@/lib/time";

/**
 * Seeded response playbooks. Same discipline as correlation rules: `enabled`
 * playbooks have a human `enabled_by` and a full history; the `peer_review`
 * one was proposed by the Response Planner agent and is waiting on a human —
 * the agent cannot enable it (soc-spec.md).
 *
 * Every step carries its `action_class` up front and either a response-side
 * `d3fend_mapping` or an explicit `d3fend_unmapped` marker.
 */
export type SeededPlaybook = Playbook & {
  /** ATT&CK techniques this playbook is a response to — used by the Response Planner to match a case */
  applies_to_techniques: string[];
};

const now = "2026-08-28T12:00:00.000Z";
const HUMAN_AUTHOR = "user-marcus-senior";
const APPROVER = "user-dana-approver";
const ENABLER = "user-ravi-manager";

const D3 = {
  NI: { d3fend_technique_id: "D3-NI", d3fend_technique_name: "Network Isolation", category: "Isolate" },
  PT: { d3fend_technique_id: "D3-PT", d3fend_technique_name: "Process Termination", category: "Evict" },
  ACH: { d3fend_technique_id: "D3-ACH", d3fend_technique_name: "Account Locking", category: "Isolate" },
  ANCI: { d3fend_technique_id: "D3-ANCI", d3fend_technique_name: "Authentication Cache Invalidation", category: "Evict" },
  OTF: { d3fend_technique_id: "D3-OTF", d3fend_technique_name: "Outbound Traffic Filtering", category: "Isolate" },
  ITF: { d3fend_technique_id: "D3-ITF", d3fend_technique_name: "Inbound Traffic Filtering", category: "Isolate" },
};

function enabledHistory() {
  return [
    { from_state: "draft", to_state: "test", changed_by: HUMAN_AUTHOR, changed_at: minus(now, { days: 30 }) },
    { from_state: "test", to_state: "peer_review", changed_by: HUMAN_AUTHOR, changed_at: minus(now, { days: 28 }) },
    { from_state: "peer_review", to_state: "approved", changed_by: APPROVER, changed_at: minus(now, { days: 26 }) },
    { from_state: "approved", to_state: "enabled", changed_by: ENABLER, changed_at: minus(now, { days: 25 }) },
  ];
}

type Template = {
  slug: string;
  name: string;
  applies_to_techniques: string[];
  steps: SeededPlaybook["steps"];
  state?: SeededPlaybook["lifecycle_state"];
  proposed_by?: string;
  history?: SeededPlaybook["history"];
  test_results?: SeededPlaybook["test_results"];
};

const TEMPLATES: Template[] = [
  {
    slug: "contain-endpoint",
    name: "Contain a compromised endpoint",
    applies_to_techniques: ["T1486", "T1071", "T1055", "T1059", "T1490"],
    steps: [
      { step_id: "s1", order: 1, action_class: "A2", action_type: "create_containment_tasks", description: "Open the standard containment task set (memory capture, backup check).", d3fend_unmapped: true },
      { step_id: "s2", order: 2, action_class: "A3", action_type: "isolate_host", description: "Isolate the affected host at the network layer (do not power off).", d3fend_mapping: [D3.NI] },
      { step_id: "s3", order: 3, action_class: "A3", action_type: "terminate_malicious_process", description: "Terminate the identified malicious process on the host.", d3fend_mapping: [D3.PT] },
    ],
  },
  {
    slug: "compromised-account",
    name: "Respond to a compromised account",
    applies_to_techniques: ["T1078", "T1078.004", "T1110", "T1621"],
    steps: [
      { step_id: "s1", order: 1, action_class: "A2", action_type: "open_identity_review_task", description: "Open an identity review task and pull the full auth timeline.", d3fend_unmapped: true },
      { step_id: "s2", order: 2, action_class: "A3", action_type: "disable_account", description: "Disable the compromised account.", d3fend_mapping: [D3.ACH] },
      { step_id: "s3", order: 3, action_class: "A3", action_type: "revoke_sessions", description: "Revoke all active sessions and refresh tokens for the account.", d3fend_mapping: [D3.ANCI] },
    ],
  },
  {
    slug: "block-c2",
    name: "Block C2 infrastructure at the perimeter",
    applies_to_techniques: ["T1071", "T1071.001", "T1573", "T1105"],
    steps: [
      { step_id: "s1", order: 1, action_class: "A1", action_type: "enrich_indicators", description: "Enrich the candidate C2 indicators (read-only).", d3fend_unmapped: true },
      { step_id: "s2", order: 2, action_class: "A3", action_type: "block_ip", description: "Add an egress block for the C2 IP at the perimeter firewall.", d3fend_mapping: [D3.OTF] },
      { step_id: "s3", order: 3, action_class: "A3", action_type: "block_domain", description: "Add a DNS/proxy block for the C2 domain.", d3fend_mapping: [D3.OTF] },
    ],
  },
  {
    slug: "phishing-campaign",
    name: "Contain a phishing campaign",
    applies_to_techniques: ["T1566", "T1566.001", "T1566.002"],
    steps: [
      { step_id: "s1", order: 1, action_class: "A1", action_type: "retrohunt_campaign", description: "Retro-hunt the sender, subject and URL across all mailboxes.", d3fend_unmapped: true },
      { step_id: "s2", order: 2, action_class: "A3", action_type: "quarantine_message", description: "Quarantine all delivered copies of the campaign messages.", d3fend_mapping: [D3.ITF] },
      { step_id: "s3", order: 3, action_class: "A3", action_type: "block_domain", description: "Block the sender / look-alike domain at the mail gateway.", d3fend_mapping: [D3.OTF] },
    ],
  },
  {
    slug: "emergency-bulk-disable",
    name: "Emergency: bulk-disable a set of accounts",
    applies_to_techniques: ["T1078", "T1098"],
    state: "peer_review",
    proposed_by: "response-planner-agent",
    history: [
      { from_state: "—", to_state: "draft", changed_by: "response-planner-agent", changed_at: minus(now, { days: 4 }) },
      { from_state: "draft", to_state: "test", changed_by: "response-planner-agent", changed_at: minus(now, { days: 4 }) },
      { from_state: "test", to_state: "peer_review", changed_by: "response-planner-agent", changed_at: minus(now, { days: 4 }) },
    ],
    test_results: { run_against_synthetic_case_id: "synthetic-case-bulk-compromise", passed: true, notes: "Dry-run disabled 6 synthetic accounts; rollback restored all 6." },
    steps: [
      { step_id: "s1", order: 1, action_class: "A2", action_type: "snapshot_account_state", description: "Snapshot the state of every targeted account for rollback.", d3fend_unmapped: true },
      { step_id: "s2", order: 2, action_class: "A4", action_type: "bulk_disable_accounts", description: "Disable the full set of implicated accounts in one operation.", d3fend_mapping: [D3.ACH] },
    ],
  },
];

const TENANTS = ["tenant-northwind-bank", "tenant-summit-cu"];

export const PLAYBOOKS: SeededPlaybook[] = TENANTS.flatMap((tenant_id) =>
  TEMPLATES.map((t): SeededPlaybook => {
    const state = t.state ?? "enabled";
    return {
      playbook_id: `pb-${tenant_id.replace("tenant-", "")}-${t.slug}`,
      tenant_id,
      name: t.name,
      version: state === "enabled" ? "1.2.0" : "0.3.0",
      lifecycle_state: state,
      proposed_by: t.proposed_by ?? HUMAN_AUTHOR,
      enabled_by: state === "enabled" ? ENABLER : undefined,
      steps: t.steps,
      test_results: t.test_results,
      history: t.history ?? enabledHistory(),
      applies_to_techniques: t.applies_to_techniques,
    };
  }),
);
