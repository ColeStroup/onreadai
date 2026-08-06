# Audit Quality Rollout v1

## Flags

All new behavior defaults off:

- `AUDIT_VALIDATION_PIPELINE_V2_ENABLED`
- `AUDIT_AI_FINDING_REVIEW_ENABLED`
- `AUDIT_RENDERED_FETCH_FALLBACK_ENABLED`
- `AUDIT_PLAIN_LANGUAGE_V2_ENABLED`
- `AUDIT_TARGETED_VERIFICATION_V1_ENABLED`

Each flag supports an optional comma-separated `*_BUSINESS_IDS` allowlist. The proven contact extraction correction is also present in the legacy path so the known false positive is not preserved.

## Staged Promotion

1. Deploy schema and application with all flags false.
2. Run fixture and compatibility suites. Confirm legacy audits still render.
3. Allowlist internal test businesses for shadow comparison. Validation snapshots are saved but customer findings and scores stay unchanged.
4. Review disagreements, suppression reasons, extraction completeness, render fallback failures, score deltas, and owner feedback in `/dashboard/admin/audit-quality`.
5. Enable rendered fallback and AI review only for bounded tenants after security and cost review.
6. Enable validation and plain-language output for a small cohort. Compare repeat audits and all report surfaces.
7. Expand only after representative restaurant, service, ecommerce, professional, creator, multi-location, JavaScript-heavy, small, and content-heavy sites pass manual review.

## Rollback

Set the relevant flag to `false` and remove its allowlist. No data rollback is required: legacy readers ignore v2 metadata, and relational findings remain valid records. Do not delete snapshots or feedback during rollback. If the migration itself must be reversed, first deploy code that no longer reads the feedback model; production enum values should generally be left in place.

## Security And Telemetry

Rendered requests keep SSRF, same-host navigation, popup, download, timeout, and byte protections. AI receives compact structured evidence, never whole raw sites. Telemetry stores IDs, versions, decisions, counts, usage, costs, and safe failure codes, not prompts, page bodies, messages, credentials, or tokens.

## Deferred Work

Before broad production promotion, complete the manual QA matrix, browser availability/capacity testing, PDF visual baselines, mobile presentation screenshots, dedicated targeted-verification UI, admin feedback resolution actions, and longer-term finding-flap analytics across production re-audits.

