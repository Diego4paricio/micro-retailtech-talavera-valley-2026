import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// Compact, SDK-independent views of the Stripe objects Kardo mirrors (ADR
// 019). Sync logic and tests work with these instead of the SDK types, and
// every field read from Stripe is named here once.
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

/** Statuses in which the subscription still governs the workspace plan. */
export const liveSubscriptionStatuses: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
];

/** Statuses that block starting a second Checkout for the same workspace. */
export const openSubscriptionStatuses: readonly SubscriptionStatus[] = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
];

export type BillingInterval = "day" | "week" | "month" | "year";

export type PaymentMethodSnapshot = {
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

/** One line of a subscription: the plan's, or an extra with its quantity
 * (ADR 024). */
export type SubscriptionItemSnapshot = {
  id: string;
  priceId: string;
  planCode: string | null;
  extraCode: string | null;
  quantity: number;
  unitAmount: number | null;
};

export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  livemode: boolean;
  createdAt: Date;
  priceId: string | null;
  /** `metadata.kardo_plan_code` of the Price, else of its Product. */
  planCode: string | null;
  interval: BillingInterval | null;
  intervalCount: number | null;
  unitAmount: number | null;
  currency: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  cancellationReason: string | null;
  cancellationFeedback: string | null;
  paymentMethod: PaymentMethodSnapshot | null;
  latestInvoiceId: string | null;
  /** Set by Kardo's Checkout in `subscription_data.metadata`. */
  workspaceId: string | null;
  profileId: string | null;
  /** Every line: the plan's first, then the extras (ADR 024). */
  items: SubscriptionItemSnapshot[];
};

export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "uncollectible"
  | "void";

export type InvoiceSnapshot = {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  number: string | null;
  status: InvoiceStatus | null;
  billingReason: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  paidAt: Date | null;
  attemptCount: number | null;
  nextPaymentAttempt: Date | null;
  livemode: boolean;
  createdAt: Date;
};

export type PriceSnapshot = {
  id: string;
  productId: string;
  planCode: string | null;
  /** `metadata.kardo_extra_code` of the Price or its Product (ADR 024). */
  extraCode: string | null;
  lookupKey: string | null;
  currency: string;
  unitAmount: number | null;
  interval: BillingInterval | null;
  intervalCount: number | null;
  taxBehavior: "inclusive" | "exclusive" | "unspecified" | null;
  /** Inactive when the Price or its Product is archived. */
  active: boolean;
  livemode: boolean;
};

export type RefundStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled";

export type RefundSnapshot = {
  id: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  paymentIntentId: string | null;
  /** Set by Kardo when Operations issues the refund. */
  invoiceId: string | null;
  reason: string | null;
  livemode: boolean;
  createdAt: Date;
};

export type BillingEventSnapshot = {
  id: string;
  type: string;
  livemode: boolean;
  apiVersion: string | null;
  createdAt: Date;
  objectType: string | null;
  objectId: string | null;
  /** Customer the object belongs to, when the object carries one. */
  customerId: string | null;
  /** checkout.session: the subscription it created. */
  subscriptionId: string | null;
  /** invoice.*: the subscription it bills. */
  invoiceSubscriptionId: string | null;
  /** price.*: product; product.*: itself. */
  productId: string | null;
  customerEmail: string | null;
  /** checkout.session: the customer ticked the Terms of Service box. */
  termsAccepted: boolean;
  /** invoice.upcoming: amount that will be charged (cents, IVA incl.). */
  upcomingAmount: number | null;
  /** invoice.upcoming: when it will be charged. */
  upcomingAt: Date | null;
};

const PLAN_CODE_PATTERN = /^[a-z0-9_-]{2,64}$/;
const EXTRA_CODE_PATTERN = /^[a-z_]{2,32}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INTERVALS = new Set<string>(["day", "week", "month", "year"]);
const TAX_BEHAVIORS = new Set<string>([
  "inclusive",
  "exclusive",
  "unspecified",
]);

function intervalOf(value: string | null | undefined): BillingInterval | null {
  return value && INTERVALS.has(value) ? (value as BillingInterval) : null;
}

function taxBehaviorOf(
  value: string | null | undefined,
): PriceSnapshot["taxBehavior"] {
  return value && TAX_BEHAVIORS.has(value)
    ? (value as PriceSnapshot["taxBehavior"])
    : null;
}

function date(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

function idOf(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function metadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
  pattern: RegExp,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function productOf(
  product: string | Stripe.Product | Stripe.DeletedProduct,
): Stripe.Product | null {
  return typeof product === "object" &&
    !("deleted" in product && product.deleted)
    ? (product as Stripe.Product)
    : null;
}

/** Plan code of a Price: its own metadata first, then its Product's. */
export function planCodeOfPrice(price: Stripe.Price): string | null {
  return (
    metadataValue(price.metadata, "kardo_plan_code", PLAN_CODE_PATTERN) ??
    metadataValue(
      productOf(price.product)?.metadata,
      "kardo_plan_code",
      PLAN_CODE_PATTERN,
    )
  );
}

/** Extra code of a Price (organización, QR y etiquetas, links). */
export function extraCodeOfPrice(price: Stripe.Price): string | null {
  return (
    metadataValue(price.metadata, "kardo_extra_code", EXTRA_CODE_PATTERN) ??
    metadataValue(
      productOf(price.product)?.metadata,
      "kardo_extra_code",
      EXTRA_CODE_PATTERN,
    )
  );
}

export function toPriceSnapshot(price: Stripe.Price): PriceSnapshot {
  const product = productOf(price.product);
  return {
    id: price.id,
    productId: idOf(price.product) ?? "",
    planCode: planCodeOfPrice(price),
    extraCode: extraCodeOfPrice(price),
    lookupKey: price.lookup_key ?? null,
    currency: price.currency,
    unitAmount: price.unit_amount ?? null,
    interval: intervalOf(price.recurring?.interval),
    intervalCount: price.recurring?.interval_count ?? null,
    taxBehavior: taxBehaviorOf(price.tax_behavior),
    active: price.active && (product ? product.active : true),
    livemode: price.livemode,
  };
}

function paymentMethodOf(
  value: string | Stripe.PaymentMethod | null | undefined,
): PaymentMethodSnapshot | null {
  if (!value || typeof value === "string") return null;
  const card = value.card;
  return {
    type: value.type,
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    expMonth: card?.exp_month ?? null,
    expYear: card?.exp_year ?? null,
  };
}

function customerDefaultPaymentMethod(
  customer: Stripe.Subscription["customer"],
): string | Stripe.PaymentMethod | null {
  if (typeof customer !== "object" || customer === null) return null;
  if ("deleted" in customer && customer.deleted) return null;
  return (
    (customer as Stripe.Customer).invoice_settings?.default_payment_method ??
    null
  );
}

/** Expects `items.data.price.product`, `default_payment_method` and
 * `customer.invoice_settings.default_payment_method` expanded. */
export function toSubscriptionSnapshot(
  subscription: Stripe.Subscription,
): SubscriptionSnapshot {
  // The plan's line carries the plan, its interval and period; the extras
  // are lines of their own (ADR 024). Before extras there was one line.
  const items: SubscriptionItemSnapshot[] = subscription.items.data.map(
    (line) => ({
      id: line.id,
      priceId: line.price.id,
      planCode: planCodeOfPrice(line.price),
      extraCode: extraCodeOfPrice(line.price),
      quantity: line.quantity ?? 1,
      unitAmount: line.price.unit_amount ?? null,
    }),
  );
  const item =
    subscription.items.data.find((line) => planCodeOfPrice(line.price)) ??
    subscription.items.data[0];
  const price = item?.price ?? null;
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer) ?? "",
    status: subscription.status as SubscriptionStatus,
    livemode: subscription.livemode,
    createdAt: new Date(subscription.created * 1000),
    priceId: price?.id ?? null,
    planCode: price ? planCodeOfPrice(price) : null,
    interval: intervalOf(price?.recurring?.interval),
    intervalCount: price?.recurring?.interval_count ?? null,
    unitAmount: price?.unit_amount ?? null,
    currency: price?.currency ?? subscription.currency ?? null,
    // Since API 2025-03-31 the billing period lives on each item.
    currentPeriodStart: date(item?.current_period_start),
    currentPeriodEnd: date(item?.current_period_end),
    trialStart: date(subscription.trial_start),
    trialEnd: date(subscription.trial_end),
    // With the API version Kardo uses (2026-08-26.dahlia) the portal
    // schedules a cancellation with `cancel_at` (the period end) and leaves
    // `cancel_at_period_end` false (seen in the sandbox, video 3). For Kardo
    // both mean "scheduled to cancel": the panel says so, the cancellation
    // notice with its folio goes out and no renewal notice does.
    cancelAtPeriodEnd:
      subscription.cancel_at_period_end || subscription.cancel_at !== null,
    cancelAt: date(subscription.cancel_at),
    canceledAt: date(subscription.canceled_at),
    endedAt: date(subscription.ended_at),
    cancellationReason: subscription.cancellation_details?.reason ?? null,
    cancellationFeedback: subscription.cancellation_details?.feedback ?? null,
    // The subscription's card, else the customer's default (set when the
    // customer updates the card in the portal).
    paymentMethod:
      paymentMethodOf(subscription.default_payment_method) ??
      paymentMethodOf(customerDefaultPaymentMethod(subscription.customer)),
    latestInvoiceId: idOf(subscription.latest_invoice),
    workspaceId: metadataValue(
      subscription.metadata,
      "kardo_workspace_id",
      UUID_PATTERN,
    ),
    profileId: metadataValue(
      subscription.metadata,
      "kardo_profile_id",
      UUID_PATTERN,
    ),
    items: [
      ...items.filter((line) => line.planCode),
      ...items.filter((line) => !line.planCode),
    ],
  };
}

/** Subscription an invoice bills (moved under `parent` in API 2025-03-31). */
export function subscriptionIdOfInvoice(
  invoice: Stripe.Invoice,
): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

function httpsOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value.startsWith("https://")
    ? value
    : null;
}

export function toInvoiceSnapshot(invoice: Stripe.Invoice): InvoiceSnapshot {
  const tax = (invoice.total_taxes ?? []).reduce(
    (sum, entry) => sum + (entry.amount ?? 0),
    0,
  );
  return {
    id: invoice.id ?? "",
    customerId: idOf(invoice.customer) ?? "",
    subscriptionId: subscriptionIdOfInvoice(invoice),
    number: invoice.number ?? null,
    status: (invoice.status as InvoiceStatus | null) ?? null,
    billingReason: invoice.billing_reason ?? null,
    currency: invoice.currency,
    subtotal: invoice.subtotal ?? null,
    tax: invoice.total_taxes ? tax : null,
    total: invoice.total,
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    amountRemaining: invoice.amount_remaining ?? null,
    hostedInvoiceUrl: httpsOrNull(invoice.hosted_invoice_url),
    invoicePdf: httpsOrNull(invoice.invoice_pdf),
    periodStart: date(invoice.period_start),
    periodEnd: date(invoice.period_end),
    paidAt: date(invoice.status_transitions?.paid_at),
    attemptCount: invoice.attempt_count ?? null,
    nextPaymentAttempt: date(invoice.next_payment_attempt),
    livemode: invoice.livemode,
    createdAt: new Date(invoice.created * 1000),
  };
}

/** Refunds carry no `livemode`: the caller passes the gateway's. */
export function toRefundSnapshot(
  refund: Stripe.Refund,
  livemode: boolean,
): RefundSnapshot {
  return {
    id: refund.id,
    amount: refund.amount,
    currency: refund.currency,
    status: (refund.status ?? "pending") as RefundStatus,
    paymentIntentId: idOf(refund.payment_intent),
    invoiceId: metadataValue(
      refund.metadata,
      "kardo_invoice_id",
      /^in_[A-Za-z0-9]{6,64}$/,
    ),
    reason: refund.metadata?.kardo_reason?.slice(0, 500) ?? null,
    livemode,
    createdAt: new Date(refund.created * 1000),
  };
}

type EventObject = {
  id?: string;
  object?: string;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  product?: string | { id: string } | null;
  email?: string | null;
  mode?: string;
  parent?: Stripe.Invoice["parent"];
  consent?: { terms_of_service?: string | null } | null;
  amount_due?: number;
  next_payment_attempt?: number | null;
  period_end?: number | null;
};

export function toEventSnapshot(event: Stripe.Event): BillingEventSnapshot {
  const object = event.data.object as EventObject;
  const objectType = object.object ?? null;
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    apiVersion: event.api_version ?? null,
    createdAt: new Date(event.created * 1000),
    objectType,
    objectId: object.id ?? null,
    customerId:
      objectType === "customer" ? (object.id ?? null) : idOf(object.customer),
    subscriptionId:
      objectType === "checkout.session" ? idOf(object.subscription) : null,
    invoiceSubscriptionId:
      objectType === "invoice"
        ? idOf(object.parent?.subscription_details?.subscription ?? null)
        : null,
    productId:
      objectType === "product"
        ? (object.id ?? null)
        : objectType === "price"
          ? idOf(object.product)
          : null,
    customerEmail:
      objectType === "customer" && typeof object.email === "string"
        ? object.email.slice(0, 320)
        : null,
    termsAccepted:
      objectType === "checkout.session" &&
      object.consent?.terms_of_service === "accepted",
    upcomingAmount:
      objectType === "invoice" && typeof object.amount_due === "number"
        ? object.amount_due
        : null,
    upcomingAt:
      objectType === "invoice"
        ? date(object.next_payment_attempt ?? object.period_end ?? null)
        : null,
  };
}
