import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function ApprovalsPage() {
  return (
    <RoadmapPage
      title="Approval Queue"
      description="No self-approval, ever — enforced in the schema, not just the UI."
      milestone="M4"
      requires="has_soc"
    >
      M4 builds the approval queue with action class (A2/A3/A4) visually distinct, A3 requiring approval unless a policy
      pre-authorizes that exact action type, A4 always requiring an independent human approver regardless of policy, and
      a hard validation failure when <code>requested_by == approver</code>.
    </RoadmapPage>
  );
}
