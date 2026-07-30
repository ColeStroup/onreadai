"use client";

import {
  BarChart3,
  Building2,
  CreditCard,
  Handshake,
  LifeBuoy,
  LogOut,
  KeyRound,
  Plus,
  Settings,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
  };
  isAdmin?: boolean;
  isPartner?: boolean;
  children: ReactNode;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { label: "Businesses", href: "/dashboard/businesses", icon: Building2 },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Help", href: "/dashboard/help", icon: LifeBuoy },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardShell({
  user,
  isAdmin = false,
  isPartner = false,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const userLabel = user.name || user.email || "Account";
  const visibleNavItems = [
    ...navItems,
    ...(isPartner
      ? [{ label: "Partner", href: "/dashboard/partner", icon: Handshake }]
      : []),
    ...(isAdmin
      ? [
          {
            label: "Complimentary Access",
            href: "/dashboard/admin/entitlements",
            icon: KeyRound,
          },
          {
            label: "Partner Admin",
            href: "/dashboard/admin/partners",
            icon: Handshake,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[280px_1fr]">
      <aside className="sticky top-0 hidden h-screen min-h-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="shrink-0 border-b border-border p-5">
          <Link href="/dashboard" className="flex items-center gap-3 font-semibold">
            <BrandLogo size={36} eager />
            <span>Onread AI</span>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-foreground/5 hover:text-foreground",
                  isActive && "bg-foreground text-background hover:bg-foreground hover:text-background dark:bg-accent dark:text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-border bg-card p-4">
          <div className="mb-3 min-w-0">
            <p className="truncate text-sm font-medium">{userLabel}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className={buttonVariants({
              variant: "secondary",
              size: "sm",
              className: "w-full",
            })}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
              <BrandLogo size={32} eager />
              <span>Onread</span>
            </Link>
            <Link
              href="/dashboard/businesses/new"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              <Plus className="size-4" />
              New
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted",
                    isActive && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
