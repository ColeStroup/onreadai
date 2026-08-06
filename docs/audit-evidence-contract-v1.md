# Audit Evidence Contract v1

## Contract

Customer claims are backed by `audit-evidence-v3` records. Each record has a stable ID, evidence type, category, source analyzer, source URL and path, observed and interpreted values, confidence, applicability, observation time, analyzer version, explanation, and related issue keys.

Normalized page facts preserve provenance for title, description, H1, interactions, contact signals, and fetch quality. Interaction records preserve visible text, accessible name, element type, destination, page region, visibility, prominence, surrounding text, semantic purpose, destination status, and source evidence ID.

## Fetch Evidence

Page fetch facts retain requested URL, final URL, canonical URL, response status, redirects, method, content type, byte counts, rendering state, duration, timeout, retry count, robots state, extraction completeness, and safe error class. `INCOMPLETE` is unavailable evidence, not proof that content is absent.

## Claim Rules

- A customer-visible issue needs one or more valid saved evidence IDs.
- Evidence must match the category and affected page.
- Contradictory evidence is retained with the validation decision.
- Missing data is represented as a limitation or coverage note.
- Raw page bodies, credentials, cookies, and sensitive query parameters are not persisted in quality telemetry.

## Versioning

Readers accept legacy `audit-evidence-v1` and `audit-evidence-v2` snapshots for display compatibility. New audits write v3. Analyzer, rule, prompt, model, finding, and scoring versions remain separate so stale cache data cannot silently satisfy a newer rule.

