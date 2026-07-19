"use client";

import { CreditCard, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/portal", { method: "POST" });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Billing management is unavailable.");
      }

      window.location.assign(result.url);
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Billing management is unavailable.",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => void openPortal()} disabled={loading}>
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
        {loading ? "Opening portal..." : "Manage billing"}
      </Button>
      {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300" role="alert">{error}</p> : null}
    </div>
  );
}
