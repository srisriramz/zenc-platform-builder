import { FlaskConical } from "lucide-react";

/**
 * NON-REMOVABLE per SKILL.md principle #13 and references/security-governance.md.
 * A "clean up the UI for the demo" request does not authorise removing this.
 * It is a safety/honesty control, not decoration. It may be re-styled for a
 * demo brand, but it must stay visible on every screen.
 */
export function DemoNotice() {
  return (
    <div className="sticky top-0 z-[90] flex items-center justify-center gap-2 border-b border-[color-mix(in_oklch,var(--warning)_40%,var(--border))] bg-[color-mix(in_oklch,var(--warning)_14%,var(--background))] px-3 py-1 text-center text-[11px] font-medium tracking-wide text-foreground">
      <FlaskConical className="size-3.5 text-[var(--warning)]" aria-hidden />
      <span>Interactive Demo with Mock Data</span>
      <span className="hidden text-muted-foreground sm:inline">
        · no production systems, real credentials, or real customer data · all response actions are dry-run only
      </span>
    </div>
  );
}
