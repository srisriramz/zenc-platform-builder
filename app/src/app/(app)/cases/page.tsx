import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function CasesPage() {
  return (
    <RoadmapPage
      title="Cases"
      description="SOC's unit of investigation and response work."
      milestone="M4"
      requires="has_soc"
    >
      M4 builds case detail with timeline, evidence panel (chain-of-custody visible), tasks/SLA clock, linked alerts, the
      ATT&amp;CK technique-breakdown panel (click a technique → the contributing normalized events), and an agents/runs
      panel. Every closed case carries a closure classification from the fixed taxonomy.
    </RoadmapPage>
  );
}
