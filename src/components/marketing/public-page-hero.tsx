import type { LucideIcon } from "lucide-react";

export function PublicPageHero({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <header className="border-b border-white/10 bg-[#081213]">
      <div className="mx-auto w-full max-w-7xl px-6 py-16 sm:py-20 lg:px-8">
        <Icon className="size-7 text-teal-300" aria-hidden="true" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
          {description}
        </p>
      </div>
    </header>
  );
}

