"use client";

import {
  ImplementationDraftStatus,
  RecommendationStatus,
} from "@prisma/client";
import {
  Archive,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  generateImplementationHelpAction,
  getImplementationDraftsAction,
  updateImplementationDraftStatusAction,
  type ImplementationDraftView,
} from "@/app/dashboard/businesses/[businessId]/implementation/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ImplementationSourceInput } from "@/lib/ai/implementation-context";
import { updateRecommendationStatus } from "@/lib/recommendations/actions";
import { cn } from "@/lib/utils";

type ImplementationHelpDrawerProps = {
  businessId: string;
  businessName: string;
  source: ImplementationSourceInput;
  recommendationTitle: string;
  evidence?: string | null;
  recommendationId?: string | null;
  initialSavedCount?: number;
  label?: string;
  compact?: boolean;
  triggerClassName?: string;
};

export function ImplementationHelpDrawer({
  businessId,
  businessName,
  source,
  recommendationTitle,
  evidence,
  recommendationId,
  initialSavedCount = 0,
  label = "Generate Fix",
  compact = true,
  triggerClassName,
}: ImplementationHelpDrawerProps) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [drafts, setDrafts] = useState<ImplementationDraftView[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [copied, setCopied] = useState("");
  const [taskCompleted, setTaskCompleted] = useState(false);
  const sourceKey = useMemo(() => JSON.stringify(source), [source]);
  const activeDraft =
    drafts.find((draft) => draft.id === activeDraftId) ?? drafts.at(0) ?? null;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    const timeout = window.setTimeout(() => closeRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(timeout);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  async function openDrawer() {
    if (loading) return;
    setOpen(true);
    setError("");
    setLimitReached(false);
    setLoading(true);

    let result;
    try {
      result = await getImplementationDraftsAction({
        businessId,
        source: JSON.parse(sourceKey) as ImplementationSourceInput,
      });
    } catch {
      setError("Could not load implementation drafts. Please retry.");
      setLoading(false);
      return;
    }

    if (!result.ok) {
      setError(result.error ?? "Could not load implementation drafts.");
      setLoading(false);
      return;
    }

    setUsage(result.usage ?? null);
    const existing = result.drafts ?? [];
    setDrafts(existing);

    if (existing.length > 0) {
      setActiveDraftId(existing[0].id);
      setLoading(false);
      return;
    }

    await createDraft();
  }

  async function createDraft() {
    if (generationRef.current) return;
    generationRef.current = true;
    setLoading(true);
    setError("");
    setLimitReached(false);

    try {
      const result = await generateImplementationHelpAction({
        businessId,
        source: JSON.parse(sourceKey) as ImplementationSourceInput,
      });

      if (!result.ok || !result.draft) {
        setError(result.error ?? "Implementation generation failed.");
        setLimitReached(Boolean(result.limitReached));
        setUsage(result.usage ?? null);
        return;
      }

      setDrafts((current) => [result.draft!, ...current]);
      setActiveDraftId(result.draft.id);
      setUsage(result.usage ?? null);
      router.refresh();
    } catch {
      setError("Implementation generation failed. Please retry.");
    } finally {
      generationRef.current = false;
      setLoading(false);
    }
  }

  async function updateStatus(status: "SAVED" | "APPLIED" | "ARCHIVED") {
    if (!activeDraft || loading) return;
    setLoading(true);
    setError("");
    const result = await updateImplementationDraftStatusAction({
      businessId,
      draftId: activeDraft.id,
      status,
    });

    if (!result.ok || !result.draft) {
      setError(result.error ?? "Could not update this draft.");
      setLoading(false);
      return;
    }

    if (status === "ARCHIVED") {
      const remaining = drafts.filter((draft) => draft.id !== activeDraft.id);
      setDrafts(remaining);
      setActiveDraftId(remaining.at(0)?.id ?? "");
      if (remaining.length === 0) setOpen(false);
    } else {
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === result.draft!.id ? result.draft! : draft,
        ),
      );
    }
    setLoading(false);
    router.refresh();
  }

  async function markTaskComplete() {
    if (!recommendationId || loading) return;
    setLoading(true);
    const result = await updateRecommendationStatus({
      businessId,
      recommendationId,
      status: RecommendationStatus.COMPLETED,
    });
    if (!result.ok) {
      setError(result.error ?? "Could not complete this task.");
    } else {
      setTaskCompleted(true);
      router.refresh();
    }
    setLoading(false);
  }

  async function copyText(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1400);
  }

  function closeDrawer() {
    if (!loading) setOpen(false);
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const refinePrompt = activeDraft
    ? buildRefinePrompt(businessName, recommendationTitle, activeDraft)
    : "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDrawer}
        className={buttonVariants({
          variant: "secondary",
          size: compact ? "sm" : "md",
          className: triggerClassName,
        })}
      >
        <Sparkles className="size-4" />
        {initialSavedCount > 0 ? "View Draft" : label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80]" aria-hidden={false}>
          <button
            type="button"
            aria-label="Close implementation help"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="implementation-help-title"
            onKeyDown={handlePanelKeyDown}
            className="absolute inset-0 flex flex-col overflow-hidden bg-card shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[min(720px,92vw)] sm:border-l sm:border-border"
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                    Implementation Help
                  </span>
                  {activeDraft ? (
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted">
                      {activeDraft.source === "ai_generated" ? "AI generated" : "Template fallback"}
                    </span>
                  ) : null}
                </div>
                <h2 id="implementation-help-title" className="mt-2 text-xl font-semibold">
                  {activeDraft?.title ?? recommendationTitle}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted">{recommendationTitle}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeDrawer}
                disabled={loading}
                aria-label="Close Implementation Help"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {loading && !activeDraft ? (
                <div className="flex min-h-72 flex-col items-center justify-center text-center" role="status" aria-live="polite">
                  <Loader2 className="size-7 animate-spin text-accent" />
                  <p className="mt-4 font-semibold">Creating a business-specific implementation draft...</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                    We are combining the recommendation with current Business Context and relevant audit evidence.
                  </p>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100" role="alert">
                  <p className="font-semibold">Draft not available</p>
                  <p className="mt-1 leading-6">{error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!limitReached ? (
                      <Button type="button" variant="secondary" size="sm" onClick={createDraft} disabled={loading}>
                        <RefreshCw className="size-4" />
                        Retry
                      </Button>
                    ) : (
                      <Link href="/pricing" className={buttonVariants({ variant: "primary", size: "sm" })}>
                        View plans
                        <ExternalLink className="size-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ) : null}

              {activeDraft ? (
                <div className="space-y-6">
                  {drafts.length > 1 ? (
                    <div>
                      <label htmlFor="implementation-version" className="text-xs font-semibold uppercase text-muted">
                        Saved versions
                      </label>
                      <select
                        id="implementation-version"
                        value={activeDraft.id}
                        onChange={(event) => setActiveDraftId(event.target.value)}
                        className="mt-2 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                      >
                        {drafts.map((draft, index) => (
                          <option key={draft.id} value={draft.id}>
                            Version {drafts.length - index} · {new Date(draft.createdAt).toLocaleString()} · {draft.status.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <Section title="Why this matters">
                    <p className="text-sm leading-6 text-muted">{activeDraft.content.whyItMatters}</p>
                    {evidence ? (
                      <p className="mt-3 rounded-lg bg-foreground/[0.035] p-3 text-xs leading-5 text-muted">
                        Evidence: {evidence}
                      </p>
                    ) : null}
                  </Section>

                  <Section title="Generated fix">
                    <p className="mb-4 text-sm leading-6 text-muted">{activeDraft.content.summary}</p>
                    <div className="space-y-3">
                      {activeDraft.content.options.map((option, optionIndex) => (
                        <article
                          key={`${option.label}-${optionIndex}`}
                          className={cn(
                            "rounded-lg border bg-background p-4",
                            optionIndex === activeDraft.content.recommendedOption
                              ? "border-accent"
                              : "border-border",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{option.label}</h4>
                              {optionIndex === activeDraft.content.recommendedOption ? (
                                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">Recommended</span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => copyText(optionText(option), `option-${optionIndex}`)}
                              aria-label={`Copy ${option.label}`}
                              className="flex size-9 items-center justify-center rounded-full border border-border text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                              {copied === `option-${optionIndex}` ? <Check className="size-4" /> : <Copy className="size-4" />}
                            </button>
                          </div>
                          <dl className="mt-4 space-y-3">
                            {option.fields.map((field) => (
                              <div key={`${field.label}-${field.value}`}>
                                <dt className="text-xs font-semibold uppercase text-muted">{field.label}</dt>
                                <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 select-text">{field.value}</dd>
                                {field.meta ? <p className="mt-1 text-xs text-muted">{field.meta}</p> : null}
                              </div>
                            ))}
                          </dl>
                          {option.rationale ? <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted">Why it fits: {option.rationale}</p> : null}
                        </article>
                      ))}
                    </div>
                  </Section>

                  <ListSection title="Where to use it" items={activeDraft.content.placementGuidance} />
                  <ListSection title="Implementation steps" items={activeDraft.content.implementationSteps} ordered />
                  <ListSection title="How to verify completion" items={activeDraft.content.validationChecklist} />

                  {activeDraft.content.assumptions.length || activeDraft.content.limitations.length ? (
                    <Section title="Review notes">
                      <ul className="space-y-2 text-sm leading-6 text-muted">
                        {[...activeDraft.content.assumptions, ...activeDraft.content.limitations].map((item) => (
                          <li key={item} className="flex gap-2">
                            <span aria-hidden="true">-</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="shrink-0 border-t border-border bg-card px-5 py-4 sm:px-6">
              {usage ? (
                <p className="mb-3 text-xs text-muted">
                  {usage.used} of {usage.limit} implementation generations used
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {activeDraft ? (
                  <>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={loading || activeDraft.status === ImplementationDraftStatus.SAVED}
                      onClick={() => updateStatus("SAVED")}
                    >
                      <Bookmark className="size-4" />
                      {activeDraft.status === ImplementationDraftStatus.SAVED ? "Saved" : "Save Draft"}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => copyText(draftText(activeDraft), "all")}>
                      {copied === "all" ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied === "all" ? "Copied" : "Copy All"}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={createDraft}>
                      {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      Regenerate
                    </Button>
                    <Link
                      href={`/dashboard/businesses/${businessId}/chat?prompt=${encodeURIComponent(refinePrompt)}`}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      <Sparkles className="size-4" />
                      Refine in Consultant
                    </Link>
                    {recommendationId ? (
                      <Button type="button" variant="secondary" size="sm" disabled={loading || taskCompleted} onClick={markTaskComplete}>
                        <CheckCircle2 className="size-4" />
                        {taskCompleted ? "Task complete" : "Mark Task Complete"}
                      </Button>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => updateStatus("ARCHIVED")}>
                      <Archive className="size-4" />
                      Archive
                    </Button>
                  </>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ListSection({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  if (!items.length) return null;
  const Tag = ordered ? "ol" : "ul";

  return (
    <Section title={title}>
      <Tag className="space-y-2 text-sm leading-6 text-muted">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-xs font-semibold text-foreground">
              {ordered ? index + 1 : <Check className="size-3" />}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </Tag>
    </Section>
  );
}

function optionText(option: ImplementationDraftView["content"]["options"][number]) {
  return option.fields.map((field) => `${field.label}: ${field.value}`).join("\n\n");
}

function draftText(draft: ImplementationDraftView) {
  return [
    draft.title,
    draft.content.summary,
    ...draft.content.options.map(optionText),
    "Implementation steps:",
    ...draft.content.implementationSteps.map((item, index) => `${index + 1}. ${item}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildRefinePrompt(
  businessName: string,
  recommendationTitle: string,
  draft: ImplementationDraftView,
) {
  const option =
    draft.content.options[draft.content.recommendedOption] ??
    draft.content.options.at(0);
  const preferred = option ? optionText(option) : draft.content.summary;

  return `Help me refine this implementation draft for ${businessName}.\n\nRecommendation: ${recommendationTitle}\n\nCurrent draft:\n${preferred}\n\nGive me improved options and explain which one best matches the saved target audience.`.slice(
    0,
    600,
  );
}
