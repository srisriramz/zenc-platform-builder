/**
 * Deterministic simulator for the "live" ingestion dashboard.
 *
 * Every value is a pure function of (sourceId, whole-second t). The React hook
 * that consumes this just advances `t` on a timer and keeps a rolling buffer —
 * so pausing, resuming, and reduced-motion slow-ticking all stay consistent,
 * and there is no real network or randomness-per-render.
 */
import { hashString } from "@/lib/prng";
import type { HealthState } from "@/schemas";

export interface StreamSample {
  /** events per second */
  eps: number;
  /** bytes per second on the wire */
  bps: number;
}

interface HealthShape {
  factor: number;
  volatility: number;
  /** probability of a short dropout in any given second */
  dropoutChance: number;
}

function healthShape(health: HealthState): HealthShape {
  switch (health) {
    case "healthy":
      return { factor: 1, volatility: 0.06, dropoutChance: 0 };
    case "degraded":
      return { factor: 0.55, volatility: 0.34, dropoutChance: 0.08 };
    case "unknown":
      return { factor: 0.7, volatility: 0.14, dropoutChance: 0.02 };
    case "stale":
      return { factor: 0, volatility: 0, dropoutChance: 0 };
  }
}

/** unit-interval pseudo-random from an integer, stable across sessions */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Events/sec for one source at whole-second `t` (seconds since the demo clock).
 * Combines a slow diurnal swell, a medium ~40s wave, and per-second noise.
 */
export function sampleEps(sourceId: string, nominalEps: number, health: HealthState, t: number): number {
  const shape = healthShape(health);
  if (shape.factor === 0) return 0;

  const base = hashString(sourceId);
  const diurnal = 1 + 0.14 * Math.sin((t / 3600) * Math.PI * 2 + (base % 100) / 16);
  const swell = 1 + 0.08 * Math.sin((t / 41) * Math.PI * 2 + (base % 50));
  const n = (noise(base + Math.floor(t)) - 0.5) * 2 * shape.volatility;
  const dropout = shape.dropoutChance > 0 && noise(base * 7 + Math.floor(t / 3)) < shape.dropoutChance ? 0.25 : 1;

  const eps = nominalEps * shape.factor * diurnal * swell * dropout * (1 + n);
  return Math.max(0, Math.round(eps));
}

export function sampleStream(
  sourceId: string,
  nominalEps: number,
  avgEventBytes: number,
  health: HealthState,
  t: number,
): StreamSample {
  const eps = sampleEps(sourceId, nominalEps, health, t);
  // per-event size wobbles a little too
  const sizeJitter = 1 + (noise(hashString(sourceId) + Math.floor(t) * 3) - 0.5) * 0.12;
  return { eps, bps: Math.round(eps * avgEventBytes * sizeJitter) };
}

export const LIVE_WINDOW_SECONDS = 90;
export const LIVE_TICK_MS = 1500;
export const LIVE_TICK_MS_REDUCED = 4000;
