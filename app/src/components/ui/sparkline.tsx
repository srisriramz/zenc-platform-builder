import * as React from "react";
import { cn } from "@/lib/utils";

/** Tiny inline-SVG trend line. No axes, no interaction — a glanceable shape. */
export function Sparkline({
  data,
  width = 96,
  height = 26,
  className,
  strokeClass = "stroke-primary",
  fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeClass?: string;
  fill?: boolean;
}) {
  const { line, area } = React.useMemo(() => {
    if (data.length < 2) return { line: "", area: "" };
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    const stepX = width / (data.length - 1);
    const pts = data.map((v, i) => [i * stepX, height - 2 - ((v - min) / span) * (height - 4)] as const);
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [data, width, height]);

  if (!line) return <div style={{ width, height }} className={className} aria-hidden />;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)} aria-hidden>
      {fill && <path d={area} className={cn("fill-current opacity-10", strokeClass)} stroke="none" />}
      <path d={line} className={cn("fill-none", strokeClass)} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
