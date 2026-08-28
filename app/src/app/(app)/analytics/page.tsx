"use client";

import * as React from "react";
import { useCapabilities } from "@/hooks/use-platform";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessDeniedState, EntitlementMissingState, LoadingState } from "@/components/states";
import { DetectionAnalytics } from "@/components/analytics/detection-analytics";
import { ManagerAnalytics } from "@/components/analytics/manager-analytics";
import { ExecutiveAnalytics } from "@/components/analytics/executive-analytics";

type View = "detection" | "manager" | "executive";

const VIEW_LABEL: Record<View, string> = {
  detection: "Detection Analytics",
  manager: "SOC Manager",
  executive: "Executive",
};

const DEFAULT_VIEW_BY_ROLE: Record<string, View> = {
  ciso: "executive",
  soc_manager: "manager",
  analyst: "detection",
  senior_analyst: "detection",
};

export default function AnalyticsPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading analytics…" />}>
      <AnalyticsInner />
    </React.Suspense>
  );
}

function AnalyticsInner() {
  const caps = useCapabilities();
  const { params, setParams } = useNavParams();

  if (caps.isLoading || !caps.data) return <LoadingState label="Loading analytics…" />;

  const perms = caps.data.permissions;
  if (!perms.includes("reporting.view")) {
    return (
      <>
        <PageHeader title="Analytics" />
        <AccessDeniedState message="Your role in this tenant does not include reporting access." />
      </>
    );
  }

  const ent = caps.data.tenant?.entitlements;
  const role = caps.data.role ?? "";
  const view = ((params.get("view") as View | null) ?? DEFAULT_VIEW_BY_ROLE[role] ?? "detection") as View;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="A role-aware reporting layer that consumes SIEM and SOAR through their contracts — not a cross-product god-view. Each preset recomposes the same underlying KPIs at a different altitude, and degrades when a product is absent for this tenant."
      />

      <Tabs value={view} onValueChange={(v) => setParams({ view: v })}>
        <TabsList>
          {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
            <TabsTrigger key={v} value={v}>
              {VIEW_LABEL[v]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {view === "detection" &&
          (ent?.has_siem ? (
            <DetectionAnalytics />
          ) : (
            <EntitlementMissingState message="Detection Analytics needs ZenC SIEM, which this tenant is not entitled to." />
          ))}

        {view === "manager" &&
          (ent?.has_soc ? (
            <ManagerAnalytics />
          ) : (
            <EntitlementMissingState message="The SOC Manager view needs ZenC SOAR, which this tenant is not entitled to." />
          ))}

        {view === "executive" &&
          (ent?.has_soc ? (
            <ExecutiveAnalytics />
          ) : (
            <EntitlementMissingState message="The Executive view needs ZenC SOAR, which this tenant is not entitled to." />
          ))}
      </div>
    </>
  );
}
