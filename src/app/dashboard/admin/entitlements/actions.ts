"use server";

import { revalidatePath } from "next/cache";

import {
  ComplimentaryEntitlementError,
  createComplimentaryEntitlement,
  revokeComplimentaryEntitlement,
} from "@/lib/billing/complimentary-entitlements";
import type { EntitlementActionState } from "@/lib/billing/entitlement-action-state";
import { logError } from "@/lib/observability/log";
import { requireAdmin } from "@/lib/partners/authorization";

export async function createComplimentaryEntitlementAction(
  targetUserId: string,
  _previousState: EntitlementActionState,
  formData: FormData,
): Promise<EntitlementActionState> {
  const admin = await requireAdmin(
    `/dashboard/admin/entitlements/${targetUserId}`,
  );

  try {
    const startType = String(formData.get("startType") ?? "IMMEDIATE");
    const expirationType = String(
      formData.get("expirationType") ?? "NONE",
    );
    const startsAt =
      startType === "SCHEDULED"
        ? parseUtcDate(formData.get("startsAt"), "Enter a valid UTC start time.")
        : undefined;
    const expiresAt =
      expirationType === "CUSTOM"
        ? parseUtcDate(
            formData.get("expiresAt"),
            "Enter a valid UTC expiration time.",
          )
        : null;

    await createComplimentaryEntitlement({
      adminUserId: admin.id,
      targetUserId,
      plan: formData.get("plan"),
      source: formData.get("source"),
      reason: String(formData.get("reason") ?? ""),
      internalNotes: String(formData.get("internalNotes") ?? ""),
      startsAt,
      expiresAt,
      confirmSupersede: formData.get("confirmSupersede") === "on",
    });

    revalidateEntitlementPaths(targetUserId);
    return {
      status: "success",
      message: "Complimentary access granted.",
    };
  } catch (error) {
    return actionError(
      error,
      "complimentary_entitlement_grant_failed",
      "Complimentary access could not be granted.",
    );
  }
}

export async function revokeComplimentaryEntitlementAction(
  targetUserId: string,
  entitlementId: string,
  _previousState: EntitlementActionState,
  formData: FormData,
): Promise<EntitlementActionState> {
  const admin = await requireAdmin(
    `/dashboard/admin/entitlements/${targetUserId}`,
  );

  try {
    await revokeComplimentaryEntitlement({
      adminUserId: admin.id,
      entitlementId,
      reason: String(formData.get("reason") ?? ""),
    });

    revalidateEntitlementPaths(targetUserId);
    return {
      status: "success",
      message: "Complimentary access revoked.",
    };
  } catch (error) {
    return actionError(
      error,
      "complimentary_entitlement_revoke_failed",
      "Complimentary access could not be revoked.",
    );
  }
}

function parseUtcDate(value: FormDataEntryValue | null, message: string) {
  const text = String(value ?? "").trim();
  const date = new Date(text.endsWith("Z") ? text : `${text}Z`);

  if (!text || !Number.isFinite(date.getTime())) {
    throw new ComplimentaryEntitlementError(message, "INVALID_DATE");
  }

  return date;
}

function revalidateEntitlementPaths(targetUserId: string) {
  revalidatePath("/dashboard/admin/entitlements");
  revalidatePath(`/dashboard/admin/entitlements/${targetUserId}`);
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
}

function actionError(
  error: unknown,
  event: string,
  fallback: string,
): EntitlementActionState {
  if (error instanceof ComplimentaryEntitlementError) {
    return { status: "error", message: error.message };
  }

  logError(event, error);
  return { status: "error", message: fallback };
}
