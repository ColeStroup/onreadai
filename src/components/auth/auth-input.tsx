import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function AuthInput({ className, invalid, ...props }: AuthInputProps) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-lg border bg-[#091213] px-3 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:ring-2",
        invalid
          ? "border-rose-400/60 focus:border-rose-300 focus:ring-rose-400/20"
          : "border-white/15 focus:border-teal-300 focus:ring-teal-300/20",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
