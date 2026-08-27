"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { HealthState } from "@/schemas";
import { drillHref } from "@/lib/use-nav";

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
      <ul className="space-y-0.5 text-sm">
        {ORDER.map((k) => {
          const n = counts[k] ?? 0;
          const row = (
            <>
              <span className="size-2 rounded-full" style={{ background: COLOR[k] }} aria-hidden />
              <span className="text-muted-foreground">{LABEL[k]}</span>
              <span className="tabular-nums font-medium">{n}</span>
            </>
          );
          return (
            <li key={k}>
              {n > 0 ? (
                <Link
                  href={drillHref("/telemetry", { health: k })}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
                >
                  {row}
                </Link>
              ) : (
                <span className="flex items-center gap-2 px-1.5 py-1 opacity-60">{row}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
