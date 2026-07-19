"use client";

import Link from "next/link";
import { useActionState } from "react";

import { runPartnerScannerAction, type ScannerActionState } from "@/app/dashboard/partner/scanner/actions";
import { SubmitButton } from "@/components/ui/submit-button";

const initial: ScannerActionState = { status: "idle", message: "" };
const field = "mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
export function PartnerScannerForm() {
  const [state, action] = useActionState(runPartnerScannerAction, initial);
  return <form action={action} className="space-y-5"><label className="block text-sm font-medium">Business name, optional<input name="businessName" maxLength={160} className={field} placeholder="Harbor & Pine" /></label><label className="block text-sm font-medium">Public website URL<input name="websiteUrl" type="url" required className={field} placeholder="https://example.com" /></label><div className="rounded-lg border border-border bg-background/50 p-4 text-xs leading-5 text-muted">This scanner checks static public website evidence on no more than four pages. It does not call AI, Places, social or review APIs, competitor systems, or the full audit generator.</div>{state.message ? <div aria-live="polite" className={`rounded-lg border p-3 text-sm ${state.status === "error" ? "border-red-400/30 bg-red-400/5 text-red-700 dark:text-red-200" : "border-emerald-400/30 bg-emerald-400/5 text-emerald-700 dark:text-emerald-200"}`}>{state.message}{state.prospectId ? <Link href={`/dashboard/partner/prospects#${state.prospectId}`} className="ml-2 font-semibold underline">View prospect</Link> : null}</div> : null}<SubmitButton pendingLabel="Scanning public pages...">Run lightweight scan</SubmitButton></form>;
}
