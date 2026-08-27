"use client";

import * as React from "react";
import { Download, Loader2, RotateCcw, Search, SlidersHorizontal, Star } from "lucide-react";
import { useEntityRisk, useLogSearch, useTelemetrySources } from "@/hooks/use-siem";
import { useSession } from "@/store/session";
import { useScopedStorage } from "@/lib/local-store";
import { useNavParams } from "@/lib/use-nav";
import {
  DEFAULT_RANGE,
  resolvePreset,
  TIME_PRESETS,
  type TimeRangeSelection,
  type TimeRangePreset,
} from "@/lib/query/time-range";
import { QUERY_LIMITS } from "@/lib/query/fields";
import { formatTimestamp } from "@/lib/time";
import type { NormalizedEvent } from "@/schemas";
import type { LogSearchInput } from "@/mock/api";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui/primitives";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import {
  DegradedSourceState,
  LoadingState,
  NoResultsState,
  PartialResultsBanner,
  QueryErrorState,
  StaleDataBanner,
} from "@/components/states";
import { Histogram } from "@/components/siem/log-explorer/histogram";
import { ResultsTable } from "@/components/siem/log-explorer/results-table";
import { FieldStats } from "@/components/siem/log-explorer/field-stats";
import { EventDetail } from "@/components/siem/log-explorer/event-detail";
import { QueryBuilder } from "@/components/siem/log-explorer/query-builder";

interface SavedSearch {
  name: string;
  query: string;
  preset: TimeRangePreset;
}

const EXAMPLE_QUERIES = [
  "event_type:windows_security_4625 AND entity.user:svc-backup",
  "source.family:firewall AND event_type ~ firewall_*deny*",
  "attack_technique_refs:exists",
  "normalization_status:quarantined",
  "entity.ip ~ 203.0.113.* OR entity.ip ~ 198.51.100.*",
];

export default function LogExplorerPage() {
  return (
    <React.Suspense fallback={<LoadingState label="Loading Log Explorer…" />}>
      <LogExplorerInner />
    </React.Suspense>
  );
}

/** Hydrate initial state from URL params (drill-in from a dashboard). Read once. */
function initialFromParams(params: URLSearchParams) {
  const q = params.get("q");
  const rangeParam = params.get("range") as TimeRangePreset | null;
  const from = params.get("from");
  const to = params.get("to");
  const incl = params.get("quarantined") === "1";

  let range: TimeRangeSelection = DEFAULT_RANGE;
  if (from && to) range = { preset: "custom", fromIso: from, toIso: to };
  else if (rangeParam && rangeParam !== "custom") range = resolvePreset(rangeParam);

  const submitted: LogSearchInput | null =
    q !== null
      ? { query: q, fromIso: range.fromIso, toIso: range.toIso, includeQuarantined: incl, limit: QUERY_LIMITS.defaultResultRows }
      : null;
  return { text: q ?? "", range, incl, submitted };
}

function LogExplorerInner() {
  const tenantId = useSession((s) => s.tenantId);
  const { params } = useNavParams();

  const [text, setText] = React.useState(() => initialFromParams(params).text);
  const [range, setRange] = React.useState<TimeRangeSelection>(() => initialFromParams(params).range);
  const [includeQuarantined, setIncludeQuarantined] = React.useState(() => initialFromParams(params).incl);
  const [showBuilder, setShowBuilder] = React.useState(false);
  const [selected, setSelected] = React.useState<NormalizedEvent | null>(null);

  const [submitted, setSubmitted] = React.useState<LogSearchInput | null>(() => initialFromParams(params).submitted);
  const [history, setHistory] = useScopedStorage<string[]>(tenantId, "log-explorer.history", []);
  const [saved, setSaved] = useScopedStorage<SavedSearch[]>(tenantId, "log-explorer.saved", []);

  const sources = useTelemetrySources();
  const degradedSources = (sources.data ?? []).filter((s) => s.health !== "healthy");
  const familyOf = React.useCallback(
    (id: string) => (sources.data ?? []).find((s) => s.telemetry_source_id === id)?.family,
    [sources.data],
  );

  const entityRisk = useEntityRisk();
  const riskFor = React.useCallback(
    (entityType: string, value: string) =>
      entityRisk.data?.find((r) => r.entity_type === entityType && r.value === value),
    [entityRisk.data],
  );

  const search = useLogSearch(submitted);

  const runSearch = React.useCallback(
    (overrideText?: string, overrideRange?: TimeRangeSelection, overrideQuarantined?: boolean) => {
      const q = overrideText ?? text;
      const r = overrideRange ?? range;
      const incl = overrideQuarantined ?? includeQuarantined;
      setSelected(null);
      setSubmitted({ query: q, fromIso: r.fromIso, toIso: r.toIso, includeQuarantined: incl, limit: QUERY_LIMITS.defaultResultRows });
      if (q.trim()) setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 12));
    },
    [text, range, includeQuarantined, setHistory],
  );

  function insertCondition(cond: string) {
    setText((t) => (t.trim() ? `${t.trim()} AND ${cond}` : cond));
  }

  function setPreset(preset: TimeRangePreset) {
    if (preset === "custom") {
      setRange((r) => ({ ...r, preset: "custom" }));
    } else {
      const next = resolvePreset(preset);
      setRange(next);
      if (submitted) runSearch(undefined, next);
    }
  }

  function zoomToBucket(startIso: string, endIso: string) {
    const next: TimeRangeSelection = { preset: "custom", fromIso: startIso, toIso: endIso };
    setRange(next);
    runSearch(undefined, next);
  }

  function exportRows(format: "csv" | "json") {
    const rows = search.data?.result.rows ?? [];
    let blob: Blob;
    if (format === "json") {
      blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    } else {
      const header = ["event_id", "occurred_at", "ingested_at", "source_family", "event_type", "normalization_status", "entities"];
      const lines = rows.map((e) =>
        [
          e.event_id,
          e.occurred_at,
          e.ingested_at,
          familyOf(e.telemetry_source_id) ?? "",
          e.event_type,
          e.normalization_status,
          (e.entities ?? []).map((x) => `${x.entity_type}=${x.value}`).join("|"),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
      blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zenc-log-export-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const result = search.data?.result;
  const parseErrorShown = search.isError;

  return (
    <>
      <PageHeader
        title="Log Explorer"
        description="Structured, bounded search over a deterministic ~72h sample of normalized telemetry. The query language never compiles to SQL, shell, eval, or an unsafe regex — a malformed query is rejected with a specific reason."
      />

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search query"
                className="h-10 pl-9 font-mono text-sm"
                placeholder="e.g.  event_type:windows_security_4625 AND entity.user:svc-backup"
                value={text}
                maxLength={QUERY_LIMITS.maxQueryLength}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
            </div>
            <div className="flex gap-2">
              <Select aria-label="Time range" className="h-10 w-40" value={range.preset} onChange={(e) => setPreset(e.target.value as TimeRangePreset)}>
                {TIME_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Button className="h-10" onClick={() => runSearch()} disabled={search.isFetching}>
                {search.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Search
              </Button>
            </div>
          </div>

          {range.preset === "custom" && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                From
                <Input type="text" className="mt-1 h-8 w-56 font-mono text-xs" value={range.fromIso} onChange={(e) => setRange((r) => ({ ...r, fromIso: e.target.value }))} />
              </label>
              <label className="text-xs text-muted-foreground">
                To
                <Input type="text" className="mt-1 h-8 w-56 font-mono text-xs" value={range.toIso} onChange={(e) => setRange((r) => ({ ...r, toIso: e.target.value }))} />
              </label>
              <span className="text-[11px] text-muted-foreground">Max span {QUERY_LIMITS.maxTimeRangeDays} days.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Button variant="outline" size="sm" onClick={() => setShowBuilder((s) => !s)}>
              <SlidersHorizontal className="size-3.5" />
              {showBuilder ? "Hide" : "Show"} query builder
            </Button>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={includeQuarantined} onChange={(e) => setIncludeQuarantined(e.target.checked)} />
              Include quarantined events
            </label>

            <Menu
              trigger={
                <Button variant="ghost" size="sm">
                  <Star className="size-3.5" />
                  Saved &amp; history
                </Button>
              }
            >
              {(close) => (
                <>
                  <MenuLabel>Saved searches</MenuLabel>
                  {saved.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">None saved yet.</div>}
                  {saved.map((s) => (
                    <MenuItem
                      key={s.name}
                      onClick={() => {
                        setText(s.query);
                        const r = s.preset === "custom" ? range : resolvePreset(s.preset);
                        setRange(r);
                        runSearch(s.query, r);
                        close();
                      }}
                    >
                      <span className="truncate">{s.name}</span>
                    </MenuItem>
                  ))}
                  <MenuItem
                    onClick={() => {
                      const name = text.trim().slice(0, 40) || "Untitled search";
                      setSaved((list) => [{ name, query: text, preset: range.preset }, ...list.filter((x) => x.name !== name)].slice(0, 12));
                      close();
                    }}
                  >
                    <span className="text-primary">+ Save current query</span>
                  </MenuItem>
                  <MenuLabel>Recent</MenuLabel>
                  {history.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">No history yet.</div>}
                  {history.map((h, i) => (
                    <MenuItem
                      key={i}
                      onClick={() => {
                        setText(h);
                        runSearch(h);
                        close();
                      }}
                    >
                      <span className="truncate font-mono text-xs">{h}</span>
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={!result || result.rows.length === 0} onClick={() => exportRows("csv")}>
                <Download className="size-3.5" />
                CSV
              </Button>
              <Button variant="ghost" size="sm" disabled={!result || result.rows.length === 0} onClick={() => exportRows("json")}>
                <Download className="size-3.5" />
                JSON
              </Button>
            </div>
          </div>

          {showBuilder && <QueryBuilder onInsert={insertCondition} />}
        </CardContent>
      </Card>

      {!submitted && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Start a search</CardTitle>
            <p className="text-sm text-muted-foreground">
              Free-text terms match across event type and entity fields. Add structured conditions with{" "}
              <code className="rounded bg-muted px-1">field:value</code>, joined with <code className="rounded bg-muted px-1">AND</code>/
              <code className="rounded bg-muted px-1">OR</code>, negated with <code className="rounded bg-muted px-1">NOT</code>.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                className="block w-full rounded border border-border px-2 py-1.5 text-left font-mono text-xs hover:bg-accent"
                onClick={() => {
                  setText(q);
                  runSearch(q);
                }}
              >
                {q}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {submitted && degradedSources.length > 0 && (
        <div className="mt-4">
          <DegradedSourceState>
            {degradedSources.map((s) => `${s.connector_label} (${s.health})`).join("; ")} — results may under-count these families.
          </DegradedSourceState>
        </div>
      )}

      {submitted && parseErrorShown && (
        <div className="mt-4">
          <QueryErrorState error={search.error} onRetry={() => search.refetch()} />
        </div>
      )}

      {submitted && !parseErrorShown && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            {search.isLoading && <LoadingState label="Running search…" />}

            {result && (
              <>
                {search.data?.partial && <PartialResultsBanner shown={result.rows.length} total={result.totalMatched * 2} />}
                {search.isStale && !search.isFetching && (
                  <StaleDataBanner ageLabel={formatTimestamp(new Date(search.dataUpdatedAt).toISOString())} onRefresh={() => search.refetch()} />
                )}

                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <div>
                      <CardTitle>
                        {result.totalMatched.toLocaleString()} event{result.totalMatched === 1 ? "" : "s"}
                        {result.truncated && <span className="ml-2 text-xs font-normal text-muted-foreground">showing first {result.limit}</span>}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        scanned {result.scannedCount.toLocaleString()} in range · {formatTimestamp(result.timeRange.fromIso)} →{" "}
                        {formatTimestamp(result.timeRange.toIso)}
                      </p>
                    </div>
                    {search.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                  </CardHeader>
                  <CardContent>
                    <Histogram data={search.data!.histogram} onSelectBucket={zoomToBucket} />
                  </CardContent>
                </Card>

                {result.rows.length === 0 ? (
                  <NoResultsState onReset={() => { setText(""); setSubmitted(null); }}>
                    Nothing matched <code className="rounded bg-muted px-1 font-mono">{submitted.query || "(empty query)"}</code> in this range.
                    Widen the time range or loosen a condition.
                  </NoResultsState>
                ) : (
                  <ResultsTable rows={result.rows} familyOf={(id) => familyOf(id)} selectedId={selected?.event_id ?? null} onSelect={setSelected} riskFor={riskFor} />
                )}

                {selected && (
                  <EventDetail event={selected} familyOf={(id) => familyOf(id)} riskFor={riskFor} onClose={() => setSelected(null)} onSelectRelated={setSelected} />
                )}
              </>
            )}
          </div>

          <div className="space-y-4">
            {search.data && <FieldStats stats={search.data.fieldStats} onAddCondition={(f, v) => insertCondition(`${f}:${/\s/.test(v) ? `"${v}"` : v}`)} />}
            {submitted && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { setText(""); setRange(DEFAULT_RANGE); setSubmitted(null); setSelected(null); }}
              >
                <RotateCcw className="size-3.5" />
                Reset explorer
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
