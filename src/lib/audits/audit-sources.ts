import { BusinessProfileStatus } from "@prisma/client";

export function approvedBusinessProfilesForAudit<
  T extends {
    status: BusinessProfileStatus;
    url?: string | null;
    handle?: string | null;
  },
>(profiles: T[]) {
  return profiles.filter(
    (profile) =>
      profile.status === BusinessProfileStatus.CONFIRMED &&
      Boolean(profile.url?.trim() || profile.handle?.trim()),
  );
}
