import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function AlertsPage() {
  return (
    <RoadmapPage
      title="Alert Intake"
      description="One versioned alert-envelope contract for every source — native SIEM or third-party."
      milestone="M4"
      requires="has_soc"
    >
      M4 implements intake normalization, schema validation with quarantine (never silent drop), deduplication by
      idempotency key, and grouping of alerts into cases. SOAR logic never branches on <code>source.system</code>.
    </RoadmapPage>
  );
}
