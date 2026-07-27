import { AuditStatus } from "@prisma/client";
import {
  CheckCircle2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { notFound } from "next/navigation";

import {
  confirmBusinessContext,
  regenerateBusinessContext,
  saveBusinessContext,
} from "@/app/dashboard/businesses/[businessId]/context/actions";
import { ContextualHelpCard } from "@/components/dashboard/contextual-help-card";
import { FloatingScrollControls } from "@/components/dashboard/floating-scroll-controls";
import { DataSourceNotice } from "@/components/dashboard/report-ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  contextConfidenceLabel,
  contextSourceLabel,
  hasBusinessContext,
  isContextConfirmed,
  normalizeContextConfidence,
} from "@/lib/business-context";
import {
  confirmedSocialProfiles,
  hasConfirmedWebsite,
} from "@/lib/audits/audit-applicability";
import { contextualHelp } from "@/lib/education/help-content";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BusinessContextPageProps = {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const textareaClass =
  "min-h-28 w-full rounded-lg border border-border bg-card px-3 py-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60";

export default async function BusinessContextPage({
  params,
  searchParams,
}: BusinessContextPageProps) {
  const user = await requireUser("/dashboard/businesses");
  const { businessId } = await params;
  const query = await searchParams;
  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      ownerId: user.id,
    },
    select: {
      id: true,
      name: true,
      initialInput: true,
      description: true,
      targetAudience: true,
      mainOffer: true,
      industry: true,
      businessType: true,
      primaryConversionGoal: true,
      brandTone: true,
      contextConfidence: true,
      contextSource: true,
      contextConfirmedAt: true,
      contextUpdatedAt: true,
      profiles: {
        select: {
          platform: true,
          status: true,
          url: true,
          handle: true,
        },
      },
      audits: {
        where: {
          status: AuditStatus.COMPLETED,
        },
        take: 1,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          createdAt: true,
        },
      },
    },
  });

  if (!business) {
    notFound();
  }

  const hasContext = hasBusinessContext(business);
  const confirmed = isContextConfirmed(business);
  const confidence = normalizeContextConfidence(business.contextConfidence);
  const latestAudit = business.audits.at(0);
  const socialFirst =
    !hasConfirmedWebsite(business.profiles) &&
    confirmedSocialProfiles(business.profiles).length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles className="size-5" />
          </div>
          <CardTitle className="text-2xl">Business Context</CardTitle>
          <CardDescription className="max-w-3xl text-base leading-7">
            Help the app understand what {business.name} does, who it serves,
            what it offers, and what action customers or profile visitors
            should take next.
          </CardDescription>
        </CardHeader>
      </Card>

      <ContextualHelpCard {...contextualHelp.context} />

      {socialFirst ? (
        <DataSourceNotice>
          <strong>This is a social-first business.</strong> Because there is no
          confirmed website to explain the offer, the description, target
          audience, and main offer below are required before the context can be
          confirmed. Review them instead of relying on guesses from a handle.
        </DataSourceNotice>
      ) : null}

      {query.error === "missing-core" ? (
        <StatusMessage
          tone="warning"
          message="Add a business description, target audience, and main offer before confirming this social-first context."
        />
      ) : null}

      {query.error === "rate-limited" ? (
        <StatusMessage
          tone="warning"
          message="Please wait before generating another Business Context draft."
        />
      ) : null}

      {query.saved === "1" ? (
        <StatusMessage tone="success" message="Business context saved." />
      ) : null}
      {query.generated === "1" ? (
        <StatusMessage
          tone="success"
          message="A fresh draft context was generated. Review and confirm it when it looks right."
        />
      ) : null}
      {query.confirmed === "1" ? (
        <StatusMessage tone="success" message="Business context confirmed." />
      ) : null}

      {!hasContext ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-semibold">Help us understand your business</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Generate a draft from a bounded public homepage analysis, saved
                profiles, selected goals, and the latest audit when available.
                You can edit every important field before confirming it.
              </p>
              {!latestAudit ? (
                <p className="mt-2 text-sm text-muted">
                  No completed audit exists yet. A saved website, when
                  available, will still be analyzed before the draft is
                  generated.
                </p>
              ) : null}
            </div>
            <form action={regenerateBusinessContext}>
              <input type="hidden" name="businessId" value={business.id} />
              <Button type="submit" variant="primary">
                <RefreshCw className="size-4" />
                Generate Business Context
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          label="Confidence"
          value={contextConfidenceLabel(business.contextConfidence)}
          accent={confidence ?? 0}
        />
        <MetricCard
          label="Source"
          value={contextSourceLabel(business.contextSource)}
        />
        <MetricCard
          label="Confirmation"
          value={confirmed ? "Confirmed" : "Needs review"}
          className={
            confirmed
              ? "border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40"
              : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          }
        />
        <MetricCard
          label="Last updated"
          value={
            business.contextUpdatedAt
              ? business.contextUpdatedAt.toLocaleDateString()
              : "Not updated"
          }
        />
      </div>

      {!confirmed && hasContext ? (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-200" />
              <div>
                <p className="font-medium text-amber-950 dark:text-amber-50">
                  This context has not been confirmed yet.
                </p>
                <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-100">
                  Review the draft carefully. Confirming it gives the AI
                  Consultant stronger grounding for recommendations and social
                  strategy.
                </p>
              </div>
            </div>
            <form action={confirmBusinessContext}>
              <input type="hidden" name="businessId" value={business.id} />
              <Button type="submit" variant="secondary" className="w-full sm:w-fit">
                <CheckCircle2 className="size-4" />
                Confirm This Looks Right
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <form action={saveBusinessContext} className="space-y-6">
        <input type="hidden" name="businessId" value={business.id} />

        <Card>
          <CardHeader>
            <CardTitle>Editable Context</CardTitle>
            <CardDescription>
              Keep these fields plain and accurate. The AI Consultant treats
              this as high-priority context when answering strategy questions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <FieldGroup
              label="Business Description"
              name="description"
              value={business.description}
              placeholder="Harbor & Pine creates brand photography and social content for independent businesses."
              textarea
            />
            <FieldGroup
              label="Target Audience"
              name="targetAudience"
              value={business.targetAudience}
              placeholder="Independent retailers, hospitality teams, and local service businesses."
              textarea
            />
            <FieldGroup
              label="Main Offer"
              name="mainOffer"
              value={business.mainOffer}
              placeholder="Monthly content shoots with ready-to-publish photo and video packages."
              textarea
            />

            <div className="grid gap-5 md:grid-cols-2">
              <FieldGroup
                label="Industry / Category"
                name="industry"
                value={business.industry}
                placeholder="Creative services"
              />
              <FieldGroup
                label="Business Type"
                name="businessType"
                value={business.businessType}
                placeholder="Service business"
              />
              <FieldGroup
                label="Primary Conversion Goal"
                name="primaryConversionGoal"
                value={business.primaryConversionGoal}
                placeholder="Get qualified prospects to book a consultation."
                textarea
              />
              <FieldGroup
                label="Brand Tone"
                name="brandTone"
                value={business.brandTone}
                placeholder="Clear, warm, and confident."
                textarea
              />
              <div className="space-y-2">
                <Label htmlFor="contextConfidence">Confidence Score</Label>
                <Input
                  id="contextConfidence"
                  name="contextConfidence"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={business.contextConfidence ?? ""}
                  placeholder="0-100"
                />
                <p className="text-xs leading-5 text-muted">
                  Use a lower score when the context is incomplete or uncertain.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-muted">
            Saving edits marks the context as user edited. Confirm it afterward
            when it accurately describes the business.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton pendingLabel="Saving context...">
              Save Context
            </SubmitButton>
          </div>
        </div>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <form action={regenerateBusinessContext}>
          <input type="hidden" name="businessId" value={business.id} />
          <Button type="submit" variant="secondary" className="w-full sm:w-fit">
            <RefreshCw className="size-4" />
            Regenerate Context
          </Button>
        </form>
        <form action={confirmBusinessContext}>
          <input type="hidden" name="businessId" value={business.id} />
          <Button type="submit" variant="secondary" className="w-full sm:w-fit">
            <CheckCircle2 className="size-4" />
            Confirm This Looks Right
          </Button>
        </form>
      </div>

      <FloatingScrollControls />
    </div>
  );
}

function FieldGroup({
  label,
  name,
  value,
  placeholder,
  textarea = false,
}: {
  label: string;
  name: string;
  value?: string | null;
  placeholder: string;
  textarea?: boolean;
}) {
  const id = `context-${name}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {textarea ? (
        <textarea
          id={id}
          name={name}
          defaultValue={value ?? ""}
          placeholder={placeholder}
          className={textareaClass}
        />
      ) : (
        <Input
          id={id}
          name={name}
          defaultValue={value ?? ""}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: string;
  accent?: number;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="mt-2 text-lg font-semibold">{value}</p>
        {typeof accent === "number" ? (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(0, Math.min(100, accent))}%` }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusMessage({
  tone,
  message,
}: {
  tone: "success" | "warning";
  message: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium",
        tone === "success"
          ? "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
      )}
    >
      <CheckCircle2 className="size-4" />
      {message}
    </div>
  );
}
