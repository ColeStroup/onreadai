"use client";

import {
  BookOpenText,
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
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { label: "Confirm", segment: "confirm", icon: SearchCheck },
  { label: "Overview", segment: "overview", icon: LayoutDashboard },
  { label: "Context", segment: "context", icon: BookOpenText },
  { label: "Action Plan", segment: "action-plan", icon: ListChecks },
  { label: "Goals", segment: "goals", icon: Target },
  { label: "Website", segment: "website", icon: Globe2 },
  { label: "SEO", segment: "seo", icon: Search },
  { label: "Social", segment: "social", icon: Share2 },
  { label: "Reviews", segment: "reviews", icon: Star },
  { label: "Competitors", segment: "competitors", icon: Swords },
  { label: "History", segment: "history", icon: History },
  { label: "Chat", segment: "chat", icon: MessageSquareText },
];

export function BusinessTabs({ businessId }: { businessId: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border pb-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const href = `/dashboard/businesses/${businessId}/${tab.segment}`;
        const isActive =
          pathname === href ||
          (tab.segment === "overview" &&
            pathname === `/dashboard/businesses/${businessId}`);

        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground",
              isActive && "bg-card text-foreground shadow-sm",
            )}
          >
            <Icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
