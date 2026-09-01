import * as React from "react";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.125rem]">{title}</h1>
        {description && <p className="max-w-2xl leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
