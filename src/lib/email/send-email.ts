import "server-only";

import { getResendClient } from "@/lib/email/resend-client";
import { logError, logWarn } from "@/lib/observability/log";

export type EmailDeliveryResult =
  | { delivered: true; messageId: string }
  | {
      delivered: false;
      code: "NOT_CONFIGURED" | "INVALID_CONFIGURATION" | "PROVIDER_REJECTED";
    };

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export function getEmailSenderConfiguration() {
  const name = process.env.EMAIL_FROM_NAME?.trim() || "Onread";
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  if (
    !address ||
    !replyTo ||
    !/^\S+@\S+\.\S+$/.test(address) ||
    !/^\S+@\S+\.\S+$/.test(replyTo)
  ) {
    return null;
  }

  return { from: `${name} <${address}>`, replyTo };
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<EmailDeliveryResult> {
  const resend = getResendClient();
  if (!resend) {
    return { delivered: false, code: "NOT_CONFIGURED" };
  }

  const sender = getEmailSenderConfiguration();
  if (!sender) {
    return { delivered: false, code: "INVALID_CONFIGURATION" };
  }

  try {
    const result = await resend.emails.send(
      {
        from: sender.from,
        to: input.to,
        replyTo: sender.replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (result.error || !result.data?.id) {
      logWarn("transactional_email_rejected", {
        provider: "resend",
        errorCode: result.error?.name ?? "unknown",
      });
      return { delivered: false, code: "PROVIDER_REJECTED" };
    }

    return { delivered: true, messageId: result.data.id };
  } catch (error) {
    logError("transactional_email_delivery_failed", error, {
      provider: "resend",
    });
    return { delivered: false, code: "PROVIDER_REJECTED" };
  }
}
