/**
 * Editorial copy for the /why-soc explainer, kept in one place so it can be
 * rewritten without touching the page. Stage captions and agent lines are
 * factual and derived from the demo's real data; the narrative blocks are
 * marketing copy and can be swapped freely.
 */

export const WHY_SOC_CONTENT = {
  hero: {
    eyebrow: "Why a SOC",
    title: "Your environment generates more security signal in a day than a team could read in a year.",
    lede: "A Security Operations Center is the machinery that turns that signal into a short, ranked list of things a person actually has to decide — and handles everything before and after it automatically, inside fixed guardrails.",
  },

  problem: {
    title: "The volume problem",
    body: [
      "Every endpoint, firewall, identity provider and cloud control plane emits events without pause. Each one, on its own, is unremarkable — a login, a blocked packet, a script that ran.",
      "No one reads that. So the question a SOC actually answers is not “what happened” — it is “which of these thousands of events are the same incident, and does it matter enough to act on tonight.”",
      "Without a pipeline that reduces, correlates and enriches the stream, a genuine intrusion is indistinguishable from a quiet Tuesday — until the quiet Tuesday is a breach notification.",
    ],
  },

  funnel: {
    title: "From raw telemetry to a decision",
    lede: "Each stage narrows the stream and adds context. Every figure below is live from the Northwind Bank demo tenant — the funnel narrows because the real data does.",
  },

  agents: {
    title: "Where the automation sits",
    lede: "The reduction from a firehose to a decision is a pipeline, and most of it runs without a person. Eleven bounded agents do the repetitive work — normalizing, enriching, drafting queries, proposing responses. Each has one job, a fixed set of tools, and an autonomy ceiling it cannot raise. They recommend and draft; people and deterministic services decide and act.",
  },

  outcome: {
    title: "What the team is left with",
    lede: "Not an inbox of alerts. A ranked queue of real cases, every recommendation carrying the evidence behind it, a mean time-to-detect measured in minutes, and a response path that stays dry-run until a second person signs off. Analysts spend their hours on judgement, not triage.",
  },
} as const;

/** One line per agent — its job and the line it will not cross. */
export const AGENT_STAGE_ROLE: Record<string, string> = {
  "intake-agent": "Normalizes every inbound alert to the envelope shape at the boundary.",
  "detection-engineer-agent": "Proposes and tests correlation rules against the synthetic corpus — never enables one.",
  "triage-agent": "Recommends severity, grouping, and open-vs-suppress. A human confirms.",
  "enrichment-agent": "Attaches read-only asset, identity and threat-intel context. Never changes case status.",
  "investigation-agent": "Runs bounded, source-cited queries and drafts findings as reviewable evidence.",
  "hunt-agent": "Runs analyst-initiated hunts within a bounded scope and window.",
  "digital-advisor-agent": "Answers “what next” from approved evidence and approved lessons only.",
  "response-planner-agent": "Proposes a playbook step with its action class and approval requirement labelled. Never executes.",
  "reporting-agent": "Drafts case and executive narrative from approved data. Never publishes without sign-off.",
  "qa-governance-agent": "Reviews every agent run for schema, evidence and policy compliance before it reaches a human.",
  supervisor: "Routes work between agents and enforces the autonomy / action-class policy. Orchestration only.",
};
