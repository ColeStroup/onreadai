# Audit Validation Pipeline v2

## Purpose

Validation v2 separates detector output from customer-visible findings. Detectors create candidates; a candidate is published only after evidence, extraction quality, contradiction, materiality, confidence, and duplicate-root checks.

## Lifecycle

1. `candidateFromFinding` assigns a rule ID, rule version, root cause, logical URLs, evidence IDs, classification, materiality, confidence, and verification rule.
2. `deterministicDecision` rejects incomplete evidence and looks for contradictory normalized facts before it confirms anything.
3. Objective, complete, evidence-backed candidates may be confirmed deterministically.
4. Subjective or semantic candidates require structured AI review when enabled. If review is unavailable or invalid, the candidate becomes a non-scoring limitation instead of a confirmed problem.
5. Optional preferences are reframed as optional or suppressed when hypothetical and immaterial.
6. A root cause is published and scored once. Related recommendations are removed when their root is suppressed.
7. Published findings receive plain-language, specialist-readiness, and frozen verification metadata.

Decision states are `CONFIRMED`, `REFRAMED`, `SUPPRESSED_CONTRADICTION`, `SUPPRESSED_INSUFFICIENT_DATA`, `SUPPRESSED_IMMATERIAL`, `NEEDS_AI_REVIEW`, and `LIMITATION_ONLY`.

## Contradictions

The deterministic contradiction pass currently protects contact/conversion paths, meta descriptions, H1s, and primary actions. Contact equivalents include visible email or phone details, forms, contact sections, and usable contact, order, booking, quote, purchase, application, or chat destinations.

## AI Review

AI sees one candidate, compact business context, a bounded evidence set, and explicit untrusted-content boundaries. Output must match the strict schema and cite only saved evidence IDs. Unsupported IDs, guarantees, invented behavior, or malformed output are rejected. One bounded repair uses the original task model. AI never sets a numeric score.

## Stable Identity

Candidate and finding keys hash the ruleset version, rule, root cause, logical page identity, and classification. Presentation wording is not part of score identity. Re-audit comparison prefers this metadata when both audits support it.

## Compatibility

The snapshot is stored at `Audit.analysisSnapshot.auditValidation`. Legacy audits remain readable and use their existing report fallbacks. The v2 reader only accepts its declared pipeline version; malformed metadata is ignored conservatively.

