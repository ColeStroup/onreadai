import assert from "node:assert/strict";
import test from "node:test";

import {
  PlanType,
  SubscriptionStatus,
} from "@prisma/client";
import type Stripe from "stripe";

import {
  getBillingCatalog,
  resolveBillingProduct,
} from "@/lib/billing/catalog";
import { billingConfirmationFromPersistedState } from "@/lib/billing/confirmation";
import {
  handleCheckoutRequest,
  handlePortalRequest,
  handleWebhookRequest,
} from "@/lib/billing/http-handlers";
import { getOrCreateStripeCustomer } from "@/lib/billing/stripe-customer";
import { createStripeCheckoutSession } from "@/lib/billing/stripe-checkout";
import { createStripePortalSession } from "@/lib/billing/stripe-portal";
import { processStripeWebhookEvent } from "@/lib/billing/stripe-webhooks";
import { subscriptionHasPaidAccess } from "@/lib/billing/subscription-policy";

const catalog = getBillingCatalog({
  STRIPE_PRICE_FULL_AUDIT: "price_full",
  STRIPE_PRICE_STARTER_MONTHLY: "price_starter",
  STRIPE_PRICE_PRO_MONTHLY: "price_pro",
});

type FakeUser = {
  id: string;
  name: string | null;
  email: string | null;
  stripeCustomerId: string | null;
};

type FakeSubscription = Record<string, unknown> & {
  id: string;
  userId: string;
  plan: PlanType;
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeProductKey: string | null;
  latestStripeEventCreatedAt: Date | null;
  updatedAt: Date;
};

class FakeBillingDatabase {
  users = new Map<string, FakeUser>();
  subscriptions = new Map<string, FakeSubscription>();
  purchases = new Map<string, Record<string, unknown>>();
  events = new Map<string, Record<string, unknown>>();
  subscriptionWrites = 0;

  constructor() {
    this.users.set("user_1", {
      id: "user_1",
      name: "Test Owner",
      email: "owner@example.com",
      stripeCustomerId: "cus_1",
    });
  }

  user = {} as never;
  userSubscription = {} as never;
  oneTimeAuditPurchase = {} as never;
  stripeWebhookEvent = {} as never;

  $transaction = async <T>(
    callback: (transaction: FakeBillingDatabase) => Promise<T>,
  ) => callback(this);

  initialize() {
    this.user = {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.id === "string") return this.users.get(where.id) ?? null;
        if (typeof where.stripeCustomerId === "string") {
          return (
            [...this.users.values()].find(
              (user) => user.stripeCustomerId === where.stripeCustomerId,
            ) ?? null
          );
        }
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeUser> }) => {
        const current = this.users.get(where.id);
        if (!current) throw new Error("Missing user");
        const updated = { ...current, ...data };
        this.users.set(where.id, updated);
        return updated;
      },
      updateMany: async ({ where, data }: { where: { id: string; stripeCustomerId?: null }; data: Partial<FakeUser> }) => {
        const current = this.users.get(where.id);
        if (!current || (where.stripeCustomerId === null && current.stripeCustomerId !== null)) {
          return { count: 0 };
        }
        this.users.set(where.id, { ...current, ...data });
        return { count: 1 };
      },
    } as never;
    this.userSubscription = {
      findUnique: async ({ where }: { where: { stripeSubscriptionId: string } }) =>
        this.subscriptions.get(where.stripeSubscriptionId) ?? null,
      findFirst: async ({ where }: { where: { userId: string; plan?: PlanType; stripeSubscriptionId?: null } }) =>
        [...this.subscriptions.values()].find(
          (subscription) =>
            subscription.userId === where.userId &&
            (where.plan === undefined || subscription.plan === where.plan) &&
            (where.stripeSubscriptionId === undefined ||
              subscription.stripeSubscriptionId === where.stripeSubscriptionId),
        ) ?? null,
      upsert: async ({ where, create, update }: { where: { stripeSubscriptionId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        this.subscriptionWrites += 1;
        const existing = this.subscriptions.get(where.stripeSubscriptionId);
        const value = {
          ...(existing ?? {}),
          ...(existing ? update : create),
          id: existing?.id ?? `local_${this.subscriptions.size + 1}`,
          updatedAt: new Date(),
        } as FakeSubscription;
        this.subscriptions.set(where.stripeSubscriptionId, value);
        return value;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        this.subscriptionWrites += 1;
        const entry = [...this.subscriptions.entries()].find(([, value]) => value.id === where.id);
        if (!entry) throw new Error("Missing subscription");
        const value = { ...entry[1], ...data, updatedAt: new Date() } as FakeSubscription;
        this.subscriptions.set(entry[0], value);
        return value;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        this.subscriptionWrites += 1;
        const key = typeof data.stripeSubscriptionId === "string"
          ? data.stripeSubscriptionId
          : `one_time_${this.subscriptions.size + 1}`;
        const value = {
          ...data,
          id: `local_${this.subscriptions.size + 1}`,
          stripeSubscriptionId: data.stripeSubscriptionId ?? null,
          updatedAt: new Date(),
        } as FakeSubscription;
        this.subscriptions.set(key, value);
        return value;
      },
    } as never;
    this.oneTimeAuditPurchase = {
      findUnique: async ({ where }: { where: { stripeCheckoutSessionId: string } }) =>
        this.purchases.get(where.stripeCheckoutSessionId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const key = String(data.stripeCheckoutSessionId);
        const value = { id: `purchase_${this.purchases.size + 1}`, ...data };
        this.purchases.set(key, value);
        return value;
      },
    } as never;
    this.stripeWebhookEvent = {
      findUnique: async ({ where }: { where: { stripeEventId: string } }) =>
        this.events.get(where.stripeEventId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const key = String(data.stripeEventId);
        if (this.events.has(key)) {
          throw Object.assign(new Error("Duplicate"), { code: "P2002" });
        }
        const value = { id: `event_${this.events.size + 1}`, ...data };
        this.events.set(key, value);
        return value;
      },
    } as never;
    return this;
  }
}

function stripeSubscription(input: {
  priceId?: string;
  status?: Stripe.Subscription.Status;
  cancelAtPeriodEnd?: boolean;
} = {}) {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    metadata: { appUserId: "user_1" },
    status: input.status ?? "active",
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    items: {
      data: [
        {
          price: { id: input.priceId ?? "price_starter" },
          current_period_start: 1_750_000_000,
          current_period_end: 1_752_592_000,
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function stripeEvent(
  id: string,
  type: Stripe.Event.Type,
  object: object,
  created: number,
) {
  return {
    id,
    object: "event",
    type,
    created,
    data: { object },
    livemode: false,
  } as Stripe.Event;
}

function webhookDependencies(
  database: FakeBillingDatabase,
  input: {
    subscription?: Stripe.Subscription;
    session?: Stripe.Checkout.Session;
  } = {},
) {
  return {
    database: database as never,
    catalog,
    stripe: {
      subscriptions: {
        retrieve: async () => input.subscription ?? stripeSubscription(),
      },
      checkout: {
        sessions: {
          retrieve: async () => {
            if (!input.session) throw new Error("Missing Checkout fixture");
            return input.session;
          },
        },
      },
    } as never,
  };
}

test("checkout rejects unauthenticated users", async () => {
  let called = false;
  const response = await handleCheckoutRequest(
    new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ productKey: "starter_monthly" }),
    }),
    {
      getUser: async () => null,
      createSession: async () => {
        called = true;
        throw new Error("Should not run");
      },
    },
  );

  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("checkout rejects oversized request bodies before creating a session", async () => {
  let called = false;
  const response = await handleCheckoutRequest(
    new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: "x".repeat(2_100),
    }),
    {
      getUser: async () => ({ id: "user_1" }) as never,
      createSession: async () => {
        called = true;
        throw new Error("Should not run");
      },
    },
  );

  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("checkout rejects unknown product keys", async () => {
  const response = await handleCheckoutRequest(
    new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({ productKey: "secret_plan" }),
    }),
    {
      getUser: async () => ({ id: "user_1" }) as never,
      createSession: (input) =>
        createStripeCheckoutSession(input, {
          stripe: { checkout: { sessions: { create: async () => ({}) } } } as never,
          appUrl: "http://localhost:3000",
          resolveProduct: (key) => resolveBillingProduct(key, catalog),
          getCustomer: async () => ({ id: "cus_1" }),
          hasBlockingSubscription: async () => false,
        }),
    },
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "UNKNOWN_PRODUCT");
});

test("checkout refuses arbitrary Price IDs in the request body", async () => {
  let called = false;
  const response = await handleCheckoutRequest(
    new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      body: JSON.stringify({
        productKey: "starter_monthly",
        priceId: "price_attacker",
      }),
    }),
    {
      getUser: async () => ({ id: "user_1" }) as never,
      createSession: async () => {
        called = true;
        throw new Error("Should not run");
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test("checkout creates and then reuses the authenticated user's Stripe customer", async () => {
  const database = new FakeBillingDatabase().initialize();
  const user = database.users.get("user_1")!;
  user.stripeCustomerId = null;
  let creates = 0;
  let retrieves = 0;
  const customer = {
    id: "cus_created",
    object: "customer",
    deleted: false,
  } as unknown as Stripe.Customer;
  const stripe = {
    customers: {
      create: async (params: Stripe.CustomerCreateParams, options: Stripe.RequestOptions) => {
        creates += 1;
        assert.equal(
          params.metadata && typeof params.metadata === "object"
            ? params.metadata.appUserId
            : undefined,
          "user_1",
        );
        assert.equal(options.idempotencyKey, "ai-growth-consultant:customer:user_1");
        return customer;
      },
      retrieve: async (id: string) => {
        retrieves += 1;
        assert.equal(id, "cus_created");
        return customer;
      },
    },
  } as never;

  const first = await getOrCreateStripeCustomer("user_1", {
    stripe,
    database: database as never,
  });
  const second = await getOrCreateStripeCustomer("user_1", {
    stripe,
    database: database as never,
  });

  assert.equal(first.id, "cus_created");
  assert.equal(second.id, "cus_created");
  assert.equal(creates, 1);
  assert.equal(retrieves, 1);
});

test("recurring products create subscription-mode Checkout Sessions", async () => {
  const capturedParams: Stripe.Checkout.SessionCreateParams[] = [];
  const result = await createStripeCheckoutSession(
    { userId: "user_1", productKey: "starter_monthly" },
    {
      stripe: {
        checkout: {
          sessions: {
            create: async (input: Stripe.Checkout.SessionCreateParams) => {
              capturedParams.push(input);
              return { id: "cs_1", url: "https://checkout.stripe.test/cs_1" };
            },
          },
        },
      } as never,
      appUrl: "http://localhost:3000",
      resolveProduct: (key) => resolveBillingProduct(key, catalog),
      getCustomer: async () => ({ id: "cus_1" }),
      hasBlockingSubscription: async () => false,
    },
  );

  const params = capturedParams[0];
  assert.ok(params);
  assert.equal(result.mode, "subscription");
  assert.equal(params.mode, "subscription");
  assert.equal(params.line_items?.[0]?.price, "price_starter");
  assert.equal(params.subscription_data?.metadata?.appUserId, "user_1");
});

test("invalid webhook signatures are rejected before processing", async () => {
  let processed = false;
  const response = await handleWebhookRequest(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "bad" },
      body: "raw-payload",
    }),
    {
      constructEvent: () => {
        throw new Error("Invalid signature");
      },
      webhookSecret: () => "whsec_test",
      processEvent: async () => {
        processed = true;
        return { duplicate: false, userId: null };
      },
    },
  );

  assert.equal(response.status, 400);
  assert.equal(processed, false);
});

test("oversized webhook bodies are rejected before signature processing", async () => {
  let constructed = false;
  const response = await handleWebhookRequest(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "signature" },
      body: "x".repeat(1_000_001),
    }),
    {
      constructEvent: () => {
        constructed = true;
        throw new Error("Should not run");
      },
      webhookSecret: () => "whsec_test",
      processEvent: async () => ({ duplicate: false, userId: null }),
    },
  );

  assert.equal(response.status, 413);
  assert.equal(constructed, false);
});

test("duplicate webhook event IDs do not apply subscription changes twice", async () => {
  const database = new FakeBillingDatabase().initialize();
  const event = stripeEvent(
    "evt_duplicate",
    "customer.subscription.created",
    stripeSubscription(),
    100,
  );
  const dependencies = webhookDependencies(database);

  const first = await processStripeWebhookEvent(event, dependencies);
  const second = await processStripeWebhookEvent(event, dependencies);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(database.subscriptionWrites, 1);
  assert.equal(database.events.size, 1);
});

test("checkout completion validates the purchased Price instead of trusting metadata", async () => {
  const database = new FakeBillingDatabase().initialize();
  const unexpanded = {
    id: "cs_mismatch",
    mode: "payment",
    payment_status: "paid",
  } as Stripe.Checkout.Session;
  const expanded = {
    ...unexpanded,
    customer: "cus_1",
    client_reference_id: "user_1",
    metadata: { appUserId: "user_1", productKey: "pro_monthly" },
    payment_intent: "pi_1",
    line_items: {
      data: [{ quantity: 1, price: { id: "price_full" } }],
    },
  } as unknown as Stripe.Checkout.Session;
  const event = stripeEvent(
    "evt_mismatch",
    "checkout.session.completed",
    unexpanded,
    110,
  );

  await assert.rejects(() =>
    processStripeWebhookEvent(
      event,
      webhookDependencies(database, { session: expanded }),
    ),
  );
  assert.equal(database.purchases.size, 0);
  assert.equal(database.events.size, 0);
});

test("subscription created and updated events synchronize local plan state", async () => {
  const database = new FakeBillingDatabase().initialize();
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_created",
      "customer.subscription.created",
      stripeSubscription(),
      120,
    ),
    webhookDependencies(database),
  );
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_updated",
      "customer.subscription.updated",
      stripeSubscription({ priceId: "price_pro", cancelAtPeriodEnd: true }),
      130,
    ),
    webhookDependencies(database),
  );

  const stored = database.subscriptions.get("sub_1")!;
  assert.equal(stored.plan, PlanType.PRO);
  assert.equal(stored.status, SubscriptionStatus.ACTIVE);
  assert.equal(stored.stripePriceId, "price_pro");
  assert.equal(stored.cancelAtPeriodEnd, true);
});

test("subscription deletion removes recurring paid entitlement", async () => {
  const database = new FakeBillingDatabase().initialize();
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_active",
      "customer.subscription.created",
      stripeSubscription(),
      140,
    ),
    webhookDependencies(database),
  );
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_deleted",
      "customer.subscription.deleted",
      stripeSubscription({ status: "canceled" }),
      150,
    ),
    webhookDependencies(database),
  );

  const status = database.subscriptions.get("sub_1")!.status;
  assert.equal(status, SubscriptionStatus.CANCELED);
  assert.equal(subscriptionHasPaidAccess(status), false);
});

test("stale subscription events cannot overwrite newer state", async () => {
  const database = new FakeBillingDatabase().initialize();
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_newer",
      "customer.subscription.updated",
      stripeSubscription({ priceId: "price_pro" }),
      200,
    ),
    webhookDependencies(database),
  );
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_stale",
      "customer.subscription.updated",
      stripeSubscription({ priceId: "price_starter" }),
      100,
    ),
    webhookDependencies(database),
  );

  assert.equal(database.subscriptions.get("sub_1")!.plan, PlanType.PRO);
  assert.deepEqual(
    database.subscriptions.get("sub_1")!.latestStripeEventCreatedAt,
    new Date(200_000),
  );
});

test("invoice payment failure exposes a past-due billing state", async () => {
  const database = new FakeBillingDatabase().initialize();
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_active_invoice",
      "customer.subscription.created",
      stripeSubscription(),
      210,
    ),
    webhookDependencies(database),
  );
  const invoice = {
    parent: {
      subscription_details: { subscription: "sub_1" },
    },
  } as Stripe.Invoice;
  await processStripeWebhookEvent(
    stripeEvent("evt_failed_invoice", "invoice.payment_failed", invoice, 220),
    webhookDependencies(database, { subscription: stripeSubscription() }),
  );

  const stored = database.subscriptions.get("sub_1")!;
  assert.equal(stored.status, SubscriptionStatus.PAST_DUE);
  assert.deepEqual(stored.lastPaymentFailedAt, new Date(220_000));
  assert.equal(subscriptionHasPaidAccess(stored.status), true);
});

test("one-time fulfillment cannot grant the same audit credit twice", async () => {
  const database = new FakeBillingDatabase().initialize();
  const baseSession = {
    id: "cs_full",
    mode: "payment",
    payment_status: "paid",
  } as Stripe.Checkout.Session;
  const expandedSession = {
    ...baseSession,
    customer: "cus_1",
    client_reference_id: "user_1",
    metadata: { appUserId: "user_1", productKey: "full_audit" },
    payment_intent: "pi_full",
    line_items: {
      data: [{ quantity: 1, price: { id: "price_full" } }],
    },
  } as unknown as Stripe.Checkout.Session;
  const dependencies = webhookDependencies(database, {
    session: expandedSession,
  });

  await processStripeWebhookEvent(
    stripeEvent(
      "evt_full_complete",
      "checkout.session.completed",
      baseSession,
      230,
    ),
    dependencies,
  );
  await processStripeWebhookEvent(
    stripeEvent(
      "evt_full_async",
      "checkout.session.async_payment_succeeded",
      baseSession,
      240,
    ),
    dependencies,
  );

  assert.equal(database.purchases.size, 1);
  assert.equal(
    [...database.subscriptions.values()].filter(
      (subscription) => subscription.plan === PlanType.ONE_TIME_AUDIT,
    ).length,
    1,
  );
});

test("billing portal requires authentication and uses the current user's customer", async () => {
  const unauthorized = await handlePortalRequest({
    getUser: async () => null,
    createSession: async () => {
      throw new Error("Should not run");
    },
  });
  assert.equal(unauthorized.status, 401);

  let portalCustomer = "";
  const session = await createStripePortalSession("user_1", {
    stripe: {
      billingPortal: {
        sessions: {
          create: async ({ customer }: { customer: string }) => {
            portalCustomer = customer;
            return { id: "bps_1", url: "https://billing.stripe.test/session" };
          },
        },
      },
    } as never,
    appUrl: "http://localhost:3000",
    getCustomer: async (userId) => {
      assert.equal(userId, "user_1");
      return { id: "cus_current_user" };
    },
  });

  assert.equal(session.url, "https://billing.stripe.test/session");
  assert.equal(portalCustomer, "cus_current_user");
});

test("the billing success page cannot grant access from a session query parameter", () => {
  const databaseState = {
    hasPaidAccess: false,
    session_id: "cs_claimed_paid",
  };

  assert.equal(
    billingConfirmationFromPersistedState(databaseState),
    "pending",
  );
});
