import {
  AiOperationType,
  AiUsageStatus,
  AuditFindingFeedbackStatus,
  AuditStatus,
} from "@prisma/client";
import { Activity, Bot, Flag, MonitorCheck, ShieldCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { readCanonicalAuditReport } from "@/lib/reports/canonical-audit-report";

type ValidationDecision = {
  stableFindingKey: string;
  ruleId: string;
  rootCauseKey: string;
  claim: string;
  state: string;
  reasonCode: string;
  finalClassification: string;
  confidence: number;
  materiality: string;
  scoreEligible: boolean;
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
};

export default async function AuditQualityAdminPage() {
  const [feedback, audits, validationUsage] = await Promise.all([
    prisma.auditFindingFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        business: { select: { name: true } },
        finding: {
          select: {
            title: true,
            category: true,
            sourceUrl: true,
          },
        },
      },
    }),
    prisma.audit.findMany({
      where: { status: AuditStatus.COMPLETED },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: {
        id: true,
        completedAt: true,
        analysisSnapshot: true,
        business: { select: { name: true } },
      },
    }),
    prisma.auditAiUsage.findMany({
      where: { operationType: AiOperationType.FINDING_VALIDATION },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        status: true,
        retryCount: true,
        cacheHit: true,
        totalTokens: true,
      },
    }),
  ]);
  const validationRuns = audits.flatMap((audit) => {
    const validation = auditValidation(audit.analysisSnapshot);
    return validation
      ? [
          {
            ...validation,
            auditId: audit.id,
            businessName: audit.business.name,
            fetchQuality: fetchQualitySummary(audit.analysisSnapshot),
          },
        ]
      : [];
  });
  const canonicalReports = audits.flatMap((audit) => {
    const report = readCanonicalAuditReport(audit.analysisSnapshot);
    return report
      ? [{ report, businessName: audit.business.name }]
      : [];
  });
  const reportsNeedingReview = canonicalReports.filter(
    ({ report }) => report.integrity.status === "NEEDS_REVIEW",
  ).length;
  const decisions = validationRuns.flatMap((run) =>
    run.decisions.slice(0, 30).map((decision) => ({ ...decision, run })),
  );
  const pendingFeedback = feedback.filter(
    (item) => item.status === AuditFindingFeedbackStatus.PENDING,
  ).length;
  const suppressed = decisions.filter((item) =>
    item.state.startsWith("SUPPRESSED_"),
  ).length;
  const contradictions = decisions.filter(
    (item) => item.contradictoryEvidenceIds.length > 0,
  ).length;
  const renderedPages = validationRuns.reduce(
    (total, run) => total + (run.fetchQuality?.renderedPages ?? 0),
    0,
  );
  const renderFailures = validationRuns.reduce(
    (total, run) => total + (run.fetchQuality?.renderedFallbackFailures ?? 0),
    0,
  );
  const failedAiReviews = validationUsage.filter(
    (item) =>
      item.status === AiUsageStatus.FAILED ||
      item.status === AiUsageStatus.VALIDATION_REJECTED,
  ).length;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold text-accent">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold">Audit quality</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Inspect validation decisions, contradiction handling, score eligibility,
          and owner feedback. This view never changes a finding or score automatically.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric icon={Activity} label="Recent validation runs" value={validationRuns.length} />
        <Metric icon={ShieldCheck} label="Suppressed candidates" value={suppressed} />
        <Metric icon={MonitorCheck} label="Contradictions found" value={contradictions} />
        <Metric icon={Bot} label="AI review failures" value={failedAiReviews} />
        <Metric icon={Flag} label="Feedback awaiting review" value={pendingFeedback} />
        <Metric icon={Flag} label="Reports needing review" value={reportsNeedingReview} />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold">Fetch and review diagnostics</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          <AdminFact label="Rendered pages" value={String(renderedPages)} />
          <AdminFact label="Render failures" value={String(renderFailures)} />
          <AdminFact label="AI validation calls" value={String(validationUsage.length)} />
          <AdminFact
            label="AI validation tokens"
            value={String(
              validationUsage.reduce((total, item) => total + item.totalTokens, 0),
            )}
          />
        </dl>
      </Card>

      <section aria-labelledby="score-trace-title">
        <h2 id="score-trace-title" className="text-xl font-semibold">
          Canonical score trace
        </h2>
        <p className="mt-1 text-sm text-muted">
          Each deduction is tied to one validated root cause and its saved evidence.
        </p>
        <div className="mt-3 space-y-3">
          {canonicalReports.slice(0, 12).map(({ report, businessName }) => (
            <Card key={report.auditId} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{businessName}</p>
                  <p className="mt-1 text-xs text-muted">
                    {report.auditId} / {report.reportVersion}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
                  {label(report.integrity.status)}
                </span>
              </div>
              {report.integrity.issues.length > 0 ? (
                <p className="mt-3 text-xs text-muted">
                  Integrity diagnostics: {report.integrity.issues.map((issue) => `${issue.code}: ${issue.message}`).join(" | ")}
                </p>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-border uppercase text-muted">
                    <tr>
                      <th className="px-2 py-2">Finding</th>
                      <th className="px-2 py-2">Root cause</th>
                      <th className="px-2 py-2">Classification</th>
                      <th className="px-2 py-2">Deduction / cap</th>
                      <th className="px-2 py-2">Final category result</th>
                      <th className="px-2 py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.appendix.scoreTrace.map((trace) => (
                      <tr key={`${trace.category}:${trace.rootCauseKey}`}>
                        <td className="px-2 py-2">{trace.findingId ?? "Unlinked"}</td>
                        <td className="px-2 py-2">{trace.rootCauseKey}</td>
                        <td className="px-2 py-2">{label(trace.classification ?? "Unclassified")}</td>
                        <td className="px-2 py-2">-{trace.deduction} / {trace.cap}</td>
                        <td className="px-2 py-2">
                          {report.scores.find(
                            (score) => score.category === trace.category,
                          )?.score ?? "Not scored"}
                        </td>
                        <td className="px-2 py-2">{trace.evidenceIds.join(", ") || "None"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
          {canonicalReports.length === 0 ? (
            <Card className="p-8 text-center text-muted">
              No canonical v4 reports have been generated yet.
            </Card>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="feedback-title">
        <h2 id="feedback-title" className="text-xl font-semibold">
          Owner feedback
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Finding</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {feedback.map((item) => (
                <tr key={item.id}>
                  <td className="max-w-md px-4 py-3">
                    <p className="font-medium">{item.finding.title}</p>
                    <p className="mt-1 text-xs text-muted">
                      {label(item.finding.category)}
                      {item.finding.sourceUrl ? ` / ${item.finding.sourceUrl}` : ""}
                    </p>
                    {item.comment ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted">
                        {item.comment}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{label(item.reason)}</td>
                  <td className="px-4 py-3">{label(item.status)}</td>
                  <td className="px-4 py-3">{item.business.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {item.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {feedback.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    No finding feedback has been submitted.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="decisions-title">
        <h2 id="decisions-title" className="text-xl font-semibold">
          Validation decisions
        </h2>
        <div className="mt-3 space-y-3">
          {decisions.slice(0, 60).map(({ run, ...decision }) => (
            <Card key={`${run.auditId}:${decision.stableFindingKey}`} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{decision.claim}</p>
                  <p className="mt-1 break-words text-xs text-muted">
                    {run.businessName} / {decision.ruleId} / {decision.rootCauseKey}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold">
                  {label(decision.state)}
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                <AdminFact label="Classification" value={label(decision.finalClassification)} />
                <AdminFact label="Confidence" value={`${Math.round(decision.confidence * 100)}%`} />
                <AdminFact label="Materiality" value={label(decision.materiality)} />
                <AdminFact label="Score impact" value={decision.scoreEligible ? "Eligible" : "None"} />
                <AdminFact
                  label="Evidence"
                  value={`${decision.supportingEvidenceIds.length} support / ${decision.contradictoryEvidenceIds.length} contradiction`}
                />
              </dl>
              <p className="mt-3 text-xs text-muted">
                Reason: {label(decision.reasonCode)} / AI: {aiDecision(decision)} /
                Pipeline: {run.pipelineVersion} / Fixture: {fixtureForRule(decision.ruleId)}
              </p>
            </Card>
          ))}
          {decisions.length === 0 ? (
            <Card className="p-8 text-center text-muted">
              No validation-v2 snapshots are available yet. Run an allowlisted shadow audit first.
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Metric({
  icon: Icon,
  label: text,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <Icon className="size-5 text-accent" aria-hidden="true" />
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </Card>
  );
}

function AdminFact({ label: text, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted">{text}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function auditValidation(value: unknown) {
  if (!isRecord(value) || !isRecord(value.auditValidation)) return null;
  const snapshot = value.auditValidation;
  if (
    typeof snapshot.pipelineVersion !== "string" ||
    typeof snapshot.mode !== "string" ||
    !Array.isArray(snapshot.decisions)
  ) {
    return null;
  }
  return {
    pipelineVersion: snapshot.pipelineVersion,
    mode: snapshot.mode,
    decisions: snapshot.decisions.filter(isValidationDecision),
  };
}

function fetchQualitySummary(value: unknown) {
  if (!isRecord(value) || !isRecord(value.websiteCrawl)) return null;
  const summary = value.websiteCrawl.fetchQualitySummary;
  if (!isRecord(summary)) return null;
  return {
    renderedPages: numberValue(summary.renderedPages),
    renderedFallbackFailures: numberValue(summary.renderedFallbackFailures),
  };
}

function isValidationDecision(value: unknown): value is ValidationDecision {
  return (
    isRecord(value) &&
    typeof value.stableFindingKey === "string" &&
    typeof value.ruleId === "string" &&
    typeof value.rootCauseKey === "string" &&
    typeof value.claim === "string" &&
    typeof value.state === "string" &&
    typeof value.reasonCode === "string" &&
    typeof value.finalClassification === "string" &&
    typeof value.confidence === "number" &&
    typeof value.materiality === "string" &&
    typeof value.scoreEligible === "boolean" &&
    Array.isArray(value.supportingEvidenceIds) &&
    Array.isArray(value.contradictoryEvidenceIds)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function aiDecision(decision: ValidationDecision) {
  return decision.reasonCode.startsWith("AI_")
    ? label(decision.reasonCode)
    : "Not required";
}

function fixtureForRule(ruleId: string) {
  return ruleId.includes("contact-path") ? "just-pie-orlando" : "not linked";
}
