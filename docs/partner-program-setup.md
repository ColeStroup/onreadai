# Partner Program MVP setup

This document covers the launch and operation of the Partner Program MVP. The program is disabled by default. It does not grant partners customer workspace access, product entitlements, Pro access, or authority to manage customer billing.

> The partner terms, commission policy, promotion standards, scanner policy, payout process, and tax workflow require formal review by qualified legal and tax professionals before commercial launch.

## Architecture

The program uses PostgreSQL as the canonical source of truth:

- `PartnerApplication` stores one active application per user.
- `PartnerProfile` stores certification state, referral code, per-partner financial policy, scanner limits, and payout readiness.
- `PartnerProgramSettings` is a database-backed singleton. Environment variables only provide first-run defaults.
- Training progress, assessment results, and versioned agreement acceptances are retained independently.
- A signed, HttpOnly referral cookie holds anonymous first-touch context until a new account is created.
- `PartnerReferralAttribution` permanently locks the eligible partner to the new user.
- `PartnerCheckoutIntent` is persisted before Stripe Checkout and is validated again during webhooks.
- `PartnerCommission` and `PartnerCommissionAdjustment` form the immutable financial ledger.
- `PartnerPayout` reserves eligible ledger items and records a payment made outside the application.
- Scanner prospects and scans are separate from customer `Business` and `Audit` records.
- Public preview tokens are random; PostgreSQL stores only their SHA-256 hashes.
- `PartnerAdminAuditLog` records consequential administrator changes and their required reasons.

## Lifecycle

```text
Application -> admin approval -> required training -> assessment >= 80%
-> current agreements accepted -> ACTIVE partner -> referral enabled
```

```text
Referral click -> signed first-touch cookie -> new-user signup -> locked attribution
-> persisted Checkout intent -> verified Stripe payment webhook -> pending commission
-> hold period ends -> available commission -> manual payout -> paid commission
```

```text
Paid commission -> customer refund or dispute -> immutable negative adjustment
-> future available balance offset -> historical paid payout remains unchanged
```

## Program defaults

Launch defaults are 20% (`2000` basis points), 12 paid subscription invoices, a 30-day referral window, a 30-day hold, a $50 USD payout minimum, and United States-only applications. Currency arithmetic uses integer cents and basis points. Fractional commission cents are rounded down.

Settings in `.env` initialize `PartnerProgramSettings` only if the singleton does not exist. After initialization, use `/dashboard/admin/partners/settings`. Updates affect future approvals or events and never recalculate existing commissions.

These values require an application restart when changed:

- `PARTNER_REFERRAL_SIGNING_SECRET`
- `PARTNER_COMMUNITY_URL`
- `NEXT_PUBLIC_APP_URL`
- Auth.js, database, and Stripe credentials

Other `PARTNER_*` environment defaults also require a restart to affect first initialization, but have no effect once the settings record exists.

## Safe rollout order

1. Deploy the migration with every partner flag set to `false`.
2. Generate a dedicated referral signing secret, for example with `openssl rand -base64 48`.
3. Promote a known user to administrator:

```bash
npm run partner:admin -- owner@example.com --confirm
```

4. Open `/dashboard/admin/partners/settings` and verify all defaults.
5. Complete legal review of all four policy pages and update their version.
6. Configure the external payout, tax, and compliance process.
7. Enable the program and applications only.
8. Approve and certify internal test partners.
9. Enable referral attribution and validate signup attribution in PostgreSQL.
10. Validate Stripe test-mode commissions, refunds, disputes, and recurring invoices.
11. Enable commission creation.
12. Enable scanner and preview pages only after abuse monitoring is ready.
13. Enable manual payouts only after the payout checklist is operational.

The separate switches allow applications, attribution, commissions, scanner access, public previews, and payouts to be stopped independently.

## Application and certification

Applications are available at `/partners/apply`. Submission requires an authenticated account, approved country, substantive responses, adult confirmation, promotion-standard acceptance, and acknowledgement that earnings are not guaranteed. A database unique key prevents simultaneous pending or waitlisted applications.

Approval creates a `PENDING_TRAINING` profile. It does not activate referrals. Activation requires all eight current modules, an assessment score of at least 80%, and all four current agreement acceptances. Individual terms reacceptance uses a new acceptance timestamp while preserving the old legal record.

Administrators can suspend or terminate partners, disable referrals or scanning, change future financial rules, reset certification, require agreement reacceptance, replace a referral code, set payout eligibility, and flag compliance review. Every change requires a server-authorized administrator and a reason.

## Referral attribution

Public referral entry points are `/r/[code]` and `?ref=[code]`. `src/proxy.ts` converts the query-string form into the canonical route before rendering public content.

The referral cookie is:

- HMAC-SHA256 signed
- HttpOnly
- `SameSite=Lax`
- `Secure` in production
- bounded by the partner-specific referral window
- first valid touch, so later partner links do not overwrite it

The signup action consumes the cookie immediately for email/password registration. Google signups consume it on the first authenticated dashboard request, which is the supported Auth.js fallback in this application. Attribution rejects existing accounts, prior customers, expired context, self-referrals, inactive partners, and tampered cookies.

Administrator attribution overrides require a reason and cannot reassign an attribution after a commission ledger exists.

## Checkout and Stripe metadata

The browser submits only an allowlisted product key. The server creates `PartnerCheckoutIntent` before Checkout, then adds only opaque IDs:

- `partnerId`
- `partnerAttributionId`
- `partnerCheckoutIntentId`

The webhook verifies those IDs against PostgreSQL, the authenticated application user, the partner, the attribution, and the selected catalog product. Client-supplied partner IDs, rates, amounts, and arbitrary Stripe Price IDs are never trusted.

Commission events are processed through the existing raw-body, signature-verified webhook at `/api/stripe/webhook`. Subscribe Stripe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `refund.created`
- `refund.updated`
- `charge.dispute.created`
- `charge.dispute.closed`

Webhook event IDs and financial source keys are both unique. A processing failure rolls back the database transaction and returns an error so Stripe can retry; valid customer entitlement is delayed rather than partially committed or revoked.

## Commission policy

Full Audit commission is created only for a verified paid Checkout Session. Its base is `amount_subtotal - amount_discount`; tax is excluded.

Subscription Checkout completion links attribution but does not create commission. Each verified paid invoice creates at most one commission. The base is the smaller of the tax-exclusive invoice total and amount actually paid. Zero, negative, unpaid, unsupported-product, unsupported-currency, and out-of-window invoices are ignored. Paid-month counting is serialized per attribution, and cancel/resubscribe does not reset it.

The rate, recurring limit, and hold period are copied from the partner profile when the qualifying payment is processed. Historical commissions are not changed by later settings edits.

## Refunds and disputes

Successful refunds create a unique adjustment. Partial refunds calculate the cumulative proportional reversal using integer arithmetic, and cumulative reversals are capped at the original commission. Duplicate refund events do nothing.

An open dispute creates a bounded debit and blocks availability. A won dispute creates a separate restoration; a lost dispute remains reversed. If a refund or dispute occurs after payout, the paid record and payout remain unchanged. The adjustment becomes a negative carry-forward against a future payout.

## Manual payouts

No money is sent by this application. No bank account, routing number, card number, Social Security number, or tax ID is collected.

Before drafting a payout, operations must confirm:

- partner is active, or a terminated partner has an explicit final-payout reason
- payout eligibility is `ELIGIBLE`
- compliance review is `CLEAR`
- current agreements are accepted
- payout method label and contact email are configured
- net balance meets the threshold, or an administrator records an override reason

Draft creation recalculates and reserves all eligible USD commissions and carry adjustments inside one PostgreSQL advisory lock. Approval is separate. After funds are sent externally, record the method, external reference, and reason, then mark it paid. Paid items cannot enter a second payout. Draft and approved payouts may be canceled, releasing their items. Use the administrator CSV export for paid-payout reconciliation.

Tax forms, withholding, recipient verification, sanctions checks, and reporting remain external operational responsibilities in v1.

## Partner Scanner

The scanner is deliberately separate from the full audit pipeline. It:

- uses the existing SSRF-protected public HTTP client
- fetches static public HTML only
- scans at most four pages
- returns no more than three deterministic, evidence-backed findings
- caches by normalized domain and scanner version
- serializes cache claims to prevent duplicate concurrent scans
- enforces partner-specific daily and monthly counters transactionally
- does not call OpenAI, Google Places, competitor analysis, or the audit generator
- does not create customer businesses or audits

The scanner can return fewer than three findings when evidence is insufficient. It cannot prove traffic, conversion rate, rankings, private analytics, engagement, revenue, or visual behavior that is absent from static HTML.

## Prospect previews

Preview URLs use an unguessable token whose hash is stored in PostgreSQL. Pages expire, can be revoked, are `noindex`, expose at most the bounded scanner findings, and omit partner notes, customer data, internal IDs, hidden claims, and full-audit output. Their signup CTA routes through `/r/[code]`, preserving both partner and prospect attribution. The customer always creates and owns their own account.

## Notifications and email

Notifications are stored in PostgreSQL and displayed in-app. Development also logs delivery metadata to the console. No external email provider is configured, and the application never claims an email was delivered. Before launch, connect a provider to the notification service for application decisions, certification, commission, reversal, payout, compliance, and operational alerts.

## Development data

Fixtures are opt-in and local-only. The command refuses production mode and any
database host that is not local. In PowerShell:

```powershell
$env:ALLOW_DEVELOPMENT_FIXTURES="true"
npm run partner:fixtures
```

Unset the flag when the fixture run is complete. Never configure
`ALLOW_DEVELOPMENT_FIXTURES` in a hosted environment.

This creates a pending application, training partner, active partner, visit, referred signup, pending/available/paid/refunded ledger entries, paid payout, prospect, cached scan, and scanner usage. Fixture emails use the reserved `.test` domain.

## Validation

```bash
npx prisma format
npx prisma validate
npx prisma migrate status
npm run test:partners
npm run test:partners:integration
npm run test:billing
npm run test:website-crawler
npm run lint
npx tsc --noEmit
npm run build
```

Run integration tests only against an isolated database whose name contains `partner_test`. Example:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_growth_consultant_partner_test npm run test:partners:integration
```

For browser validation, test public partner pages at 375px, 430px, tablet portrait/landscape, 1366x768, 1440x900, and 1920x1080. Verify keyboard focus, form labels/errors, quiz controls, responsive tables, copy feedback, and no horizontal overflow.

## Troubleshooting

- **Referral link redirects without setting a cookie:** confirm the program, attribution, partner status, and partner referral switch are enabled; verify the production signing secret is configured.
- **Signup is not attributed:** confirm it is a newly created account, has no prior paid history, is not the partner account, and occurred within the cookie window.
- **No commission appears:** verify the relevant flag, webhook signature, catalog Price, persisted Checkout intent, payment status, currency, and event type.
- **Subscription commission is missing:** it is created by `invoice.paid`, not Checkout completion.
- **Payout has no balance:** check hold date, dispute state, net positive amount, existing payout items, and negative carry-forward adjustments.
- **Scanner is blocked:** check program and partner scanner switches, certification status, limits, URL protocol, DNS resolution, redirects, and private-network protection.
- **Environment change has no effect:** database settings override bootstrap defaults after the singleton is initialized.

## Deferred by design

Stripe Connect, automatic payouts, in-app bank/tax data, tax-document generation, international currency payouts, partner-owned customer billing, customer audit access, automatic collaborator access, recruitment/downline commissions, bulk outreach, white-label reports, discount codes, automated tier promotion, and AI-powered scanning are not part of this MVP.
