import { RoadmapPage } from "@/components/shell/roadmap-page";

export default function DetectionsPage() {
  return (
    <RoadmapPage
      title="Detection Engineering"
      description="Rule lifecycle: draft → test → peer review → approved → enabled → disabled → retired."
      milestone="M3"
      requires="has_siem"
    >
      M3 delivers the structured (never code-editor) rule builder, regression testing against the synthetic corpus
      (events evaluated / expected / observed / missed / unexpected / noise / execution time / rule health), version
      comparison and rollback, and the D3FEND detect-side mapping. The Detection Engineer Agent may propose and test a
      rule and submit it for review; the transition to <code>enabled</code> is enforced as a human-only action at the
      schema layer, regardless of tenant policy.
    </RoadmapPage>
  );
}
