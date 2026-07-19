# Stripe billing setup

Stripe Checkout, Customer Portal, and signed webhooks are the only billing authority. A checkout return URL never grants access. PostgreSQL changes only after a verified Stripe event is processed idempotently.

## Modes

- Local and Vercel Preview: `STRIPE_MODE=test` with `sk_test_`, test Price IDs, and a test webhook secret.
- Public production: `STRIPE_MODE=live` with `sk_live_`, live Price IDs, and the live endpoint's webhook secret.
- Public production startup rejects test mode. Preview and development reject live credentials.

Never copy test products, customers, Price IDs, or webhook secrets into live configuration; Stripe keeps the two modes separate.

## Products

Create these products with the prices already displayed by the application. Do not change application pricing during deployment.

| Product | Price type | Variable |
| --- | --- | --- |
| Full Audit | One-time | `STRIPE_PRICE_FULL_AUDIT` |
| Starter | Monthly recurring | `STRIPE_PRICE_STARTER_MONTHLY` |
| Pro | Monthly recurring | `STRIPE_PRICE_PRO_MONTHLY` |

Agency remains unavailable and has no checkout Price.

## Local test setup

1. Create the three test-mode Prices.
2. Set `STRIPE_MODE=test`, `STRIPE_SECRET_KEY`, and the three test Price IDs in `.env`.
3. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. Put the CLI's current `whsec_` value in `STRIPE_WEBHOOK_SECRET` and restart the app.
5. Activate and configure the test-mode Customer Portal in Stripe Dashboard.
6. Test successful, declined, 3DS, cancellation, refund, dispute, and failed-renewal paths with Stripe test instruments.

## Live setup

1. Activate the Stripe account and complete all business verification.
2. Recreate the three products and Prices in live mode.
3. Configure the live Customer Portal, including cancellation and payment-method behavior.
4. Add `https://onread.ai/api/stripe/webhook` as a live webhook endpoint.
5. Subscribe only to the events below.
6. Store the live secret, Price IDs, and endpoint signing secret in Vercel's Production environment only.
7. Set `STRIPE_MODE=live` and redeploy.
8. Make one controlled live purchase, confirm the signed event, entitlement, portal, cancellation behavior, and refund handling, then refund the test purchase if appropriate.

Supported events:

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

## Fulfillment rules

- The browser sends one allowlisted product key, never an arbitrary Price ID.
- Checkout customer, user, product, and partner attribution are revalidated server-side.
- Webhook signatures are checked against the raw body and payloads are capped at 1 MB.
- Event IDs and fulfillment source keys are unique, making retries idempotent.
- `active` and `trialing` subscriptions have recurring access. `past_due` preserves temporary access with a warning. Unpaid, incomplete, paused, expired, and canceled subscriptions do not.
- One-time purchases create one idempotent audit credit.

## Troubleshooting

- `BILLING_UNAVAILABLE`: inspect the structured Vercel error event and verify mode/key consistency without logging the key.
- Invalid signature: the endpoint's `whsec_` does not match the environment or the payload was not delivered raw.
- Checkout completed but access is pending: inspect the corresponding event and webhook response in Stripe Dashboard; replay after correcting the server issue.
- Portal unavailable: activate the portal in the same Stripe mode/account as the configured key.

Stripe documentation: [webhooks](https://docs.stripe.com/webhooks), [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live), and [Customer Portal](https://docs.stripe.com/customer-management).
