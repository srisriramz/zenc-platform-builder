"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  label: string;
  value: number;
}

/** Small single-series daily trend area chart (14-day volume, etc.). */
export function TrendChart({
  data,
  format,
  colorVar = "--primary",
  height = 180,
  ariaLabel,
}: {
  data: TrendPoint[];
  format: (n: number) => string;
  colorVar?: string;
  height?: number;
  ariaLabel: string;
}) {
  const gid = `trend-${colorVar.replace(/\W/g, "")}`;
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`var(${colorVar})`} stopOpacity={0.3} />
              <stop offset="100%" stopColor={`var(${colorVar})`} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={20}
          />
          <YAxis
            width={48}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => format(v as number)}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "var(--border-strong)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: 12,
              boxShadow: "var(--shadow-md)",
              color: "var(--popover-foreground)",
            }}
            formatter={(value) => [format(value as number), ""]}
          />
          <Area type="monotone" dataKey="value" stroke={`var(${colorVar})`} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
