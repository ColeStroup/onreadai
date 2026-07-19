import { onreadEmailLayout } from "@/lib/email/templates/shared";

export function verificationCodeEmail(code: string) {
  const previewText = "Use this code to finish creating your Onread account.";
  const subject = "Your Onread verification code";
  const html = onreadEmailLayout({
    previewText,
    heading: "Verify your email",
    bodyHtml: `
      <p style="margin:0 0 22px;color:#425452;font-size:16px;line-height:1.65;">Enter this code to finish creating your Onread account.</p>
      <div style="margin:0 0 22px;border:1px solid #b8d9d5;background:#eefaf8;border-radius:10px;padding:20px;text-align:center;font-size:34px;font-weight:700;letter-spacing:8px;color:#0b5f58;">${code}</div>
      <p style="margin:0 0 12px;color:#425452;font-size:15px;line-height:1.6;">This code expires in 10 minutes.</p>
      <p style="margin:0;color:#687876;font-size:14px;line-height:1.6;">If you did not create an Onread account, you can ignore this email.</p>
    `,
  });
  const text = [
    "Verify your email",
    "",
    "Enter this code to finish creating your Onread account:",
    code,
    "",
    "This code expires in 10 minutes.",
    "If you did not create an Onread account, you can ignore this email.",
    "",
    "Need help? Reply to this email or contact support@onread.ai.",
  ].join("\n");

  return { subject, previewText, html, text };
}
