# Website and SEO Product Repositioning v1

## Product decision

Onread launches as a focused Website and SEO audit and growth platform. Its job is to find evidence of website and search-visibility problems, prioritize the work, help the owner implement changes, and verify progress with another audit.

The customer promise is:

> Onread finds what is hurting your website's visibility and ability to convert customers, tells you what to fix first, helps you make the improvements, and verifies the results.

## Enabled launch product

- Business and website setup
- Controlled public website crawl
- Deterministic website and technical SEO analysis
- Optional bounded AI review of selected website pages
- Evidence-backed Website and SEO findings
- Prioritized Action Plan and recommendation tracking
- Website and SEO Consultant
- Implementation Help for supported recommendations
- Compatible re-audit comparisons and progress history
- Focused in-app, PDF, and presentation reports
- Existing authentication, billing, entitlements, and tenant isolation

## Disabled future modules

The following modules remain in code and their historical data remains in PostgreSQL, but they are off by default and excluded from the launch experience:

| Module                   | Environment variable              | Default |
| ------------------------ | --------------------------------- | ------- |
| Social Growth            | `SOCIAL_GROWTH_ENABLED`           | `false` |
| Competitive Intelligence | `COMPETITOR_INTELLIGENCE_ENABLED` | `false` |
| Local Growth             | `LOCAL_GROWTH_ENABLED`            | `false` |

These flags are checked on the server. Disabled routes return an unavailable state, mutation actions reject use after ownership checks, and the modules are omitted from navigation, onboarding, new audits, reports, recommendations, and Consultant context. A website audit may still record a social link found in website HTML as an unscored website observation.

## Customer navigation

Each business workspace centers on:

- Overview: website health and the next priority
- Setup: website source, Business Context, and goals
- Audit: Website and SEO evidence
- Plan: prioritized implementation work
- Consultant: help understanding and implementing recommendations
- Progress: compatible re-audits and verification

Future module links appear only when their corresponding server flag is explicitly `true`. Billing, Settings, Help, partner, and admin navigation retain their existing authorization behavior.

## Scoring methodology

New audits use scoring engine `website-growth-score-v1` and display the **Website Growth Score**.

| Category | Weight |
| -------- | -----: |
| Website  |    55% |
| SEO      |    45% |

The overall score is the weighted average of measured Website and SEO scores. Social profiles, competitor records, Google Business data, ratings, and review counts cannot change it. A confirmed, successfully fetched website is required, so unavailable website evidence does not become an arbitrary zero-scored audit. Crawl limits and failed pages are reported as coverage limitations rather than confirmed defects.

Website and SEO scores remain deterministic. Selective AI can explain or identify bounded opportunities but cannot rewrite the saved deterministic category scores.

## Legacy audit behavior

- Existing audit rows and JSON snapshots are not modified or recalculated.
- An audit is treated as focused only when its saved scoring version is `website-growth-score-v1`.
- Older reports retain their saved categories and are labeled **Legacy scoring model**.
- Historical social-first reports remain readable.
- Comparisons across different scoring-engine versions are marked as methodology changes and shown as limited, not as verified improvement.
- Existing report URLs continue to use the saved audit ID and ownership checks.

## Homepage and public messaging

The homepage now leads with **Find what's holding your website back.** It explains the five-step loop: add a website, run the audit, see what to fix first, make improvements, and verify results. Public feature, pricing, example-report, consultant, metadata, Open Graph, help, and methodology copy now describe supported Website and SEO capabilities.

No launch page advertises Social Growth, Competitor Intelligence, Google Business scoring, review scoring, or an all-in-one online-presence audit.

## Dashboard and onboarding

New business setup asks for a business name and public website URL. A confirmed website is the required source for a new audit. Social profiles, competitors, review sources, and Google Business setup are not onboarding requirements. Business Context and Website or SEO goals remain available because they improve prioritization and implementation guidance.

Overview emphasizes the Website Growth Score, the recommended first action, two follow-up actions, key findings, action progress, and compatible re-audit progress. Coverage and methodology stay available through disclosures.

## Consultant and Implementation Help

Focused Consultant context contains Business Context, selected goals, Website and SEO scores, top findings, recommendations and statuses, concise crawl evidence, and compatible progress. It excludes disabled-module records and filters recent conversation turns that ask the focused context builder to continue unsupported module work.

Suggested questions and system instructions focus on priorities, page titles, meta descriptions, headings, calls to action, page structure, internal linking, implementation, and verification. Missing evidence must be disclosed rather than invented.

## Reports and exports

New report view models expose Website and SEO score categories only. The in-app report, PDF, presentation deck, and public example report use Website and SEO terminology and omit disabled sections. PDF methodology states the 55/45 weighting and includes evidence, affected URLs, limitations, and technical crawl details without raw JSON.

Legacy reports continue through their broader compatibility path. Presentation and PDF rendering decide scope from the saved audit scoring version rather than from the current environment alone.

## Billing copy

Stripe prices, product IDs, checkout, portal behavior, webhook handling, and entitlement limits are unchanged. Customer-facing plan descriptions now sell website crawl depth, audits, reports, Action Plans, Consultant usage, implementation support, and progress verification. Existing internal entitlement fields for future modules are retained so this copy-only repositioning does not mutate payment behavior.

## Data and migration considerations

No Prisma schema or database migration is required. Existing profile, social strategy, competitor, Google Business, review, audit, and recommendation records remain intact. New snapshots omit disabled top-level module analyses and use the new scoring version. Do not backfill or overwrite historical snapshots.

## Analytics

Customer analytics remain allowlisted and avoid page content, full private URLs, audit evidence, and chat messages. Launch events should describe the website workflow: website added, audit started/completed, priority viewed, implementation opened, Consultant started, task progress, verification, report export, and specialist-help requests. Disabled-module customer events should not be emitted while their flags are off.

## Future module boundaries

### Social Growth

Reintroduce only with official platform connections, real performance history, and evidence-based recommendations. It may become a separate subscription or add-on.

### Competitive Intelligence

Reintroduce only with reliable public website comparisons, content and conversion gaps, and actionable source evidence. Do not market saved profile coverage as deep intelligence.

### Local Growth

Reintroduce with approved Google Business integrations, contextual local visibility evidence, and meaningful review analysis. Do not score arbitrary review-count thresholds.

## Deployment

1. Keep all three future-module flags set to `false` in production.
2. Run `npm run db:generate`.
3. No migration is needed for this release.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
5. Deploy through the existing Vercel and Stripe process without changing price IDs.
6. Run a new audit and confirm the saved scoring version is `website-growth-score-v1`.

## Rollback

Roll back the application deployment to the previous release. No database rollback is required because this change adds no migration and does not rewrite historical records. If a future module must be temporarily restored for controlled testing, enable only its explicit environment flag and redeploy; do not treat that as a full product rollback. Audits created under `website-growth-score-v1` must continue to render with their focused methodology after rollback or any compatibility release.
