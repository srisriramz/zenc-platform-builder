import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  href,
  onClick,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = !!href || !!onClick;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {interactive ? (
          <ArrowUpRight className="size-4 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        ) : (
          Icon && <Icon className="size-4 text-muted-foreground/70" />
        )}
      </div>
      <p className={cn("mt-2 text-[1.7rem] font-semibold leading-none tabular-nums", VALUE_TONE[tone])}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </>
  );

  const cardClass = cn(
    "card-hairline group relative block overflow-hidden rounded-xl border border-border p-4 text-card-foreground shadow-sm before:absolute before:inset-y-3 before:left-0 before:w-0.5 before:rounded-full",
    ACCENT[tone],
    interactive &&
      "transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:border-border-strong",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cardClass, "w-full text-left")}>
        {inner}
      </button>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}
