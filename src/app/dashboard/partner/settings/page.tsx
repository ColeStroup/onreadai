import { PartnerPayoutMethod } from "@prisma/client";

import { updatePartnerPayoutSettingsAction } from "@/app/dashboard/partner/settings/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requirePartner } from "@/lib/partners/authorization";

const field = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export default async function PartnerSettingsPage() {
  const { partner } = await requirePartner("/dashboard/partner/settings");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
      <Card><CardHeader><CardTitle>Payout contact</CardTitle><p className="text-sm text-muted">Store only the label and contact information an administrator needs to send a manual payout outside the platform.</p></CardHeader><CardContent><form action={updatePartnerPayoutSettingsAction} className="space-y-5"><label className="block text-sm font-medium">Preferred method<select name="payoutMethod" defaultValue={partner.payoutMethod ?? ""} required className={field}><option value="" disabled>Select method</option>{Object.values(PartnerPayoutMethod).map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></label><label className="block text-sm font-medium">Payout contact email<input name="payoutContactEmail" type="email" defaultValue={partner.payoutContactEmail ?? ""} required className={field} /></label><label className="block text-sm font-medium">Account display name, optional<input name="payoutAccountDisplayName" defaultValue={partner.payoutAccountDisplayName ?? ""} maxLength={160} className={field} /></label><label className="block text-sm font-medium">Instructions, optional<textarea name="payoutInstructions" defaultValue={partner.payoutInstructions ?? ""} maxLength={1000} className={`${field} min-h-24 resize-y`} placeholder="For example: PayPal account label or Wise contact preference. Do not enter bank or tax identifiers." /></label><SubmitButton>Save payout settings</SubmitButton></form></CardContent></Card>
      <Card><CardHeader><CardTitle>Eligibility checklist</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p><span className="text-muted">Status:</span> <strong>{partner.payoutEligibilityStatus.replaceAll("_", " ")}</strong></p><p><span className="text-muted">Minimum:</span> <strong>${(partner.minimumPayoutCents / 100).toFixed(2)} USD</strong></p><p><span className="text-muted">Commission rate:</span> <strong>{partner.commissionRateBps / 100}%</strong></p><p><span className="text-muted">Hold:</span> <strong>{partner.commissionHoldDays} days</strong></p><div className="border-t border-border pt-4 text-muted"><p>Tax information and payment credentials are handled outside this application. Never enter SSNs, tax IDs, routing numbers, account numbers, or card numbers here.</p></div></CardContent></Card>
    </div>
  );
}
