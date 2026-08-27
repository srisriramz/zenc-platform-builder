"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatTimestamp } from "@/lib/time";

/**
 * Event-volume-over-time. Single series → no legend (the caption names it).
 * Thin bars, 4px rounded top anchored to the baseline, a 2px surface gap
 * between bars, recessive grid, per-bar hover tooltip.
 */
export function Histogram({
  data,
  activeIndex,
  onHoverBucket,
  onSelectBucket,
}: {
  data: { bucketStartIso: string; count: number }[];
  activeIndex?: number | null;
  onHoverBucket?: (i: number | null) => void;
  /** click a bar to drill: (bucket start ISO, bucket end ISO) */
  onSelectBucket?: (startIso: string, endIso: string) => void;
}) {
  const total = data.reduce((n, d) => n + d.count, 0);
  const bucketMs =
    data.length >= 2 ? Date.parse(data[1].bucketStartIso) - Date.parse(data[0].bucketStartIso) : 60_000;
  const ticks = React.useMemo(() => {
    if (data.length === 0) return [] as string[];
    const step = Math.max(1, Math.floor(data.length / 4));
    return data.filter((_, i) => i % step === 0).map((d) => d.bucketStartIso);
  }, [data]);

  if (total === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        No events in range
      </div>
    );
  }

  return (
    <div className={`h-32 w-full ${onSelectBucket ? "[&_.recharts-bar-rectangle]:cursor-pointer" : ""}`} onMouseLeave={() => onHoverBucket?.(null)}>
      {onSelectBucket && (
        <p className="mb-1 text-[11px] text-muted-foreground">Click a bar to zoom the time range to that window.</p>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 2, bottom: 2, left: 2 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="bucketStartIso"
            ticks={ticks}
            tickFormatter={(v) => formatTimestamp(String(v)).slice(5, 16)}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={24}
          />
          <YAxis
            width={28}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in oklch, var(--foreground) 6%, transparent)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-md)",
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(v) => formatTimestamp(String(v))}
            formatter={(value) => [value as number, "events"]}
          />
          <Bar
            dataKey="count"
            fill="var(--primary)"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
            onMouseEnter={(_, i) => onHoverBucket?.(i)}
            onClick={(entry) => {
              const iso = (entry as { payload?: { bucketStartIso?: string }; bucketStartIso?: string })?.payload?.bucketStartIso
                ?? (entry as { bucketStartIso?: string })?.bucketStartIso;
              if (onSelectBucket && iso) {
                const start = Date.parse(iso);
                onSelectBucket(new Date(start).toISOString(), new Date(start + bucketMs).toISOString());
              }
            }}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                fillOpacity={activeIndex == null || activeIndex === i ? 1 : 0.4}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
