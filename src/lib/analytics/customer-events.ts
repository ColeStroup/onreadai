export const customerEventNames = [
  "overview_primary_action_clicked",
  "overview_evidence_expanded",
  "overview_coverage_expanded",
  "overview_view_all_findings_clicked",
  "task_started",
  "task_continued",
  "finding_opened",
  "consultant_prompt_selected",
  "setup_step_completed",
  "category_opened",
  "empty_state_action_clicked",
  "top_action_viewed",
  "implementation_help_opened",
  "consultant_started",
  "recommendation_marked_in_progress",
  "verification_started",
  "finding_verified_fixed",
  "report_exported",
  "specialist_help_requested",
] as const;

export type CustomerEventName = (typeof customerEventNames)[number];

export const customerEventSurfaces = [
  "business_overview",
  "business_navigation",
  "guided_setup",
  "audit_findings",
  "action_plan",
  "consultant",
  "category",
  "empty_state",
  "billing",
  "settings",
  "report",
  "progress",
  "specialist",
] as const;

export type CustomerEventSurface = (typeof customerEventSurfaces)[number];

export function isCustomerEventName(
  value: unknown,
): value is CustomerEventName {
  return (
    typeof value === "string" &&
    customerEventNames.includes(value as CustomerEventName)
  );
}

export function isCustomerEventSurface(
  value: unknown,
): value is CustomerEventSurface {
  return (
    typeof value === "string" &&
    customerEventSurfaces.includes(value as CustomerEventSurface)
  );
}
