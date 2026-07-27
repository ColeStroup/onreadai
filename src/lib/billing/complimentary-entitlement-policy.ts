import type { ComplimentaryEntitlement } from "@prisma/client";

export type ComplimentaryEntitlementStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED";

type ComplimentaryTiming = Pick<
  ComplimentaryEntitlement,
  "startsAt" | "expiresAt" | "revokedAt"
>;

export function complimentaryEntitlementStatus(
  entitlement: ComplimentaryTiming,
  now = new Date(),
): ComplimentaryEntitlementStatus {
  if (entitlement.revokedAt) return "REVOKED";
  if (entitlement.startsAt > now) return "SCHEDULED";
  if (entitlement.expiresAt && entitlement.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

export function complimentaryEntitlementIsActive(
  entitlement: ComplimentaryTiming,
  now = new Date(),
) {
  return complimentaryEntitlementStatus(entitlement, now) === "ACTIVE";
}
