import "server-only";

import { logInfo } from "@/lib/observability/log";
import { prisma } from "@/lib/prisma";

export async function createPartnerNotification(input: {
  userId: string;
  partnerId?: string | null;
  type: string;
  title: string;
  message: string;
}) {
  const notification = await prisma.partnerNotification.create({ data: input });

  if (process.env.NODE_ENV !== "production") {
    logInfo("partner_notification_created", {
      notificationId: notification.id,
      type: input.type,
      userId: input.userId,
    });
  }

  return notification;
}
