import { LockKeyhole } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function FutureModuleUnavailable({
  businessId,
  moduleName,
}: {
  businessId: string;
  moduleName: string;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-lg bg-foreground/5 text-muted">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">
          {moduleName} is not part of the launch product
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          Onread is currently focused on evidence-based Website and SEO audits.
          This future module is unavailable and does not affect your Website
          Growth Score or recommendations.
        </p>
        <Link
          href={`/dashboard/businesses/${businessId}/overview`}
          className={buttonVariants({ variant: "primary", className: "mt-5" })}
        >
          Return to overview
        </Link>
      </CardContent>
    </Card>
  );
}
