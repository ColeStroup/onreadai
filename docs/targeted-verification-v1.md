# Targeted Verification v1

## Separation From Discovery

A discovery audit searches for current issues and opportunities. Targeted verification checks only whether a previously accepted scope was completed. A new preference cannot reopen paid work.

Each published finding freezes its original finding and root IDs, evidence IDs, URLs, rule and rule version, prompt and model versions when used, required outcome, tolerance, exclusions, method, and freeze time.

Outcomes are `VERIFIED_FIXED`, `FIXED_WITH_OPTIONAL_ENHANCEMENT`, `PARTIALLY_FIXED`, `STILL_DETECTED`, `UNABLE_TO_VERIFY`, `OWNER_REVIEW_REQUIRED`, and `NO_LONGER_APPLICABLE`.

## Examples

For a missing meta description, the frozen acceptance rule is that a nonempty description exists. Preferred length and alternate wording are excluded. Once text exists, wording advice may be a separate optional enhancement but cannot fail the original work.

For a missing contact path, any saved accepted purpose can satisfy the outcome: contact, order, booking, quote, purchase, application, or chat. For a broken path, the action must still exist and its destination must load.

The feature remains default-off until a dedicated user workflow and representative manual verification matrix are complete.

