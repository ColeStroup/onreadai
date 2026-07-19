import { onreadEmailLayout, safeEmailValue } from "@/lib/email/templates/shared";

export function passwordResetEmail(resetUrl: string) {
  const safeResetUrl = safeEmailValue(resetUrl);
  const previewText = "Use this secure link to reset your Onread password.";
  const subject = "Reset your Onread password";
  const html = onreadEmailLayout({
    previewText,
    heading: "Reset your password",
    bodyHtml: `
      <p style="margin:0 0 22px;color:#425452;font-size:16px;line-height:1.65;">We received a request to reset your Onread password. This link expires in 30 minutes and can be used once.</p>
      <p style="margin:0 0 24px;"><a href="${safeResetUrl}" style="display:inline-block;border-radius:8px;background:#0f766e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 20px;">Reset password</a></p>
      <p style="margin:0 0 12px;color:#687876;font-size:13px;line-height:1.6;word-break:break-all;">If the button does not work, open this link:<br><a href="${safeResetUrl}" style="color:#0f766e;">${safeResetUrl}</a></p>
      <p style="margin:0;color:#687876;font-size:14px;line-height:1.6;">If you did not request a password reset, you can ignore this email.</p>
    `,
  });
  const text = [
    "Reset your password",
    "",
    "We received a request to reset your Onread password.",
    "Open this secure link:",
    resetUrl,
    "",
    "This link expires in 30 minutes and can be used once.",
    "If you did not request a password reset, you can ignore this email.",
    "",
    "Need help? Reply to this email or contact support@onread.ai.",
  ].join("\n");

  return { subject, previewText, html, text };
}
