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
import {
  auditProgressStageLabels,
  websiteSeoAuditProgressStages,
  type AuditProgressStage,
} from "@/lib/audits/audit-progress";
import { cn } from "@/lib/utils";

type RunStatus = "pending" | "running" | "completed" | "failed";

type AuditRunPanelProps = {
  businessId: string;
  businessName: string;
  initialAuditId?: string;
  initialStatus?: RunStatus;
  initialProgressStage?: AuditProgressStage;
  completionHref?: string;
};

export function AuditRunPanel({
  businessId,
  businessName,
  initialAuditId,
  initialStatus = "pending",
  initialProgressStage = "PREPARING_BUSINESS_INFORMATION",
  completionHref,
}: AuditRunPanelProps) {
  const steps = websiteSeoAuditProgressStages;
  const [auditId, setAuditId] = useState(initialAuditId ?? "");
  const [status, setStatus] = useState<RunStatus>(
    initialStatus === "completed" ? "completed" : "running",
  );
  const [progressStage, setProgressStage] =
    useState<AuditProgressStage>(initialProgressStage);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const startedRef = useRef(false);
  const resultHref =
    completionHref ?? `/dashboard/businesses/${businessId}/overview`;
  const activeStep =
    status === "completed"
      ? steps.length
      : Math.max(
          0,
          steps.findIndex((step) => step === progressStage),
        );

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
      title: "Running your website audit",
      description:
        "We're analyzing your website structure, content, SEO foundations, and conversion paths.",
    };
  }, [status]);

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
      if (result.progressStage) setProgressStage(result.progressStage);

      if (result.status === "completed") {
        setStatus("completed");
        return;
      }

      if (result.status === "failed") {
        setStatus("failed");
        setError(result.error ?? "Audit generation failed.");
        return;
      }

      setStatus("running");
    });
  }, [businessId, initialAuditId, initialStatus]);

  useEffect(() => {
    if (status !== "running" || !auditId) {
      return;
    }

    const interval = window.setInterval(async () => {
      const result = await getAuditRunStatus({
        businessId,
        auditId,
      });
      if (result.progressStage) setProgressStage(result.progressStage);

      if (result.status === "completed") {
        setStatus("completed");
      }

      if (result.status === "failed") {
        setStatus("failed");
        setError(result.error ?? "Audit generation failed.");
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [auditId, businessId, status]);

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
    setProgressStage("PREPARING_BUSINESS_INFORMATION");

    startTransition(async () => {
      const result = await startAuditRun({
        businessId,
        auditId,
      });

      setAuditId(result.auditId);
      if (result.progressStage) setProgressStage(result.progressStage);

      if (result.status === "completed") {
        setStatus("completed");
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
      <Card
        className="overflow-hidden"
        aria-busy={status === "running" || isPending}
      >
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
                Website &amp; SEO Audit
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
                Website evidence, SEO checks, prioritized actions, and
                verification guidance are being assembled into one saved report.
              </p>
            </div>

            {status === "failed" ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                {error || "Audit generation failed. Please try again."}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              {status === "completed" ? (
                <Link
                  href={resultHref}
                  className={buttonVariants({ variant: "primary" })}
                >
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
                  aria-busy={isPending}
                >
                  {isPending ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  {isPending ? "Retrying..." : "Try again"}
                </button>
              ) : null}

              <Link
                href={`/dashboard/businesses/${businessId}/setup?step=profiles`}
                className={buttonVariants({ variant: "secondary" })}
              >
                Review website
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-5">
            <div className="mb-5 flex items-center justify-between">
              <p className="font-medium">Audit progress</p>
              {status === "running" ? (
                <Loader2 className="size-4 animate-spin text-accent" />
              ) : null}
            </div>

            <div className="space-y-4">
              {steps.map((step, index) => {
                const isComplete = status === "completed" || index < activeStep;
                const isActive = status === "running" && index === activeStep;
                const isFailed =
                  status === "failed" &&
                  index === Math.min(activeStep, steps.length - 1);

                return (
                  <div key={step} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                        isComplete &&
                          "border-accent bg-accent text-accent-foreground",
                        isActive && "border-accent bg-accent/10 text-accent",
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
                        {auditProgressStageLabels[step]}
                      </p>
                      {isActive ? (
                        <p className="text-xs text-muted">In progress</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {status === "running" ? (
              <p
                className="mt-5 text-xs leading-5 text-muted"
                role="status"
                aria-live="polite"
              >
                The audit is running in the background. You can leave this page
                and return; refreshing will resume from the latest saved stage.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
