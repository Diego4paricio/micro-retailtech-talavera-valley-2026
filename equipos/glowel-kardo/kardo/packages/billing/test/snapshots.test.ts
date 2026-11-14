import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  planCodeOfPrice,
  toEventSnapshot,
  toInvoiceSnapshot,
  toPriceSnapshot,
  toRefundSnapshot,
  toSubscriptionSnapshot,
} from "../src/snapshots.js";

const workspaceId = "f6399f75-b398-41cd-a299-92b6d236c1fd";
const profileId = "e6abf26a-3263-4149-9d75-9b7441165d29";

function product(metadata: Record<string, string> = {}, active = true) {
  return {
    id: "prod_Negocio01",
    object: "product",
    active,
    metadata,
  } as unknown as Stripe.Product;
}

function price(overrides: Record<string, unknown> = {}): Stripe.Price {
  return {
    id: "price_NegocioMes01",
    object: "price",
    active: true,
    currency: "mxn",
    unit_amount: 29900,
    lookup_key: "kardo_negocio_month",
    livemode: false,
    tax_behavior: "inclusive",
    recurring: { interval: "month", interval_count: 1 },
    metadata: {},
    product: product({ kardo_plan_code: "negocio" }),
    ...overrides,
  } as unknown as Stripe.Price;
}

describe("planCodeOfPrice", () => {
  it("prefers the Price metadata over the Product's", () => {
    expect(
      planCodeOfPrice(price({ metadata: { kardo_plan_code: "pro" } })),
    ).toBe("pro");
    expect(planCodeOfPrice(price())).toBe("negocio");
  });

  it("ignores codes that are not plan codes", () => {
    expect(
      planCodeOfPrice(
        price({
          metadata: { kardo_plan_code: "DROP TABLE" },
          product: product({}),
        }),
      ),
    ).toBeNull();
    expect(planCodeOfPrice(price({ product: "prod_Unexpanded01" }))).toBeNull();
  });
});

describe("toPriceSnapshot", () => {
  it("maps a recurring MXN price", () => {
    expect(toPriceSnapshot(price())).toEqual({
      id: "price_NegocioMes01",
      productId: "prod_Negocio01",
      planCode: "negocio",
      extraCode: null,
      lookupKey: "kardo_negocio_month",
      currency: "mxn",
      unitAmount: 29900,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
      active: true,
      livemode: false,
    });
  });

  it("reads the extra code of an extra's price (ADR 024)", () => {
    expect(
      toPriceSnapshot(
        price({ product: product({ kardo_extra_code: "organization" }) }),
      ),
    ).toMatchObject({ planCode: null, extraCode: "organization" });
  });

  it("is inactive when its Product is archived", () => {
    expect(
      toPriceSnapshot(
        price({ product: product({ kardo_plan_code: "negocio" }, false) }),
      ).active,
    ).toBe(false);
  });
});

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_Kardo0001",
    object: "subscription",
    customer: "cus_Kardo0001",
    status: "trialing",
    livemode: false,
    created: 1_790_000_000,
    currency: "mxn",
    trial_start: 1_790_000_000,
    trial_end: 1_791_209_600,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    cancellation_details: { reason: null, feedback: null, comment: null },
    default_payment_method: {
      id: "pm_1",
      type: "card",
      card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 },
    },
    latest_invoice: "in_Kardo0001",
    metadata: { kardo_workspace_id: workspaceId, kardo_profile_id: profileId },
    items: {
      data: [
        {
          price: price(),
          current_period_start: 1_790_000_000,
          current_period_end: 1_791_209_600,
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("toSubscriptionSnapshot", () => {
  it("reads the period from the item (API 2025-03-31+)", () => {
    const snapshot = toSubscriptionSnapshot(subscription());
    expect(snapshot.currentPeriodEnd?.toISOString()).toBe(
      new Date(1_791_209_600 * 1000).toISOString(),
    );
    expect(snapshot.planCode).toBe("negocio");
    expect(snapshot.unitAmount).toBe(29900);
    expect(snapshot.paymentMethod).toEqual({
      type: "card",
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
    });
    expect(snapshot.workspaceId).toBe(workspaceId);
    expect(snapshot.profileId).toBe(profileId);
    expect(snapshot.latestInvoiceId).toBe("in_Kardo0001");
  });

  it("a cancellation scheduled in the portal counts as scheduled", () => {
    // The portal sets cancel_at (the period end), not cancel_at_period_end.
    const portal = toSubscriptionSnapshot(
      subscription({
        status: "active",
        cancel_at_period_end: false,
        cancel_at: 1_791_209_600,
        canceled_at: 1_790_100_000,
      }),
    );
    expect(portal.cancelAtPeriodEnd).toBe(true);
    expect(portal.cancelAt?.toISOString()).toBe(
      new Date(1_791_209_600 * 1000).toISOString(),
    );
    const viaApi = toSubscriptionSnapshot(
      subscription({ status: "active", cancel_at_period_end: true }),
    );
    expect(viaApi.cancelAtPeriodEnd).toBe(true);
    // Renewed in the portal: Stripe clears cancel_at.
    expect(
      toSubscriptionSnapshot(subscription({ status: "active" }))
        .cancelAtPeriodEnd,
    ).toBe(false);
  });

  it("drops metadata that is not a uuid and unexpanded payment methods", () => {
    const snapshot = toSubscriptionSnapshot(
      subscription({
        metadata: { kardo_workspace_id: "x' or 1=1", kardo_profile_id: "" },
        default_payment_method: "pm_1",
      }),
    );
    expect(snapshot.workspaceId).toBeNull();
    expect(snapshot.profileId).toBeNull();
    expect(snapshot.paymentMethod).toBeNull();
  });
});

describe("toInvoiceSnapshot", () => {
  it("finds the subscription under parent and sums taxes", () => {
    const snapshot = toInvoiceSnapshot({
      id: "in_Kardo0001",
      object: "invoice",
      customer: "cus_Kardo0001",
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_Kardo0001" },
      },
      number: "KARDO-0001",
      status: "paid",
      billing_reason: "subscription_cycle",
      currency: "mxn",
      subtotal: 29900,
      total_taxes: [{ amount: 4124 }],
      total: 29900,
      amount_due: 29900,
      amount_paid: 29900,
      amount_remaining: 0,
      hosted_invoice_url: "https://invoice.stripe.com/i/abc",
      invoice_pdf: "http://not-https.example/pdf",
      period_start: 1_790_000_000,
      period_end: 1_792_592_000,
      status_transitions: { paid_at: 1_790_000_100 },
      attempt_count: 1,
      next_payment_attempt: null,
      livemode: false,
      created: 1_790_000_000,
    } as unknown as Stripe.Invoice);
    expect(snapshot.subscriptionId).toBe("sub_Kardo0001");
    expect(snapshot.tax).toBe(4124);
    expect(snapshot.hostedInvoiceUrl).toBe("https://invoice.stripe.com/i/abc");
    expect(snapshot.invoicePdf).toBeNull();
    expect(snapshot.paidAt?.getTime()).toBe(1_790_000_100 * 1000);
  });
});

describe("toRefundSnapshot", () => {
  it("keeps Kardo's invoice link and uses the gateway livemode", () => {
    const snapshot = toRefundSnapshot(
      {
        id: "re_Kardo0001",
        object: "refund",
        amount: 10000,
        currency: "mxn",
        status: "succeeded",
        payment_intent: "pi_Kardo0001",
        metadata: {
          kardo_invoice_id: "in_Kardo0001",
          kardo_reason: "Cobro duplicado",
        },
        created: 1_790_000_000,
      } as unknown as Stripe.Refund,
      true,
    );
    expect(snapshot).toMatchObject({
      invoiceId: "in_Kardo0001",
      paymentIntentId: "pi_Kardo0001",
      reason: "Cobro duplicado",
      livemode: true,
    });
  });
});

describe("toEventSnapshot", () => {
  function event(type: string, object: Record<string, unknown>): Stripe.Event {
    return {
      id: "evt_Kardo0001",
      object: "event",
      type,
      livemode: false,
      api_version: "2026-08-26.dahlia",
      created: 1_790_000_000,
      data: { object },
    } as unknown as Stripe.Event;
  }

  it("reads a completed Checkout with consent", () => {
    const snapshot = toEventSnapshot(
      event("checkout.session.completed", {
        id: "cs_test_1",
        object: "checkout.session",
        customer: "cus_Kardo0001",
        subscription: "sub_Kardo0001",
        consent: { terms_of_service: "accepted" },
      }),
    );
    expect(snapshot).toMatchObject({
      objectType: "checkout.session",
      customerId: "cus_Kardo0001",
      subscriptionId: "sub_Kardo0001",
      termsAccepted: true,
    });
  });

  it("reads invoice, price and customer events", () => {
    expect(
      toEventSnapshot(
        event("invoice.paid", {
          id: "in_Kardo0001",
          object: "invoice",
          customer: "cus_Kardo0001",
          parent: { subscription_details: { subscription: "sub_Kardo0001" } },
        }),
      ).invoiceSubscriptionId,
    ).toBe("sub_Kardo0001");
    expect(
      toEventSnapshot(
        event("price.updated", {
          id: "price_1",
          object: "price",
          product: "prod_Negocio01",
        }),
      ).productId,
    ).toBe("prod_Negocio01");
    const customer = toEventSnapshot(
      event("customer.updated", {
        id: "cus_Kardo0001",
        object: "customer",
        email: "dueno@negocio.mx",
      }),
    );
    expect(customer.customerId).toBe("cus_Kardo0001");
    expect(customer.customerEmail).toBe("dueno@negocio.mx");
    expect(customer.termsAccepted).toBe(false);
  });
});
