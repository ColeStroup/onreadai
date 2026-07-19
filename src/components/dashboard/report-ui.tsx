import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageIntro({
  title,
  description,
  icon: Icon,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div>
          {eyebrow ? (
            <p className="mb-1 text-xs font-semibold uppercase text-muted">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-2xl font-semibold tracking-normal">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function CompactMetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const tones = {
    default: "text-foreground",
    good: "text-teal-700 dark:text-teal-200",
    warning: "text-amber-700 dark:text-amber-200",
    danger: "text-rose-700 dark:text-rose-200",
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tones[tone])}>{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-muted">{detail}</p> : null}
    </div>
  );
}

export function SummaryStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PositiveEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100">
      <CheckCircle2 className="size-4 shrink-0" />
      {children}
    </div>
  );
}

export function DataSourceNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
      <Info className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function SectionTabs({
  items,
}: {
  items: Array<{ label: string; href: string; active: boolean; count?: number }>;
}) {
  return (
    <nav
      aria-label="Page sections"
      className="flex gap-1 overflow-x-auto border-b border-border pb-2"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            item.active && "bg-card text-foreground shadow-sm",
          )}
        >
          {item.label}
          {typeof item.count === "number" ? (
            <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-xs">
              {item.count}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function CompactIssueRow({
  title,
  detail,
  meta,
  action,
  tone = "warning",
}: {
  title: string;
  detail: string;
  meta?: ReactNode;
  action?: ReactNode;
  tone?: "warning" | "danger" | "info" | "good";
}) {
  const dotTone = {
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-blue-500",
    good: "bg-teal-500",
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className={cn("mt-2 size-2 shrink-0 rounded-full", dotTone[tone])} />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
          {meta ? <div className="mt-2 text-xs text-muted">{meta}</div> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 pl-5 sm:pl-0">{action}</div> : null}
    </div>
  );
}

export function ReportSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}
