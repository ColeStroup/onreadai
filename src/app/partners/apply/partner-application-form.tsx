"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/ui/submit-button";
import {
  submitPartnerApplicationAction,
  type PartnerApplicationState,
} from "@/app/partners/apply/actions";

const initialState: PartnerApplicationState = { status: "idle", message: "" };
const inputClass =
  "mt-2 w-full rounded-lg border border-white/15 bg-[#091314] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20";
const labelClass = "text-sm font-medium text-slate-200";

export function PartnerApplicationForm({
  defaultName,
  defaultEmail,
}: {
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const [state, action] = useActionState(
    submitPartnerApplicationAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-8" aria-describedby="application-feedback">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full text-lg font-semibold text-white">Identity</legend>
        <label className={labelClass}>
          Legal name
          <input className={inputClass} name="legalName" defaultValue={defaultName ?? ""} required maxLength={120} autoComplete="name" />
        </label>
        <label className={labelClass}>
          Public display name
          <input className={inputClass} name="displayName" defaultValue={defaultName ?? ""} required maxLength={80} />
        </label>
        <label className={labelClass}>
          Email
          <input className={inputClass} name="email" type="email" defaultValue={defaultEmail ?? ""} required maxLength={254} autoComplete="email" />
        </label>
        <label className={labelClass}>
          Country
          <select className={inputClass} name="country" defaultValue="US" required>
            <option value="US">United States</option>
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          State or region
          <input className={inputClass} name="stateOrRegion" maxLength={100} autoComplete="address-level1" />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full text-lg font-semibold text-white">Public presence</legend>
        <label className={labelClass}>
          Website, optional
          <input className={inputClass} name="websiteUrl" type="url" placeholder="https://example.com" />
        </label>
        <label className={labelClass}>
          Public social links, optional
          <textarea className={`${inputClass} min-h-28 resize-y`} name="socialProfiles" placeholder={"One URL per line\nhttps://linkedin.com/in/example"} />
        </label>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="text-lg font-semibold text-white">Experience and approach</legend>
        <label className={`block ${labelClass}`}>
          Relevant experience
          <textarea className={`${inputClass} min-h-32 resize-y`} name="experienceSummary" required minLength={40} maxLength={2500} placeholder="Tell us about your consulting, marketing, creator, sales, or business experience." />
        </label>
        <div>
          <p className={labelClass}>Intended promotion methods</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {["Professional outreach", "Educational content", "Social content", "Existing consulting clients", "Professional networking", "Optional website scanner"].map((method) => (
              <label key={method} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-300">
                <input type="checkbox" name="promotionMethod" value={method} className="size-4 accent-teal-300" />
                {method}
              </label>
            ))}
          </div>
        </div>
        <label className={`block ${labelClass}`}>
          Existing audience or outreach approach
          <textarea className={`${inputClass} min-h-32 resize-y`} name="audienceOrOutreachSummary" required minLength={40} maxLength={2500} placeholder="Who do you expect to educate or introduce to the platform, and how will you reach them responsibly?" />
        </label>
        <label className={`block ${labelClass}`}>
          Why do you want to join?
          <textarea className={`${inputClass} min-h-32 resize-y`} name="applicationMessage" required minLength={40} maxLength={2500} />
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-5">
        <legend className="px-1 text-lg font-semibold text-white">Confirmations</legend>
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
          <input type="checkbox" name="ageConfirmation" required className="mt-1 size-4 accent-teal-300" />
          I confirm that I am at least 18 years old.
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
          <input type="checkbox" name="standardsAgreement" required className="mt-1 size-4 accent-teal-300" />
          I agree to honest outreach, clear referral disclosures, privacy standards, and evidence-based product claims.
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
          <input type="checkbox" name="earningsDisclaimerAccepted" required className="mt-1 size-4 accent-teal-300" />
          I understand that approval, leads, customers, earnings, and business outcomes are not guaranteed.
        </label>
      </fieldset>

      <div id="application-feedback" aria-live="polite" className={state.message ? `rounded-lg border p-4 text-sm ${state.status === "error" ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-teal-300/30 bg-teal-300/10 text-teal-100"}` : ""}>
        {state.message}
      </div>
      <SubmitButton className="h-11 bg-teal-300 px-5 text-[#052b27] hover:bg-teal-200">Submit application</SubmitButton>
    </form>
  );
}
