import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ReportQualityNotice({ businessId }: { businessId: string }) {
  return (
    <Card className="mx-auto max-w-3xl p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-xl font-semibold">
        This report needs a quality review
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        Onread found a mismatch while preparing this audit, so the report is
        hidden rather than showing information that may be inaccurate. Your
        audit evidence is still saved.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={`/dashboard/businesses/${businessId}/audit/run`}
          className={buttonVariants({ variant: "primary" })}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Run a new audit
        </Link>
        <Link
          href="/dashboard/help"
          className={buttonVariants({ variant: "outline" })}
        >
          Get help
        </Link>
      </div>
    </Card>
  );
}
