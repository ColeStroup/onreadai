"use client";

import { useEffect } from "react";

import type {
  CustomerEventName,
  CustomerEventSurface,
} from "@/lib/analytics/customer-events";

export function CustomerEventImpression({
  eventName,
  surface,
}: {
  eventName: CustomerEventName;
  surface: CustomerEventSurface;
}) {
  useEffect(() => {
    void fetch("/api/analytics/customer-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventName, surface }),
      keepalive: true,
    });
  }, [eventName, surface]);

  return null;
}
