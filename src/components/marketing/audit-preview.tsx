import {
  ArrowUpRight,
  Check,
  FilePenLine,
  SearchCheck,
  Target,
} from "lucide-react";

const scores = [
  ["Website", 75, "Needs focus"],
  ["SEO", 68, "Needs focus"],
] as const;

export function AuditPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label="Fictional example audit for Harbor and Pine"
      className="marketing-preview relative w-full rounded-lg border border-white/15 bg-[#101b1c] p-3 shadow-2xl shadow-black/40 sm:p-4"
    >
      <div className="rounded-lg border border-white/10 bg-[#0a1314]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-300">
              Example Website Growth Score
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              Harbor &amp; Pine
            </p>
          </div>
          <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-full border-[5px] border-teal-300 border-r-slate-700 text-center">
            <span className="text-lg font-semibold leading-none text-white">
              75
            </span>
            <span className="mt-0.5 text-[8px] text-slate-400">/100</span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-white/10">
          {scores.map(([label, score, status], index) => (
            <div
              key={label}
              className={`p-3 ${index % 2 === 0 ? "border-r border-white/10" : ""} ${index < 2 ? "border-b border-white/10" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{label}</span>
                <span className="text-xs font-semibold text-white">
                  {score}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-teal-300"
                  style={{ width: `${score}%` }}
                />
              </div>
              {!compact ? (
                <p className="mt-1.5 text-[10px] text-slate-400">{status}</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid gap-px bg-white/10 sm:grid-cols-3">
          <div className="bg-[#0d1718] p-3.5">
            <Target className="size-4 text-amber-300" aria-hidden="true" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Top opportunity
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-200">
              Clarify the homepage offer and primary visitor action.
            </p>
          </div>
          <div className="bg-[#0d1718] p-3.5">
            <SearchCheck className="size-4 text-sky-300" aria-hidden="true" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              SEO evidence
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-200">
              Three scanned pages are missing meta descriptions.
            </p>
          </div>
          <div className="bg-[#0d1718] p-3.5">
            <FilePenLine className="size-4 text-teal-300" aria-hidden="true" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Generated fix
            </p>
            <p className="mt-1.5 text-xs leading-5 text-slate-200">
              Three homepage headline options are ready to review.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <Check className="size-3.5 text-teal-300" aria-hidden="true" />
            Fictional data, shown as a product example
          </span>
          <span className="inline-flex items-center gap-1 text-teal-200">
            Prioritized action plan
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}
