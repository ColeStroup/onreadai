import Link from "next/link";

import { BrandMark } from "@/components/marketing/brand-mark";
import { brand } from "@/lib/brand";

const footerGroups = [
  {
    title: "Product",
    links: [
      ["How It Works", "/#how-it-works"],
      ["Features", "/#product"],
      ["Pricing", "/pricing"],
      ["Example Report", "/example-report"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help", "/help"],
      ["FAQ", "/#faq"],
      ["Methodology", "/methodology"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
  {
    title: "Company",
    links: [
      ["For Consultants", "/for-consultants"],
      ["Partner Program", "/partners"],
      ["Contact", "/help#contact"],
      ["Sign In", "/signin"],
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#070d0e]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-12 lg:grid-cols-[1.35fr_2fr] lg:px-8">
        <div>
          <BrandMark />
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-400">
            Evidence-backed website and SEO audits, prioritized improvements,
            implementation help, and progress you can verify.
          </p>
          <p className="mt-4 max-w-lg text-xs leading-5 text-slate-400">
            Public and user-confirmed evidence has limits. The platform does not
            claim private traffic, revenue, customer behavior, or guaranteed
            business outcomes.
          </p>
        </div>

        <nav
          aria-label="Footer navigation"
          className="grid gap-8 sm:grid-cols-3"
        >
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h2 className="text-sm font-semibold text-white">
                {group.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {group.links.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="rounded-sm text-sm text-slate-400 transition-colors hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>
            © {new Date().getFullYear()} {brand.name}.
          </p>
          <p>Analysis supports decisions; it does not guarantee outcomes.</p>
        </div>
      </div>
    </footer>
  );
}
