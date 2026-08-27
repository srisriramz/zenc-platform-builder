import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function CoveragePage() {
  return (
    <RoadmapPage
      title="ATT&CK × D3FEND Coverage"
      description="Per-technique: is it detected (which rule), and is there a mapped response (which playbook step)?"
      milestone="M5"
      requires="has_siem"
    >
      M5 builds the coverage matrix as a first-class screen over the seeded ATT&amp;CK and D3FEND libraries, staging each
      technique honestly (telemetry available → collected → parsed → activity detected → events correlated →
      investigation ready → response ready) rather than a binary flag, and derives Detection coverage % and Defensive
      coverage % that feed SOC reporting.
    </RoadmapPage>
  );
}
