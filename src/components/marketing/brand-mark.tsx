import { Sparkles } from "lucide-react";
import Link from "next/link";

import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${brand.name} home`}
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 rounded-md font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300",
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-teal-300/30 bg-teal-300 text-[#062421]">
        <Sparkles className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm sm:text-base">
        <span className="hidden sm:inline">{brand.name}</span>
        <span className="hidden min-[430px]:inline sm:hidden">{brand.mobileName}</span>
      </span>
    </Link>
  );
}
