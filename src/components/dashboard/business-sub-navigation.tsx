"use client";

import {
  BookOpenText,
  ChevronDown,
  ClipboardCheck,
  FileSearch,
  Globe2,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Search,
  SearchCheck,
  Share2,
  Star,
  Swords,
  Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";

type NavigationPage = {
  label: string;
  segment: string;
  icon: typeof LayoutDashboard;
  description: string;
};

type NavigationGroup = {
  label: string;
  pages: NavigationPage[];
  auditRoute?: boolean;
};

const groups: NavigationGroup[] = [
  {
    label: "Overview",
    pages: [
      {
        label: "Overview",
        segment: "overview",
        icon: LayoutDashboard,
        description: "Status and next actions",
      },
    ],
  },
  {
    label: "Setup",
    pages: [
      {
        label: "Guided setup",
        segment: "setup",
        icon: ClipboardCheck,
        description: "Complete the essential business information",
      },
      {
        label: "Profiles",
        segment: "confirm",
        icon: SearchCheck,
        description: "Confirm public profiles and sources",
      },
      {
        label: "Context",
        segment: "context",
        icon: BookOpenText,
        description: "Describe the business, audience, and offer",
      },
      {
        label: "Goals",
        segment: "goals",
        icon: Target,
        description: "Choose the outcomes recommendations should prioritize",
      },
    ],
  },
  {
    label: "Audit",
    auditRoute: true,
    pages: [
      {
        label: "Findings",
        segment: "audit",
        icon: FileSearch,
        description: "Review all findings and supporting evidence",
      },
      {
        label: "Website",
        segment: "website",
        icon: Globe2,
        description: "Website clarity, pages, and conversion paths",
      },
      {
        label: "SEO",
        segment: "seo",
        icon: Search,
        description: "Search visibility and technical basics",
      },
      {
        label: "Reviews",
        segment: "reviews",
        icon: Star,
        description: "Review presence and customer trust signals",
      },
    ],
  },
  {
    label: "Growth",
    pages: [
      {
        label: "Social",
        segment: "social",
        icon: Share2,
        description: "Channel coverage, strategy, and content direction",
      },
      {
        label: "Competitors",
        segment: "competitors",
        icon: Swords,
        description: "Public comparisons and supported opportunities",
      },
    ],
  },
  {
    label: "Plan",
    pages: [
      {
        label: "Action Plan",
        segment: "action-plan",
        icon: ListChecks,
        description: "Tasks and implementation",
      },
      {
        label: "History",
        segment: "history",
        icon: History,
        description: "Previous audits and comparable progress",
      },
    ],
  },
  {
    label: "Consultant",
    pages: [
      {
        label: "AI Chat",
        segment: "chat",
        icon: MessageSquareText,
        description: "Ask questions about your saved results",
      },
    ],
  },
];

function pageHref(businessId: string, segment: string) {
  return `/dashboard/businesses/${businessId}/${segment}`;
}

export function BusinessSubNavigation({ businessId }: { businessId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const basePath = `/dashboard/businesses/${businessId}`;
  const activePage = groups
    .flatMap((group) => group.pages)
    .find((page) => {
      const href = pageHref(businessId, page.segment);
      return (
        pathname === href ||
        (page.segment === "overview" && pathname === basePath)
      );
    });
  const mobileValue = activePage
    ? pageHref(businessId, activePage.segment)
    : pathname;

  function groupIsActive(group: NavigationGroup) {
    return (
      group.pages.some((page) => {
        const href = pageHref(businessId, page.segment);
        return (
          pathname === href ||
          (page.segment === "overview" && pathname === basePath)
        );
      }) ||
      (group.auditRoute && pathname.startsWith(`${basePath}/audit/`))
    );
  }

  return (
    <nav aria-label="Business sections" className="border-b border-border pb-3">
      <div className="lg:hidden">
        <label htmlFor="business-page-navigation" className="sr-only">
          Business page
        </label>
        <select
          id="business-page-navigation"
          value={mobileValue}
          onChange={(event) => router.push(event.target.value)}
          className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          {!activePage ? <option value={pathname}>Current page</option> : null}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.pages.map((page) => {
                const href = pageHref(businessId, page.segment);
                return (
                  <option key={page.segment} value={href}>
                    {page.label}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        <p className="mt-2 text-xs text-muted">
          {activePage?.description ?? "Audit workspace"}
        </p>
      </div>

      <div className="hidden items-center gap-1 lg:flex">
        {groups.map((group) => {
          const isActive = groupIsActive(group);
          const directPage = group.pages.length === 1 ? group.pages[0] : null;

          if (directPage) {
            const Icon = directPage.icon;
            return (
              <Link
                key={group.label}
                href={pageHref(businessId, directPage.segment)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive && "bg-card text-foreground shadow-sm",
                )}
                title={directPage.description}
              >
                <Icon className="size-4" />
                {group.label}
              </Link>
            );
          }

          return (
            <div
              key={group.label}
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setOpenGroup(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpenGroup(null);
                }
              }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={openGroup === group.label}
                onClick={() =>
                  setOpenGroup((current) =>
                    current === group.label ? null : group.label,
                  )
                }
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive && "bg-card text-foreground shadow-sm",
                )}
              >
                {group.label}
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    openGroup === group.label && "rotate-180",
                  )}
                />
              </button>
              {openGroup === group.label ? (
                <div
                  role="menu"
                  className="absolute left-0 top-12 z-30 min-w-52 rounded-lg border border-border bg-card p-1.5 shadow-xl"
                >
                  {group.pages.map((page) => {
                    const Icon = page.icon;
                    const href = pageHref(businessId, page.segment);
                    const isPageActive = pathname === href;
                    return (
                      <Link
                        key={page.segment}
                        href={href}
                        role="menuitem"
                        onClick={() => setOpenGroup(null)}
                        className={cn(
                          "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          isPageActive && "bg-foreground/5 text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span>
                          <span className="block">{page.label}</span>
                          <span className="mt-0.5 block text-xs font-normal text-muted">
                            {page.description}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        <span className="ml-auto px-2 text-xs font-medium text-muted">
          {activePage?.description ?? "Audit workspace"}
        </span>
      </div>
    </nav>
  );
}
