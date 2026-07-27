"use client";

import { CalendarClock, Gift, ShieldX } from "lucide-react";
import { useActionState, useId, useRef, useState } from "react";

import {
  createComplimentaryEntitlementAction,
  revokeComplimentaryEntitlementAction,
} from "@/app/dashboard/admin/entitlements/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialEntitlementActionState } from "@/lib/billing/entitlement-action-state";

const fieldClass =
  "flex min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";

export function ComplimentaryGrantForm({
  targetUserId,
  targetLabel,
  hasOverlappingGrant,
}: {
  targetUserId: string;
  targetLabel: string;
  hasOverlappingGrant: boolean;
}) {
  const formId = `grant-${useId().replaceAll(":", "")}`;
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [startType, setStartType] = useState("IMMEDIATE");
  const [expirationType, setExpirationType] = useState("NONE");
  const boundAction = createComplimentaryEntitlementAction.bind(
    null,
    targetUserId,
  );
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialEntitlementActionState,
  );

  function reviewGrant() {
    if (formRef.current?.reportValidity()) setConfirming(true);
  }

  function confirmGrant() {
    formRef.current?.requestSubmit();
    setConfirming(false);
  }

  return (
    <>
      <form
        ref={formRef}
        id={formId}
        action={formAction}
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Plan
            <select name="plan" defaultValue="PRO" className={`${fieldClass} mt-2`}>
              <option value="STARTER">Starter</option>
              <option value="PRO">Pro</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Source
            <select
              name="source"
              defaultValue="MANUAL_ADMIN"
              className={`${fieldClass} mt-2`}
            >
              <option value="FOUNDER">Founder</option>
              <option value="INTERNAL">Internal</option>
              <option value="BETA">Beta</option>
              <option value="PROMOTION">Promotion</option>
              <option value="CUSTOMER_SUPPORT">Customer support</option>
              <option value="MANUAL_ADMIN">Manual admin</option>
            </select>
          </label>
        </div>

        <label className="block text-sm font-medium">
          Reason
          <Input
            name="reason"
            required
            maxLength={1000}
            className="mt-2"
            placeholder="Founder/internal account"
          />
        </label>

        <label className="block text-sm font-medium">
          Internal notes, optional
          <textarea
            name="internalNotes"
            maxLength={5000}
            className={`${fieldClass} mt-2 min-h-24 resize-y`}
            placeholder="Visible only to authorized administrators."
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Start
            <select
              name="startType"
              value={startType}
              onChange={(event) => setStartType(event.target.value)}
              className={`${fieldClass} mt-2`}
            >
              <option value="IMMEDIATE">Immediately</option>
              <option value="SCHEDULED">Schedule for later</option>
            </select>
          </label>
          {startType === "SCHEDULED" ? (
            <label className="block text-sm font-medium">
              Start time (UTC)
              <Input
                name="startsAt"
                type="datetime-local"
                required
                className="mt-2"
              />
            </label>
          ) : (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted">
              <CalendarClock className="mb-2 size-4 text-accent" />
              Access starts when the grant is confirmed.
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Expiration
            <select
              name="expirationType"
              value={expirationType}
              onChange={(event) => setExpirationType(event.target.value)}
              className={`${fieldClass} mt-2`}
            >
              <option value="NONE">No expiration</option>
              <option value="CUSTOM">Custom expiration</option>
            </select>
          </label>
          {expirationType === "CUSTOM" ? (
            <label className="block text-sm font-medium">
              Expiration time (UTC)
              <Input
                name="expiresAt"
                type="datetime-local"
                required
                className="mt-2"
              />
            </label>
          ) : (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted">
              The grant remains active until an administrator revokes it.
            </div>
          )}
        </div>

        {hasOverlappingGrant ? (
          <label className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
            <input
              type="checkbox"
              name="confirmSupersede"
              required
              className="mt-1 size-4"
            />
            I understand this may overlap an existing active or scheduled
            complimentary grant. Existing history will be preserved.
          </label>
        ) : null}

        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "text-sm font-medium text-rose-600 dark:text-rose-300"
                : "text-sm font-medium text-teal-700 dark:text-teal-300"
            }
          >
            {state.message}
          </p>
        ) : null}

        <Button type="button" onClick={reviewGrant}>
          <Gift className="size-4" />
          Grant complimentary access
        </Button>
      </form>

      {confirming ? (
        <ConfirmationDialog
          title={`Grant complimentary access to ${targetLabel}?`}
          description="This grants Onread access without creating a Stripe subscription or charging the user."
          confirmLabel={pending ? "Granting..." : "Grant complimentary access"}
          formId={formId}
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={confirmGrant}
        />
      ) : null}
    </>
  );
}

export function ComplimentaryRevokeForm({
  targetUserId,
  entitlementId,
  planLabel,
}: {
  targetUserId: string;
  entitlementId: string;
  planLabel: string;
}) {
  const formId = `revoke-${useId().replaceAll(":", "")}`;
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);
  const boundAction = revokeComplimentaryEntitlementAction.bind(
    null,
    targetUserId,
    entitlementId,
  );
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialEntitlementActionState,
  );

  function reviewRevocation() {
    if (formRef.current?.reportValidity()) setConfirming(true);
  }

  function confirmRevocation() {
    formRef.current?.requestSubmit();
    setConfirming(false);
  }

  return (
    <>
      <form
        ref={formRef}
        id={formId}
        action={formAction}
        className="mt-4 border-t border-border pt-4"
      >
        <label className="block text-sm font-medium">
          Revocation reason
          <Input
            name="reason"
            required
            maxLength={1000}
            className="mt-2"
            placeholder="Reason for ending this access"
          />
        </label>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={
              state.status === "error"
                ? "mt-2 text-sm font-medium text-rose-600 dark:text-rose-300"
                : "mt-2 text-sm font-medium text-teal-700 dark:text-teal-300"
            }
          >
            {state.message}
          </p>
        ) : null}
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="mt-3"
          onClick={reviewRevocation}
        >
          <ShieldX className="size-4" />
          Revoke access
        </Button>
      </form>

      {confirming ? (
        <ConfirmationDialog
          title={`Revoke complimentary ${planLabel} access?`}
          description="Access will fall back to the user's next valid paid or complimentary plan. The grant and audit history will be preserved."
          confirmLabel={pending ? "Revoking..." : "Revoke access"}
          formId={formId}
          pending={pending}
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={confirmRevocation}
        />
      ) : null}
    </>
  );
}

function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  formId,
  pending,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  formId: string;
  pending: boolean;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        aria-describedby={`${formId}-description`}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 id={`${formId}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        <p
          id={`${formId}-description`}
          className="mt-2 text-sm leading-6 text-muted"
        >
          {description}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? "danger" : "primary"}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
