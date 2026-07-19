"use client";

import {
  Bookmark,
  CheckCircle2,
  Copy,
  Pencil,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { ImplementationHelpDrawer } from "@/components/implementation/implementation-help-drawer";

type SocialPostActionsProps = {
  businessId: string;
  itemKey: string;
  initialText: string;
  aiPrompt: string;
  allowPosted?: boolean;
  implementation?: {
    businessName: string;
    strategyId: string;
    itemKind: "post" | "weekly";
    itemIndex: number;
    savedCount: number;
    title: string;
  };
};

type SavedState = {
  text: string;
  saved: boolean;
  posted: boolean;
};

export function SocialPostActions({
  businessId,
  itemKey,
  initialText,
  aiPrompt,
  allowPosted = false,
  implementation,
}: SocialPostActionsProps) {
  const storageKey = useMemo(
    () => `growth-consultant:social:${businessId}:${itemKey}`,
    [businessId, itemKey],
  );
  const [text, setText] = useState(initialText);
  const [isEditing, setIsEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [posted, setPosted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;

      try {
        const parsed = JSON.parse(stored) as SavedState;
        setText(parsed.text || initialText);
        setSaved(Boolean(parsed.saved));
        setPosted(Boolean(parsed.posted));
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [initialText, storageKey]);

  function persist(next: Partial<SavedState>) {
    const state = {
      text,
      saved,
      posted,
      ...next,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(state));
    setSaved(state.saved);
    setPosted(state.posted);
  }

  async function copyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="space-y-3">
      {isEditing ? (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`social-copy-${itemKey}`}>
            Edit post copy
          </label>
          <textarea
            id={`social-copy-${itemKey}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            className="w-full resize-y rounded-lg border border-border bg-card p-3 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <button
            type="button"
            onClick={() => {
              persist({ text, saved: true });
              setIsEditing(false);
            }}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Save edit
          </button>
        </div>
      ) : (
        <p className="whitespace-pre-line text-sm leading-6 text-muted">{text}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyText}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Copy className="size-4" />
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing((current) => !current)}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Pencil className="size-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => persist({ saved: !saved })}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Bookmark className="size-4" />
          {allowPosted
            ? saved
              ? "Planned"
              : "Mark planned"
            : saved
              ? "Saved"
              : "Save"}
        </button>
        {allowPosted ? (
          <button
            type="button"
            onClick={() => persist({ posted: !posted })}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <CheckCircle2 className="size-4" />
            {posted ? "Posted" : "Mark posted"}
          </button>
        ) : null}
        <Link
          href={`/dashboard/businesses/${businessId}/chat?prompt=${encodeURIComponent(aiPrompt)}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Sparkles className="size-4" />
          Refine
        </Link>
        {implementation ? (
          <ImplementationHelpDrawer
            businessId={businessId}
            businessName={implementation.businessName}
            source={{
              kind: "social",
              strategyId: implementation.strategyId,
              itemKind: implementation.itemKind,
              itemIndex: implementation.itemIndex,
            }}
            recommendationTitle={implementation.title}
            initialSavedCount={implementation.savedCount}
            label="Create Draft"
          />
        ) : null}
      </div>
    </div>
  );
}
