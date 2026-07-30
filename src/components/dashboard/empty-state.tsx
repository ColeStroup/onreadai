import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <Card
      className={
        compact
          ? "flex flex-col items-start p-5 text-left"
          : "flex min-h-[220px] flex-col items-center justify-center p-7 text-center"
      }
    >
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-foreground/5 text-accent">
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}
