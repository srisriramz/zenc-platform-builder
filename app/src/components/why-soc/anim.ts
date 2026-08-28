"use client";

import * as React from "react";

const RM_QUERY = "(prefers-reduced-motion: reduce)";

/** Reduced-motion-aware: true when the viewer prefers reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(RM_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  );
}

/**
 * Returns [ref, inView]. `inView` latches true the first time the element
 * crosses the viewport threshold and never flips back, so reveal animations
 * don't replay on scroll-up.
 */
export function useInViewOnce<T extends HTMLElement>(
  rootMargin = "0px 0px -12% 0px",
): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    // already on screen at mount — reveal now, don't wait for a scroll event
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      setInView(true);
      return;
    }

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setInView(true);
            io?.disconnect();
          }
        },
        { rootMargin, threshold: 0.15 },
      );
      io.observe(el);
    }
    // safety net for environments where IO never fires — reveal after a beat
    const fallback = window.setTimeout(() => setInView(true), 1800);
    return () => {
      io?.disconnect();
      window.clearTimeout(fallback);
    };
  }, [inView, rootMargin]);
  return [ref, inView];
}

/**
 * Animates from 0 to `target` over `duration` ms once `active` is true. Returns
 * `target` directly under prefers-reduced-motion or when inactive, so no state
 * update happens in those cases.
 */
export function useCountUp(target: number, active: boolean, duration = 1100): number {
  const reduced = usePrefersReducedMotion();
  const animate = active && !reduced && duration > 0;
  const [animated, setAnimated] = React.useState(0);

  React.useEffect(() => {
    if (!animate) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimated(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate, duration]);

  return animate ? animated : target;
}
