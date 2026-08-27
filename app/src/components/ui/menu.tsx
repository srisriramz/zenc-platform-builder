"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal dropdown menu. Closes on outside click, Escape, or item selection.
 * Not a full ARIA menu widget — sufficient for the demo's switchers.
 */
export function Menu({
  trigger,
  children,
  align = "start",
  className,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div className="relative" ref={rootRef}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            "anim-scale-in absolute z-50 mt-1.5 max-h-[70vh] min-w-[13rem] overflow-y-auto rounded-lg border border-border-strong bg-popover p-1 text-popover-foreground shadow-lg",
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
            className,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  className,
  selected,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50",
        selected && "font-medium text-primary",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
