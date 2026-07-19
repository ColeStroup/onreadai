import { updatePartnerProgramSettingsAction } from "@/app/dashboard/admin/partners/settings/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getPartnerProgramSettings, settingsCountries } from "@/lib/partners/config";

const field = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export default async function PartnerProgramSettingsPage() {
  const settings = await getPartnerProgramSettings();
  const toggles = [
    ["enabled", "Partner Program enabled", settings.enabled],
    ["applicationsOpen", "Applications open", settings.applicationsOpen],
    ["referralAttributionEnabled", "New referral attribution", settings.referralAttributionEnabled],
    ["commissionCreationEnabled", "Commission creation", settings.commissionCreationEnabled],
    ["scannerEnabled", "Partner Scanner", settings.scannerEnabled],
    ["previewPagesEnabled", "Prospect previews", settings.previewPagesEnabled],
    ["manualPayoutWorkflowEnabled", "Manual payout workflow", settings.manualPayoutWorkflowEnabled],
  ] as const;
  const defaults = [
    ["defaultCommissionRateBps", "Commission basis points", settings.defaultCommissionRateBps, 0, 10_000],
    ["defaultRecurringCommissionMonths", "Recurring paid months", settings.defaultRecurringCommissionMonths, 0, 60],
    ["defaultReferralWindowDays", "Referral window days", settings.defaultReferralWindowDays, 1, 365],
    ["defaultCommissionHoldDays", "Hold days", settings.defaultCommissionHoldDays, 0, 180],
    ["defaultMinimumPayoutCents", "Minimum payout cents", settings.defaultMinimumPayoutCents, 0, 1_000_000],
    ["defaultScannerDailyLimit", "Daily scanner limit", settings.defaultScannerDailyLimit, 0, 1_000],
    ["defaultScannerMonthlyLimit", "Monthly scanner limit", settings.defaultScannerMonthlyLimit, 0, 25_000],
    ["scanCacheDays", "Scan cache days", settings.scanCacheDays, 1, 365],
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Program settings</CardTitle>
        <p className="text-sm text-muted">
          Environment values initialize this record once. Runtime settings control launch behavior afterward and do not rewrite historical commissions or partner-specific overrides.
        </p>
      </CardHeader>
      <CardContent>
        <form action={updatePartnerProgramSettingsAction} className="space-y-7">
          <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="col-span-full font-semibold">Feature controls</legend>
            {toggles.map(([name, label, checked]) => (
              <label key={name} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input name={name} type="checkbox" defaultChecked={checked} className="size-4 accent-accent" />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="col-span-full font-semibold">New-partner defaults</legend>
            {defaults.map(([name, label, value, min, max]) => (
              <label key={name} className="text-sm font-medium">
                {label}
                <input name={name} type="number" min={min} max={max} defaultValue={value} className={field} />
              </label>
            ))}
            <label className="text-sm font-medium">Approved countries<input name="approvedCountries" defaultValue={settingsCountries(settings).join(",")} className={field} /></label>
            <label className="text-sm font-medium">Terms version<input name="currentTermsVersion" defaultValue={settings.currentTermsVersion} className={field} /></label>
            <label className="text-sm font-medium">Training version<input name="currentTrainingVersion" defaultValue={settings.currentTrainingVersion} className={field} /></label>
          </fieldset>

          <label className="block text-sm font-medium">
            Required change reason
            <textarea name="reason" required minLength={3} maxLength={1000} className={`${field} min-h-24`} />
          </label>
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-muted">
            Enabling commission creation affects future verified payments. Updating terms or training versions requires an operational reacceptance or retraining decision.
          </div>
          <label className="flex items-start gap-3 text-sm leading-6 text-muted">
            <input name="confirmFinancialChange" type="checkbox" required className="mt-1 size-4 accent-accent" />
            I understand these controls may affect future attribution, commission calculations, scanner access, and payouts. Historical commissions are not recalculated.
          </label>
          <SubmitButton>Save program settings</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
