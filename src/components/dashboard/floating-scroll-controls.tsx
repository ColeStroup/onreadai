"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type FloatingScrollControlsProps = {
  topTargetId?: string;
  bottomTargetId?: string;
  scrollContainerId?: string;
  className?: string;
};

type ScrollState = {
  canScroll: boolean;
  nearTop: boolean;
  nearBottom: boolean;
};

const edgeThreshold = 180;

export function FloatingScrollControls({
  topTargetId,
  bottomTargetId,
  scrollContainerId,
  className,
}: FloatingScrollControlsProps) {
  const [scrollState, setScrollState] = useState<ScrollState>({
    canScroll: false,
    nearTop: true,
    nearBottom: true,
  });

  useEffect(() => {
    const scrollContainer = scrollContainerId
      ? document.getElementById(scrollContainerId)
      : null;

    function updateScrollState() {
      if (scrollContainer) {
        const canScroll =
          scrollContainer.scrollHeight >
          scrollContainer.clientHeight + edgeThreshold;

        setScrollState({
          canScroll,
          nearTop: scrollContainer.scrollTop < edgeThreshold,
          nearBottom:
            scrollContainer.scrollTop + scrollContainer.clientHeight >
            scrollContainer.scrollHeight - edgeThreshold,
        });
        return;
      }

      const documentElement = document.documentElement;
      const scrollTop = window.scrollY || documentElement.scrollTop;
      const scrollHeight = documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const canScroll = scrollHeight > viewportHeight + edgeThreshold;

      setScrollState({
        canScroll,
        nearTop: scrollTop < edgeThreshold,
        nearBottom: scrollTop + viewportHeight > scrollHeight - edgeThreshold,
      });
    }

    updateScrollState();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateScrollState)
        : null;

    resizeObserver?.observe(scrollContainer ?? document.body);
    const mutationObserver = scrollContainer
      ? new MutationObserver(updateScrollState)
      : null;
    if (mutationObserver && scrollContainer) {
      mutationObserver.observe(scrollContainer, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    const scrollTarget = scrollContainer ?? window;
    scrollTarget.addEventListener("scroll", updateScrollState, {
      passive: true,
    });
    window.addEventListener("resize", updateScrollState);

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      scrollTarget.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [scrollContainerId]);

  if (!scrollState.canScroll) {
    return null;
  }

  const showUp = !scrollState.nearTop;
  const showDown = !scrollState.nearBottom;

  if (!showUp && !showDown) {
    return null;
  }

  function scrollToTop() {
    const scrollContainer = scrollContainerId
      ? document.getElementById(scrollContainerId)
      : null;

    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = topTargetId ? document.getElementById(topTargetId) : null;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollToBottom() {
    const scrollContainer = scrollContainerId
      ? document.getElementById(scrollContainerId)
      : null;

    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
      return;
    }

    const target = bottomTargetId
      ? document.getElementById(bottomTargetId)
      : null;

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
  }

  return (
    <div
      className={cn(
        "fixed bottom-24 right-4 z-40 flex flex-col gap-2 sm:right-5",
        className,
      )}
    >
      {showUp ? (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label={
            scrollContainerId
              ? "Scroll conversation to oldest message"
              : "Scroll to top"
          }
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowUp className="size-4" />
        </button>
      ) : null}
      {showDown ? (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={
            scrollContainerId
              ? "Scroll conversation to newest message"
              : "Scroll to bottom"
          }
          className="flex size-11 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ArrowDown className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
