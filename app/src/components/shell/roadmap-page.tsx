"use client";

import { PageHeader, MilestoneStub } from "@/components/shell/page-header";
import { useCapabilities } from "@/hooks/use-platform";
import { EntitlementMissingState } from "@/components/states";

/**
 * Shared shell for screens whose full behaviour lands in a later milestone.
 * It still enforces the same entitlement + RBAC gates the real screen will,
 * so the navigation model is honest today.
 */
export function RoadmapPage({
  title,
  description,
  milestone,
  requires,
  children,
}: {
  title: string;
  description: string;
  milestone: string;
  requires?: "has_siem" | "has_soc";
  children: React.ReactNode;
}) {
  const caps = useCapabilities();
  const entitled = !requires || caps.data?.tenant?.entitlements[requires];

  return (
    <>
      <PageHeader title={title} description={description} />
      {caps.data && requires && !entitled ? (
        <EntitlementMissingState message={`This tenant is not entitled to ${requires === "has_siem" ? "ZenC SIEM" : "ZenC SOAR"}.`} />
      ) : (
        <MilestoneStub milestone={milestone}>{children}</MilestoneStub>
      )}
    </>
  );
}
