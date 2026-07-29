# Guided Setup Profiles

## Starting a workspace

The new-business form accepts one starting value: a website, supported public
profile URL, Google Maps listing URL, or business name. It creates the
workspace and sends the owner to guided setup. The starting value is not a
claim that Onread found every source.

A submitted URL is stored with `source = SUBMITTED` and `status = PENDING`.
Even a high-confidence match requires the owner to confirm it.

## Discovery limitations

Discovery is optional assistance. It can return no results, partial results,
incorrect matches, or time out. Match confidence describes URL/business
similarity and does not verify ownership. A discovery failure must not prevent
manual setup.

## Profile review

Step 1 supports the complete review workflow without leaving setup:

- Confirm a submitted or discovered profile.
- Edit its platform, public URL, and optional display name.
- Remove an unrelated result without deleting its history.
- Restore a removed result to pending review.
- Add a missing source manually.
- Mark an optional platform as `SKIPPED` or `NOT_USED`.

Manual entries are normalized and validated server-side. They are stored as
`source = MANUAL`, `status = CONFIRMED`, and `confidenceScore = 0` to represent
user confirmation rather than crawler confidence.

URLs are trimmed, safely upgraded to HTTPS when no scheme is supplied,
canonicalized for supported platforms, stripped of common tracking parameters,
and checked with the public-URL/SSRF policy. Handles alone are not expanded
into guessed URLs. A normalized per-business unique key prevents duplicates.

## Google Business Profile

Google Business is a first-class source in Step 1. The owner can:

- Confirm a discovered Places candidate.
- Correct a candidate by replacing it with a public Google Maps/Profile URL.
- Add a Google listing manually.
- Remove an incorrect candidate.
- Choose `I don't have one` (`NOT_USED`).
- Choose `Skip for now` (`SKIPPED`).

These decisions are distinct and persisted in `BusinessProfileDecision`.
Onread does not describe a manually supplied link as verified by Google.
Choosing skip/not-used prevents audit-time Google discovery for that unchanged
source state.

## Completion rules

The profile step is complete when:

1. At least one valid website, social, Google Business, or other primary source
   is confirmed.
2. No submitted/discovered business profile remains pending.
3. No Google Places candidate remains pending.
4. Google Business is confirmed, explicitly skipped, or marked not used.

Every social platform is optional. A website-only or social-only business can
complete setup. The setup percentage counts completed setup steps, while the
profile cards separately show confirmed, awaiting-review, manually-added, and
removed totals.

## Audit source inclusion

Only `BusinessProfile.status = CONFIRMED` records with a saved public URL or
legacy handle are passed to business analyzers. Pending and removed records are
excluded. The audit snapshot records included profile IDs/platforms/source,
excluded counts, and the Google review decision.

Website and SEO remain not applicable when no confirmed website is supplied.
Skipped and not-used sources are never presented as analyzed owned sources.

## Missing-source acknowledgement

Before a paid/comprehensive audit starts, Onread derives a stable hash from the
current profile decisions, confirmed/pending source state, Business Context,
and goals. Missing website, social, Google review, unresolved profiles,
context, or goals are shown with their expected limitation.

The owner may return to the relevant setup step or choose **Continue with
available information**. That choice stores the hash and timestamp. Onread does
not ask again while the semantic source state is unchanged; adding/editing a
source, changing a decision, context, or goals creates a new state.

## Loading and long-running work

Server-action forms use `SubmitButton`. On submit it disables immediately,
shows a spinner and action-specific text, and sets `aria-busy`.

Audit progress is persisted in `Audit.progressStage` at real workflow
boundaries:

- Preparing business information
- Reviewing confirmed profiles
- Analyzing website
- Reviewing local visibility
- Evaluating social presence
- Comparing competitors
- Building findings
- Prioritizing recommendations
- Preparing results

The run page polls the stored stage. It does not advance a cosmetic timer.
Refreshing or returning to the page resumes from the latest saved status.

## Authorization and idempotency

Guided and advanced profile actions use the same server-side profile service.
Each entry point requires authentication and verifies business ownership.
Profile IDs are always scoped by business ID. Server actions retain Next.js
Origin/Host checks and profile actions use the application rate limiter.

Database advisory locks and the normalized unique key prevent duplicate manual
entries. Confirmation, removal, restoration, and active audit creation are
safe to retry. `createPendingAuditRun` returns an existing recent active run
instead of creating a second audit.

## Troubleshooting

- **Profile will not save:** Use the complete public URL, verify the selected
  platform matches the host, and remove credentials or custom ports.
- **Duplicate warning:** The same normalized URL already exists for this
  business, including removed profiles.
- **Step still incomplete:** Resolve all pending profile cards and make an
  explicit Google Business choice.
- **Discovery found nothing:** Add sources under **Add missing profiles**.
- **Audit warning returned:** The source state changed since the last
  acknowledgement. Review the listed limitations and acknowledge the new state.
- **Interrupted audit:** Retry from the audit run page. Existing confirmed
  sources remain unchanged.
