"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface LivePoint {
  ago: number; // seconds before "now"
  value: number;
}

/**
 * Single-series live area chart (throughput or bandwidth). No legend — the
 * card title names the series. Recessive grid, crosshair tooltip, no entry
 * animation (the window simply shifts left each tick).
 */
export function LiveAreaChart({
  data,
  colorVar = "--primary",
  format,
  ariaLabel,
  height = 200,
}: {
  data: LivePoint[];
  colorVar?: string;
  format: (n: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const gradientId = React.useId().replace(/:/g, "");
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(${colorVar})`} stopOpacity={0.32} />
              <stop offset="100%" stopColor={`var(${colorVar})`} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="ago"
            reversed
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={[0, 30, 60, 90]}
            tickFormatter={(v) => (v === 0 ? "now" : `-${v}s`)}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
          />
          <YAxis
            width={52}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => format(v as number)}
            domain={[0, "auto"]}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-md)",
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(v) => (v === 0 ? "now" : `${v}s ago`)}
            formatter={(value) => [format(value as number), "rate"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={`var(${colorVar})`}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
