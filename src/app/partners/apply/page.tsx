import type { Metadata } from "next";
import Link from "next/link";

import { withdrawPartnerApplicationAction } from "@/app/partners/apply/actions";
import { PartnerApplicationForm } from "@/app/partners/apply/partner-application-form";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { brand } from "@/lib/brand";
import { getPartnerProgramSettings } from "@/lib/partners/config";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: `Apply to the Partner Program | ${brand.name}`,
  description: "Apply for review, complete required training, and qualify as a Certified Growth Partner.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PartnerApplyPage() {
  const [user, settings] = await Promise.all([
    getCurrentUser(),
    getPartnerProgramSettings(),
  ]);
  const application = user
    ? await prisma.partnerApplication.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return (
    <MarketingShell>
      <main className="bg-[#071011] py-14 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">Partner application</p>
          <h1 className="mt-4 text-4xl font-semibold text-white">Apply for review.</h1>
          <p className="mt-5 max-w-3xl leading-7 text-slate-400">Applications are reviewed manually. Approval begins certification training; it does not immediately activate referrals or guarantee earnings.</p>

          {application && ["PENDING", "WAITLISTED"].includes(application.status) ? (
            <section className="mt-10 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-6">
              <h2 className="text-lg font-semibold text-white">Application {application.status === "PENDING" ? "under review" : "waitlisted"}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Submitted {application.submittedAt.toLocaleDateString()}. You cannot submit another active application.</p>
              <form action={withdrawPartnerApplicationAction} className="mt-5">
                <input type="hidden" name="applicationId" value={application.id} />
                <button className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.06]">Withdraw application</button>
              </form>
            </section>
          ) : application?.status === "APPROVED" ? (
            <section className="mt-10 rounded-lg border border-teal-300/25 bg-teal-300/[0.06] p-6">
              <h2 className="text-lg font-semibold text-white">Application approved</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Continue to the dashboard to complete certification requirements.</p>
              <Link href="/dashboard/partner/training" className="mt-5 inline-flex rounded-lg bg-teal-300 px-4 py-2 text-sm font-semibold text-[#052b27]">Open training</Link>
            </section>
          ) : settings.enabled && settings.applicationsOpen ? (
            <section className="mt-10 rounded-lg border border-white/10 bg-[#0d1718] p-6 sm:p-8">
              <PartnerApplicationForm defaultName={user?.name} defaultEmail={user?.email} />
              {!user ? <p className="mt-5 text-sm text-slate-400">You can complete the form now. Sign-in is required when you submit.</p> : null}
            </section>
          ) : (
            <section className="mt-10 rounded-lg border border-white/10 bg-[#0d1718] p-7">
              <h2 className="text-lg font-semibold text-white">Applications are currently closed</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">The program is currently invite-only or paused. Existing applicants can still view their status.</p>
              <Link href="/partners" className="mt-5 inline-flex text-sm font-semibold text-teal-200">Return to program overview</Link>
            </section>
          )}
        </div>
      </main>
    </MarketingShell>
  );
}
