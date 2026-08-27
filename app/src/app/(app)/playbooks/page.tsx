import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function PlaybooksPage() {
  return (
    <RoadmapPage
      title="Playbooks"
      description="Named, versioned response sequences with their own approve/enable/disable/retire lifecycle."
      milestone="M4"
      requires="has_soc"
    >
      M4 builds playbook authoring and lifecycle (mirroring the detection-rule lifecycle), each step carrying an action
      class and a D3FEND response-side mapping or an explicit <code>unmapped</code> state. Kill switches, rollback, and
      verification are specified before the happy path.
    </RoadmapPage>
  );
}
