"use client";

import { useEffect } from "react";

import {
  isCustomerEventName,
  isCustomerEventSurface,
} from "@/lib/analytics/customer-events";

export function CustomerEventBoundary() {
  useEffect(() => {
    function recordEvent(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const element = target.closest<HTMLElement>("[data-customer-event]");
      if (!element) return;

      const eventName = element.dataset.customerEvent;
      const surface = element.dataset.customerSurface;
      if (!isCustomerEventName(eventName) || !isCustomerEventSurface(surface)) {
        return;
      }

      const body = JSON.stringify({ eventName, surface });
      if (
        navigator.sendBeacon?.(
          "/api/analytics/customer-event",
          new Blob([body], { type: "application/json" }),
        )
      ) {
        return;
      }

      void fetch("/api/analytics/customer-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      });
    }

    document.addEventListener("click", recordEvent, true);
    return () => document.removeEventListener("click", recordEvent, true);
  }, []);

  return null;
}
