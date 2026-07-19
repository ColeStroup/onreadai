"use client";

import type { ScoreCategory } from "@prisma/client";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useId, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { recommendationWhy } from "@/lib/education/help-content";
import { cn } from "@/lib/utils";

type RecommendationLearnWhyProps = {
  category: ScoreCategory;
};

export function RecommendationLearnWhy({
  category,
}: RecommendationLearnWhyProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "w-fit px-0",
        )}
      >
        <HelpCircle className="size-4" />
        Learn why
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <p
          id={contentId}
          className="mt-2 rounded-lg border border-border bg-card p-3 text-sm leading-6 text-muted"
        >
          {recommendationWhy[category]}
        </p>
      ) : null}
    </div>
  );
}
