"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function BillingConfirmationRefresh({ pending }: { pending: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!pending) return;

    const timeout = window.setTimeout(() => router.refresh(), 3000);
    return () => window.clearTimeout(timeout);
  }, [pending, router]);

  return null;
}
