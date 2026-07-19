"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

type PasswordInputProps = {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  describedBy?: string;
  invalid?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function PasswordInput({
  id,
  name,
  autoComplete,
  placeholder,
  required,
  minLength,
  describedBy,
  invalid,
  inputRef,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-11 w-full rounded-lg border bg-[#091213] px-3 pr-11 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:ring-2",
          invalid
            ? "border-rose-400/60 focus:border-rose-300 focus:ring-rose-400/20"
            : "border-white/15 focus:border-teal-300 focus:ring-teal-300/20",
        )}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-md text-slate-400 outline-none transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-teal-300"
        aria-label={visible ? "Hide password" : "Show password"}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
