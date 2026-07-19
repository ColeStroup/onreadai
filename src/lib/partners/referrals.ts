import "server-only";

import { cookies } from "next/headers";

import { lockPartnerReferralAttribution } from "@/lib/partners/referral-attribution";
import {
  PARTNER_REFERRAL_COOKIE,
  verifyPartnerReferralCookie,
} from "@/lib/partners/referral-cookie";

export async function consumePartnerReferralForUser(
  userId: string,
  options: { clearCookie?: boolean } = {},
) {
  const cookieStore = await cookies();
  const payload = verifyPartnerReferralCookie(
    cookieStore.get(PARTNER_REFERRAL_COOKIE)?.value,
  );

  if (!payload) return { attributed: false, reason: "no_valid_cookie" } as const;
  const result = await lockPartnerReferralAttribution(userId, payload);

  if (options.clearCookie) cookieStore.delete(PARTNER_REFERRAL_COOKIE);
  return result;
}
