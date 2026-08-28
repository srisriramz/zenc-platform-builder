"use client";

import * as React from "react";
import { useCases } from "@/hooks/use-soc";
import { useBootstrap } from "@/hooks/use-platform";
import { useNavParams } from "@/lib/use-nav";
import { PageHeader } from "@/components/shell/page-header";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { Card, CardContent, Select } from "@/components/ui/primitives";
import { EntitlementMissingState, LoadingState, QueryErrorState, TableSkeleton } from "@/components/states";
import { CaseList } from "@/components/soc/case-list";

export default function CasesPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading cases…" />}>
      <CasesInner />
    </React.Suspense>
  );
}

function CasesInner() {
  const { params, setParams } = useNavParams();
  const status = params.get("status") ?? undefined;
  const severity = params.get("severity") ?? undefined;
  const cases = useCases({ status, severity });
  const boot = useBootstrap();

  const nameOf = React.useCallback(
    (id: string) => boot.data?.allUsers.find((u) => u.user_id === id)?.display_name ?? id,
    [boot.data],
  );

  if (cases.isError) {
    return (
      <>
        <PageHeader title="Cases" />
        {(cases.error as { code?: string })?.code === "entitlement_missing" ? (
          <EntitlementMissingState message="Cases needs ZenC SOAR." />
        ) : (
          <QueryErrorState error={cases.error} onRetry={() => cases.refetch()} />
        )}
      </>
    );
  }

  const all = cases.data ?? [];
  const open = all.filter((c) => c.status !== "closed");
  const breached = open.filter((c) => c.sla?.status === "breached").length;

  return (
    <>
      <PageHeader
        title="Cases"
        description="ZenC SOAR's unit of investigation and response work. A case groups one or more alert-envelopes; every closed case carries a closure classification from the fixed taxonomy."
      />

      {cases.isLoading ? (
        <StatGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] animate-pulse rounded-xl bg-muted" />
          ))}
        </StatGrid>
      ) : (
        <StatGrid>
          <StatTile label="Open cases" value={open.length} tone="primary" onClick={() => setParams({ status: null })} />
          <StatTile
            label="SLA breached"
            value={breached}
            tone={breached ? "danger" : "success"}
          />
          <StatTile label="Closed" value={all.length - open.length} onClick={() => setParams({ status: "closed" })} />
          <StatTile label="Total" value={all.length} />
        </StatGrid>
      )}

      <Card className="mt-6">
        <CardContent className="pt-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <Select
              aria-label="Filter by status"
              className="h-8 w-44"
              value={status ?? ""}
              onChange={(e) => setParams({ status: e.target.value || null })}
            >
              <option value="">All statuses</option>
              {["new", "triaged", "investigating", "contained", "recovering", "closed", "reopened"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filter by severity"
              className="h-8 w-40"
              value={severity ?? ""}
              onChange={(e) => setParams({ severity: e.target.value || null })}
            >
              <option value="">All severities</option>
              {["critical", "high", "medium", "low", "informational"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          {cases.isLoading ? (
            <TableSkeleton cols={6} />
          ) : (
            <EmptyGuardWrapper isEmpty={all.length === 0}>
              <CaseList cases={all} ownerName={nameOf} />
            </EmptyGuardWrapper>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function EmptyGuardWrapper({ isEmpty, children }: { isEmpty: boolean; children: React.ReactNode }) {
  if (isEmpty) {
    return (
      <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        No cases match. Confirm an intake candidate on the Alert Intake screen to open one.
      </p>
    );
  }
  return <>{children}</>;
}
