import {
  generateGrowthAuditPdf,
  growthAuditPdfFileName,
} from "@/lib/audits/pdf-report";
import { canUsePdfExport } from "@/lib/billing/entitlements";
import { buildAuditReportViewModel } from "@/lib/reports/audit-report-view-model";
import { logInfo } from "@/lib/observability/log";
import { getCurrentUser } from "@/lib/session";
import {
  currentRequestRateLimitIdentifier,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type AuditPdfRouteContext = {
  params: Promise<{
    businessId: string;
    auditId: string;
  }>;
};

export async function GET(_request: Request, { params }: AuditPdfRouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const pdfCheck = await canUsePdfExport(user.id);

  if (!pdfCheck.allowed) {
    return new Response(
      "PDF export is available on Full Audit, Starter, Pro, and Agency plans.",
      { status: 403 },
    );
  }

  const { businessId, auditId } = await params;
  try {
    await enforceRateLimit({
      scope: "pdf-export",
      identifiers: [
        user.id,
        auditId,
        await currentRequestRateLimitIdentifier(),
      ],
      limit: 30,
      windowMs: 60 * 60 * 1_000,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return new Response("Please wait before exporting another report.", {
        status: 429,
      });
    }
    throw error;
  }
  const report = await buildAuditReportViewModel({
    businessId,
    auditId,
    ownerId: user.id,
  });

  if (!report) {
    return new Response("Completed audit not found.", { status: 404 });
  }

  const pdf = await generateGrowthAuditPdf(report);
  const fileName = growthAuditPdfFileName({
    businessName: report.business.name,
    businessId: report.business.id,
    auditDate: report.audit.date,
  });
  logInfo("report_exported", {
    businessId: report.business.id,
    auditId: report.audit.id,
    format: "pdf",
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
