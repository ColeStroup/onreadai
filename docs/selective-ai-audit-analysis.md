# Selective AI-assisted audit analysis

## Purpose

Selective AI analysis adds qualitative page review to Onread's existing
deterministic audit. Every page allowed by the customer's current crawl plan
still receives the normal crawler and technical checks. A bounded, explainable
subset of business-important pages receives deeper AI review, followed by one
compact site-level synthesis.

The feature does not use AI to crawl, discover URLs, verify objective facts, or
calculate audit scores. It does not change plan prices, crawl allowances, or
other product entitlements.

## Processing architecture

An audit follows this order:

1. The existing SSRF-protected crawler checks every permitted page up to the
   current plan limit.
2. Existing website, SEO, social, reviews, local, and competitor analyzers
   produce deterministic evidence and scores.
3. `selectPagesForAiReview` ranks eligible crawled pages and records the score
   and selection reasons for every page.
4. Selected pages are reduced to bounded structured evidence. Raw HTML is
   never sent to the model.
5. A cost-efficient page-analysis route reviews selected pages concurrently,
   reusing tenant-scoped content-hash cache entries when possible.
6. Valid page opportunities and compact deterministic summaries are sent to
   one stronger synthesis route.
7. Application validation removes unsupported, vague, duplicate, conflicting,
   or ungrounded output.
8. The audit stores a selection and coverage snapshot, source-labeled findings,
   recommendations, and internal usage telemetry.

When the feature is disabled, unavailable, or partially fails, the
deterministic audit continues and remains reportable.

## Deterministic and AI responsibilities

Deterministic analyzers remain authoritative for:

- fetch status, redirects, and crawl coverage
- title, metadata, headings, canonical, viewport, and indexability checks
- links, calls to action, images and alt text, robots.txt, and sitemap.xml
- profile, review, competitor, and other saved evidence
- category scores and the overall score

AI is limited to:

- explaining a page's likely purpose
- assessing clarity, positioning, trust, messaging, and conversion flow
- identifying evidence-backed qualitative strengths and opportunities
- prioritizing validated opportunities across the site

An AI statement cannot override contradictory deterministic evidence. AI
findings do not deduct score points and cannot claim that a fix guarantees
traffic, conversions, revenue, ranking, or a specific score increase.

## Page selection

Selection is deterministic and independent of crawl order. Only successfully
analyzed, business-facing pages with usable extracted content are eligible.
The rank combines:

- page type: homepage, offers/services/products, conversion, trust, local, and
  content pages
- presence in primary navigation
- observed internal-link prominence
- relevance to the business's selected and primary goals
- conversion-path signals such as pricing, booking, ordering, demos, or contact
- deterministic anomalies such as thin content, missing metadata, heading
  issues, missing actions, or unusually long content

Each page's importance score, selection reasons, template group, hashes, and
coverage state are persisted in `Audit.analysisSnapshot.aiAssistedAnalysis`.

### Deep-review caps

| Crawled pages | Maximum AI-reviewed pages |
| --- | ---: |
| 0-10 | 10 |
| 11-25 | 12 |
| 26-50 | 18 |
| 51 or more | 24 |

These are AI review caps, not crawl limits. The existing plan's crawl limit
continues to govern deterministic coverage.

### Diversity and representative sampling

For sites larger than ten pages, selection first reserves useful diversity:
homepage, primary offer, conversion, trust, local, content, and high-anomaly
groups where available. It then fills remaining capacity by rank.

Repeated service, product, location, and blog templates are represented by a
small sample instead of consuming the entire budget. High-value conversion and
anomaly groups may receive a second representative. Skipped siblings remain in
the technical site-wide summary.

Policy, authentication, search, cart, checkout, account, feed, author, tag, and
similar utility pages are normally excluded. Failed pages and pages without
usable content are not sent to AI.

## Content extraction and limits

The crawler removes script, style, template, SVG, canvas, iframe, repeated
navigation/footer/sidebar content, hidden elements, and common consent
surfaces. It retains structured evidence including:

- title, description, canonical, headings, and page type
- prominent calls to action and navigation labels
- form, contact, trust, image-alt, and structured-data signals
- cleaned primary visible content
- deterministic page findings and business goal/context summaries

Semantic page headers remain available so hero headings and actions are not
discarded.

Per selected page:

- cleaned visible content retained: 10,000 characters
- complete serialized page payload: 16,000 characters
- page-analysis output: 1,400 model output tokens
- meaningful opportunities accepted: at most 5

Truncation preserves the opening, a representative middle section, and closing
content. The payload records both available and retained character counts, and
the model output receives a limitation when truncation occurred.

The site synthesis input is capped at 58,000 characters, contains no raw page
content, and accepts at most 12 consolidated site opportunities. Page review
runs with at most three concurrent provider requests and a 105-second aggregate
page-review budget.

## Structured output and evidence

Page analysis uses strict JSON-schema output with:

- page summary and purpose
- evidence-backed strengths
- qualitative opportunities with category, description, evidence, business
  impact, recommendation, priority, and confidence
- primary call-to-action assessment
- source limitations

The parser checks every opportunity against the actual bounded page payload.
It rejects missing evidence, unsupported absolutes, generic advice, unrelated
recommendations, objective technical duplicates, and claims that conflict with
deterministic facts. Stable opportunity IDs are derived from page URL,
category, title, and evidence.

Final synthesis may reference only accepted opportunity IDs and selected page
URLs. It returns an executive summary, strengths, highest priorities, quick
wins, larger strategic improvements, recommended order, and limitations. If
synthesis fails validation, a deterministic fallback summary is stored and is
identified as such.

## Report provenance and coverage

Reports use two customer-facing source labels:

- **Verified technical issue**: produced from deterministic evidence
- **AI-reviewed opportunity**: qualitative analysis whose evidence passed
  application validation

AI opportunities show the affected page, concise evidence, why it matters,
suggested action, confidence, and priority. Coverage explicitly distinguishes:

- pages checked technically
- key pages selected and successfully reviewed by AI
- additional pages covered through technical and site-wide analysis
- cache reuse and reduced-coverage limitations

Historical snapshots without the AI object remain readable. A disabled current
flag does not hide previously stored, valid AI-assisted results.

## Model routing

Routing is centralized in `src/lib/ai/model-routing.ts`.

| Task | Route | Resolution order |
| --- | --- | --- |
| Page analysis | `AUDIT_PAGE_EFFICIENT` | `OPENAI_AUDIT_PAGE_MODEL` -> `OPENAI_MODEL` -> `gpt-5.4-mini` |
| Final synthesis | `AUDIT_SYNTHESIS_STRONG` | `OPENAI_AUDIT_SYNTHESIS_MODEL` -> `OPENAI_MODEL` -> `gpt-5.4-mini` |

`OPENAI_AUDIT_PAGE_MODEL` and `OPENAI_AUDIT_SYNTHESIS_MODEL` are optional
per-task overrides. Set the synthesis override independently when a stronger
model is justified; otherwise both tasks inherit the shared production
`OPENAI_MODEL`. Whitespace-only values are ignored. Model names remain
configurable because availability and pricing can change. Changing the page
model or route version invalidates affected page cache keys. Provider storage
is disabled for these requests.

## Cache and repeated audits

`PageAnalysisCache` is scoped to one `Business`. Its unique cache key includes:

- business ID
- normalized page URL and canonical URL
- cleaned content hash and metadata hash
- business-context hash and selected-goal hash
- page prompt and output-schema versions
- model route, route version, and model name

A changed page, metadata, business context, goals, prompt, schema, route, or
model causes a miss. Cache reads and invalid-cache deletion include the
business ID, preventing cross-tenant reuse. A uniqueness constraint handles
concurrent writers safely.

On an unchanged repeated audit, selected page reviews should all be cache hits;
one fresh site synthesis still runs so current deterministic evidence,
recommendation status, and comparison context can be prioritized. If two pages
change, only changed or newly selected pages require page-model calls.

Expected calls without retries:

- first audit: one call per selected page, plus one synthesis call
- unchanged repeated audit: zero page calls, plus one synthesis call
- partial change: one call per changed/newly selected page, plus one synthesis

The existing active-audit guard and transaction prevent repeated clicks from
creating simultaneous duplicate audits. Cache uniqueness protects page work
across otherwise valid later audits.

## Usage telemetry

`AuditAiUsage` records internal operational data per page review, cache hit, and
synthesis:

- operation, model route/model, status, and safe provider request ID
- input, cached-input, output, reasoning, and total token counts
- estimated cost in integer micro-units
- latency, retries, cache hit, prompt version, and bounded failure code
- audit, business, plan, and optional cache relation

Estimated cost uses an internal versioned price table for monitoring:

| Model family | Input / 1M | Cached input / 1M | Output / 1M |
| --- | ---: | ---: | ---: |
| `gpt-5.4-mini` and dated snapshots | $0.75 | $0.075 | $4.50 |
| `gpt-5.4` and dated snapshots | $2.50 | $0.25 | $15.00 |

Legacy GPT-4.1 pricing entries remain available for explicit historical model
overrides. Provider billing remains authoritative. For an unrecognized model,
the model and token counts are still recorded, estimated cost remains `null`,
and `audit_ai_pricing_unknown` is logged internally. Cost rollups containing
unpriced token usage also remain `null`. Unknown pricing never borrows another
model's rates and does not fail the audit.

This data is not exposed in customer reports or normal account routes.
Telemetry write failures are logged safely and do not invalidate an otherwise
successful deterministic audit.

## Retry, timeout, and degradation policy

- The SDK performs no implicit retry for these operations.
- One transient retry is allowed for timeout, connection, rate-limit, conflict,
  or provider 5xx failures, with bounded backoff.
- One structured-output repair is allowed after semantic validation rejection.
- Permanent and safety/validation failures are not retried indefinitely.
- Page timeout: 22 seconds. Synthesis timeout: 28 seconds.
- One failed page does not fail other selected pages or the deterministic audit.
- A failed synthesis uses a deterministic fallback.
- Missing API configuration or a disabled flag produces no model calls.

The saved report states reduced coverage rather than exposing provider errors
or implying that failed pages received AI review.

## Security and prompt-injection controls

Existing ownership and audit authorization remain unchanged. The AI layer:

- uses only pages already fetched through the SSRF-protected crawler
- cannot request model-suggested URLs, invoke tools, or take browser actions
- sends no raw HTML, authentication data, cookies, tokens, or unrelated tenant
  records
- treats page text as untrusted evidence inside explicit delimiters
- instructs the model to ignore commands embedded in page content
- prohibits prompt/secret disclosure and deterministic score changes
- accepts schema-only output and validates it again in application code

Implementation Help receives one selected finding and only its relevant page
evidence. The AI Consultant retrieves concise question-relevant summaries,
selected findings, limited business context, and recent conversation context;
it does not receive the full crawl or every historical message.

## Feature flag and rollout

`AI_ASSISTED_AUDITS_ENABLED` is a server-only flag and defaults to `false`.
`OPENAI_API_KEY` must also be configured. Recommended rollout:

1. local fixtures and automated tests
2. an internal founder account
3. manually reviewed controlled businesses
4. one-time Full Audit beta
5. Pro audit beta
6. wider production rollout after quality and cost review

Before each expansion, review evidence accuracy, cache hit ratio, validation
rejection rate, latency, reduced-coverage frequency, and estimated cost by
plan/audit product.

## Operations and troubleshooting

For an unexpected deterministic-only report:

1. Confirm the audit completed and inspect its `aiAssistedAnalysis.status`.
2. Confirm the flag and API key are configured in the same server environment.
3. Check safe events for provider failure, validation rejection, time budget,
   cache read/write, or usage-write failures.
4. Compare selected, reviewed, failed, and cache-hit counts in the snapshot.
5. Inspect internal `AuditAiUsage` rows by both `auditId` and `businessId`.
6. Do not delete deterministic findings or rerun repeatedly to conceal a model
   validation issue.

For elevated cost, inspect selected-page counts, cache hit ratio, prompt/schema
or model changes that invalidated cache, and retries. Disable the server flag if
needed; deterministic audits and historical reports continue to work.

For stale analysis, verify whether page content, metadata, goals, business
context, prompt/schema version, or model route changed. Those changes are
intentional cache invalidators.

## Known limitations

- Analysis uses fetched HTML only; it does not execute client-side JavaScript.
- It cannot inspect visual hierarchy, screenshots, rendered layout, animation,
  hidden interactive states, post-level social performance, or private data.
- Template grouping is heuristic and may retain or omit an imperfect
  representative.
- Evidence validation uses the bounded extracted payload, so relevant content
  outside a truncated section is reported as unreviewed.
- Final synthesis is regenerated rather than cached in v1.
- Audit orchestration still uses the current bounded Vercel `after()` flow,
  rather than a durable external job queue.

Screenshot/vision analysis may be evaluated separately after accuracy, privacy,
latency, and cost are measured. It is intentionally not part of v1.
