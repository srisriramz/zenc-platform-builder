"use client";

import * as React from "react";
import Link from "next/link";
import { useTelemetrySources } from "@/hooks/use-siem";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { EmptyState, LoadingState, QueryErrorState } from "@/components/states";
import { LiveIngestionDashboard } from "@/components/siem/ingestion/live-ingestion-dashboard";

export default function IngestionPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading throughput…" />}>
      <IngestionInner />
    </React.Suspense>
  );
}

function IngestionInner() {
  const sources = useTelemetrySources();
  const { params, setParams } = useNavParams();
  const selectedSourceId = params.get("source");
  const familyFilter = params.get("family");

  return (
    <>
      <PageHeader
        title="Traffic & Ingestion"
        description="Simulated live throughput across every connected telemetry source. The Log Explorer holds a deterministic sample of these same streams — this view models the rate, not the stored events."
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/telemetry">Connector detail</Link>
        </Button>
      </PageHeader>

      {sources.isLoading && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[104px]" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      )}

      {sources.isError && <QueryErrorState error={sources.error} onRetry={() => sources.refetch()} />}

      {sources.data && sources.data.length === 0 && (
        <EmptyState title="No telemetry sources connected">
          This tenant is entitled to ZenC SIEM but has no connectors yet. Add a source from Telemetry &amp; Connectors.
        </EmptyState>
      )}

      {sources.data && sources.data.length > 0 && (
        <LiveIngestionDashboard
          sources={sources.data}
          selectedSourceId={selectedSourceId}
          familyFilter={familyFilter}
          onSelectSource={(id) => setParams({ source: id })}
          onFilterFamily={(f) => setParams({ family: f, source: null })}
        />
      )}
    </>
  );
}
