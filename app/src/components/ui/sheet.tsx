"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Left-anchored slide-in panel for mobile navigation. Esc + backdrop dismiss. */
export function Sheet({
  open,
  onClose,
  children,
  labelledBy,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  className?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] lg:hidden">
      <div className="anim-fade absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "anim-slide-in-left absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto border-r border-border bg-card shadow-xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
