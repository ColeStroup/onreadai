import {
  ComplimentaryEntitlementSource,
  PlanType,
} from "@prisma/client";
import { Gift, Search, UserRound } from "lucide-react";
import Link from "next/link";

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
  complimentaryEntitlementPlans,
  complimentaryEntitlementSources,
  listComplimentaryEntitlements,
  searchEntitlementUsers,
} from "@/lib/billing/complimentary-entitlements";
import { complimentaryEntitlementStatus } from "@/lib/billing/complimentary-entitlement-policy";
import { requireAdmin } from "@/lib/partners/authorization";

const statuses = ["SCHEDULED", "ACTIVE", "EXPIRED", "REVOKED"] as const;

export default async function AdminEntitlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin("/dashboard/admin/entitlements");
  const query = await searchParams;
  const search = first(query.q)?.trim().slice(0, 200) ?? "";
  const plan = enumValue(first(query.plan), complimentaryEntitlementPlans);
  const source = enumValue(
    first(query.source),
    complimentaryEntitlementSources,
  );
  const status = enumValue(first(query.status), statuses);
  const [entitlements, users] = await Promise.all([
    listComplimentaryEntitlements({
      adminUserId: admin.id,
      query: search,
      plan,
      source,
      status,
    }),
    search
      ? searchEntitlementUsers({
          adminUserId: admin.id,
          query: search,
        })
      : Promise.resolve([]),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-muted">Administrator</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-normal">
          Complimentary access
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Grant or revoke Starter and Pro access without changing Stripe
          subscriptions, payments, invoices, or partner commissions.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Find users and filter grant history</CardTitle>
          <CardDescription>
            Search by account name or email. All filters are applied server-side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 lg:grid-cols-[1fr_170px_190px_170px_auto]">
            <label className="relative block">
              <span className="sr-only">Name or email</span>
              <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted" />
              <input
                name="q"
                defaultValue={search}
                placeholder="Name or email"
                className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <FilterSelect name="plan" defaultValue={plan} label="All plans">
              {complimentaryEntitlementPlans.map((value) => (
                <option key={value} value={value}>
                  {value === PlanType.STARTER ? "Starter" : "Pro"}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="source" defaultValue={source} label="All sources">
              {complimentaryEntitlementSources.map((value) => (
                <option key={value} value={value}>
                  {labelEnum(value)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="status" defaultValue={status} label="All statuses">
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {labelEnum(value)}
                </option>
              ))}
            </FilterSelect>
            <button className={buttonVariants({ variant: "secondary" })}>
              Apply
            </button>
          </form>
        </CardContent>
      </Card>

      {search ? (
        <section aria-labelledby="user-results">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="user-results" className="text-lg font-semibold">
              User results
            </h2>
            <span className="text-sm text-muted">{users.length} found</span>
          </div>
          {users.length ? (
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {user.name || "Unnamed account"}
                    </p>
                    <p className="truncate text-sm text-muted">{user.email}</p>
                  </div>
                  <Link
                    href={`/dashboard/admin/entitlements/${user.id}`}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    <UserRound className="size-4" />
                    Manage access
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted">
              No users matched that search.
            </p>
          )}
        </section>
      ) : null}

      <section aria-labelledby="grant-history">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 id="grant-history" className="text-lg font-semibold">
              Grant history
            </h2>
            <p className="mt-1 text-sm text-muted">
              Active, scheduled, expired, and revoked records are retained.
            </p>
          </div>
          <span className="text-sm text-muted">
            {entitlements.length} records
          </span>
        </div>

        {entitlements.length ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {entitlements.map((entitlement) => {
              const grantStatus = complimentaryEntitlementStatus(
                entitlement,
                now,
              );
              return (
                <div
                  key={entitlement.id}
                  className="grid gap-4 p-4 lg:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {entitlement.user.name || "Unnamed account"}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {entitlement.user.email}
                    </p>
                  </div>
                  <PlanBadge plan={entitlement.plan} />
                  <div className="text-sm">
                    <p className="font-medium">{grantStatus}</p>
                    <p className="text-muted">
                      {labelEnum(entitlement.source)}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p>{entitlement.startsAt.toLocaleDateString()}</p>
                    <p className="text-muted">
                      {entitlement.expiresAt
                        ? `Ends ${entitlement.expiresAt.toLocaleDateString()}`
                        : "No expiration"}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/admin/entitlements/${entitlement.userId}`}
                    className={buttonVariants({
                      variant: "ghost",
                      size: "sm",
                    })}
                  >
                    Review
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Gift className="mx-auto size-6 text-muted" />
            <p className="mt-3 font-semibold">No matching grants</p>
            <p className="mt-1 text-sm text-muted">
              Search for a user above to grant their first complimentary plan.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({
  name,
  defaultValue,
  label,
  children,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      >
        <option value="">{label}</option>
        {children}
      </select>
    </label>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function enumValue<T extends string>(
  value: string | undefined,
  values: readonly T[],
) {
  return value && values.includes(value as T) ? (value as T) : undefined;
}

function labelEnum(value: ComplimentaryEntitlementSource | string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
