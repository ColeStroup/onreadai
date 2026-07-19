# Production readiness

Status as of July 17, 2026: **READY WITH MANUAL CONFIGURATION**.

This status means no known code-level launch blocker remains after the validation recorded below. It does not mean the application can be exposed publicly with placeholder credentials. The provider, domain, legal, monitoring, and live-payment steps in `production-deployment.md` are mandatory launch work.

## Intended production architecture

- Vercel runs the Next.js 16 App Router application in the Node.js runtime.
- A paid Render PostgreSQL 16 database is the system of record.
- Prisma uses Render's pooled external connection for application traffic and the direct external connection for migrations.
- Auth.js provides credentials and Google OAuth sessions.
- Resend delivers verification and password-reset email.
- Stripe Checkout, signed webhooks, and Customer Portal control paid access.
- OpenAI explains stored evidence; deterministic analyzers remain the source of audit scores and findings.
- Google Places is optional enrichment for public business listing discovery.

## Production changes completed

- Removed the direct plan-switch mutation, development billing UI, raw audit debug route, default Next assets, stale placeholders, and the local tunneling binary.
- Removed fabricated business/competitor profile discovery. Only submitted URLs and actual provider results are stored.
- Removed mock chat responses from production. Provider failure is shown as unavailable and does not create a fake assistant message.
- Centralized environment validation, AI client configuration, safe structured logging, and feature-flag inventory.
- Added explicit Stripe test/live mode separation, bounded payloads, same-origin checks, distributed rate limits, and server-authoritative fulfillment tests.
- Added tenant-scoped report loading and regression coverage for cross-user report access.
- Added SSRF controls for protocols, ports, credentials, DNS results, IPv4/IPv6 ranges, redirects, timeouts, response size, and socket-level DNS rebinding.
- Bounded website and competitor crawls. Audit-integrated refreshes analyze no more than four uncached competitors per run; additional competitors can be refreshed individually.
- Added private no-store/noindex headers, a restrictive CSP, HSTS in public production, route error boundaries, and generic failure storage.
- Made partner scanner cache output tenant-neutral and protected payout CSV from spreadsheet formula injection.
- Added additive database-backed rate-limit storage and a retention command.
- Removed the unused Lighthouse dependency and its development-only advisory tree. Removed an ineffective Next/PostCSS override that caused npm to report an invalid dependency tree.
- Corrected zero-state evidence validation so an honest absence of competitor profiles does not create a stale-evidence warning.

## Environment classification

`NEXT_PUBLIC_APP_URL` is the only browser-exposed environment variable. It contains an origin, never a secret. Every credential, signing key, database URL, provider key, policy value, and admin operation remains server-only.

Required for the public production environment:

- `APP_ENVIRONMENT=production`
- `DATABASE_URL`, `DIRECT_URL`, and the database pool settings
- `NEXT_PUBLIC_APP_URL=https://onread.ai`, `NEXTAUTH_URL=https://onread.ai`, and `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, and `EMAIL_REPLY_TO`
- `EMAIL_VERIFICATION_SECRET`, `PASSWORD_RESET_SECRET`, and `RATE_LIMIT_SECRET`
- `OPENAI_API_KEY` and optional `OPENAI_MODEL`
- `STRIPE_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and all three live Price IDs
- `PARTNER_REFERRAL_SIGNING_SECRET`
- Explicit partner flags, which should all begin as `false`

Optional product enrichment: `GOOGLE_PLACES_API_KEY` (or the legacy `GOOGLE_MAPS_API_KEY` fallback), `PARTNER_COMMUNITY_URL`, and partner policy overrides. Missing Places configuration limits listing discovery but does not invent data.

## Feature flags

All flags default to `false` in development and production. Environment values seed the singleton settings row only on first use; the database becomes authoritative afterward.

| Environment variable | Direct route or operation | Server behavior when disabled |
| --- | --- | --- |
| `PARTNER_PROGRAM_ENABLED` | Partner workspace and all subfeatures | Partner routes return 404; partner navigation is hidden |
| `PARTNER_APPLICATIONS_OPEN` | `/partners/apply` submission | Submission is rejected; status remains viewable |
| `PARTNER_REFERRAL_ATTRIBUTION_ENABLED` | `/r/[code]`, signup attribution | Redirect continues without setting or consuming attribution |
| `PARTNER_COMMISSION_CREATION_ENABLED` | Verified Stripe event commission creation | No new commission is created |
| `PARTNER_SCANNER_ENABLED` | Partner Scanner | Scanner UI is unavailable and the scanner claim is rejected |
| `PARTNER_PREVIEW_PAGES_ENABLED` | Preview creation and `/preview/[token]` | Creation is rejected and public tokens return 404 |
| `PARTNER_MANUAL_PAYOUT_ENABLED` | Admin payout workflow | Payout operations are rejected |

Admin routes remain role-protected and available to inspect or change flags. Hiding navigation is never the only control.

## Security posture

- Auth cookies are HttpOnly and secure in production; JWTs are invalidated with `sessionVersion` after password resets.
- Verification codes and reset tokens are purpose-separated HMAC values at rest, expiring, single-use, and rate-limited.
- Google sign-in accepts only verified-email evidence and retains Auth.js safe account-linking defaults.
- Business, audit, report, chat, recommendation, competitor, partner, and admin reads/mutations are scoped by authenticated owner or role.
- Stripe webhooks use raw-body signatures and database idempotency. Checkout return parameters never grant access.
- Expensive mutations use PostgreSQL-backed limits rather than in-memory state.
- Crawled HTML is bounded and reduced to structured evidence. Raw HTML is not returned to users or sent wholesale to OpenAI.
- AI output cannot authorize users, change entitlement state, or create audit evidence.
- Logs omit messages, prompts, email addresses, tokens, cookies, provider payloads, and secrets.

## Validation evidence

- Clean lockfile install with `npm ci`: passed; dependency tree is valid.
- Prisma schema format, validation, and generation: passed.
- All 20 migrations applied successfully to the active local database.
- All 20 migrations applied from zero to multiple disposable PostgreSQL 16 databases; migration status was current and each database was removed afterward.
- TypeScript and ESLint: passed.
- Unit suites: 110 passed after the zero-profile evidence regression was added.
- Production security suite: 25 passed, including SSRF, DNS rebinding, distributed rate limiting, tenant isolation, origin checks, cleanup assertions, and CSV safety.
- Isolated partner lifecycle integration: passed.
- Optimized Next.js build: passed with no metadata or type warnings.
- Production-server HTTP smoke: public pages returned 200; private dashboard access redirected to sign-in; expired preview and removed debug routes returned 404; private pages returned `no-store` and `noindex`; security headers were present and `X-Powered-By` was absent.
- Production-mode Playwright: 34 unique project/test executions passed across credentials auth, password reset, marketing/SEO, partner public flows, authenticated dashboard actions, PDF authorization/download, Presentation Mode, and a complete social-first onboarding/audit journey.
- Axe checks passed on the tested marketing, auth, partner, dashboard, and presentation surfaces. Responsive checks covered 375x812 through 1920x1080 with no tested overflow.
- The social-first production journey confirmed that Website and SEO scores are omitted, the report shows not provided, and website-only recommendations are absent when no website is supplied.
- `npm audit` reports four moderate production-package entries representing two advisory roots: Next's bundled PostCSS and NextAuth's UUID dependency. No high or critical advisories remain, and npm offers no compatible non-breaking fix for either chain.

## Change inventory

Key files added include centralized environment, logging, rate-limit, request-origin, SSRF, feature-flag, submitted-profile discovery, AI client, retention, migration, and production-flow test modules under `src/`, `scripts/`, `prisma/migrations/`, and `tests/`. The deployment set is documented in:

- `docs/production-readiness.md`
- `docs/production-deployment.md`
- `docs/production-operations.md`
- `docs/stripe-setup.md`

Key files changed include `.env.example`, `.gitignore`, `.vercelignore`, `next.config.ts`, `package.json`, `package-lock.json`, `prisma.config.ts`, `prisma/schema.prisma`, Auth.js/email/Stripe configuration, audit and competitor runners, partner authorization/settings/scanner/referral/payout flows, private route layouts and handlers, public metadata/robots/sitemap/legal pages, and the Playwright configurations.

Confirmed removals include the customer billing mutation, raw audit debug page, fabricated business and competitor discovery modules, mock consultant module, obsolete mock-audit filename, dead placeholder surfaces, default Next starter assets, local tunnel binary, root debug logs, and generated report/build artifacts. Isolated test fixtures and deterministic report/email templates remain because they are not production execution shortcuts.

## Residual and manual risks

1. Provider setup, DNS, real email delivery, live Stripe fulfillment, and Google OAuth callback validation require the account owner.
2. Terms, Privacy, Partner terms, commission policy, scanner policy, payout process, and tax/compliance workflow require qualified legal and tax review before commercial launch.
3. Automated account deletion is intentionally not implemented because billing and partner financial records require retention-aware handling. Support-assisted requests need an approved policy and runbook before broad release.
4. Audit work uses Vercel `after()` within a bounded function, not a durable queue. Use a Vercel plan that supports the configured 800-second audit duration. A platform interruption is marked failed after the stale window and can be rerun; a durable queue is the recommended scale-up path.
5. `npm audit` reports a moderate `uuid` advisory through NextAuth 4.24.14. The affected buffer-writing UUID APIs are not called by this application, and npm offers only a major incompatible path. Monitor Auth.js releases and upgrade when a supported fixed release is available.
6. Next 16.2.10 bundles PostCSS 8.4.31, which carries a moderate CSS-stringification XSS advisory. Onread does not stringify user-controlled CSS at runtime. npm cannot replace this bundled copy safely; monitor the next compatible Next.js release.
7. Vercel structured logs are present, but alert routing and retention must be configured manually.

Do not promote the deployment until every item in the deployment sign-off checklist is complete.
