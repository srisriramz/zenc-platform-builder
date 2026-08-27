"use client";

import * as React from "react";
import type { HealthState, TelemetrySourceFamily } from "@/schemas";
import { demoNowMs } from "@/lib/time";
import {
  LIVE_TICK_MS,
  LIVE_TICK_MS_REDUCED,
  LIVE_WINDOW_SECONDS,
  sampleStream,
  type StreamSample,
} from "@/lib/live-feed";

export interface LiveSource {
  id: string;
  label: string;
  family: TelemetrySourceFamily;
  health: HealthState;
  nominalEps: number;
  avgEventBytes: number;
}

export interface LiveFrame {
  t: number; // whole seconds on the demo clock
  totalEps: number;
  totalBps: number;
  per: Record<string, StreamSample>;
}

export interface LiveIngestion {
  history: LiveFrame[];
  latest: LiveFrame;
  paused: boolean;
  togglePaused: () => void;
  tickMs: number;
}

function frameAt(sources: LiveSource[], t: number): LiveFrame {
  const per: Record<string, StreamSample> = {};
  let totalEps = 0;
  let totalBps = 0;
  for (const s of sources) {
    const sample = sampleStream(s.id, s.nominalEps, s.avgEventBytes, s.health, t);
    per[s.id] = sample;
    totalEps += sample.eps;
    totalBps += sample.bps;
  }
  return { t, totalEps, totalBps, per };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Advances a simulated clock and re-derives a rolling window of throughput
 * frames from the pure `live-feed` sampler. All impurity (Date.now, timers)
 * lives in effects; `history` is a pure `useMemo` of elapsed seconds.
 */
export function useLiveIngestion(sources: LiveSource[]): LiveIngestion {
  const [tickMs] = React.useState(() => (prefersReducedMotion() ? LIVE_TICK_MS_REDUCED : LIVE_TICK_MS));
  const [originT] = React.useState(() => Math.floor(demoNowMs() / 1000));
  const [elapsed, setElapsed] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const start = Date.now() - elapsed * 1000; // resume where we left off
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, tickMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `elapsed` is read once to anchor `start`, not tracked
  }, [paused, tickMs]);

  // `key` captures exactly the parts of `sources` that change a sample.
  const key = sources.map((s) => `${s.id}:${s.health}:${s.nominalEps}:${s.avgEventBytes}`).join("|");

  const history = React.useMemo(() => {
    const end = originT + elapsed;
    return Array.from({ length: LIVE_WINDOW_SECONDS }, (_, i) =>
      frameAt(sources, end - (LIVE_WINDOW_SECONDS - 1 - i)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `sources`
  }, [originT, elapsed, key]);

  const togglePaused = React.useCallback(() => setPaused((p) => !p), []);

  return { history, latest: history[history.length - 1], paused, togglePaused, tickMs };
}
