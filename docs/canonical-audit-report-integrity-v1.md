# Canonical Audit Report Integrity v1

## Purpose

New Website and SEO audits finalize one immutable report result before any customer surface renders it. The contract prevents counts, page attribution, classifications, recommendations, and scores from changing between Overview, Audit, Action Plan, PDF, Presentation Mode, progress comparison, the AI Consultant, Implementation Help, email projections, and the public example.

The saved report version is `audit-report-v4-canonical-integrity`.

## Source Of Truth

The audit pipeline still saves analyzer snapshots, database findings, and recommendation rows for operations and historical compatibility. Those records are inputs, not independent report outputs.

The finalization sequence is:

1. Deterministic and selective AI analysis completes.
2. `buildAuditReportViewModel` assembles the selected audit without attaching a compatibility report.
3. `buildCanonicalAuditReport` validates pages, evidence, findings, recommendations, counts, and score impact in strict mode.
4. The finalized object is saved at `Audit.analysisSnapshot.canonicalAuditReport`.
5. The audit score rows and summary are updated to the finalized values.
6. Customer surfaces call `readCanonicalAuditReport` and `materializeCanonicalReport` instead of rebuilding report claims.

Only live recommendation status is overlaid after finalization. Completing or dismissing an action does not rewrite the saved evidence, title, classification, priority, or affected pages.

## Evidence Binding

Canonical pages use a stable page ID, normalized URL identity, final URL, short path, and display label. Findings and recommendations link through finding IDs, root-cause keys, evidence IDs, and canonical page IDs.

Display order, array indexes, page labels, and broad category matches are never evidence joins. A label such as `Order Inquiries` cannot cause evidence from `Merchandise Shop` to move to that page.

Strict finalization verifies:

- every affected page exists in the saved audit page set;
- every evidence ID exists;
- page evidence belongs to the referenced canonical URL;
- Website and SEO recommendations reference a published finding;
- malformed or external URLs are not published as audited pages; and
- duplicate page identities do not create duplicate records.

An invalid finding is excluded from customer output and cannot affect a score.

## Count Derivation

`CanonicalFactsSummary` is derived once from canonical analyzed page records. It owns pages scanned, successful and failed pages, missing titles, missing descriptions, H1 issues, images and missing alt text, action-link coverage, and CTA-assessment coverage.

Overview, Website, SEO, PDF, Presentation Mode, Consultant context, specialist scope, email projection, and the public example read these fields. They do not recount page arrays or analyzer prose. Strict finalization compares saved summary counts with the page-derived values and marks a mismatch for review.

## Recommendation Consolidation

Recommendations are grouped after validation by canonical root cause. Equivalent wording such as "write search summaries" and "add meta descriptions" cannot create separate actions for the same root.

Each final recommendation contains its source finding IDs, affected pages, evidence IDs, confidence, completion criteria, verification method, and specialist category. The priority list contains at most three high- or medium-confidence actions with distinct root-cause keys. It may contain fewer than three when the evidence does not support three useful actions.

## Classification Rules

- `VERIFIED_TECHNICAL_ISSUE`: an objective requirement is missing, invalid, broken, or confidently malfunctioning.
- `AI_REVIEWED_OPPORTUNITY`: an existing element works but could communicate or convert better.
- `OPTIONAL_REFINEMENT`: incremental polish with no material score deduction.
- `VERIFIED_STRENGTH`: supported positive evidence.
- `COVERAGE_NOTE`: factual scope information with no score impact.
- `LIMITATION`: evidence was unavailable or could not be verified, with no score impact.

A title judged only against a preferred length range is an optional refinement, not a technical failure. When saved evidence shows that an existing title does not explain the offer clearly, it is an AI-reviewed opportunity. CTA prominence is also an opportunity when a usable action path exists. Preferred character ranges are guidance rather than pass/fail rules.

## Business-Aware Page Purposes

Page-purpose coverage distinguishes a dedicated page, equivalent section, equivalent conversion path, discovered-but-skipped page, missing function, optional or not-expected page, and an unable-to-determine state.

Contact can be satisfied by a contact page, inquiry or order path, booking or quote flow, phone, or email. Founder and story content can satisfy About. A shop or merchandise path can satisfy Store. Location, Map, and Hours are not defects for a confirmed private, home-based, service-area, or online-only model when those pages are not expected.

The explanation describes the equivalent that was observed rather than saying a page is wholly absent.

## Score Integrity

Only published canonical findings can produce deductions. Each root cause is scored once. Suppressed findings, invalid evidence bindings, limitations, coverage notes, and optional refinements have no material deduction. AI-reviewed opportunities have bounded impact.

The administrator Audit Quality page exposes finding ID, root cause, classification, deduction, cap, evidence IDs, and the final category result. Internal trace data stays out of the main customer report.

## Customer Copy And URLs

Main report copy uses the confirmed business name and plain business language. Internal analyzer names, normalized-fact terminology, report version strings, and implementation labels are removed or translated. Technical versions appear only in the appendix.

Canonical URL handling removes fragments and default ports, normalizes host casing and paths, preserves query strings and encoded characters, and rejects incomplete URLs. Primary tables use page labels and short paths. Full URLs remain complete and clickable in the PDF appendix.

## Progress Comparison

Comparisons use canonical score, finding, and root-cause identities when both audits contain v4 reports. Text identifies new findings, findings no longer present, completion changes, coverage changes, and scoring-method changes.

A score increase is not described as intentional business improvement unless the evidence supports that conclusion. When coverage or cause is uncertain, the report says so explicitly.

## Consumer Rules

- Overview, Audit, Website, SEO, Action Plan, setup Results, and History read the materialized canonical report.
- PDF and Presentation Mode reject a report whose integrity status is `NEEDS_REVIEW`.
- The AI Consultant receives compact canonical facts, pages, findings, classifications, priorities, and evidence IDs.
- Implementation Help resolves the selected recommendation against its own source audit and exact canonical finding IDs. It never falls back to an unrelated finding in the same category.
- `buildCanonicalEmailSummary` provides a READY-only projection for an audit email feature. No audit-report email sender currently exists.
- The public fictional example obtains its score, counts, priorities, and implementation brief from a sanitized READY canonical fixture.

## Failure Behavior

Strict construction records integrity issues for count mismatches, duplicate page identities, broken URLs, unknown pages or evidence, missing evidence, evidence-page mismatches, duplicate roots, invalid classifications or score impact, and missing referenced findings.

The audit and raw evidence remain saved. The canonical report is stored with `NEEDS_REVIEW`, an internal warning is logged, customer report pages show a neutral quality notice, and PDF or Presentation publication is blocked. Customers do not receive stack traces or internal diagnostics.

## Regression Fixtures

The sanitized Just Pie Orlando fixture verifies four missing descriptions, Menu missing its H1, eight missing alt attributes on Merchandise Shop, zero on Order Inquiries, a weak existing title, an existing contact/order path, founder content, merchandise, and a private cottage-food model.

Additional report fixtures cover hospitality, SaaS, local service, ecommerce, professional services, social-only businesses, and legacy/stale data behavior.

## Historical Reports

Historical audits are not rewritten. Reports without a v4 snapshot use the existing compatibility adapter and retain their original scoring label and methodology. Compatibility reports remain readable, but they are not labeled as v4 and their warnings do not become claims that the old audit passed the new strict contract.

## Rollout

1. Deploy code capable of reading both legacy and v4 reports.
2. Generate internal Just Pie and cross-business fixture PDFs.
3. Review report, presentation, dashboard, and mobile artifacts.
4. Monitor `canonical_audit_report_needs_review` warnings and the admin quality page.
5. Publish v4 output only when the saved integrity status is READY.

No database migration is required because the canonical result uses the existing JSON audit snapshot.

## Rollback

Rollback the application release to the previous report builder. Do not delete or rewrite v4 snapshots. The prior code ignores the extra JSON field, while a later re-deploy can read it again. If only public example exposure needs to be rolled back, restore the prior fictional example page without changing saved customer audits.

## Known Limits

- Historical reports cannot gain v4 guarantees without a new audit.
- The email projection is implemented, but there is no audit email-delivery feature yet.
- Static HTML analysis cannot prove visual CTA prominence or JavaScript-only behavior unless supported by saved rendered evidence.
- A READY report means internal consistency and evidence binding passed; it does not guarantee that every useful business opportunity was observable within crawl coverage.
