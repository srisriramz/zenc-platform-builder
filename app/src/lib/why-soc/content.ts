/**
 * Editorial copy for the /why-soc explainer, kept in one place so it can be
 * rewritten without touching the page.
 *
 * The stage captions and agent lines are factual and derived from the demo's
 * real data — safe to ship as-is. The four `TODO(copy)` blocks below are the
 * persuasive narrative; replace the placeholder text with the ZenC messaging.
 */

export const WHY_SOC_CONTENT = {
  hero: {
    eyebrow: "Why a SOC",
    // TODO(copy): the one-line thesis.
    title: "A modern estate speaks faster than any team can listen.",
    // TODO(copy): 1–2 sentences under the title.
    lede: "A Security Operations Center exists to turn that noise into a short, ranked list of things a human must decide — and to do the rest automatically, under guardrails.",
  },

  problem: {
    // TODO(copy): the section heading.
    title: "The volume problem",
    // TODO(copy): 2–3 short paragraphs. The live numbers (events/day, device
    // families, quarantine rate) are injected by the page around this copy.
    body: [
      "Every endpoint, firewall, identity provider and cloud control plane emits a continuous stream of events. Individually each one is unremarkable. Together they are unreadable.",
      "Without a pipeline that reduces and correlates this stream, a real intrusion looks exactly like a quiet Tuesday — until it doesn't.",
    ],
  },

  funnel: {
    title: "From raw telemetry to a decision",
    lede: "Each stage narrows the stream and adds context. The figures below are live from the Northwind Bank demo tenant.",
  },

  agents: {
    title: "Where the automation sits",
    // TODO(copy): 1–2 sentences framing the agent model.
    lede: "Eleven bounded agents work the pipeline. Each has a fixed job, a fixed tool allowlist, and a fixed autonomy ceiling — they recommend and draft; humans and deterministic services decide and execute.",
  },

  outcome: {
    // TODO(copy): the closing heading + a sentence.
    title: "What the team is left with",
    lede: "A ranked queue, a cited trail behind every recommendation, and a mean time-to-detect measured in minutes.",
  },
} as const;

/** Short label + "never does" for each agent, keyed by agent name. */
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
