"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  CircleX,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import styles from "@/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-deck.module.css";
import { cn } from "@/lib/utils";
import type {
  PresentationComparisonRow,
  PresentationDensity,
  PresentationStatus,
  PresentationTone,
} from "@/lib/reports/presentation-types";

export function PresentationSlide({
  slideId,
  eyebrow,
  title,
  icon: Icon,
  density = "standard",
  footerNote,
  children,
}: {
  slideId: string;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  density?: PresentationDensity;
  footerNote?: string | null;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const measure = () => {
      const next =
        element.scrollHeight > element.clientHeight + 2 ||
        element.scrollWidth > element.clientWidth + 2;
      setOverflowing(next);
      if (process.env.NODE_ENV !== "production" && next && !warnedRef.current) {
        warnedRef.current = true;
        console.warn(
          `[Presentation Mode] Slide "${title}" exceeds its fixed content area. Split or reduce the slide content.`,
        );
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const animationFrame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [title]);

  return (
    <section
      className={styles.slide}
      data-density={density}
      data-presentation-slide={slideId}
      data-slide-overflow={overflowing ? "true" : "false"}
      role="group"
      aria-roledescription="slide"
      aria-label={title}
    >
      <div className={styles.slideFrame}>
        <header className={styles.slideHeader}>
          <span className={styles.slideHeaderIcon} aria-hidden="true">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className={styles.slideEyebrow}>{eyebrow}</p>
            <h1 className={styles.slideTitle}>{title}</h1>
          </div>
        </header>
        <div ref={contentRef} className={styles.slideContent}>
          {children}
        </div>
        {footerNote ? <SlideFooterNote>{footerNote}</SlideFooterNote> : null}
      </div>
    </section>
  );
}

export function SlideMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: PresentationTone;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border bg-card p-3 shadow-sm sm:p-4",
        tone === "positive" && "border-emerald-200 dark:border-emerald-900",
        tone === "warning" && "border-amber-200 dark:border-amber-900",
        tone === "critical" && "border-red-200 dark:border-red-900",
        tone === "neutral" && "border-border",
      )}
    >
      <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
      <div className="mt-1 text-xl font-semibold leading-tight sm:mt-2 sm:text-3xl">
        {value}
      </div>
      {detail ? (
        <p className="mt-1 text-xs leading-5 text-muted sm:mt-2 sm:text-sm">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function SlideMetricGrid({
  columns = 3,
  children,
  className,
}: {
  columns?: 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-0 gap-2 sm:gap-3",
        columns === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SlideInsightCard({
  title,
  tone = "neutral",
  children,
  className,
}: {
  title: string;
  tone?: PresentationTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border p-3 sm:p-4",
        tone === "positive" &&
          "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20",
        tone === "warning" &&
          "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20",
        tone === "critical" &&
          "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/20",
        tone === "neutral" && "border-border bg-card",
        className,
      )}
    >
      <h2 className="text-sm font-semibold sm:text-base">{title}</h2>
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  );
}

export function SlideBulletList({
  items,
  tone = "neutral",
  compact = false,
}: {
  items: string[];
  tone?: PresentationTone;
  compact?: boolean;
}) {
  const bulletClass =
    tone === "positive"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-amber-500"
        : tone === "critical"
          ? "bg-red-500"
          : "bg-accent";
  return (
    <ul className={cn("grid", compact ? "gap-1.5" : "gap-2 sm:gap-3")}>
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "flex min-w-0 gap-2 leading-snug",
            compact ? "text-xs sm:text-sm" : "text-sm sm:text-base",
          )}
        >
          <span
            className={cn("mt-[0.48em] size-1.5 shrink-0 rounded-full", bulletClass)}
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function SlideStatusGrid({ statuses }: { statuses: PresentationStatus[] }) {
  return (
    <div className="grid min-h-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {statuses.map((status) => (
        <StatusCard key={status.label} status={status} />
      ))}
    </div>
  );
}

function StatusCard({ status }: { status: PresentationStatus }) {
  const Icon =
    status.tone === "positive"
      ? CheckCircle2
      : status.tone === "warning"
        ? AlertTriangle
        : status.tone === "critical"
          ? CircleX
          : CircleHelp;
  return (
    <div
      className="min-w-0 rounded-lg border border-border bg-card p-2.5 sm:p-3"
      data-status-tone={status.tone}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            status.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            status.tone === "warning" && "text-amber-600 dark:text-amber-400",
            status.tone === "critical" && "text-red-600 dark:text-red-400",
            status.tone === "neutral" && "text-muted",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{status.label}</p>
          <p className="mt-0.5 text-sm font-semibold sm:text-base">{status.value}</p>
        </div>
      </div>
      {status.detail ? (
        <p className="mt-1.5 text-[0.68rem] leading-4 text-muted sm:text-xs">
          {status.detail}
        </p>
      ) : null}
      <span className="sr-only">Status: {status.value}</span>
    </div>
  );
}

export function SlideComparisonTable({
  businessName,
  competitorName,
  rows,
}: {
  businessName: string;
  competitorName: string;
  rows: PresentationComparisonRow[];
}) {
  return (
    <>
      <div className={styles.comparisonDesktop}>
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-foreground/[0.045]">
              <tr>
                <th scope="col" className="w-[16%] px-3 py-2.5 font-semibold">Area</th>
                <th scope="col" className="w-[25%] px-3 py-2.5 font-semibold">{businessName}</th>
                <th scope="col" className="w-[25%] px-3 py-2.5 font-semibold">{competitorName}</th>
                <th scope="col" className="w-[34%] px-3 py-2.5 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.area} className="border-t border-border">
                  <th scope="row" className="px-3 py-2.5 font-semibold">{row.area}</th>
                  <td className="px-3 py-2.5 text-muted">{row.businessValue}</td>
                  <td className="px-3 py-2.5 text-muted">{row.competitorValue}</td>
                  <td className="px-3 py-2.5">
                    <ResultBadge tone={row.tone}>{row.result}</ResultBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={cn(styles.comparisonMobile, "gap-1.5")}>
        {rows.map((row) => (
          <section key={row.area} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold">{row.area}</h2>
              <ResultBadge tone={row.tone}>{row.result}</ResultBadge>
            </div>
            <dl className="mt-1.5 grid grid-cols-2 gap-2 text-[0.68rem] leading-4">
              <div>
                <dt className="font-medium text-muted">{businessName}</dt>
                <dd>{row.businessValue}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted">{competitorName}</dt>
                <dd>{row.competitorValue}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}

export function ResultBadge({
  tone,
  children,
}: {
  tone: PresentationTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-1 text-[0.65rem] font-semibold leading-none sm:text-xs",
        tone === "positive" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
        tone === "warning" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
        tone === "critical" &&
          "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200",
        tone === "neutral" && "border-border bg-background text-muted",
      )}
    >
      {children}
    </span>
  );
}

export function SlideActionCard({
  index,
  eyebrow,
  title,
  description,
  evidence,
  badges,
}: {
  index: number;
  eyebrow: string;
  title: string;
  description: string;
  evidence: string;
  badges: string[];
}) {
  return (
    <article className="grid min-h-0 grid-cols-[2rem_minmax(0,1fr)] gap-2.5 rounded-lg border border-border bg-card p-3 shadow-sm sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:p-4">
      <span className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground sm:size-10">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase text-accent sm:text-xs">{eyebrow}</p>
        <h2 className="mt-0.5 text-base font-semibold leading-tight sm:text-xl">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted sm:text-sm">{description}</p>
        <p className="mt-1 hidden text-[0.68rem] leading-4 text-muted sm:block sm:text-xs">
          <span className="font-semibold text-foreground">Evidence:</span> {evidence}
        </p>
      </div>
      <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-auto sm:flex-col sm:items-end">
        {badges.map((badge, badgeIndex) => (
          <span
            key={badge}
            className={cn(
              "rounded-full border border-border bg-background px-2 py-1 text-[0.65rem] font-medium sm:text-xs",
              badgeIndex === 2 && "hidden sm:inline-flex",
            )}
          >
            {badge}
          </span>
        ))}
      </div>
    </article>
  );
}

export function SlideFooterNote({ children }: { children: ReactNode }) {
  return (
    <p className={styles.slideFooterNote}>
      <Info className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
