"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  CustomerEventName,
  CustomerEventSurface,
} from "@/lib/analytics/customer-events";

type DisclosureSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  compact?: boolean;
  analyticsEvent?: CustomerEventName;
  analyticsSurface?: CustomerEventSurface;
};

export function DisclosureSection({
  title,
  description,
  children,
  defaultOpen = false,
  className,
  contentClassName,
  compact = false,
  analyticsEvent,
  analyticsSurface,
}: DisclosureSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        data-customer-event={!isOpen ? analyticsEvent : undefined}
        data-customer-surface={!isOpen ? analyticsSurface : undefined}
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex w-full items-center justify-between gap-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
          compact ? "px-4 py-3" : "p-5",
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          {description ? (
            <span className="mt-1 block text-sm leading-6 text-muted">
              {description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <div
          id={contentId}
          className={cn(
            "border-t border-border",
            compact ? "p-4" : "p-5",
            contentClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
