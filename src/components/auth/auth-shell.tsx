import { CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { brand } from "@/lib/brand";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

const productPoints = [
  "Evidence-backed business audits",
  "Prioritized actions and ready-to-use fixes",
  "Competitor insights grounded in public data",
] as const;

function AuthLogo() {
  return (
    <Link
      href="/"
      aria-label={`${brand.name} home`}
      className="inline-flex items-center gap-2.5 rounded-md text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
    >
      <span className="flex size-10 items-center justify-center rounded-lg border border-teal-200/30 bg-teal-300 text-[#062421]">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <span className="font-semibold">{brand.name}</span>
    </Link>
  );
}

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="marketing-shell min-h-dvh bg-[#071011] text-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.82fr)]">
      <section className="order-2 hidden min-h-dvh border-r border-white/10 bg-[#081313] px-8 py-8 lg:flex lg:flex-col xl:px-14 xl:py-10">
        <AuthLogo />
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-12">
          <p className="text-sm font-semibold text-teal-300">A clearer way forward</p>
          <h2 className="mt-3 max-w-lg text-4xl font-semibold leading-tight text-white xl:text-5xl">
            Move from uncertainty to clear action.
          </h2>
          <ul className="mt-8 space-y-4">
            {productPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-slate-300">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-teal-300"
                  aria-hidden="true"
                />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 max-w-md rounded-lg border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <span className="text-sm font-medium text-slate-200">Growth audit</span>
              <span className="rounded-full border border-teal-300/25 bg-teal-300/10 px-2.5 py-1 text-xs font-semibold text-teal-200">
                Evidence ready
              </span>
            </div>
            <div className="mt-4 grid grid-cols-[72px_1fr] items-center gap-4">
              <div className="flex size-[72px] items-center justify-center rounded-full border-[5px] border-teal-300 text-xl font-semibold text-white">
                74
              </div>
              <div>
                <p className="font-medium text-white">Your next moves, ranked</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  See the evidence, understand the priority, and start the work.
                </p>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400">Secure account access for your Onread workspace.</p>
      </section>

      <section className="order-1 flex min-h-dvh items-start justify-center px-4 py-5 sm:px-6 sm:py-8 lg:order-2 lg:items-center lg:px-10 lg:py-10">
        <div className="w-full max-w-[470px]">
          <div className="mb-7 lg:hidden">
            <AuthLogo />
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0d1718] p-5 shadow-2xl shadow-black/30 sm:p-7 lg:p-6 2xl:p-8">
            <header>
              <h1 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base">
                {description}
              </p>
            </header>
            <div className="mt-6">{children}</div>
            {footer ? (
              <div className="mt-5 border-t border-white/10 pt-5 text-center text-sm text-slate-400">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
