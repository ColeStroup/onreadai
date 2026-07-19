# Production operations

## Daily signals

Use Vercel logs and provider dashboards. Application logs are one-line JSON with an event name and safe identifiers; they deliberately omit messages, prompts, HTML, email addresses, cookies, tokens, provider payloads, and secrets.

Alert on:

- spikes in `audit_generation_failed`, `competitor_analysis_failed`, or provider error events
- Stripe webhook non-2xx responses or retry growth
- Resend rejection/delivery failure
- database connection exhaustion, latency, storage, or backup failure
- elevated 429/5xx rates
- Vercel function timeouts and audit records stuck in `PENDING`, `QUEUED`, or `RUNNING`

Do not add a public database health endpoint. Vercel deployment checks plus authenticated smoke tests provide health evidence without exposing a new abuse target.

## Audit incidents

Audit work is bounded and runs in Vercel `after()`. A refresh or duplicate click reuses the current active audit. A record older than the 14-minute active window is marked failed and may be rerun safely.

1. Inspect the safe event by `auditId` and Vercel invocation status.
2. Check Render connectivity, target-site failures, OpenAI/Places availability, and Vercel duration limits.
3. Never edit a completed audit to failed because a later page revalidation failed.
4. Ask the owner to rerun after the underlying incident is resolved.
5. For sustained volume or stricter delivery guarantees, move audit orchestration to a durable queue before increasing crawl limits.

## Stripe webhook failures

1. Find the event in Stripe Dashboard and match its event ID to the safe log and `StripeWebhookEvent` table.
2. Confirm endpoint mode, signing secret, supported event, and database availability.
3. Correct the server issue, then use Stripe's replay action. Do not create entitlements or commissions manually unless following an audited reconciliation procedure.
4. Duplicate events are expected to return success without applying state twice.
5. For refunds/disputes, verify immutable partner adjustments and never rewrite a paid payout.

## Feature kill switches

Use `/dashboard/admin/partners/settings` with an authorized admin. Recommended emergency order:

1. Disable new commission creation.
2. Disable referral attribution if new attribution is unsafe.
3. Disable scanner and preview pages for network/abuse incidents.
4. Disable manual payouts while preserving ledger data.
5. Disable the whole Partner Program to remove partner navigation and return 404 from partner workspaces.

Flags are database-backed after first initialization, so changing only Vercel environment values will not overwrite an existing settings row. Keep admin access available to recover flags.

## Database and migrations

- Monitor Render connections, CPU, storage, replication/backup status, and slow queries.
- Runtime traffic uses the pooled URL with a small Prisma adapter pool; migrations use `DIRECT_URL`.
- Run `npm run db:migrate:deploy` from one trusted job, followed by `npm run db:status`.
- Take a backup before risky changes. Never run `prisma migrate dev`, seeds, or destructive down SQL against production.
- Test every migration from zero and against a recent restored snapshot before release.

Run security-record retention weekly from a protected one-off job:

```bash
SECURITY_EVENT_RETENTION_DAYS=31 npm run security:prune
```

The command removes old rate/auth events and already-expired consumed or invalidated auth challenges. It does not remove active challenges, users, billing, audits, or partner ledgers.

## Key rotation

Rotate provider and signing secrets after suspected exposure and on the organization's normal schedule.

- `NEXTAUTH_SECRET` rotation signs users out; coordinate it.
- Verification/reset HMAC rotation invalidates outstanding codes/links.
- Referral signing rotation invalidates existing anonymous referral cookies.
- Stripe webhook secret rotation requires updating the endpoint and Vercel together; retain the old secret only during Stripe's documented overlap.
- Database rotation requires updating pooled and direct URLs and confirming both before revoking the old credential.

Never place old or new values in tickets, screenshots, logs, or documentation.

## User data and deletion requests

Automated destructive account deletion is not available. Do not run `DELETE FROM User` as a support shortcut: cascades and restricted financial relations can remove needed billing data or fail midway.

For a request:

1. Authenticate the requester and open a restricted support record.
2. Stop/cancel active Stripe billing in Stripe and wait for the signed event to reconcile.
3. Increment the user's session version and invalidate sessions, reset tokens, and verification codes.
4. Revoke partner preview tokens owned by the account and stop partner/referral access when applicable.
5. Preserve records legally required for billing, refunds, disputes, tax, fraud, and partner payout reconciliation.
6. Apply the attorney-approved deletion or pseudonymization procedure and communicate what must be retained.

Designing and implementing that retention-aware workflow is a post-launch requirement before expansion into jurisdictions or customers that demand self-service deletion.

## Partner payout operations

- Keep manual payouts disabled until legal, tax, identity, sanctions, and payment procedures are approved.
- Require separation between draft, approval, external payment, and paid reconciliation where staffing allows.
- Store only payout contact labels, not bank, card, government ID, or tax identifiers.
- Treat CSV exports as sensitive operational files and delete local copies according to policy.
- Reconcile negative refund/dispute carry-forwards before each payout.

## Release and rollback cadence

Before each release run schema validation, typecheck, lint, unit/security tests, migration tests, production build, and Preview smoke tests. Capture only synthetic test data in screenshots.

For application rollback, promote the prior Vercel deployment. Do not reverse an additive migration unless a separately reviewed forward repair is impossible. After rollback, retest auth, webhook receipt, audit status polling, and private cache headers.

## Periodic review

- Weekly: failed jobs, Stripe retries, Resend failures, rate-limit volume, backups, and security-data pruning.
- Monthly: dependency audit, provider budgets/quotas, admin/partner access, feature flags, database capacity, and restored-backup drill.
- Quarterly: key rotation plan, CSP/header review, SSRF range tests, legal/privacy text, retention policy, accessibility, and incident exercise.
