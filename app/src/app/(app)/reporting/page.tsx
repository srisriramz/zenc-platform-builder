import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function ReportingPage() {
  return (
    <RoadmapPage
      title="SOC Reporting"
      description="Pipeline-latency breakdown and coverage KPIs — sourced from SIEM, not recomputed in SOC."
      milestone="M5"
      requires="has_soc"
    >
      M5 surfaces the stage-by-stage pipeline latency (collection lag → SIEM detection → handoff → SOC ack → MTTR) and
      the detection/defensive coverage percentages produced by the SIEM coverage layer, tying SIEM and SOC data
      together in one view.
    </RoadmapPage>
  );
}
