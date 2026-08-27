import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/primitives";

type Tone = "default" | "primary" | "warning" | "danger" | "success";

const ACCENT: Record<Tone, string> = {
  default: "before:bg-border-strong",
  primary: "before:bg-primary",
  warning: "before:bg-[var(--warning)]",
  danger: "before:bg-[var(--destructive)]",
  success: "before:bg-[var(--success)]",
};

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-foreground",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--destructive)]",
  success: "text-[var(--success)]",
};

export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-4 before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full",
        ACCENT[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground/70" />}
      </div>
      <p className={cn("mt-2 text-[1.7rem] font-semibold leading-none tabular-nums", VALUE_TONE[tone])}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}
