"use client";

import { Flag, LoaderCircle } from "lucide-react";
import { useActionState, useId } from "react";

import {
  reportAuditFindingFeedback,
  type FindingFeedbackActionState,
} from "@/app/dashboard/businesses/[businessId]/audit/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: FindingFeedbackActionState = {
  status: "idle",
  message: "",
};

const reasons = [
  ["INCORRECT", "Incorrect"],
  ["ALREADY_FIXED", "Already fixed"],
  ["NOT_RELEVANT", "Not relevant"],
  ["UNABLE_TO_UNDERSTAND", "Unable to understand"],
  ["DUPLICATE", "Duplicate"],
  ["TOO_MINOR", "Too minor"],
  ["WRONG_PAGE", "Wrong page"],
  ["WRONG_EVIDENCE", "Wrong evidence"],
] as const;

export function FindingFeedbackForm({
  businessId,
  auditId,
  findingId,
}: {
  businessId: string;
  auditId: string;
  findingId: string;
}) {
  const [state, action, pending] = useActionState(
    reportAuditFindingFeedback,
    initialState,
  );
  const reasonId = useId();
  const commentId = useId();

  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 font-medium text-muted hover:text-foreground">
        <Flag className="size-4" aria-hidden="true" />
        Report a problem with this finding
      </summary>
      <form action={action} className="mt-3 max-w-xl space-y-3 border-l border-border pl-4">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="auditId" value={auditId} />
        <input type="hidden" name="findingId" value={findingId} />
        <div>
          <label htmlFor={reasonId} className="block font-medium">
            What seems wrong?
          </label>
          <select
            id={reasonId}
            name="reason"
            required
            defaultValue=""
            className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-3"
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {reasons.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={commentId} className="block font-medium">
            Details (optional)
          </label>
          <textarea
            id={commentId}
            name="comment"
            maxLength={1_000}
            rows={3}
            className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2"
            placeholder="Tell us what the page actually shows."
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Flag className="size-4" aria-hidden="true" />
            )}
            Submit report
          </button>
          {state.message ? (
            <p
              className={state.status === "error" ? "text-danger" : "text-muted"}
              role="status"
            >
              {state.message}
            </p>
          ) : null}
        </div>
      </form>
    </details>
  );
}
