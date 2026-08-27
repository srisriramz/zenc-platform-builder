import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function SocDashboardPage() {
  return (
    <RoadmapPage
      title="SOAR Dashboard"
      description="Respond layer. ZenC SOAR runs standalone — it consumes the alert-envelope contract, not SIEM's tables."
      milestone="M4"
      requires="has_soc"
    >
      M4 builds alert intake, triage, case management, evidence and chain-of-custody, timelines, tasks/SLA, the 12
      bounded agents, playbooks, the approval queue (no self-approval, enforced in the schema), the deterministic
      Response Executor in dry-run, and verification/rollback. Intake is proven with both a native ZenC SIEM alert and a
      third-party-shaped fixture using only the versioned contract.
    </RoadmapPage>
  );
}
