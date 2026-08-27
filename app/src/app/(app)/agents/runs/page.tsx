import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function AgentRunsPage() {
  return (
    <RoadmapPage
      title="Agent Runs"
      description="Agents recommend; deterministic services execute. Every run is explainable."
      milestone="M4"
      requires="has_soc"
    >
      M4 renders each agent run with rationale, evidence, contradictory evidence, tool calls (within the allowlist
      defined for that agent), versions, analyst feedback, and the final human decision. Untrusted content — alert
      payloads, evidence, enrichment — is data the agent reasons about, never instructions it obeys.
    </RoadmapPage>
  );
}
