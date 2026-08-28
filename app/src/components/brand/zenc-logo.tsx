import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The ZenC brand mark — a jade arc (the "C"), a stroked "Z", and an orbiting
 * dot — lifted from the ZenC Labs site (zenclabs). The arc is the brand green;
 * the Z and dot ride `currentColor` so the mark inverts cleanly between the
 * dark and light themes. The orbit is a slow spin, and it inherits the global
 * `prefers-reduced-motion` clamp in `globals.css`.
 */
export function ZencMark({
  size = 28,
  spin = true,
  className,
}: {
  size?: number;
  /** animate the orbiting dot */
  spin?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="ZenC"
      className={cn("shrink-0", className)}
    >
      <path d="M31.1 12.3 A13.5 13.5 0 1 0 31.1 27.7" stroke="var(--primary)" strokeWidth="2.9" strokeLinecap="round" />
      <path d="M14.5 14.8 H25.5 L14.5 25.2 H25.5" stroke="currentColor" strokeWidth="4" strokeLinejoin="miter" />
      <g style={{ transformOrigin: "20px 20px", animation: spin ? "orbit 3.6s linear infinite" : undefined }}>
        <circle cx="20" cy="6.5" r="2.7" fill="currentColor" />
      </g>
    </svg>
  );
}

/**
 * Mark + wordmark lockup. The wordmark is "ZenC" with a jade "C" (the site's
 * treatment); pass `suffix` for the full "ZenC Labs" form.
 */
export function ZencLogo({
  markSize = 28,
  suffix,
  className,
}: {
  markSize?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.6rem] font-display text-[1.05rem] font-bold leading-none tracking-tight text-foreground",
        className,
      )}
    >
      <ZencMark size={markSize} className="text-foreground" />
      <span className="whitespace-nowrap">
        Zen<span className="text-primary">C</span>
        {suffix ? <span>&nbsp;{suffix}</span> : null}
      </span>
    </span>
  );
}
