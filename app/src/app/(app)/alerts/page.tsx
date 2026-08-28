"use client";

import * as React from "react";
import { useIntakeQueue } from "@/hooks/use-soc";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { EntitlementMissingState, LoadingState, QueryErrorState } from "@/components/states";
import { IntakeQueue } from "@/components/soc/intake-queue";

export default function AlertsPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading intake…" />}>
      <AlertsInner />
    </React.Suspense>
  );
}

function AlertsInner() {
  const { params, setParams } = useNavParams();
  const selected = params.get("candidate");
  const q = useIntakeQueue();

  if (q.isError) {
    return (
      <>
        <PageHeader title="Alert Intake" />
        {(q.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Alert Intake needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
        )}
      </>
    );
  }

  const d = q.data;

  return (
    <>
      <PageHeader
        title="Alert Intake"
        description="One versioned alert-envelope contract for every source — native ZenC SIEM or third-party. Intake validates (quarantine, never drop), deduplicates by idempotency key, groups by shared entity + time + technique, and hands each group to the Triage Agent. SOAR logic never branches on source.system."
      />

      {q.isLoading || !d ? (
        <StatGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted" />
          ))}
        </StatGrid>
      ) : (
        <>
          <StatGrid>
            <StatTile label="Received (sample)" value={d.counts.received} sub={`${d.counts.accepted} accepted`} />
            <StatTile
              label="Quarantined"
              value={d.counts.quarantined}
              tone={d.counts.quarantined ? "warning" : "default"}
              sub="schema-invalid / unsupported version"
            />
            <StatTile label="Deduplicated" value={d.counts.duplicate} sub="repeat idempotency key" />
            <StatTile
              label="Pending triage"
              value={d.counts.pending}
              tone={d.counts.pending ? "primary" : "success"}
              sub={`${d.counts.opened} opened · ${d.counts.suppressed} suppressed`}
            />
          </StatGrid>

          <div className="mt-6">
            <IntakeQueue
              data={d}
              selectedId={selected}
              onSelect={(id) => setParams({ candidate: id })}
            />
          </div>
        </>
      )}
    </>
  );
}
