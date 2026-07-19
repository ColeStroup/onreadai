"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-accent">Onread AI</p>
        <h1 className="mt-3 text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          We could not load this page. Your saved work has not been changed.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={() => unstable_retry()}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
