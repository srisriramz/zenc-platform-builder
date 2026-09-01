import type { AgentName } from "@/schemas";

/**
 * The 12 bounded agents (references/agentic-architecture.md). Every agent has
 * a fixed autonomy ceiling, a fixed tool allowlist, and a fixed output schema
 * (agent-message). Adding a 13th means adding a row here first, not loosening
 * an existing one.
 *
 * Eleven of the twelve are wired (`status: "live"`). Only the Assessment
 * Assistant is dormant — Assessment is Phase 2 and off everywhere.
 */
export type Autonomy = "L0" | "L1" | "L2" | "L3" | "L4";

export interface AgentTool {
  name: string;
  access: "read" | "write";
  bound: string;
}

export interface AgentDef {
  name: AgentName;
  label: string;
  purpose: string;
  default_autonomy: Autonomy;
  tools: AgentTool[];
  never_does: string[];
  /** which milestone wires this agent */
  status: "live" | "m5" | "phase2";
  prompt_version: string;
}

export const AGENTS: AgentDef[] = [
  {
    name: "intake-agent",
    label: "Intake Agent",
    purpose: "Normalises and validates inbound alerts into the alert-envelope shape at the boundary.",
    default_autonomy: "L1",
    tools: [{ name: "envelope-validate", access: "read", bound: "one alert payload" }],
    never_does: ["write to the case store directly"],
    status: "live",
    prompt_version: "intake-agent-prompt-v1.0",
  },
  {
    name: "triage-agent",
    label: "Triage Agent",
    purpose: "Proposes severity, grouping, and an open-vs-suppress recommendation for a case.",
    default_autonomy: "L2",
    tools: [
      { name: "alert-read", access: "read", bound: "the envelope + recent case history" },
      { name: "case-history-read", access: "read", bound: "last 30 days, same tenant" },
    ],
    never_does: ["open or suppress a case itself"],
    status: "live",
    prompt_version: "triage-agent-prompt-v1.0",
  },
  {
    name: "enrichment-agent",
    label: "Enrichment Agent",
    purpose: "Attaches read-only context (asset, identity, prior sightings) to an alert or case.",
    default_autonomy: "L1",
    tools: [
      { name: "asset-lookup", access: "read", bound: "one entity per call" },
      { name: "identity-lookup", access: "read", bound: "one entity per call" },
      { name: "ti-lookup", access: "read", bound: "one indicator per call, cached" },
    ],
    never_does: ["modify case status"],
    status: "live",
    prompt_version: "enrichment-agent-prompt-v1.0",
  },
  {
    name: "investigation-agent",
    label: "Investigation Agent",
    purpose: "Runs bounded, source-cited investigation queries and drafts findings.",
    default_autonomy: "L2",
    tools: [
      { name: "case-read", access: "read", bound: "the assigned case" },
      { name: "evidence-read", access: "read", bound: "the assigned case" },
      { name: "log-search", access: "read", bound: "≤ 5000 events, ≤ 24h per call, safe parser only" },
    ],
    never_does: ["execute any external action"],
    status: "live",
    prompt_version: "investigation-agent-prompt-v1.0",
  },
  {
    name: "hunt-agent",
    label: "Hunt Agent",
    purpose: "Runs analyst-initiated hunt queries against a bounded scope and time window.",
    default_autonomy: "L1",
    tools: [{ name: "log-search", access: "read", bound: "≤ 5000 events, ≤ 7d, safe parser only" }],
    never_does: ["auto-create a case without analyst confirmation"],
    status: "live",
    prompt_version: "hunt-agent-prompt-v1.0",
  },
  {
    name: "response-planner-agent",
    label: "Response Planner",
    purpose: "Proposes a playbook or ad-hoc action sequence with every action class labelled up front.",
    default_autonomy: "L2",
    tools: [
      { name: "case-read", access: "read", bound: "the assigned case" },
      { name: "playbook-read", access: "read", bound: "the approved playbook library" },
      { name: "action-request-draft", access: "write", bound: "drafts only — never submit-for-execution" },
    ],
    never_does: ["enable a playbook", "execute an action"],
    status: "live",
    prompt_version: "response-planner-agent-prompt-v1.0",
  },
  {
    name: "detection-engineer-agent",
    label: "Detection Engineer Agent",
    purpose: "Proposes and tests correlation-rule changes against the synthetic corpus in ZenC SIEM.",
    default_autonomy: "L2",
    tools: [
      { name: "rule-read", access: "read", bound: "this tenant's rule catalog" },
      { name: "rule-test", access: "read", bound: "the deterministic synthetic corpus only — never live telemetry" },
      { name: "rule-draft", access: "write", bound: "draft state only — cannot advance a rule past 'peer_review'" },
    ],
    never_does: [
      "publish or enable a rule or playbook",
      "evaluate live telemetry in a rule's own production logic",
      "expand its own tool allowlist or autonomy level",
    ],
    status: "live",
    prompt_version: "detection-engineer-agent-prompt-v2.3",
  },
  {
    name: "assessment-assistant-agent",
    label: "Assessment Assistant",
    purpose: "Drafts a suggested finding or evidence item for Assessment review from a closed case.",
    default_autonomy: "L2",
    tools: [{ name: "closed-case-read", access: "read", bound: "one closed case" }],
    never_does: ["write to Assessment directly"],
    status: "phase2",
    prompt_version: "assessment-assistant-agent-prompt-v1.0",
  },
  {
    name: "reporting-agent",
    label: "Reporting Agent",
    purpose: "Drafts case and executive report content from approved case data and KPI aggregates.",
    default_autonomy: "L2",
    tools: [
      { name: "case-read", access: "read", bound: "approved case data only" },
      { name: "kpi-aggregate-read", access: "read", bound: "tenant-scoped aggregates" },
    ],
    never_does: ["publish a report without human sign-off on external-facing copy"],
    status: "live",
    prompt_version: "reporting-agent-prompt-v1.0",
  },
  {
    name: "digital-advisor-agent",
    label: "Digital Advisor Agent",
    purpose: "Answers “what should we do next” for a case using approved evidence only.",
    default_autonomy: "L1",
    tools: [
      { name: "case-read", access: "read", bound: "the assigned case" },
      { name: "approved-knowledge-read", access: "read", bound: "approved lessons only" },
    ],
    never_does: ["approve any action", "guarantee an outcome"],
    status: "live",
    prompt_version: "digital-advisor-agent-prompt-v1.0",
  },
  {
    name: "qa-governance-agent",
    label: "QA & Governance Agent",
    purpose: "Reviews other agents' outputs for policy / schema / evidence compliance before they reach a human queue.",
    default_autonomy: "L1",
    tools: [{ name: "agent-run-read", access: "read", bound: "agent-run records only" }],
    never_does: ["approve on another agent's behalf"],
    status: "live",
    prompt_version: "qa-governance-agent-prompt-v1.0",
  },
  {
    name: "supervisor",
    label: "Supervisor",
    purpose: "Routes work between agents and enforces autonomy / action-class policy. Orchestration only.",
    default_autonomy: "L1",
    tools: [
      { name: "agent-run-read", access: "read", bound: "agent-run records" },
      { name: "policy-read", access: "read", bound: "tenant policy config" },
    ],
    never_does: [
      "hold standing credentials across tools",
      "override a policy-engine decision",
      "approve its own or another agent's action request",
      "expand a tenant's scope or autonomy level",
      "bypass human approval for A3/A4",
    ],
    status: "live",
    prompt_version: "supervisor-prompt-v1.0",
  },
];

export const AGENT_MAP: Record<string, AgentDef> = Object.fromEntries(AGENTS.map((a) => [a.name, a]));
