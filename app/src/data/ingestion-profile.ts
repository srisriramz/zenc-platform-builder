import type { TelemetrySourceFamily } from "@/schemas";

/**
 * Throughput profile per source family, used only by the SIMULATED-LIVE
 * ingestion dashboard (`/ingestion`). These are demo-plausible steady-state
 * rates, not the deterministic seed the Log Explorer materialises — that seed
 * is a small, queryable sample of these same streams.
 *
 * `nominal_eps` for a source = `volume_weight * eps_per_weight[family]`, so
 * `volume_weight` in telemetry-sources.ts stays the single tuning knob.
 */
export interface FamilyIngestionProfile {
  eps_per_weight: number;
  /** mean normalized-event size on the wire, bytes */
  avg_event_bytes: number;
  label: string;
}

export const FAMILY_INGESTION_PROFILE: Record<TelemetrySourceFamily, FamilyIngestionProfile> = {
  windows: { eps_per_weight: 23, avg_event_bytes: 1150, label: "Windows" },
  linux_syslog: { eps_per_weight: 18, avg_event_bytes: 480, label: "Linux / syslog" },
  firewall: { eps_per_weight: 47, avg_event_bytes: 340, label: "Firewall" },
  cloud: { eps_per_weight: 6, avg_event_bytes: 2200, label: "Cloud" },
  identity: { eps_per_weight: 9, avg_event_bytes: 920, label: "Identity" },
  email: { eps_per_weight: 2.2, avg_event_bytes: 5200, label: "Email" },
};

/** Steady-state events/sec for a source at full health. */
export function nominalEps(family: TelemetrySourceFamily, volumeWeight: number): number {
  return Math.round(volumeWeight * FAMILY_INGESTION_PROFILE[family].eps_per_weight);
}

/**
 * Deterministic N-day daily-volume trend (events + bytes) for a set of sources.
 * Weekday pattern + a fixed pseudo-random wobble — used by the analytics
 * volume-trend charts. `endIso` is the most recent day (the demo clock).
 */
export function dailyVolumeSeries(
  sources: { family: TelemetrySourceFamily; nominalEps: number; healthFactor: number }[],
  endIso: string,
  days = 14,
): { dateIso: string; events: number; bytes: number }[] {
  const end = new Date(endIso);
  const out: { dateIso: string; events: number; bytes: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - d);
    const dow = day.getUTCDay();
    const weekday = dow === 0 || dow === 6 ? 0.72 : 1;
    // stable wobble from the day-of-year
    const doy = Math.floor((day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 0)) / 86_400_000);
    const wobble = 0.9 + ((Math.sin(doy * 2.3) + 1) / 2) * 0.2;
    let events = 0;
    let bytes = 0;
    for (const s of sources) {
      const dayEvents = s.nominalEps * 86_400 * s.healthFactor * weekday * wobble;
      events += dayEvents;
      bytes += dayEvents * FAMILY_INGESTION_PROFILE[s.family].avg_event_bytes;
    }
    out.push({ dateIso: day.toISOString().slice(0, 10), events: Math.round(events), bytes: Math.round(bytes) });
  }
  return out;
}
