import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AuthNotice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const success = tone === "success";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-5",
        tone === "error" && "border-rose-300/20 bg-rose-400/10 text-rose-100",
        success && "border-teal-300/20 bg-teal-300/10 text-teal-100",
        tone === "info" && "border-white/10 bg-white/[0.04] text-slate-300",
      )}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <div>{children}</div>
    </div>
  );
}
