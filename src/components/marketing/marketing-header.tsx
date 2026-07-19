import { Menu } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/marketing/brand-mark";

const primaryLinks = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "For Consultants", href: "/for-consultants" },
  { label: "Partners", href: "/partners" },
  { label: "Pricing", href: "/pricing" },
] as const;

const navLinkClass =
  "rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#081011]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <BrandMark className="mr-auto" />

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {primaryLinks.map((link) => (
            <Link key={link.href} href={link.href} className={navLinkClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/signin"
          className={`${navLinkClass} hidden whitespace-nowrap md:inline-flex`}
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          data-marketing-cta="header"
          className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-teal-300 px-3 text-sm font-semibold text-[#052b27] transition-colors hover:bg-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-4"
        >
          Start Free Audit
        </Link>

        <details className="marketing-menu relative shrink-0 lg:hidden">
          <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-white/15 text-white transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            <Menu className="size-4" aria-hidden="true" />
            <span className="sr-only">Open navigation menu</span>
          </summary>
          <nav
            aria-label="Mobile navigation"
            className="absolute right-0 top-12 w-72 rounded-lg border border-white/15 bg-[#0d1718] p-2 shadow-2xl shadow-black/40"
          >
            {primaryLinks.map((link) => (
              <Link key={link.href} href={link.href} className={`flex ${navLinkClass}`}>
                {link.label}
              </Link>
            ))}
            <div className="my-2 border-t border-white/10" />
            <Link href="/example-report" className={`flex ${navLinkClass}`}>
              Example Report
            </Link>
            <Link href="/help" className={`flex ${navLinkClass}`}>
              Help
            </Link>
            <Link href="/signin" className={`flex ${navLinkClass}`}>
              Sign In
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
