# Complimentary entitlements

## Purpose

Complimentary entitlements let an authorized Onread administrator grant Starter
or Pro product access without representing that access as a purchase. They are
appropriate for founder and internal accounts, approved beta users, promotions,
and customer-support resolutions.

The grant is an application entitlement only. It does not create or change a
Stripe customer, subscription, invoice, payment, Checkout Session, webhook
event, revenue record, referral conversion, or partner commission.

## Entitlement precedence

Onread resolves access on the server for each protected request:

1. Reject or redirect the request under the existing authentication, email
   verification, session invalidation, role, and ownership controls.
2. Find valid paid product access.
3. Find active complimentary access.
4. Use the highest valid plan, with paid access winning a tie.
5. Apply the existing limits from `src/lib/billing/plans.ts`.

Examples:

| Paid access | Complimentary access | Effective access |
| --- | --- | --- |
| None | Starter | Starter |
| Starter | Pro | Pro |
| Pro | Starter | Pro |
| Pro | Pro | Pro, paid source |
| Expired/canceled | Pro | Pro |
| Starter | Expired or revoked Pro | Starter |
| None | Expired or revoked Pro | Free |

Plan state is not copied into Auth.js JWTs and is not cached separately.
Expiration and revocation therefore take effect on the user's next server
request without a sign-out or deployment.

## Grant sources

- `FOUNDER`: founder account access
- `INTERNAL`: other approved internal use
- `BETA`: approved product testing
- `PROMOTION`: time-limited promotional access
- `CUSTOMER_SUPPORT`: a documented support resolution
- `MANUAL_ADMIN`: another reviewed administrative grant

## Admin workflow

1. Sign in with a database-backed `ADMIN` account.
2. Open `/dashboard/admin/entitlements`.
3. Search for the target account by name or email.
4. Open the user.
5. Select Starter or Pro and an accurate source.
6. Enter a required operational reason and optional internal notes.
7. Choose an immediate or future UTC start.
8. Choose no expiration or a custom UTC expiration.
9. Review the confirmation explaining that no Stripe subscription or charge is
   created.
10. Confirm the grant.

The list supports plan, source, and derived-status filters. The user page shows
effective access, paid access, complimentary access, grant history, revocation
history, and immutable grant/revoke events. Internal notes are selected only by
the protected admin service.

When an equal-or-higher complimentary grant overlaps the proposed interval,
the server rejects it unless the administrator explicitly confirms the
overlap. Existing records remain intact.

## Founder workflow

Use:

- Plan: `PRO`
- Source: `FOUNDER`
- Reason: `Founder/internal account`
- Start: immediately
- Expiration: no expiration

After granting, open the target account's Billing page and confirm:

- Effective plan is Pro.
- Access source is Complimentary access.
- Expiration is No expiration.
- No Stripe subscription is presented for the grant.
- Pro limits are displayed.

Also verify that no new `UserSubscription`, `OneTimeAuditPurchase`,
`StripeWebhookEvent`, `PartnerCommission`, or partner notification row was
created.

## Expiration and revocation

Status is derived:

- `SCHEDULED`: start is in the future
- `ACTIVE`: started, unexpired, and not revoked
- `EXPIRED`: expiration has passed
- `REVOKED`: an administrator revoked the grant

No cron job is required for access correctness. Expired records remain in
history and are ignored by the effective-entitlement resolver.

To revoke:

1. Open the user's entitlement page.
2. Enter a required revocation reason.
3. Review the explicit confirmation.
4. Revoke access.
5. Confirm the record remains visible as `REVOKED`.
6. Confirm effective access falls back to the next valid paid,
   complimentary, or Free plan.

There is no reactivation operation. Create a new reviewed grant if access must
be restored.

## Billing-page behavior

Billing presents three facts separately:

- effective product access
- actual paid Stripe subscription state, when one exists
- complimentary plan and expiration, when one exists

The Stripe Customer Portal is shown only for an active Stripe subscription.
Users without one may still purchase a legitimate plan through Checkout under
the existing product policy. Complimentary access does not hide a user's real
renewal, cancellation, payment problem, or ongoing billing obligation.

## Stripe and commission separation

The grant/revoke service writes only:

- `ComplimentaryEntitlement`
- a corresponding `PartnerAdminAuditLog` security event

It does not call Stripe code or partner attribution/commission code. Partner
commissions continue to originate only from eligible signed Stripe payment
events. Integration and browser tests compare billing, webhook, purchase,
commission, and notification row counts before and after a grant.

Do not manually add Stripe identifiers to a complimentary grant. Do not create
a fake local `UserSubscription` as a shortcut.

## Audit logging

Grant and revocation transactions append:

- action type
- grant ID and target user ID
- administrator ID
- plan and source
- reason
- start and expiration
- revocation timestamp, administrator, and reason when applicable

The implementation reuses the existing append-only
`PartnerAdminAuditLog` administrative event store with
`entityType = ComplimentaryEntitlement`. No application mutation edits or
deletes these events. Internal notes are deliberately excluded from event JSON.

Expiration is deterministic timestamp state, not a mutation, so this version
does not fabricate an `EXPIRED` event without an actual scheduler.

## Notifications

Grant email and in-app notifications are intentionally deferred. The existing
notification surface is partner-specific and is not exposed to normal customer
accounts. This version does not misuse that table or send an email users cannot
manage. The Billing page is the customer-visible source of access status.

When a general customer notification system is added, use the grant ID as an
idempotency key and state clearly that no charge was made.

## Manual Stripe trial cleanup

Do not cancel a manually created Stripe trial from application code.

1. Grant complimentary Pro.
2. Confirm the target Billing page shows effective Pro and the complimentary
   source.
3. Confirm no new commission, purchase, webhook, or subscription record was
   created by the grant.
4. In Stripe Dashboard, cancel the manually created trial using the intended
   timing.
5. Confirm signed Stripe webhooks reconcile the real subscription as canceled.
6. Reload Billing and confirm the paid subscription state is accurate.
7. Confirm effective access remains Pro through the complimentary grant.

## Operational cautions

- Never authorize by email, URL parameters, hidden navigation, or client role
  state.
- Never accept a client-supplied administrator ID or effective plan.
- Do not edit dates silently. Revoke and create a new grant when the business
  decision changes.
- A grant does not bypass existing authentication, verification, session,
  admin, partner, business-ownership, or route authorization.
- The current User model has no generic suspended/banned status. If one is
  introduced, enforce it before entitlement resolution.
- Keep internal notes factual and minimal. Do not store credentials, tokens,
  payment data, or unnecessary private customer information.
- Use the admin workflow as the normal operating path, not Prisma Studio.

No new production environment variable is required.
