import {
  Bell,
  BriefcaseBusiness,
  KeyRound,
  Link2,
  Settings,
} from "lucide-react";
import Link from "next/link";

import { PageIntro } from "@/components/dashboard/report-ui";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      passwordHash: true,
      accounts: {
        select: { provider: true },
        orderBy: { provider: "asc" },
      },
      _count: { select: { businesses: true } },
    },
  });
  const connectedProviders =
    account?.accounts.map((item) => item.provider).filter(Boolean) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageIntro
        eyebrow="Settings"
        title="Account and workspace settings"
        description="Review account identity, sign-in protection, business workspaces, notifications, and connected services."
        icon={Settings}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Identity details supplied by your verified sign-in account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={account?.name ?? user.name ?? ""}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={account?.email ?? user.email ?? ""}
                readOnly
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <BriefcaseBusiness className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Business workspaces</CardTitle>
                <CardDescription>
                  Add, review, or switch the businesses you own.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {account?._count.businesses ?? 0}
            </p>
            <p className="mt-1 text-sm text-muted">
              Active and archived workspaces are managed from Businesses.
            </p>
            <Link
              href="/dashboard/businesses"
              className={buttonVariants({
                variant: "primary",
                size: "sm",
                className: "mt-4",
              })}
            >
              Manage businesses
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <KeyRound className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>
                  Current verification and sign-in methods.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border text-sm">
            <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
              <span className="text-muted">Email verification</span>
              <strong>
                {account?.emailVerified ? "Verified" : "Not verified"}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-muted">Password sign-in</span>
              <strong>{account?.passwordHash ? "Enabled" : "Not set"}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
              <span className="text-muted">Connected sign-in providers</span>
              <strong className="text-right">
                {connectedProviders.length > 0
                  ? connectedProviders
                      .map((provider) =>
                        provider.replace(/\b\w/g, (letter) =>
                          letter.toUpperCase(),
                        ),
                      )
                      .join(", ")
                  : "None"}
              </strong>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Bell className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Account and billing communication.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted">
              Required verification, password, billing, and security messages
              are sent to the account email above. Optional notification
              preferences are not available yet.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Link2 className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  How Onread currently uses your public website.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted">
              Onread analyzes the confirmed public website saved in each
              workspace. Historical sources from earlier product versions stay
              stored, but disabled growth modules are not used by new audits.
            </p>
            <Link
              href="/dashboard/businesses"
              className={buttonVariants({
                variant: "secondary",
                size: "sm",
                className: "mt-4",
              })}
            >
              Review business sources
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
