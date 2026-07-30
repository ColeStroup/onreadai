# Audit Report Quality v3

Audit Report Quality v3 makes deterministic analyzer evidence the shared source
of truth for the dashboard, PDF, presentation, AI Consultant, implementation
help, and re-audit comparison.

## Versions

| Area | Version |
| --- | --- |
| Report view model | `audit-report-v3-normalized-facts` |
| Scoring | `growth-score-v4-data-sufficiency` |
| Website analyzer | `website-analyzer-v4-content-quality` |
| SEO analyzer | `seo-analyzer-v3-guideline-quality` |
| Social strategy | `social-strategy-v3-business-model` |
| Normalized facts | `normalized-audit-facts-v3` |
| Coverage | `audit-coverage-v2` |
| Recommendation evidence | `recommendation-evidence-v2-root-cause` |
| Consistency validator | `audit-consistency-validator-v3` |
| Page analysis prompt | `audit-page-analysis-prompt-v2` |
| Synthesis prompt | `audit-synthesis-prompt-v2` |

The model routing and AI page-selection limits are unchanged.

## Normalized audit facts

`Audit.analysisSnapshot.normalizedFacts` stores the objective values consumed by
all report surfaces. It includes:

- Homepage URL, title, title length, meta description, meta length, H1 count,
  H1 values, and action classification.
- Every successfully analyzed URL and its title, meta, and H1 measurements.
- URL-bound missing title, missing meta description, missing H1, and multiple
  H1 records.
- Thin pages, duplicate-content groups, copy-quality findings, and ordering
  friction.
- User-confirmed, publicly detected, additional detected, pending, and
  content-analyzed profile counts.
- Category score confidence, coverage status, evidence completeness, minimum
  data status, and missing inputs.
- Crawl, technical, selected AI, social, review, and competitor coverage.
- The normalized business model and public-location status.

Legacy audits are reconstructed from their saved analyzer snapshots when the
normalized object is absent. Current live social or review data must not replace
the saved evidence of a historical audit.

## Evidence precedence

Evidence is resolved in this order:

1. Deterministic analyzer measurements.
2. Saved normalized audit facts.
3. Validated AI-reviewed interpretation tied to a real analyzed URL.
4. Current live state, only when explicitly labeled as current.
5. General best practice, only when explicitly labeled.

Known numeric values cannot be replaced with `unavailable`. AI synthesis may
explain measured facts, but it cannot change title lengths, meta lengths, H1
counts, profile states, review metrics, or coverage totals.

## Coverage terminology

Coverage is divided by analysis layer:

- Crawl coverage: pages fetched within the configured crawl scope.
- Technical coverage: successfully fetched pages analyzed by deterministic
  checks.
- AI content coverage: selected pages that completed optional content review.
- Social profile coverage: confirmed, detected, pending, and content-analyzed
  profiles.
- Review coverage: listing presence versus available rating and count.
- Competitor coverage: saved competitors versus completed public snapshots.

`COMPLETE_FOR_ELIGIBLE_CRAWLED_PAGES` means all eligible canonical pages
discovered inside the bounded crawl completed analysis. It is not a claim that
every page on the public site was discovered. A partial status always includes
a readable explanation.

## Score sufficiency

Every category score has:

- score or `null`
- confidence
- coverage status
- evidence completeness
- minimum-data status
- missing inputs

Website and SEO are not applicable when no website is confirmed. Social
presence is a profile-coverage score unless post-level data exists. It does not
measure activity, engagement, reach, or performance.

Reviews distinguish:

- listing existence
- rating
- review count
- review recency
- owner responses
- sentiment

A confirmed Google Business listing without rating and review count is limited
to a low-confidence listing-presence assessment and is capped below a strong
review-performance score. The report states that reviews were not read and
sentiment was not analyzed.

## Finding taxonomy

Every customer-facing finding uses one of these labels:

- `VERIFIED_TECHNICAL_ISSUE`
- `AI_REVIEWED_OPPORTUNITY`
- `VERIFIED_STRENGTH`
- `COVERAGE_INFORMATION`
- `LIMITATION`
- `OBSERVATION`

Successful crawls, present H1 elements, and detected social links are not
technical issues. Missing deterministic signals remain technical issues.
Interpretive CTA, trust, messaging, and process findings are AI-reviewed
opportunities when AI supplied the interpretation.

## Recommendation consolidation

Recommendations are normalized before persistence. Each canonical item keeps:

- root-cause key
- source finding IDs
- source evidence IDs
- affected URLs
- source types
- normalized category
- priority, effort, impact, and confidence
- complete evidence summary

Important root-cause keys include:

- `HOMEPAGE_PRIMARY_CTA_CLARITY`
- `HOMEPAGE_META_DESCRIPTION_MISSING`
- `PAGE_H1_MISSING`
- `PAGE_H1_MULTIPLE`
- `TITLE_QUALITY`
- `ORDERING_PROCESS_FRICTION`
- `CONTACT_ACTION_WEAK`
- `SOCIAL_PROFILE_INCOMPLETE`
- `REVIEW_DATA_UNAVAILABLE`
- `COPY_PROFESSIONALISM`
- `DUPLICATE_CONTENT`
- `THIN_CONTENT`

Deterministic and AI candidates merge when they describe the same customer
action. Deterministic evidence is preserved while the more specific
implementation direction may be retained. Missing-H1 recommendations remain
separate by affected URL.

## CTA and conversion classification

Static action extraction separates:

- navigation
- conversion
- contact
- email
- order or inquiry
- booking or scheduling
- newsletter
- social
- event
- utility

Action presence and primary CTA clarity are separate facts. A menu, email, or
order link may exist without being structurally prominent.

Conversion-process analysis may identify a manual form, email, phone, external
checkout, or manual inquiry. It records visible manual steps, delayed
confirmation, invoices or payment links, pricing clarity, and fulfillment
clarity. Manual ordering is described as potential friction, never as broken
checkout.

## Content quality

Deterministic content-quality checks are intentionally conservative:

- duplicated words
- a small high-confidence spelling dictionary
- malformed currency wording
- obvious placeholder copy
- empty or thin extracted main content
- exact or high-similarity duplicate main content

Every copy issue includes the URL, a short excerpt, suggested correction, and
confidence. Brand names, product names, handles, slang, and stylized
capitalization are not automatically treated as errors. Findings are capped and
grouped to avoid a proofreading dump.

Thin pages are not automatically deleted. Recommendations may suggest adding
content, redirecting, removing from navigation, applying `noindex`, or
consolidating after the owner confirms the page purpose.

## SEO guidelines

Title and meta-description ranges are editorial heuristics, not search-engine
requirements. Report wording uses terms such as "recommended guideline" and
"typically effective range" and explains that search engines may truncate or
rewrite snippets. Relevance, specificity, duplication, and vague titles are
considered alongside character count.

## Business-model-aware strategy

The normalized business model supports restaurant, cafe, cottage food, local
retail, ecommerce, professional service, home service, appointment, mobile,
creator, nonprofit, SaaS, and other businesses.

Public visit language is allowed only when a customer-facing location is
confirmed. A lone hours link is not sufficient. Cottage-food, preorder,
home-based, and no-location businesses receive product, preparation, founder,
ordering, pickup, delivery, pop-up, and fulfillment guidance instead of
atmosphere, dine-in, directions, or walk-in guidance.

Social strategy is labeled as foundational when posts were not analyzed and
must not make claims about posting frequency, engagement, or performance.

## Final consistency gate

Before persistence, the validator:

- rejects homepage H1 contradictions
- rejects URL-bound H1 and meta claims that conflict with measurements
- accepts citations only from successfully analyzed URLs
- restores known homepage counts and lengths
- removes duplicate root causes
- rejects social performance claims without post data
- rejects customer-visit language without a confirmed location
- checks review-score ceilings under limited data
- reconciles crawl, technical, and selected AI totals
- normalizes finding taxonomy
- replaces unsupported executive-summary wording with deterministic-safe copy

The validation result is saved at
`Audit.analysisSnapshot.consistencyValidation`. Non-material contradictory
items are removed without failing the audit. A material score or coverage
integrity failure marks the report as not publishable for internal inspection.

## Observability

Safe structured events cover:

- content-quality counts
- limited review scoring
- evidence validation warnings
- contradictions rejected
- duplicate root causes removed
- known-value regressions prevented
- business-model mismatches rejected
- safe summary fallbacks
- final consistency failures

Logs contain identifiers, counts, versions, and error categories, not full page
content, prompts, secrets, or private customer data.

## Regression fixture

`src/lib/audits/audit-quality-v3.test.ts` models a synthetic home-based,
preorder business with:

- one verified homepage H1
- a missing menu-page H1
- missing homepage and menu descriptions
- one confirmed and two additional detected social platforms
- a confirmed Google listing without rating or count
- manual email ordering and delayed invoice confirmation
- a copy error
- a thin page
- two duplicate product pages
- no public storefront

Tests assert evidence invariants and structure rather than exact AI prose.
