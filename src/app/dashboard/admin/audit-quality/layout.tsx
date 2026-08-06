import type { ReactNode } from "react";

import { requireAdmin } from "@/lib/partners/authorization";

export default async function AuditQualityAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdmin("/dashboard/admin/audit-quality");
  return <div className="mx-auto w-full max-w-7xl">{children}</div>;
}
