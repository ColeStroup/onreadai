"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  getAuditRunStatus,
  startAuditRun,
} from "@/app/dashboard/businesses/[businessId]/audit/run/actions";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type RunStatus = "pending" | "running" | "completed" | "failed";

type AuditRunPanelProps = {
  businessId: string;
  businessName: string;
  initialAuditId?: string;
  initialStatus?: RunStatus;
  completionHref?: string;
  hasWebsite: boolean;
};

const websiteSteps = [
  "Preparing business profile",
  "Analyzing website",
  "Checking SEO basics",
  "Reviewing social presence",
  "Analyzing competitors",
  "Generating recommendations",
  "Saving report",
];

const socialFirstSteps = [
  "Preparing business profile",
  "Reviewing Business Context",
  "Reviewing social presence",
  "Checking conversion paths",
  "Analyzing trust and competitors",
  "Generating recommendations",
  "Saving report",
];

export function AuditRunPanel({
  businessId,
  businessName,
  initialAuditId,
  initialStatus = "pending",
  completionHref,
  hasWebsite,
}: AuditRunPanelProps) {
  const steps = hasWebsite ? websiteSteps : socialFirstSteps;
  const [auditId, setAuditId] = useState(initialAuditId ?? "");
  const [status, setStatus] = useState<RunStatus>(
    initialStatus === "completed" ? "completed" : "running",
  );
  const [activeStep, setActiveStep] = useState(
    initialStatus === "completed" ? steps.length : 0,
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const startedRef = useRef(false);
  const resultHref =
    completionHref ?? `/dashboard/businesses/${businessId}/overview`;

  const statusCopy = useMemo(() => {
    if (status === "completed") {
      return {
        title: "Audit complete",
        description: "Your report is ready to review.",
      };
    }

    if (status === "failed") {
      return {
        title: "Audit could not be completed",
        description:
          "Something interrupted the audit run. You can try again without losing your confirmed profiles.",
      };
    }

    return {
      title: "Running your growth audit",
      description: hasWebsite
        ? "We're analyzing your confirmed profiles, website, SEO, goals, and competitors."
        : "We're building a social-first assessment from confirmed profiles, Business Context, goals, reviews, and competitors.",
    };
  }, [hasWebsite, status]);

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, steps.length - 1));
    }, 700);

    return () => window.clearInterval(interval);
  }, [status, steps.length]);

  useEffect(() => {
    if (startedRef.current || initialStatus === "completed") {
      return;
    }

    startedRef.current = true;
    startTransition(async () => {
      const result = await startAuditRun({
        businessId,
        auditId: initialAuditId,
      });

      setAuditId(result.auditId);

      if (result.status === "completed") {
        setStatus("completed");
        setActiveStep(steps.length);
        return;
      }

      if (result.status === "failed") {
        setStatus("failed");
        setError(result.error ?? "Audit generation failed.");
        return;
      }

      setStatus("running");
    });
  }, [businessId, initialAuditId, initialStatus, steps.length]);

  useEffect(() => {
    if (status !== "running" || !auditId) {
      return;
    }

    const interval = window.setInterval(async () => {
      const result = await getAuditRunStatus({
        businessId,
        auditId,
      });

      if (result.status === "completed") {
        setStatus("completed");
        setActiveStep(steps.length);
      }

      if (result.status === "failed") {
        setStatus("failed");
        setError(result.error ?? "Audit generation failed.");
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [auditId, businessId, status, steps.length]);

  useEffect(() => {
    if (status !== "completed") {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.location.assign(resultHref);
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [resultHref, status]);

  function retryAudit() {
    setStatus("running");
    setError("");
    setActiveStep(0);

    startTransition(async () => {
      const result = await startAuditRun({
        businessId,
        auditId,
      });

      setAuditId(result.auditId);

      if (result.status === "completed") {
        setStatus("completed");
        setActiveStep(steps.length);
        return;
      }

      if (result.status === "failed") {
        setStatus("failed");
        setError(result.error ?? "Audit generation failed.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="grid gap-8 p-6 lg:grid-cols-[1fr_320px] lg:p-8">
          <div className="space-y-6">
            <div>
              <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {status === "completed" ? (
                  <CheckCircle2 className="size-6" />
                ) : status === "failed" ? (
                  <AlertTriangle className="size-6" />
                ) : (
                  <SearchCheck className="size-6" />
                )}
              </div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                Growth Audit
              </p>
              <h2 className="mt-2 text-4xl font-semibold tracking-normal">
                {statusCopy.title}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
                {statusCopy.description}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium">{businessName}</p>
              <p className="mt-1 text-sm text-muted">
                {hasWebsite
                  ? "Website, SEO, social presence, goals, and competitors are being assembled into one saved report."
                  : "Social presence, brand context, trust signals, goals, and competitors are being assembled into one saved report. Website and SEO will be marked not provided."}
              </p>
            </div>

            {status === "failed" ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                {error || "Audit generation failed. Please try again."}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {status === "completed" ? (
                <Link href={resultHref} className={buttonVariants({ variant: "primary" })}>
                  View Results
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}

              {status === "failed" ? (
                <button
                  type="button"
                  onClick={retryAudit}
                  disabled={isPending}
                  className={buttonVariants({ variant: "primary" })}
                >
                  <RefreshCw className="size-4" />
                  Try again
                </button>
              ) : null}

              <Link
                href={`/dashboard/businesses/${businessId}/confirm`}
                className={buttonVariants({ variant: "secondary" })}
              >
                Review profiles
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-5">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-medium">Audit Progress</p>
              {status === "running" ? (
                <Loader2 className="size-4 animate-spin text-accent" />
              ) : null}
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => {
                const isComplete =
                  status === "completed" || index < activeStep;
                const isActive = status === "running" && index === activeStep;
                const isFailed =
                  status === "failed" && index === Math.min(activeStep, steps.length - 1);

                return (
                  <div key={step} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                        isComplete &&
                          "border-accent bg-accent text-accent-foreground",
                        isActive &&
                          "border-accent bg-accent/10 text-accent",
                        isFailed &&
                          "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
                        !isComplete &&
                          !isActive &&
                          !isFailed &&
                          "border-border bg-card text-muted",
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="size-4" />
                      ) : isActive ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : isFailed ? (
                        <AlertTriangle className="size-3.5" />
                      ) : (
                        <Circle className="size-3" />
                      )}
                    </span>
                    <div>
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isActive && "text-accent",
                          isComplete && "text-foreground",
                          isFailed && "text-rose-700 dark:text-rose-100",
                          !isActive && !isComplete && !isFailed && "text-muted",
                        )}
                      >
                        {step}
                      </p>
                      {isActive ? (
                        <p className="text-xs text-muted">In progress</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
