import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function CorrelationPage() {
  return (
    <RoadmapPage
      title="Correlation"
      description="Deterministic correlation engine — no LLM decides a match or a severity."
      milestone="M2"
      requires="has_siem"
    >
      M2 wires the deterministic rule evaluator (single-event, sequence, threshold, aggregation, joins, time windows,
      suppression) over the seeded normalized-event stream from M1. Each fired alert is a real{" "}
      <code>alert-envelope</code> whose <code>attack_techniques</code> cite the specific contributing normalized events
      that justified them — never a static tag.
    </RoadmapPage>
  );
}
