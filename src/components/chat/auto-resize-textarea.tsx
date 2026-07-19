"use client";

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  maxHeight?: number;
};

function resizeTextarea(element: HTMLTextAreaElement, maxHeight: number) {
  element.style.height = "auto";
  element.style.overflowY = "hidden";
  const minimumHeight =
    Number.parseFloat(window.getComputedStyle(element).minHeight) || 48;
  const measuredHeight = element.value ? element.scrollHeight : minimumHeight;
  const nextHeight = Math.min(
    Math.max(measuredHeight, minimumHeight),
    maxHeight,
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.value && element.scrollHeight > maxHeight ? "auto" : "hidden";
}

export const AutoResizeTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>(function AutoResizeTextarea(
  { className, maxHeight = 208, value, style, ...props },
  forwardedRef,
) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (internalRef.current) {
      resizeTextarea(internalRef.current, maxHeight);
    }
  }, [maxHeight, value]);

  return (
    <textarea
      ref={(element) => {
        internalRef.current = element;
        if (typeof forwardedRef === "function") {
          forwardedRef(element);
        } else if (forwardedRef) {
          forwardedRef.current = element;
        }
      }}
      rows={1}
      value={value}
      className={cn(
        "min-h-12 w-full resize-none rounded-lg border border-border bg-card px-3 py-3 text-sm leading-6 text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      style={{ ...style, overflowY: "hidden" }}
      {...props}
    />
  );
});
