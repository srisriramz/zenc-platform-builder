"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, CircleUser, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { USER_MAP } from "@/data/platform";
import { useGuidedDemo } from "@/hooks/use-demo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";

/**
 * The docked controller strip for the guided demo (references/launch-demo-spec.md).
 * Rendered only while a walkthrough is running. It sits below the non-removable
 * demo notice and above page content, and persists across the real screens the
 * script navigates through.
 */
export function DemoController() {
  const demo = useGuidedDemo();
  if (!demo.running || !demo.script || !demo.step) return null;

  const personaName = USER_MAP[demo.step.persona]?.display_name ?? demo.step.persona;
  const stepNo = demo.stepIndex + 1;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[95] border-t border-border bg-card/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.4)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="flex-none gap-1.5 text-[10px] uppercase tracking-wide">
            Guided demo
          </Badge>
          <span className="flex-none text-xs font-medium text-muted-foreground">
            {demo.script.label} · step {stepNo}/{demo.total}
          </span>
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
            <CircleUser className="size-3.5" /> as {personaName}
          </span>
          <div className="ml-auto flex flex-none items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={demo.prev} disabled={demo.busy || demo.atStart}>
              <ChevronLeft /> Prev
            </Button>
            <Button size="sm" variant="outline" onClick={demo.restart} disabled={demo.busy} title="Reset demo state and start over">
              <RotateCcw />
            </Button>
            {demo.atEnd ? (
              <Button size="sm" variant="default" onClick={demo.exit} disabled={demo.busy}>
                Finish
              </Button>
            ) : (
              <Button size="sm" variant="default" onClick={demo.next} disabled={demo.busy}>
                {demo.busy ? <Loader2 className="animate-spin" /> : <>Next <ChevronRight /></>}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={demo.exit} disabled={demo.busy} aria-label="Exit guided demo">
              <X />
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{demo.step.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{demo.step.presenterNote}</p>
          </div>
        </div>

        {demo.error && (
          <p className="flex items-center gap-1.5 text-[11px] text-[var(--warning)]">
            <TriangleAlert className="size-3.5 flex-none" />
            That step couldn&rsquo;t run against live state ({demo.error}). Use Restart to reset and try the walkthrough again.
          </p>
        )}
      </div>
    </div>
  );
}
