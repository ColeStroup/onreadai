"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-100">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">This workspace view did not load</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Try the request again or return to your dashboard. No account changes were made by this error.
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
