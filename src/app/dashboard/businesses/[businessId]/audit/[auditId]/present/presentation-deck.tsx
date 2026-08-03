"use client";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpenText,
  CheckCircle2,
  Download,
  Expand,
  Globe2,
  MessageSquareText,
  Minimize2,
  Search,
  Share2,
  Sparkles,
  Star,
  Swords,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";

import styles from "@/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-deck.module.css";
import {
  PresentationSlide,
  ResultBadge,
  SlideActionCard,
  SlideBulletList,
  SlideComparisonTable,
  SlideInsightCard,
  SlideMetric,
  SlideMetricGrid,
  SlideStatusGrid,
} from "@/app/dashboard/businesses/[businessId]/audit/[auditId]/present/presentation-primitives";
import { buttonVariants } from "@/components/ui/button";
import type { PresentationDeckData } from "@/lib/reports/presentation-types";
import { cn } from "@/lib/utils";

type DeckSlide = {
  id: string;
  title: string;
  content: React.ReactNode;
};

function BigScore({
  score,
  label = "Website Growth Score",
  compact = false,
}: {
  score: number;
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        compact ? "size-28 sm:size-32" : "size-36 sm:size-44",
      )}
      style={{
        background: `conic-gradient(var(--accent) ${score * 3.6}deg, color-mix(in srgb, var(--border) 78%, transparent) 0deg)`,
      }}
      role="img"
      aria-label={`${label}: ${score} out of 100`}
    >
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-full bg-background shadow-sm",
          compact ? "size-20 sm:size-24" : "size-28 sm:size-32",
        )}
      >
        <span
          className={cn(
            "font-semibold tracking-normal",
            compact ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl",
          )}
        >
          {score}
        </span>
        <span className="text-[0.65rem] font-medium text-muted sm:text-xs">
          /100
        </span>
      </div>
    </div>
  );
}

export function PresentationDeck({ data }: { data: PresentationDeckData }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenUnavailable, setFullscreenUnavailable] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const overviewHref = `/dashboard/businesses/${data.businessId}/overview`;
  const chatHref = `/dashboard/businesses/${data.businessId}/chat`;
  const actionPlanHref = `/dashboard/businesses/${data.businessId}/action-plan`;
  const pdfHref = `/dashboard/businesses/${data.businessId}/audit/${data.auditId}/pdf`;

  const slides = useMemo<DeckSlide[]>(() => {
    const result: DeckSlide[] = [
      {
        id: "cover",
        title: "Cover",
        content: (
          <PresentationSlide
            slideId="cover"
            eyebrow={
              data.productScope === "website_seo"
                ? "Website & SEO Growth Report"
                : "Growth Audit Report"
            }
            title={data.businessName}
            icon={Sparkles}
            density="spacious"
          >
            <div className="grid h-full min-h-0 items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-10">
              <div className="min-w-0 self-center">
                <p className="max-w-3xl text-lg font-medium leading-snug sm:text-2xl lg:text-3xl">
                  {data.productScope === "website_seo"
                    ? "See what is helping or hurting visibility and conversions, what to fix first, and how to verify progress."
                    : "A focused view of what is working, what needs attention, and what to implement next."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs sm:mt-6 sm:text-sm">
                  <span className="rounded-full border border-border bg-card px-3 py-1.5 font-medium">
                    {data.auditDate}
                  </span>
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 font-medium text-accent">
                    Completed audit
                  </span>
                  <span className="rounded-full border border-border bg-card px-3 py-1.5 font-medium">
                    {data.healthLabel}
                  </span>
                </div>
              </div>
              <div className="flex justify-center sm:justify-end">
                <BigScore score={data.overallScore} label={data.scoreLabel} />
              </div>
            </div>
          </PresentationSlide>
        ),
      },
      {
        id: "summary",
        title: "What matters most",
        content: (
          <PresentationSlide
            slideId="summary"
            eyebrow="Executive Summary"
            title="What matters most"
            icon={Target}
            footerNote={data.summary.progressNote}
          >
            <div className="grid h-full min-h-0 gap-2 sm:gap-3 lg:grid-cols-3">
              <SlideInsightCard title="What is working" tone="positive">
                <SlideBulletList items={data.summary.working} tone="positive" />
              </SlideInsightCard>
              <SlideInsightCard title="What needs attention" tone="warning">
                <SlideBulletList
                  items={data.summary.attention}
                  tone="warning"
                  compact
                />
              </SlideInsightCard>
              <SlideInsightCard title="Start here">
                <SlideBulletList items={data.summary.startHere} />
              </SlideInsightCard>
            </div>
          </PresentationSlide>
        ),
      },
      {
        id: "business-context",
        title: "Business Context",
        content: (
          <PresentationSlide
            slideId="business-context"
            eyebrow="Business Context"
            title="The strategy foundation"
            icon={BookOpenText}
            footerNote={data.businessContext.conflictNote}
            density="compact"
          >
            {data.businessContext.available ? (
              <dl className="grid h-full min-h-0 grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
                <ContextItem
                  label="What the business does"
                  value={data.businessContext.description}
                  className="col-span-2"
                />
                <ContextItem
                  label="Target audience"
                  value={data.businessContext.targetAudience}
                />
                <ContextItem
                  label="Main offer"
                  value={data.businessContext.mainOffer}
                />
                <ContextItem
                  label="Observed conversion goal"
                  value={data.businessContext.conversionGoal}
                />
                <ContextItem
                  label="Brand tone"
                  value={data.businessContext.brandTone}
                />
              </dl>
            ) : (
              <EmptySlideState
                title="Business Context needs review"
                description="Confirm what the business does, who it serves, its main offer, conversion goal, and brand tone before relying on detailed strategy."
              />
            )}
          </PresentationSlide>
        ),
      },
      {
        id: "score-breakdown",
        title: "Score Breakdown",
        content: (
          <PresentationSlide
            slideId="score-breakdown"
            eyebrow={data.scoreLabel}
            title={
              data.legacyScoring
                ? "Score breakdown"
                : "Website health breakdown"
            }
            icon={BarChart3}
            footerNote={
              data.assessmentMode === "social_first"
                ? "Website and SEO were not provided, so unavailable categories were excluded from the weighted score."
                : null
            }
          >
            <div className="grid h-full min-h-0 content-center items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-7">
              <div className="flex items-center justify-center sm:block">
                <BigScore
                  score={data.overallScore}
                  label={data.scoreLabel}
                  compact
                />
              </div>
              <SlideMetricGrid columns={3} className="content-center">
                {data.scores.map((score) => (
                  <SlideMetric
                    key={score.label}
                    label={score.label}
                    value={score.displayValue}
                    tone={
                      score.score === null
                        ? "neutral"
                        : score.score >= 80
                          ? "positive"
                          : score.score < 70
                            ? "warning"
                            : "neutral"
                    }
                  />
                ))}
              </SlideMetricGrid>
            </div>
          </PresentationSlide>
        ),
      },
      {
        id: "website",
        title: "Website and Conversion",
        content: (
          <PresentationSlide
            slideId="website"
            eyebrow="Website Analysis"
            title="Website and conversion"
            icon={Globe2}
            footerNote={
              data.website.available ? data.website.assessmentNote : null
            }
            density="compact"
          >
            {!data.website.available ? (
              <EmptySlideState
                title="Website not provided"
                description={data.website.assessmentNote}
              />
            ) : (
              <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 sm:gap-3">
                <SlideMetricGrid columns={2}>
                  <SlideMetric
                    label="Website score"
                    value={`${data.website.score}/100`}
                  />
                  <SlideMetric
                    label="Pages scanned"
                    value={data.website.pagesScanned}
                  />
                  <SlideMetric
                    label="Homepage H1"
                    value={data.website.h1Status}
                    tone="warning"
                  />
                  <SlideMetric
                    label="Primary CTA clarity"
                    value={data.website.primaryCtaClarity}
                    tone={
                      data.website.primaryCtaClarity === "Clear"
                        ? "positive"
                        : "warning"
                    }
                  />
                </SlideMetricGrid>
                <div className="grid min-h-0 gap-2 sm:grid-cols-2 sm:gap-3">
                  <ChipPanel
                    label="Detected action links"
                    items={data.website.detectedActionTypes}
                    empty="No action links detected"
                  />
                  <ChipPanel
                    label="Important pages found"
                    items={data.website.importantPagesFound}
                    empty="No important page types detected"
                  />
                </div>
                <div className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-sm font-medium sm:px-4 sm:py-3 sm:text-base">
                  Key action: {data.website.keyAction}
                </div>
              </div>
            )}
          </PresentationSlide>
        ),
      },
      {
        id: "seo",
        title: "SEO",
        content: (
          <PresentationSlide
            slideId="seo"
            eyebrow="SEO Analysis"
            title="Search readiness"
            icon={Search}
            density="compact"
          >
            {!data.seo.available || data.seo.score === null ? (
              <EmptySlideState
                title="SEO not applicable yet"
                description={
                  data.seo.recommendedFixes.at(0) ??
                  "Add a website to unlock SEO analysis."
                }
              />
            ) : (
              <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 sm:gap-3">
                <div className="flex items-center gap-4">
                  <BigScore score={data.seo.score} label="SEO score" compact />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted">SEO score</p>
                    <p className="text-xl font-semibold sm:text-2xl">
                      {data.seo.warningCount} checks need attention
                    </p>
                  </div>
                </div>
                <SlideStatusGrid statuses={data.seo.checks} />
                <SlideInsightCard title="Highest-value fixes" tone="warning">
                  <SlideBulletList
                    items={data.seo.recommendedFixes}
                    tone="warning"
                    compact
                  />
                </SlideInsightCard>
              </div>
            )}
          </PresentationSlide>
        ),
      },
      {
        id: "reviews",
        title: "Reviews and Trust",
        content: (
          <PresentationSlide
            slideId="reviews"
            eyebrow="Reviews and Trust"
            title="Credibility at a glance"
            icon={Star}
            footerNote={data.reviews.sourceLabel}
            density="compact"
          >
            <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 sm:gap-3">
              <SlideMetricGrid columns={2} className="lg:grid-cols-4">
                <SlideMetric
                  label={data.reviews.scoreLabel}
                  value={`${data.reviews.score}/100`}
                  detail={data.reviews.scoreDetail}
                  detailClassName="hidden xl:block"
                  tone={
                    data.reviews.scoreLabel === "Listing-presence score"
                      ? "warning"
                      : "positive"
                  }
                />
                <SlideMetric
                  label="Google Business"
                  value={data.reviews.googleStatus}
                  tone="positive"
                />
                <SlideMetric
                  label="Google rating"
                  value={data.reviews.rating}
                />
                <SlideMetric
                  label="Public review count"
                  value={data.reviews.reviewCount}
                />
              </SlideMetricGrid>
              <ChipPanel
                label="Confirmed review platforms"
                items={data.reviews.confirmedPlatforms}
                empty="No confirmed review platforms"
                horizontal
              />
              <div className="grid min-h-0 gap-2 sm:grid-cols-2 sm:gap-3">
                <SlideInsightCard title="Key opportunity" tone="warning">
                  <p className="text-sm leading-5 sm:text-base sm:leading-6">
                    {data.reviews.keyOpportunity}
                  </p>
                </SlideInsightCard>
                <SlideInsightCard title="Recommended actions">
                  <SlideBulletList
                    items={data.reviews.recommendedActions}
                    compact
                  />
                </SlideInsightCard>
              </div>
            </div>
          </PresentationSlide>
        ),
      },
      {
        id: "social-strategy",
        title: "Social Strategy",
        content: (
          <PresentationSlide
            slideId="social-strategy"
            eyebrow="Social Strategy"
            title="Channels and content pillars"
            icon={Share2}
            footerNote={data.socialStrategy.scopeNote}
            density="compact"
          >
            <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 sm:gap-3">
              <SlideMetricGrid columns={3}>
                <SlideMetric
                  label="Social score"
                  value={`${data.social.score}/100`}
                />
                <SlideMetric
                  label="Branding score"
                  value={
                    data.social.brandingScore === null
                      ? "Unavailable"
                      : `${data.social.brandingScore}/100`
                  }
                  tone="positive"
                />
                <SlideMetric
                  label="Profile coverage"
                  value={`${data.social.confirmedCount} confirmed / ${data.social.detectedCount} detected`}
                  detail={`${data.social.pendingCount} pending; ${data.social.contentAnalyzedCount} profile contents analyzed`}
                  detailClassName="hidden sm:block"
                />
              </SlideMetricGrid>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <ResultBadge tone="positive">
                  {data.socialStrategy.sourceLabel}
                </ResultBadge>
                <span className="font-medium">
                  Confirmed:{" "}
                  {data.social.confirmedPlatforms.join(", ") || "None"}
                </span>
                {data.social.recommendedChannels.length > 0 ? (
                  <span className="text-muted">
                    Recommended next:{" "}
                    {data.social.recommendedChannels.join(" and ")}
                  </span>
                ) : null}
              </div>
              <div className="grid min-h-0 gap-2 sm:grid-cols-3 sm:gap-3">
                {data.socialStrategy.contentPillars.map((pillar) => (
                  <SlideInsightCard key={pillar.title} title={pillar.title}>
                    <p className="hidden text-xs leading-5 text-muted sm:block sm:text-sm sm:leading-6">
                      {pillar.description}
                    </p>
                  </SlideInsightCard>
                ))}
              </div>
            </div>
          </PresentationSlide>
        ),
      },
    ];

    if (data.socialStrategy.contentIdeas.length > 0) {
      result.push({
        id: "social-content",
        title: "Social Content Plan",
        content: (
          <PresentationSlide
            slideId="social-content"
            eyebrow="Social Content Plan"
            title="Three posts to create next"
            icon={Sparkles}
            footerNote="Content direction is based on confirmed business evidence, not post-level performance data."
            density="compact"
          >
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 sm:gap-3">
              <div className="grid min-h-0 gap-2 sm:grid-cols-3 sm:gap-3">
                {data.socialStrategy.contentIdeas.map((idea, index) => (
                  <article
                    key={`${idea.platform}-${idea.hook}`}
                    className="min-h-0 rounded-lg border border-border bg-card p-3 sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-accent">
                        Post {index + 1}
                      </span>
                      <span className="rounded-full border border-border px-2 py-1 text-[0.65rem] font-medium sm:text-xs">
                        {idea.platform}
                      </span>
                    </div>
                    <h2 className="mt-2 text-base font-semibold leading-tight sm:text-lg">
                      {idea.hook}
                    </h2>
                    <p className="mt-2 text-xs leading-5 text-muted sm:text-sm sm:leading-6">
                      {idea.concept}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-accent sm:text-sm">
                      {idea.callToAction}
                    </p>
                  </article>
                ))}
              </div>
              <div className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-sm font-medium sm:px-4 sm:py-3 sm:text-base">
                Conversion focus: {data.socialStrategy.conversionTip}
              </div>
            </div>
          </PresentationSlide>
        ),
      });
    }

    result.push({
      id: "competitor-comparison",
      title: "Competitor Comparison",
      content: (
        <PresentationSlide
          slideId="competitor-comparison"
          eyebrow="Competitor Intelligence"
          title="The public side-by-side"
          icon={Swords}
          footerNote={
            data.competitor.available
              ? [
                  data.competitor.snapshotLabel,
                  data.competitor.pendingSocialSummary,
                  data.competitor.limitationsNote,
                ]
                  .filter(Boolean)
                  .join(" | ")
              : data.competitor.limitationsNote
          }
          density="compact"
        >
          {data.competitor.available && data.competitor.competitorName ? (
            <div className="flex h-full min-h-0 flex-col justify-center gap-2 sm:gap-3">
              <SlideComparisonTable
                businessName={data.businessName}
                competitorName={data.competitor.competitorName}
                rows={data.competitor.rows}
              />
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm dark:border-amber-900 dark:bg-amber-950/20 sm:px-4 sm:py-3 sm:text-base">
                <span className="font-semibold">Highlighted opportunity:</span>{" "}
                {data.competitor.highlightedOpportunity}
              </div>
            </div>
          ) : (
            <EmptySlideState
              title="Comparable competitor evidence is not available"
              description="Add and analyze a competitor before presenting side-by-side website, SEO, social, review, and positioning evidence."
            />
          )}
        </PresentationSlide>
      ),
    });

    if (data.competitor.opportunities.length >= 2) {
      result.push({
        id: "competitor-opportunities",
        title: "Competitor Opportunities",
        content: (
          <PresentationSlide
            slideId="competitor-opportunities"
            eyebrow="Competitive Response"
            title="Three opportunities to act on"
            icon={Target}
            footerNote={data.competitor.limitationsNote}
            density="compact"
          >
            <div className="grid h-full min-h-0 content-center gap-2 sm:grid-cols-3 sm:gap-3">
              {data.competitor.opportunities.map((opportunity, index) => (
                <article
                  key={opportunity.title}
                  className="min-h-0 rounded-lg border border-border bg-card p-3 sm:p-4"
                >
                  <p className="text-xs font-semibold uppercase text-accent">
                    {index + 1}. {opportunity.category}
                  </p>
                  <h2 className="mt-1.5 text-base font-semibold leading-tight sm:text-lg">
                    {opportunity.title}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-muted sm:text-sm">
                    <span className="font-semibold text-foreground">
                      Evidence:
                    </span>{" "}
                    {opportunity.evidence}
                  </p>
                  <p className="mt-2 text-xs leading-5 sm:text-sm">
                    <span className="font-semibold">Response:</span>{" "}
                    {opportunity.response}
                  </p>
                </article>
              ))}
            </div>
          </PresentationSlide>
        ),
      });
    }

    result.push(
      {
        id: "top-priorities",
        title: "Top Priorities",
        content: (
          <PresentationSlide
            slideId="top-priorities"
            eyebrow="Top Priorities"
            title="Fix these first"
            icon={Target}
            density="compact"
          >
            <div className="grid h-full min-h-0 gap-2 sm:gap-3">
              {data.topPriorities.map((recommendation, index) => (
                <SlideActionCard
                  key={recommendation.title}
                  index={index + 1}
                  eyebrow={`${recommendation.category} | ${recommendation.priority} priority`}
                  title={recommendation.title}
                  description={recommendation.description}
                  evidence={recommendation.evidence}
                  badges={[
                    `Effort: ${recommendation.effort}`,
                    `Impact: ${recommendation.impact}`,
                    `Confidence: ${recommendation.confidence}`,
                  ]}
                />
              ))}
            </div>
          </PresentationSlide>
        ),
      },
      {
        id: "action-plan",
        title: "30-Day Plan",
        content: (
          <PresentationSlide
            slideId="action-plan"
            eyebrow="30-Day Plan"
            title="A sequenced month of progress"
            icon={CheckCircle2}
            density="compact"
          >
            <div className="grid h-full min-h-0 grid-cols-2 gap-2 sm:gap-3">
              {data.actionPlan.map((week) => (
                <article
                  key={week.week}
                  className="min-h-0 rounded-lg border border-border bg-card p-3 sm:p-4"
                >
                  <p className="text-xs font-semibold uppercase text-accent">
                    {week.week}
                  </p>
                  <h2 className="mt-1 text-sm font-semibold leading-tight sm:text-lg">
                    {week.outcome}
                  </h2>
                  <div className="mt-2">
                    <SlideBulletList items={week.bullets} compact />
                  </div>
                </article>
              ))}
            </div>
          </PresentationSlide>
        ),
      },
      {
        id: "consultant",
        title: "AI Consultant",
        content: (
          <PresentationSlide
            slideId="consultant"
            eyebrow="Implementation Help"
            title="Turn the audit into finished work"
            icon={MessageSquareText}
            density="compact"
          >
            <div className="flex h-full min-h-0 flex-col justify-center gap-2 sm:gap-3">
              <p className="max-w-4xl text-base font-medium leading-snug sm:text-xl">
                {data.consultant.lead}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                {data.consultant.prompts.map((prompt) => (
                  <div
                    key={prompt}
                    className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium leading-snug shadow-sm sm:px-4 sm:py-3 sm:text-base"
                  >
                    &quot;{prompt}&quot;
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={chatHref}
                  className={buttonVariants({ variant: "primary", size: "lg" })}
                >
                  <MessageSquareText className="size-4" />
                  Open AI Consultant
                </Link>
                <Link
                  href={actionPlanHref}
                  className={buttonVariants({
                    variant: "secondary",
                    size: "lg",
                  })}
                >
                  <CheckCircle2 className="size-4" />
                  Open Action Plan
                </Link>
              </div>
            </div>
          </PresentationSlide>
        ),
      },
    );

    if (data.productScope === "website_seo") {
      const disabledSlideIds = new Set([
        "reviews",
        "social-strategy",
        "social-content",
        "competitor-comparison",
        "competitor-opportunities",
      ]);
      return result.filter((slide) => !disabledSlideIds.has(slide.id));
    }

    return result;
  }, [actionPlanHref, chatHref, data]);

  const goToSlide = useCallback(
    (nextSlide: number) => {
      const bounded = Math.max(0, Math.min(slides.length - 1, nextSlide));
      setCurrentSlide((current) => {
        if (bounded === current) return current;
        setDirection(bounded > current ? "next" : "previous");
        return bounded;
      });
    },
    [slides.length],
  );

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.dataset.presentationMode = "true";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overscrollBehavior = bodyOverscroll;
      delete document.body.dataset.presentationMode;
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const timeout = window.setTimeout(
      () => stage.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [currentSlide]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          window.location.assign(overviewHref);
        }
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToSlide(currentSlide + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToSlide(currentSlide - 1);
      } else if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        goToSlide(currentSlide + (event.shiftKey ? -1 : 1));
      } else if (event.key === "Home") {
        event.preventDefault();
        goToSlide(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goToSlide(slides.length - 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlide, goToSlide, overviewHref, slides.length]);

  async function toggleFullscreen() {
    if (fullscreenUnavailable) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        if (
          !document.fullscreenEnabled ||
          !rootRef.current?.requestFullscreen
        ) {
          setFullscreenUnavailable(true);
          return;
        }
        await rootRef.current.requestFullscreen();
      }
    } catch {
      setFullscreenUnavailable(true);
    }
  }

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return;
    }
    goToSlide(currentSlide + (deltaX < 0 ? 1 : -1));
  }

  const slide = slides[currentSlide];
  const progress = ((currentSlide + 1) / slides.length) * 100;

  return (
    <div
      ref={rootRef}
      className={cn(
        styles.root,
        "fixed inset-0 z-[100] bg-background text-foreground",
      )}
      data-presentation-root
    >
      <header
        className={cn(
          styles.toolbar,
          "flex items-center justify-between gap-3 border-b border-border bg-card/95 px-3 backdrop-blur sm:px-5",
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data.businessName}</p>
          <p className="hidden text-xs text-muted sm:block">
            {data.auditDate} | Completed
          </p>
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-xs font-medium sm:text-sm">
            {slide.title}
          </p>
          <p
            className="text-[0.65rem] text-muted sm:text-xs"
            data-slide-counter
          >
            {currentSlide + 1} / {slides.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href={pdfHref}
            aria-label="Download audit PDF"
            title="Download PDF"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Download className="size-4" />
            <span className="hidden lg:inline">PDF</span>
          </Link>
          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={fullscreenUnavailable}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-pressed={isFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Expand className="size-4" />
            )}
            <span className="hidden lg:inline">Fullscreen</span>
          </button>
          <Link
            href={overviewHref}
            aria-label="Exit presentation"
            title="Exit presentation"
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <X className="size-4" />
            <span className="hidden lg:inline">Exit</span>
          </Link>
        </div>
      </header>

      <main
        ref={stageRef}
        className={cn(styles.stage, "focus:outline-none")}
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={`Audit presentation: ${slide.title}`}
      >
        <div className={styles.canvas} data-presentation-canvas>
          <div
            key={slide.id}
            className={styles.slideMotion}
            data-direction={direction}
          >
            {slide.content}
          </div>
        </div>
      </main>

      <footer
        className={cn(
          styles.footer,
          "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-border bg-card/95 px-3 backdrop-blur sm:px-5",
        )}
      >
        <button
          type="button"
          onClick={() => goToSlide(currentSlide - 1)}
          disabled={currentSlide === 0}
          aria-label="Previous slide"
          className={buttonVariants({ variant: "secondary" })}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <div className="min-w-0 px-1 sm:px-4">
          <div className="mb-2 h-1 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="hidden items-center justify-center gap-1.5 md:flex">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}: ${item.title}`}
                aria-current={index === currentSlide ? "step" : undefined}
                title={`${index + 1}. ${item.title}`}
                className={cn(
                  "h-2.5 rounded-full bg-foreground/20 transition-all duration-150 motion-reduce:transition-none",
                  index === currentSlide
                    ? "w-7 bg-accent"
                    : "w-2.5 hover:bg-foreground/40",
                )}
              />
            ))}
          </div>
          <p className="truncate text-center text-[0.65rem] font-medium md:hidden">
            {currentSlide + 1} / {slides.length} | {slide.title}
          </p>
        </div>
        <button
          type="button"
          onClick={() => goToSlide(currentSlide + 1)}
          disabled={currentSlide === slides.length - 1}
          aria-label="Next slide"
          className={buttonVariants({ variant: "primary" })}
        >
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="size-4" />
        </button>
      </footer>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Slide {currentSlide + 1} of {slides.length}: {slide.title}
      </p>
    </div>
  );
}

function ContextItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-b border-r border-border p-3 sm:p-4",
        className,
      )}
    >
      <dt className="text-[0.65rem] font-semibold uppercase text-muted sm:text-xs">
        {label}
      </dt>
      <dd className="mt-1 text-xs leading-5 sm:text-base sm:leading-6">
        {value}
      </dd>
    </div>
  );
}

function ChipPanel({
  label,
  items,
  empty,
  horizontal = false,
}: {
  label: string;
  items: string[];
  empty: string;
  horizontal?: boolean;
}) {
  return (
    <section
      className={cn(
        "min-h-0 rounded-lg border border-border bg-card p-3 sm:p-4",
        horizontal && "flex items-center gap-3",
      )}
    >
      <h2 className="shrink-0 text-xs font-semibold sm:text-sm">{label}</h2>
      <div
        className={cn("flex flex-wrap gap-1.5", horizontal ? "mt-0" : "mt-2")}
      >
        {items.length > 0 ? (
          items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border bg-background px-2 py-1 text-[0.65rem] font-medium sm:text-xs"
            >
              {item}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted sm:text-sm">{empty}</span>
        )}
      </div>
    </section>
  );
}

function EmptySlideState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-border bg-card p-5 text-center sm:p-8">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted sm:text-xl sm:leading-8">
          {description}
        </p>
      </div>
    </div>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "a, button, input, textarea, select, [contenteditable='true']",
      ),
    )
  );
}
