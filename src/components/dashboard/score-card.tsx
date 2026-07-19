import { ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ScoreCardProps = {
  label: string;
  score: number;
  detail: string;
  tone: "teal" | "amber" | "blue" | "rose" | "zinc";
};

const tones: Record<ScoreCardProps["tone"], string> = {
  teal: "bg-teal-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  rose: "bg-rose-500",
  zinc: "bg-zinc-500",
};

export function ScoreCard({ label, score, detail, tone }: ScoreCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-semibold leading-none">{score}</span>
            <span className="pb-1 text-sm text-muted">/100</span>
          </div>
        </div>
        <span className="flex size-9 items-center justify-center rounded-lg bg-foreground/5 text-muted">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
      <div className="mt-5 h-2 rounded-full bg-foreground/10">
        <div
          className={cn("h-2 rounded-full", tones[tone])}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted">{detail}</p>
    </Card>
  );
}
