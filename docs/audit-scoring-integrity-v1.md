# Audit Scoring Integrity v1

## Validated Score

`website-growth-score-v2-validated` keeps the Website 55% and SEO 45% weighting. Each applicable category starts at 100.

Only a finding that is validated, score-eligible, material, and at least 0.65 confidence may create a deduction. Technical defects and meaningful opportunities use bounded severity, materiality, confidence, and affected-page factors. A technical root is capped at 18 points and an opportunity root at 10 points.

The following never lower the validated score:

- suppressed candidates;
- limitations and unavailable data;
- optional refinements;
- strengths and coverage notes;
- low-confidence claims;
- duplicate instances of an already counted category/root cause.

## Traceability

Every deduction records the root cause, label, affected-page count, evidence IDs, confidence, cap explanation, engine version, and calculation time. The shadow snapshot records current and validated finding counts plus Website, SEO, and overall shadow scores.

Score comparisons require compatible methodology versions. A scoring-version change is explained as a methodology boundary rather than business progress. AI can validate meaning but cannot assign numeric scores.

