"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BillingProductKey } from "@/lib/billing/catalog";
import { cn } from "@/lib/utils";

type StripeCheckoutButtonProps = {
  productKey: BillingProductKey;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  autoStart?: boolean;
};

export function StripeCheckoutButton({
  productKey,
  children,
  className,
  disabled = false,
  autoStart = false,
}: StripeCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function startCheckout() {
    if (disabled || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productKey }),
      });
      const result = (await response.json()) as {
        url?: string;
        error?: string;
        code?: string;
      };

      if (response.status === 401) {
        const callbackUrl = `${window.location.pathname}?checkout=${encodeURIComponent(productKey)}`;
        window.location.assign(
          `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
        return;
      }

      if (!response.ok || !result.url) {
        throw new Error(result.error ?? "Checkout could not be started.");
      }

      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Checkout could not be started.",
      );
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoStart || disabled || started.current) return;
    started.current = true;
    void startCheckout();
  });

  return (
    <div className="mt-7">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => void startCheckout()}
        className={cn(className, "mt-0 w-full disabled:cursor-not-allowed disabled:opacity-55")}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {loading ? "Opening secure checkout..." : children}
      </button>
      {error ? (
        <p className="mt-2 text-xs leading-5 text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
