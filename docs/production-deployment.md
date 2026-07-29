# Production deployment

This runbook deploys `https://onread.ai` to Vercel with a paid Render PostgreSQL database. Keep all partner features disabled for the first production deployment.

## 1. Create Render PostgreSQL

1. Create a paid PostgreSQL 16 database in the region closest to the selected Vercel functions.
2. Enable Render's integrated connection pooling when available.
3. Record two **external** TLS URLs because Vercel cannot use Render's private network URL:
   - Runtime `DATABASE_URL`: pooled PgBouncer endpoint, normally port `6432`, with `sslmode=require`.
   - Migration `DIRECT_URL`: direct endpoint, normally port `5432`, with `sslmode=require`.
4. Set `DATABASE_POOL_MAX=3`, `DATABASE_CONNECTION_TIMEOUT_MS=10000`, and `DATABASE_IDLE_TIMEOUT_MS=10000` in Vercel.
5. Enable Render backups and record the restore procedure before migrating.

Render references: [connection pooling](https://render.com/docs/postgresql-connection-pooling) and [connecting to PostgreSQL](https://render.com/docs/postgresql-creating-connecting).

## 2. Run production migrations

Run migrations from a trusted workstation or protected CI job using `DIRECT_URL`. Do not run seeds and do not add migration execution to application startup.

```bash
npm ci
npm run db:validate
npm run db:migrate:deploy
npm run db:status
```

The migration history is additive. `prisma.config.ts` selects `DIRECT_URL` for
migration commands. The selective AI audit migration adds tenant-scoped page
analysis cache and internal usage telemetry tables; it does not change scores,
prices, or entitlements. Take a Render backup before future high-risk schema
changes.

Prisma connection guidance: [connection management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections).

## 3. Configure the Vercel project

1. Import the repository and select Node.js 20, 22, or 24 within the package engine range.
2. Use `npm run vercel-build` as the Build Command and `npm start` only for non-Vercel hosting. Do not configure a seed command.
3. Enable Fluid Compute and a plan whose function-duration limit supports `maxDuration=800` for the audit run page. If the project cannot support that duration, do not launch audits until a durable background worker is added.
4. Configure `onread.ai` and the intended `www` redirect, then verify TLS.
5. Scope variables separately: Production uses live services; Preview uses test services and `APP_ENVIRONMENT=preview`.

Vercel reference: [function duration](https://vercel.com/docs/functions/configuring-functions/duration).

## 4. Set Vercel Production variables

Use the Vercel encrypted environment UI or CLI. Never paste values into source files.

```text
APP_ENVIRONMENT=production
DATABASE_URL=<Render pooled external TLS URL>
DIRECT_URL=<Render direct external TLS URL>
DATABASE_POOL_MAX=3
DATABASE_CONNECTION_TIMEOUT_MS=10000
DATABASE_IDLE_TIMEOUT_MS=10000
NEXT_PUBLIC_APP_URL=https://onread.ai
NEXTAUTH_URL=https://onread.ai
NEXTAUTH_SECRET=<random 48+ character secret>
GOOGLE_CLIENT_ID=<production OAuth client ID>
GOOGLE_CLIENT_SECRET=<production OAuth client secret>
RESEND_API_KEY=<production key>
EMAIL_FROM_NAME=Onread
EMAIL_FROM_ADDRESS=notifications@updates.onread.ai
EMAIL_REPLY_TO=support@onread.ai
EMAIL_VERIFICATION_SECRET=<independent random secret>
PASSWORD_RESET_SECRET=<independent random secret>
RATE_LIMIT_SECRET=<independent random secret>
OPENAI_API_KEY=<production project key>
OPENAI_MODEL=gpt-5.4-mini
OPENAI_AUDIT_PAGE_MODEL=gpt-5.4-mini
OPENAI_AUDIT_SYNTHESIS_MODEL=gpt-5.4-mini
AI_ASSISTED_AUDITS_ENABLED=false
STRIPE_MODE=live
STRIPE_SECRET_KEY=<live secret>
STRIPE_WEBHOOK_SECRET=<live endpoint signing secret>
STRIPE_PRICE_FULL_AUDIT=<live Price ID>
STRIPE_PRICE_STARTER_MONTHLY=<live Price ID>
STRIPE_PRICE_PRO_MONTHLY=<live Price ID>
PARTNER_REFERRAL_SIGNING_SECRET=<independent random secret>
PARTNER_PROGRAM_ENABLED=false
PARTNER_APPLICATIONS_OPEN=false
PARTNER_REFERRAL_ATTRIBUTION_ENABLED=false
PARTNER_COMMISSION_CREATION_ENABLED=false
PARTNER_SCANNER_ENABLED=false
PARTNER_PREVIEW_PAGES_ENABLED=false
PARTNER_MANUAL_PAYOUT_ENABLED=false
```

Add `GOOGLE_PLACES_API_KEY` only after restricting the key to the required Places API and setting account quotas. `PARTNER_COMMUNITY_URL` is optional and HTTPS-only. Never set `ALLOW_DEVELOPMENT_FIXTURES` in Vercel.

Production startup rejects missing required values, non-TLS database URLs, incorrect public origins, test Stripe keys, short secrets, duplicate Price IDs, and malformed flags. `VERCEL_ENV` takes precedence over a conflicting app-stage value.

## 5. Configure Google OAuth

1. Create or select the production Google Cloud project and OAuth consent screen.
2. Add `https://onread.ai` as an authorized JavaScript origin.
3. Add exactly `https://onread.ai/api/auth/callback/google` as an authorized redirect URI.
4. Put the production client ID and secret in Vercel Production only.
5. Test new-account sign-in, existing Google sign-in, sign-out, rejected unverified-email evidence, and the safe account-linking error path.

## 6. Configure Resend

1. Verify `updates.onread.ai` in Resend and publish the requested SPF/DKIM records.
2. Confirm `notifications@updates.onread.ai` is allowed as the sender and `support@onread.ai` receives replies.
3. Set the production API key and exact sender values above.
4. Test one real signup code and one password-reset email. Verify links use `https://onread.ai`, messages do not land in spam, and provider failures produce a generic retry state.

## 7. Configure Stripe live mode

Follow `stripe-setup.md`. Create live products and Prices, activate the live portal, create the webhook at `https://onread.ai/api/stripe/webhook`, subscribe to the documented events, and use the endpoint-specific signing secret. A controlled real transaction is required before sign-off.

## 8. Configure AI and Places

1. Use a dedicated OpenAI production project with a hard monthly budget, usage alerts, and a key scoped to this application.
2. Keep `OPENAI_MODEL` explicit. `OPENAI_AUDIT_PAGE_MODEL` and
   `OPENAI_AUDIT_SYNTHESIS_MODEL` are optional per-task overrides; when omitted,
   both audit routes inherit `OPENAI_MODEL`. Chat and content assistance may use
   AI; audit scoring may not.
3. Configure Google Places quotas and restrictions if listing discovery is enabled.
4. Verify provider failure states. The app must show unavailable/limited data and never substitute fabricated findings.

Selective AI-assisted audits are additionally gated by
`AI_ASSISTED_AUDITS_ENABLED`. Keep it `false` for the initial deployment. Follow
the staged rollout and cost-monitoring checklist in
[`selective-ai-audit-analysis.md`](./selective-ai-audit-analysis.md) before
enabling it. Public production startup requires `OPENAI_API_KEY` and resolvable
page-analysis and synthesis models while the flag is on. The deterministic
audit remains active while the flag is off.

## 9. Bootstrap administration and flags

No production seed is required. The partner settings singleton and published training modules are created idempotently when needed. Development fixtures refuse production and remote databases.

After the owner has created and verified a normal account, run from a trusted environment with the production `DIRECT_URL`:

```bash
npm run partner:admin -- owner@example.com --confirm
```

Open `/dashboard/admin/partners/settings`, confirm every flag is off, and verify policy defaults. The command only updates the named existing user once; normal requests do not overwrite roles.

## 10. Deploy and sign off

1. Deploy to Preview with test Stripe/provider credentials and run the browser smoke matrix.
2. Deploy to Production with all flags off.
3. Verify `/`, pricing, Terms, Privacy, signup, credentials sign-in, Google sign-in, email verification, password reset, dashboard ownership, business onboarding, social-only onboarding, audit run, report, PDF, presentation, chat, and billing.
4. Verify private pages return `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`.
5. Verify security headers and CSP in the browser console.
6. Complete the controlled live Stripe purchase and refund.
7. Configure alerts, then enable only the product flags approved for launch.

## 11. Manual prelaunch smoke checklist

These checks require real provider accounts or human review and were not claimed as passed by the repository validation:

- [ ] Receive a real Resend signup verification email at an external mailbox.
- [ ] Receive a real Resend password-reset email and confirm Reply-To reaches `support@onread.ai`.
- [ ] Sign in with the production Google OAuth client, then sign out.
- [ ] Complete Stripe test Checkout, receive the signed webhook, and confirm entitlement state.
- [ ] Open Stripe Customer Portal and return safely to Billing.
- [ ] Before commercial launch, complete the controlled live Stripe purchase/refund procedure in `stripe-setup.md`.
- [ ] Run an audit against a controlled public website and inspect crawl evidence.
- [ ] Add, analyze, and compare a controlled competitor.
- [ ] Ask the AI Consultant questions grounded in a known audit and verify provider-failure behavior.
- [ ] Download and inspect a PDF; open and navigate Presentation Mode.
- [ ] Complete signup and core dashboard navigation on a physical mobile device.
- [ ] Follow a partner referral, complete signup, and verify first-touch attribution.
- [ ] Exercise Partner Scanner quotas with approved public test domains.
- [ ] Verify owner admin access and denial for a non-admin account.
- [ ] Verify logout, expired verification code, invalid/used reset link, and unauthorized report URL behavior.
- [ ] Verify a disabled partner feature URL returns 404 or a blocked state.
- [ ] Inspect the 404 page and a controlled production error boundary without exposing internals.
- [ ] Confirm Vercel alerts, Render backups, Resend alerts, Stripe webhook alerts, and OpenAI budget alerts reach the operator.

## Rollback

- Application regression: promote the previous known-good Vercel deployment. Additive database migrations remain in place.
- Provider misconfiguration: disable the affected feature or restore the prior secret, then redeploy. Do not log secret values.
- Database incident: stop writes, preserve logs, and use a verified Render point-in-time restore. Do not run ad hoc down migrations.
- Billing incident: disable checkout UI by removing/invalidating Price configuration only during a coordinated incident, keep the signed webhook available for retries, and reconcile Stripe before restoring sales.
