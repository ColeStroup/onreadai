import { ArrowLeft, History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ComplimentaryGrantForm,
  ComplimentaryRevokeForm,
} from "@/components/billing/complimentary-entitlement-forms";
import { PlanBadge } from "@/components/billing/plan-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ComplimentaryEntitlementError,
  getUserEntitlementSummary,
} from "@/lib/billing/complimentary-entitlements";
import { complimentaryEntitlementStatus } from "@/lib/billing/complimentary-entitlement-policy";
import { planLabels } from "@/lib/billing/plans";
import { requireAdmin } from "@/lib/partners/authorization";

export default async function AdminUserEntitlementPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const admin = await requireAdmin(
    `/dashboard/admin/entitlements/${userId}`,
  );
  const summary = await getUserEntitlementSummary({
    adminUserId: admin.id,
    targetUserId: userId,
  }).catch((error: unknown) => {
    if (
      error instanceof ComplimentaryEntitlementError &&
      error.code === "TARGET_USER_NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  });
  const { user, billing, auditEvents } = summary;
  const now = new Date();
  const grantStatuses = user.complimentaryEntitlements.map((entitlement) => ({
    entitlement,
    status: complimentaryEntitlementStatus(entitlement, now),
  }));
  const hasOverlappingGrant = grantStatuses.some(({ status }) =>
    ["ACTIVE", "SCHEDULED"].includes(status),
  );
  const targetLabel = user.name || user.email || "this user";

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/admin/entitlements"
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-3 mb-3",
          })}
        >
          <ArrowLeft className="size-4" />
          All entitlements
        </Link>
        <p className="text-sm font-medium text-muted">Complimentary access</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">
          {targetLabel}
        </h1>
        <p className="mt-2 text-sm text-muted">{user.email}</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          label="Effective access"
          value={<PlanBadge plan={billing.plan} />}
        />
        <SummaryMetric
          label="Entitlement source"
          value={labelEnum(billing.entitlementSource)}
        />
        <SummaryMetric
          label="Paid Stripe plan"
          value={
            billing.activeStripeSubscription
              ? planLabels[billing.activeStripeSubscription.plan]
              : "None"
          }
        />
        <SummaryMetric
          label="Complimentary plan"
          value={
            billing.complimentaryPlan
              ? planLabels[billing.complimentaryPlan]
              : "None"
          }
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Grant complimentary access</CardTitle>
          <CardDescription>
            This changes product access only. It does not create or modify
            Stripe billing, payments, invoices, or commissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComplimentaryGrantForm
            targetUserId={user.id}
            targetLabel={targetLabel}
            hasOverlappingGrant={hasOverlappingGrant}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grant history</CardTitle>
          <CardDescription>
            Internal notes and administrative history are visible only on this
            protected admin route.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grantStatuses.length ? (
            <div className="divide-y divide-border">
              {grantStatuses.map(({ entitlement, status }) => (
                <article key={entitlement.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PlanBadge plan={entitlement.plan} />
                        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
                          {status}
                        </span>
                        <span className="text-xs font-medium text-muted">
                          {labelEnum(entitlement.source)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-medium">
                        {entitlement.reason}
                      </p>
                      {entitlement.internalNotes ? (
                        <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-muted">
                          {entitlement.internalNotes}
                        </p>
                      ) : null}
                    </div>
                    <dl className="shrink-0 space-y-1 text-sm">
                      <div className="flex gap-2">
                        <dt className="text-muted">Starts</dt>
                        <dd>{formatDateTime(entitlement.startsAt)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">Expires</dt>
                        <dd>
                          {entitlement.expiresAt
                            ? formatDateTime(entitlement.expiresAt)
                            : "Never"}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">Granted by</dt>
                        <dd>
                          {entitlement.grantedByUser.name ||
                            entitlement.grantedByUser.email ||
                            "Administrator"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {entitlement.revokedAt ? (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/20">
                      <p className="font-semibold">
                        Revoked {formatDateTime(entitlement.revokedAt)}
                      </p>
                      <p className="mt-1 text-muted">
                        {entitlement.revokedReason}
                      </p>
                    </div>
                  ) : ["ACTIVE", "SCHEDULED"].includes(status) ? (
                    <ComplimentaryRevokeForm
                      targetUserId={user.id}
                      entitlementId={entitlement.id}
                      planLabel={planLabels[entitlement.plan]}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="py-6 text-sm text-muted">
              This user has no complimentary grant history.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="size-4 text-accent" />
            <CardTitle>Immutable admin events</CardTitle>
          </div>
          <CardDescription>
            Grant and revocation events are retained independently of access
            status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditEvents.length ? (
            <div className="divide-y divide-border">
              {auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {labelEnum(event.action)}
                    </p>
                    <p className="mt-1 text-sm text-muted">{event.reason}</p>
                  </div>
                  <time className="text-sm text-muted">
                    {formatDateTime(event.createdAt)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No admin events recorded.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <ShieldCheck className="size-4" />
      </div>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-2 font-semibold">{value}</div>
    </div>
  );
}

function formatDateTime(date: Date) {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })}`;
}

function labelEnum(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
