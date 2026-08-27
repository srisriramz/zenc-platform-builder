"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { HealthState } from "@/schemas";

const ORDER: HealthState[] = ["healthy", "degraded", "stale", "unknown"];
const COLOR: Record<HealthState, string> = {
  healthy: "var(--success)",
  degraded: "var(--warning)",
  stale: "var(--destructive)",
  unknown: "var(--muted-foreground)",
};
const LABEL: Record<HealthState, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  stale: "Stale",
  unknown: "Unknown",
};

export function IngestionHealth({ counts }: { counts: Record<HealthState, number> }) {
  const total = ORDER.reduce((n, k) => n + (counts[k] ?? 0), 0);
  const data = ORDER.filter((k) => (counts[k] ?? 0) > 0).map((k) => ({ name: k, value: counts[k] }));

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={62}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={COLOR[d.name as HealthState]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">sources</span>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: COLOR[k] }} aria-hidden />
            <span className="text-muted-foreground">{LABEL[k]}</span>
            <span className="tabular-nums font-medium">{counts[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
