"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatTimestamp } from "@/lib/time";

export function Histogram({ data }: { data: { bucketStartIso: string; count: number }[] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  if (total === 0) {
    return <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No events in range</div>;
  }
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="bucketStartIso" hide />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "var(--accent)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(v) => formatTimestamp(String(v))}
            formatter={(value) => [value as number, "events"]}
          />
          <Bar dataKey="count" fill="var(--primary)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
