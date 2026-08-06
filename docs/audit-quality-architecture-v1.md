# Audit Quality Architecture v1

## Scope

This document maps the Website + SEO audit path before the validation-v2 rollout. It records where evidence is created, transformed, scored, and presented so changes can be reviewed against the existing production behavior.

## Current pipeline

1. `audit-runner.ts` loads the owned business, approved website profile, goals, context, and plan limits.
2. `website-analyzer.ts` fetches the homepage through `public-http.ts`. Redirects are checked for SSRF safety and the final URL is retained.
3. `website-crawler.ts` fetches the entry page and prioritized same-site links. Static HTML is parsed with Cheerio. The crawler records metadata, headings, links, images, forms, local signals, action types, and a bounded content excerpt.
4. `seo-analyzer.ts` combines homepage facts with `robots.txt` and `sitemap.xml` checks.
5. `deterministic-audit.ts` creates scores, findings, and recommendations directly from analyzer outputs.
6. `evidence-integrity.ts` attaches canonical evidence records and consolidates recommendation roots.
7. Selective AI reviews a bounded set of pages when enabled. It sees compact extracted content plus deterministic context and may add opportunities. It does not change numeric scores.
8. `normalized-audit-facts.ts` builds the report fact snapshot.
9. `audit-consistency.ts` removes a limited set of contradictions and unsupported URLs, restores known values, and deduplicates recommendation roots.
10. The final evidence snapshot, normalized facts, findings, recommendations, and scores are saved in `Audit.analysisSnapshot` and relational audit tables.
11. The report view model is the shared source for Overview, PDF, and Presentation Mode. The Consultant builds a compact context from the same saved audit records.
12. Re-audit comparison currently identifies findings primarily from category and normalized title, with methodology compatibility checks.

## URL discovery and fetching

- URL normalization lives in `website-url.ts` and `website-analyzer.ts`.
- The crawler remains on the audited hostname, removes fragments, rejects unsafe schemes and obvious utility/download paths, and deduplicates logical homepage variants.
- `public-http.ts` resolves DNS before each request and redirect, rejects private/reserved addresses, uses standard ports only, bounds redirects, bytes, and time, and performs manual redirect validation.
- The current fetch path stores the final URL but not the complete redirect chain or a complete fetch-quality record.
- HTML is static server response HTML. There is no production browser-rendering adapter.

## Extraction

The crawler currently extracts title, description, H1-H3, canonical, viewport, links, buttons, forms, images, alt text, structured-data types, trust/local clues, action types, and bounded main text. Action classification considers visible labels, paths, DOM region, button-like structure, and business type.

Important gaps before v2:

- Accessible names, image-link alt text, icon-only controls, form actions, visibility, repeated elements, and surrounding copy are not preserved as normalized interaction evidence.
- Contact evidence is split across action classification and basic body-pattern checks.
- Destination-page purpose is not connected back to the source interaction.
- Fetch completeness and extraction quality are not explicit facts.
- Homepage analysis duplicates some crawler extraction with narrower logic.

## Known false-positive root cause

`website-analyzer.ts` reduced homepage contact coverage to a literal regex over link text and URL: `contact|call|email|get-in-touch`. The richer action classifier already recognized `Order Inquiries`, while the crawler also detected visible email content. Those facts were discarded before `deterministic-audit.ts` evaluated `hasContactLink`.

The deterministic audit then:

- deducted homepage score points for the false boolean;
- published `Contact path is not obvious from homepage links`;
- created `Make contact easy to find`; and
- did so before any semantic contradiction check.

Selective AI could add opportunities but could not suppress or reframe that deterministic issue. The consistency validator checked H1, metadata, source URLs, business-model wording, and social claims, but not contact/conversion contradictions. This is why the Just Pie Orlando finding survived even though contradictory evidence existed.

## Evidence and scoring weaknesses

- Findings are created as customer-visible records instead of candidates.
- Some evidence is attached after the claim is written, rather than being required to create it.
- Stable evidence IDs exist, but normalized page facts do not consistently carry per-fact provenance.
- Analyzer scores are calculated before final contradiction, confidence, materiality, and root-cause validation.
- Missing or incomplete page data can resemble a low-quality empty page in legacy score inputs.
- Preference-level checks such as multiple H1s, CTA prominence, text length, and thin content can appear more definite than extraction quality supports.
- Repeated issues can be consolidated as recommendations, but score deductions originate earlier and can still overlap.
- Finding identity is title-sensitive, so copy changes can look like issue changes.

## AI path and trust boundary

- Website content is untrusted input. Selective-AI prompts already instruct the model to treat it as data and reject instructions embedded in it.
- Structured output validators require known source URLs and evidence excerpts for AI opportunities.
- AI classification and presentation wording are not yet separated for every deterministic finding.
- There is no bounded semantic review step for ambiguous deterministic candidates.
- Provider failures do not break the deterministic audit, but the previous architecture could still publish an ambiguous deterministic finding.

## Caches and partial failures

- AI page cache keys include content, metadata, business context, goals, prompt, schema, model route, and model.
- Crawler results are not persisted in a reusable rendered-page cache.
- A failed page is marked `FAILED`, but fetch method, timeout class, raw/extracted sizes, and completeness are not represented uniformly.
- Legacy snapshots may not include current normalized facts or evidence contracts; report readers already provide conservative fallbacks.

## Presentation consumers

- `audit-report-view-model.ts` is the main report adapter.
- Overview, PDF, and Presentation Mode consume this view model, which is the right boundary for consistent customer output.
- The Audit workspace reads the same saved findings but currently exposes only a brief evidence disclosure.
- Action Plan and Implementation Help use saved recommendations and their evidence.
- Consultant context uses saved findings, canonical recommendations, coverage, score components, and current action status.

## Validation-v2 insertion points

Validation v2 is inserted after normalized facts and the existing consistency pass, and before the final evidence snapshot is persisted:

1. Convert findings to candidate records with rule, root cause, evidence, materiality, completeness, and stable identity.
2. Search normalized facts for deterministic contradictions.
3. Suppress unsupported, incomplete, immaterial, and contradicted candidates.
4. Send only ambiguous candidates to a bounded structured AI reviewer when explicitly enabled.
5. Enrich final findings with plain-language, specialist-readiness, and frozen verification metadata.
6. Remove recommendations whose source root was suppressed.
7. Calculate shadow scores from validated, material, confidence-qualified root causes.
8. Apply v2 findings and scores only when the rollout flag is enabled; always retain privacy-safe comparison telemetry.

## Security boundaries

- Keep `public-http.ts` as the only network path for static crawler requests.
- A rendered-page adapter must independently enforce DNS/IP checks, request filtering, popup/download blocking, same-site navigation, byte/time limits, and tenant-neutral ephemeral storage.
- Never send raw full websites to AI; send bounded facts and evidence excerpts.
- Never log page bodies, prompts, credentials, cookies, query values, or customer chat content.
- Owner feedback must use tenant-scoped finding lookup. Admin QA must require the existing admin authorization guard.

## Rollout constraints

The new pipeline is controlled by default-off flags. Shadow output is saved separately from customer-visible output. The known contact contradiction is also fixed in the current path because leaving a proven false positive active would be unsafe. Promotion requires fixture review, representative manual audits, stable score comparisons, and a rollback test.

