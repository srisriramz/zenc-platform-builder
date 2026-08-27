import { cn } from "@/lib/utils";
import type { RiskBand } from "@/schemas";

const BAND_STYLE: Record<RiskBand, { text: string; bg: string; label: string }> = {
  critical: { text: "text-[var(--sev-critical)]", bg: "bg-[color-mix(in_oklch,var(--sev-critical)_16%,transparent)]", label: "Critical" },
  high: { text: "text-[var(--sev-high)]", bg: "bg-[color-mix(in_oklch,var(--sev-high)_16%,transparent)]", label: "High" },
  elevated: { text: "text-[var(--sev-medium)]", bg: "bg-[color-mix(in_oklch,var(--sev-medium)_20%,transparent)]", label: "Elevated" },
  low: { text: "text-[var(--sev-low)]", bg: "bg-[color-mix(in_oklch,var(--sev-low)_18%,transparent)]", label: "Low" },
};

const BAND_DOT: Record<RiskBand, string> = {
  critical: "bg-[var(--sev-critical)]",
  high: "bg-[var(--sev-high)]",
  elevated: "bg-[var(--sev-medium)]",
  low: "bg-[var(--sev-low)]",
};

export function RiskBadge({ score, band, className }: { score: number; band: RiskBand; className?: string }) {
  const s = BAND_STYLE[band];
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums", s.bg, s.text, className)}
      title={`Indicative risk ${score}/100 — ${s.label}`}
    >
      <span className={cn("size-1.5 rounded-full", BAND_DOT[band])} aria-hidden />
      {score}
    </span>
  );
}

export function RiskDot({ band, className }: { band: RiskBand; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", BAND_DOT[band], className)} aria-hidden />;
}

export function trendLabel(trend: "rising" | "steady" | "falling"): string {
  return trend === "rising" ? "▲ rising" : trend === "falling" ? "▼ falling" : "▬ steady";
}
