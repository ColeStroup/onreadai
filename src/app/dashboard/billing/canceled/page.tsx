import { ArrowLeft, CreditCard } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/session";

export default async function BillingCanceledPage() {
  await requireUser("/dashboard/billing/canceled");

  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-foreground/5 text-muted">
            <CreditCard className="size-6" />
          </div>
          <CardTitle>Checkout canceled</CardTitle>
          <CardDescription>
            No plan changes were made. Your current access and saved work remain
            unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/pricing" className={buttonVariants()}>
            Review plans
          </Link>
          <Link href="/dashboard/billing" className={buttonVariants({ variant: "secondary" })}>
            <ArrowLeft className="size-4" />
            Back to billing
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
