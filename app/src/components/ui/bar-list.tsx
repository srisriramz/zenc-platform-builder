import * as React from "react";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  label: React.ReactNode;
  value: number;
  /** formatted value shown at the row end */
  display: string;
  /** tailwind bg utility or arbitrary value for the fill */
  barClass?: string;
  /** true if this row is the current selection */
  active?: boolean;
}

/**
 * Horizontal bar list — a single measure across a handful of categories.
 * Direct value labels (few rows), recessive track, per-row title tooltip.
 * When `onSelect` is given, rows become clickable drill targets.
 */
export function BarList({
  data,
  className,
  onSelect,
}: {
  data: BarDatum[];
  className?: string;
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className={cn("space-y-1", className)}>
      {data.map((d) => {
        const Row = onSelect ? "button" : "div";
        return (
          <li key={d.key}>
            <Row
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(d.key) } : {})}
              title={d.display}
              className={cn(
                "grid w-full grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-left text-sm transition-colors",
                onSelect && "hover:bg-accent",
                d.active && "bg-accent",
              )}
            >
              <span className="truncate text-muted-foreground">{d.label}</span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", d.barClass ?? "bg-primary")}
                  style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }}
                />
              </span>
              <span className="tabular-nums text-xs text-muted-foreground">{d.display}</span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
