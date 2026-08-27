/**
 * The demo runs against a frozen clock so that "stale", "lag", and latency
 * numbers are deterministic across reloads. Nothing in the build should call
 * `Date.now()` for domain logic — use `demoNow()`.
 */
export const DEMO_NOW_ISO = "2026-08-28T12:00:00.000Z";

export function demoNow(): Date {
  return new Date(DEMO_NOW_ISO);
}

export function demoNowMs(): number {
  return demoNow().getTime();
}

/** Whole seconds between two ISO timestamps (b - a). */
export function secondsBetween(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 1000);
}

export function minus(iso: string, opts: { hours?: number; minutes?: number; seconds?: number; days?: number }): string {
  const d = new Date(iso);
  if (opts.days) d.setUTCDate(d.getUTCDate() - opts.days);
  if (opts.hours) d.setUTCHours(d.getUTCHours() - opts.hours);
  if (opts.minutes) d.setUTCMinutes(d.getUTCMinutes() - opts.minutes);
  if (opts.seconds) d.setUTCSeconds(d.getUTCSeconds() - opts.seconds);
  return d.toISOString();
}

export function formatTimestamp(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(".000Z", "Z");
}

export function formatRelative(iso: string | undefined | null): string {
  if (!iso) return "—";
  const deltaSec = Math.round((demoNowMs() - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(deltaSec);
  const suffix = deltaSec >= 0 ? "ago" : "from now";
  if (abs < 60) return `${abs}s ${suffix}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${suffix}`;
  return `${Math.round(abs / 86400)}d ${suffix}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}
