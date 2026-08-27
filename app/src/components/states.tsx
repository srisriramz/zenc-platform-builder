"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  Clock,
  Inbox,
  Loader2,
  PlugZap,
  RefreshCw,
  SearchX,
  ServerCrash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { AccessError } from "@/mock/rbac";
import { SimulatedFault, QueryParseFault } from "@/mock/api";

function Shell({
  icon: Icon,
  title,
  children,
  tone = "muted",
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children?: React.ReactNode;
  tone?: "muted" | "warning" | "danger";
  action?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger" ? "text-[var(--destructive)]" : tone === "warning" ? "text-[var(--warning)]" : "text-muted-foreground";
  const ringClass =
    tone === "danger"
      ? "bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)]"
      : tone === "warning"
        ? "bg-[color-mix(in_oklch,var(--warning)_14%,transparent)]"
        : "bg-muted";
  return (
    <div
      className="anim-fade flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center"
      role="status"
    >
      <span className={cn("grid size-11 place-items-center rounded-full", ringClass)}>
        <Icon className={cn("size-5", toneClass)} />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {children && <div className="mx-auto max-w-md text-sm text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn("h-8", c === 0 ? "w-40" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <Shell icon={Inbox} title={title}>
      {children}
    </Shell>
  );
}

export function NoResultsState({ children, onReset }: { children?: React.ReactNode; onReset?: () => void }) {
  return (
    <Shell
      icon={SearchX}
      title="No results match this search"
      action={onReset ? <Button size="sm" variant="outline" onClick={onReset}>Clear filters</Button> : undefined}
    >
      {children ?? "Try widening the time range or removing a condition."}
    </Shell>
  );
}

export function MalformedQueryState({
  message,
  hint,
  position,
  query,
}: {
  message: string;
  hint?: string;
  position?: number;
  query?: string;
}) {
  return (
    <div className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_40%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_7%,transparent)] p-4" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 text-[var(--destructive)]" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Query rejected</p>
          <p className="text-sm text-[var(--destructive)]">{message}</p>
          {typeof position === "number" && query != null && (
            <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs text-muted-foreground">
              {query}
              {"\n"}
              {" ".repeat(Math.max(0, position))}^
            </pre>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

export function TimeoutState({ onRetry }: { onRetry?: () => void }) {
  return (
    <Shell
      icon={Clock}
      title="The request timed out"
      tone="warning"
      action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="size-4" />Retry</Button> : undefined}
    >
      The mock service did not respond in time. Your data is unchanged.
    </Shell>
  );
}

export function ServerErrorState({ onRetry, detail }: { onRetry?: () => void; detail?: string }) {
  return (
    <Shell
      icon={ServerCrash}
      title="Something went wrong"
      tone="danger"
      action={onRetry ? <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="size-4" />Retry</Button> : undefined}
    >
      {detail ?? "The mock service returned an error. This failure is contained — other products keep running."}
    </Shell>
  );
}

export function AccessDeniedState({ message }: { message?: string }) {
  return (
    <Shell icon={Ban} title="Access denied" tone="warning">
      {message ?? "Your current role in this tenant does not permit this view. Switch role or tenant from the top bar."}
    </Shell>
  );
}

export function DegradedSourceState({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_oklch,var(--warning)_45%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm" role="status">
      <PlugZap className="mt-0.5 size-4 text-[var(--warning)]" />
      <div className="text-muted-foreground">
        <span className="font-medium text-foreground">Degraded source. </span>
        {children ?? "One or more connectors are degraded or stale. Results below may be incomplete for the affected sources."}
      </div>
    </div>
  );
}

export function StaleDataBanner({ ageLabel, onRefresh }: { ageLabel: string; onRefresh?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground" role="status">
      <span>Showing data cached {ageLabel}. It may be out of date.</span>
      {onRefresh && (
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onRefresh}>
          <RefreshCw className="size-3" />
          Refresh
        </Button>
      )}
    </div>
  );
}

export function PartialResultsBanner({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="rounded-md border border-[color-mix(in_oklch,var(--info)_45%,var(--border))] bg-[color-mix(in_oklch,var(--info)_10%,transparent)] px-3 py-1.5 text-xs text-muted-foreground" role="status">
      Partial results — showing {shown.toLocaleString()} of an estimated {total.toLocaleString()}. Some sources did not
      return in time; retry for the complete set.
    </div>
  );
}

/**
 * Maps a thrown error from the mock API to the right state component. Keeps
 * every data-bearing screen consistent without repeating the ladder.
 */
export function QueryErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof QueryParseFault) {
    return <MalformedQueryState message={error.detail.message} hint={error.detail.hint} position={error.detail.position} />;
  }
  if (error instanceof SimulatedFault) {
    return error.kind === "timeout" ? <TimeoutState onRetry={onRetry} /> : <ServerErrorState onRetry={onRetry} detail={error.message} />;
  }
  if (error instanceof AccessError) {
    if (error.code === "entitlement_missing") return <EntitlementMissingState message={error.message} />;
    return <AccessDeniedState message={error.message} />;
  }
  return <ServerErrorState onRetry={onRetry} detail={error instanceof Error ? error.message : undefined} />;
}

export function EntitlementMissingState({ message }: { message?: string }) {
  return (
    <Shell icon={Ban} title="Product not entitled for this tenant" tone="muted">
      {message ?? "This tenant is not licensed for this product. SIEM and SOC license independently."}
    </Shell>
  );
}
