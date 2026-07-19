function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeEmailValue(value: string) {
  return escapeHtml(value);
}

export function onreadEmailLayout(input: {
  previewText: string;
  heading: string;
  bodyHtml: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;background:#edf2f2;color:#152221;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.previewText)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf2f2;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dce5e4;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#081313;padding:22px 28px;color:#ffffff;font-size:18px;font-weight:700;">${escapeHtml(brand.name)}</td>
            </tr>
            <tr>
              <td style="padding:34px 28px 30px;">
                <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#102321;">${escapeHtml(input.heading)}</h1>
                ${input.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5eceb;padding:20px 28px;color:#5d6e6c;font-size:13px;line-height:1.6;">
                Need help? Reply to this email or contact
                <a href="mailto:support@onread.ai" style="color:#0f766e;">support@onread.ai</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
import { brand } from "@/lib/brand";
