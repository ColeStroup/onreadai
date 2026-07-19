import type { ReactNode } from "react";

import { MarketingShell } from "@/components/marketing/marketing-shell";

export function LegalPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <main>
        <header className="border-b border-white/10 bg-[#081213]">
          <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">{eyebrow}</p>
            <h1 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">{title}</h1>
            <p className="mt-5 text-base leading-7 text-slate-300">{description}</p>
            <p className="mt-4 text-xs text-slate-400">Last updated July 14, 2026</p>
          </div>
        </header>
        <div className="mx-auto w-full max-w-4xl space-y-10 px-6 py-14 text-sm leading-7 text-slate-400 lg:px-8">
          {children}
        </div>
      </main>
    </MarketingShell>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
