"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { useCapabilities } from "@/hooks/use-platform";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader, MilestoneStub } from "@/components/shell/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessDeniedState, EntitlementMissingState, LoadingState } from "@/components/states";
import { DetectionAnalytics } from "@/components/analytics/detection-analytics";

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
            <MilestoneStub milestone="M4">
              <p className="mb-2">
                The SOC Manager view lands with ZenC SOAR&apos;s case and agent layer. It will show, all read-only:
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>queue depth and ageing, open cases per analyst (workload balance)</li>
                <li>alert → case conversion rate, and the case-closure mix (true / false / benign / duplicate / suppressed)</li>
                <li>SLA compliance and at-risk / breached cases</li>
                <li>agent-assisted vs. fully-manual resolution ratio, and agent acceptance</li>
                <li>detection-engineering throughput (rules proposed / in review / enabled)</li>
              </ul>
            </MilestoneStub>
          ) : (
            <EntitlementMissingState message="The SOC Manager view needs ZenC SOAR, which this tenant is not entitled to." />
          ))}

        {view === "executive" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 flex-none" />
              <span>
                This tenant has{" "}
                <span className="font-medium text-foreground">
                  {[ent?.has_siem && "ZenC SIEM", ent?.has_soc && "ZenC SOAR"].filter(Boolean).join(" + ") || "no live products"}
                </span>
                . The Executive view degrades to whatever is entitled — an absent product is shown as a gap, never
                silently omitted.
              </span>
            </div>
            <MilestoneStub milestone="M5">
              <p className="mb-2">
                The Executive (CISO) view is the final beat of the guided demo — it ties SIEM and SOAR data together:
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>ATT&amp;CK detection coverage % and D3FEND defensive coverage % (computed by SIEM, surfaced here)</li>
                <li>MTTD / MTTR trend, and the stage-by-stage pipeline-latency breakdown behind them</li>
                <li>open critical incidents and response success rate</li>
                <li>top adversary techniques seen this period, and SLA compliance</li>
                <li>the Reporting Agent drafts the narrative from approved KPI aggregates (human sign-off required)</li>
              </ul>
            </MilestoneStub>
          </div>
        )}
      </div>
    </>
  );
}
