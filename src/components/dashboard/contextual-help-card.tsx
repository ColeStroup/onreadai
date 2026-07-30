import { CircleHelp, ChevronDown } from "lucide-react";

type ContextualHelpCardProps = {
  title: string;
  description: string;
};

export function ContextualHelpCard({
  title,
  description,
}: ContextualHelpCardProps) {
  return (
    <details className="group w-fit max-w-full">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent">
        <CircleHelp className="size-4 text-accent" aria-hidden="true" />
        How this works
        <ChevronDown
          className="size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 max-w-3xl rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
    </details>
  );
}
