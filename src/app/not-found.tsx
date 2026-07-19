import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <section className="w-full max-w-lg text-center">
        <p className="text-sm font-semibold text-accent">404</p>
        <h1 className="mt-3 text-4xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          This page may have moved, expired, or may not be available to this account.
        </p>
        <Link href="/" className={buttonVariants({ variant: "primary", className: "mt-6" })}>
          Return home
        </Link>
      </section>
    </main>
  );
}
