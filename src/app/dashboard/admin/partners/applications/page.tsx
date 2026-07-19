import { reviewPartnerApplicationAction } from "@/app/dashboard/admin/partners/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

const actionClass = "rounded-lg border border-border px-4 py-2 text-sm font-semibold";

export default async function PartnerApplicationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requested = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Math.max(1, Number.isFinite(requested) ? requested : 1);
  const applications = await prisma.partnerApplication.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: { submittedAt: "desc" },
    skip: (page - 1) * 25,
    take: 25,
  });

  return (
    <div className="space-y-5">
      {applications.length ? (
        applications.map((application) => (
          <Card key={application.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{application.displayName}</CardTitle>
                <p className="mt-2 text-sm text-muted">
                  {application.email} · {application.country}
                  {application.stateOrRegion ? ` / ${application.stateOrRegion}` : ""} · Submitted {application.submittedAt.toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full border border-border px-2 py-1 text-xs">
                {application.status}
              </span>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 text-sm lg:grid-cols-3">
                <div>
                  <p className="font-semibold">Experience</p>
                  <p className="mt-2 leading-6 text-muted">{application.experienceSummary}</p>
                </div>
                <div>
                  <p className="font-semibold">Audience and outreach</p>
                  <p className="mt-2 leading-6 text-muted">{application.audienceOrOutreachSummary}</p>
                </div>
                <div>
                  <p className="font-semibold">Why join</p>
                  <p className="mt-2 leading-6 text-muted">{application.applicationMessage}</p>
                </div>
              </div>

              {application.status === "PENDING" || application.status === "WAITLISTED" ? (
                <form
                  action={reviewPartnerApplicationAction}
                  className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input
                    name="reason"
                    required
                    minLength={3}
                    maxLength={2000}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Required review reason or internal note"
                  />
                  <button
                    name="decision"
                    value="APPROVE"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button name="decision" value="WAITLIST" className={actionClass}>
                    Waitlist
                  </button>
                  <button
                    name="decision"
                    value="REJECT"
                    className={`${actionClass} border-red-400/30 text-red-600`}
                  >
                    Reject
                  </button>
                </form>
              ) : application.reviewNotes ? (
                <p className="border-t border-border pt-4 text-sm text-muted">
                  Review note: {application.reviewNotes}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted">
            No applications found.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
