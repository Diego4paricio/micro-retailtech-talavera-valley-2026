import Stripe from "stripe";
import {
  type BillingEventSnapshot,
  type InvoiceSnapshot,
  type PriceSnapshot,
  type RefundSnapshot,
  type SubscriptionSnapshot,
  toEventSnapshot,
  toInvoiceSnapshot,
  toPriceSnapshot,
  toRefundSnapshot,
  toSubscriptionSnapshot,
} from "./snapshots.js";

/** API version pinned by stripe@22.6.2. Webhook endpoints must use it too. */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

export type CheckoutInput = {
  customerId: string;
  priceId: string;
  workspaceId: string;
  profileId: string;
  /** The person's billing account (ADR 024). */
  accountId?: string | null;
  /** Null: no trial (not offered, or already used). */
  trialDays: number | null;
  trialRequiresCard: boolean;
  /**
   * First charge on this date instead of today: the rest of the Kardo trial
   * (ADR 020 §3, only when 5 or more days remain). The card is always
   * collected, and Checkout shows the date of the first charge.
   */
  trialEnd?: Date | null;
  /** Manual "IVA 16%" Tax Rate (inclusive), when configured. */
  taxRateId: string | null;
  /**
   * `hosted` (default): Stripe's page, back through `successUrl` or
   * `cancelUrl`. `embedded`: Checkout inside the panel (`ui_mode:
   * embedded_page`), which comes back to `returnUrl` once paid.
   */
  uiMode?: CheckoutUiMode;
  successUrl: string;
  cancelUrl: string;
  /** Embedded only; must carry `{CHECKOUT_SESSION_ID}`. */
  returnUrl?: string | null;
  /** Require ticking the Terms of Service box (LFPC art. 76 Bis: express
   * consent to the recurring charge). Needs the Terms URL set in the
   * Stripe Dashboard (Settings → Public details). */
  requireTermsConsent: boolean;
  /** Public Terms page, linked from the consent box (Markdown link). */
  termsUrl: string | null;
  /** Billing interval of `priceId`, for the text under the pay button. */
  interval: "month" | "year";
  /**
   * Coupon applied in Checkout (ADR 020 §1: the conversion coupon). Stripe
   * does not combine `discounts` with promotion codes, so they are off.
   */
  couponId?: string | null;
  /** Kardo look (ADR 020, relevo 18 §4.5); null keeps the account's. */
  branding?: CheckoutBranding | null;
};

export type CheckoutUiMode = "hosted" | "embedded";

/** A new Checkout Session: hosted ones have `url`, embedded ones the
 * `clientSecret` that Stripe.js mounts. */
export type CheckoutSessionResult = {
  id: string;
  url: string | null;
  clientSecret: string | null;
};

/** What the panel's return page needs to know about a Checkout Session. */
export type CheckoutSessionState = {
  id: string;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  /** `client_reference_id`: the workspace that started it. */
  workspaceId: string | null;
  subscriptionId: string | null;
};

/**
 * Checkout Session `branding_settings` (API 2026-08-26.dahlia). Stripe
 * accepts a logo or an icon, never both; the files are uploaded once with
 * the Files API (`business_logo` / `business_icon`) by setup-billing.mts.
 */
export type CheckoutBranding = {
  displayName: string;
  backgroundColor: string;
  buttonColor: string;
  borderStyle: "rounded" | "rectangular" | "pill";
  /** One of Stripe's font families; Geist is not offered, `inter` is the
   * closest. */
  fontFamily: string;
  logoFileId: string | null;
  iconFileId: string | null;
};

/** Kardo brand colors (Docs/Marca): teal button over the cream background. */
export const KARDO_CHECKOUT_BRANDING: Omit<
  CheckoutBranding,
  "logoFileId" | "iconFileId"
> = {
  displayName: "Kardo",
  backgroundColor: "#f7f5f0",
  buttonColor: "#0a6c78",
  borderStyle: "rounded",
  fontFamily: "inter",
};

const CHARGE_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

/** Text under the pay button: when the first charge happens. */
export function checkoutSubmitMessage(input: {
  trialEnd: Date | null;
  interval: "month" | "year";
  couponId?: string | null;
}): string {
  const renews = input.interval === "year" ? "cada año" : "cada mes";
  if (input.trialEnd) {
    return `Hoy no se cobra nada: tu primer cargo es el ${CHARGE_DATE.format(input.trialEnd)} y después se renueva ${renews} hasta que lo canceles.`;
  }
  return input.couponId
    ? `Se cobra hoy con tu descuento y se renueva ${renews} hasta que lo canceles.`
    : `Se cobra hoy y se renueva ${renews} hasta que lo canceles.`;
}

/**
 * The Checkout Session Kardo creates (ADR 019, ADR 020 §1 and §3). Pure, so
 * the parameters are tested without Stripe. The embedded page takes the same
 * session (coupon, trial, branding, consent, texts), but comes back to one
 * `return_url` instead of the success and cancel URLs.
 */
export function checkoutSessionParams(
  input: CheckoutInput,
): Stripe.Checkout.SessionCreateParams {
  const trial = input.trialEnd
    ? { trial_end: Math.floor(input.trialEnd.getTime() / 1000) }
    : input.trialDays
      ? {
          trial_period_days: input.trialDays,
          trial_settings: {
            end_behavior: { missing_payment_method: "cancel" as const },
          },
        }
      : {};
  const taxRates = input.taxRateId ? [input.taxRateId] : undefined;
  const branding = input.branding;
  const submit = checkoutSubmitMessage({
    trialEnd: input.trialEnd ?? null,
    interval: input.interval,
    couponId: input.couponId ?? null,
  });
  const embedded = input.uiMode === "embedded";
  if (embedded && !input.returnUrl?.includes("{CHECKOUT_SESSION_ID}")) {
    throw new Error(
      "Embedded Checkout needs a return URL with the session id.",
    );
  }
  return {
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: input.workspaceId,
    line_items: [
      {
        price: input.priceId,
        quantity: 1,
        ...(taxRates ? { tax_rates: taxRates } : {}),
      },
    ],
    subscription_data: {
      metadata: {
        kardo_workspace_id: input.workspaceId,
        kardo_profile_id: input.profileId,
        ...(input.accountId ? { kardo_account_id: input.accountId } : {}),
      },
      ...trial,
      ...(taxRates ? { default_tax_rates: taxRates } : {}),
    },
    payment_method_collection:
      !input.trialEnd && input.trialDays && !input.trialRequiresCard
        ? "if_required"
        : "always",
    ...(input.couponId
      ? { discounts: [{ coupon: input.couponId }] }
      : { allow_promotion_codes: true }),
    locale: "es-419",
    ...(branding
      ? {
          branding_settings: {
            display_name: branding.displayName,
            background_color: branding.backgroundColor,
            button_color: branding.buttonColor,
            border_style: branding.borderStyle,
            font_family: branding.fontFamily,
            // Stripe takes a logo or an icon, not both, and neither on the
            // embedded page (verified in the sandbox): the panel around it
            // already shows the Kardo brand.
            ...(embedded
              ? {}
              : branding.logoFileId
                ? {
                    logo: {
                      type: "file" as const,
                      file: branding.logoFileId,
                    },
                  }
                : branding.iconFileId
                  ? {
                      icon: {
                        type: "file" as const,
                        file: branding.iconFileId,
                      },
                    }
                  : {}),
          },
        }
      : {}),
    billing_address_collection: "auto",
    customer_update: { name: "auto", address: "auto" },
    tax_id_collection: { enabled: true },
    metadata: {
      kardo_workspace_id: input.workspaceId,
      ...(input.accountId ? { kardo_account_id: input.accountId } : {}),
    },
    ...(input.requireTermsConsent
      ? { consent_collection: { terms_of_service: "required" as const } }
      : {}),
    custom_text: {
      submit: { message: submit },
      ...(input.requireTermsConsent
        ? {
            terms_of_service_acceptance: {
              message: `Acepto los ${
                input.termsUrl
                  ? `[Términos y Condiciones de Suscripción](${input.termsUrl})`
                  : "Términos y Condiciones de Suscripción"
              } de Kardo y el cargo recurrente de este plan, que se renueva automáticamente hasta que lo canceles.`,
            },
          }
        : {}),
    },
    ...(embedded
      ? { ui_mode: "embedded_page" as const, return_url: input.returnUrl ?? "" }
      : { success_url: input.successUrl, cancel_url: input.cancelUrl }),
  };
}

function checkoutStatus(value: string | null): CheckoutSessionState["status"] {
  return value === "complete" || value === "expired" ? value : "open";
}

function paymentStatus(value: string): CheckoutSessionState["paymentStatus"] {
  return value === "paid" || value === "no_payment_required" ? value : "unpaid";
}

export type PortalFlow =
  | "default"
  | "payment_method_update"
  | "subscription_update"
  | "subscription_update_confirm"
  | "subscription_cancel";

export type PortalInput = {
  customerId: string;
  returnUrl: string;
  flow: PortalFlow;
  /** Required by the subscription flows. */
  subscriptionId: string | null;
  /** Target price of `subscription_update_confirm`. */
  priceId?: string | null;
};

/** One movement of the Stripe balance (a charge, a refund, a payout…),
 * for the accountant's monthly reconciliation. Cents. */
export type BalanceMovement = {
  id: string;
  /** `charge`, `payment`, `refund`, `payout`, `stripe_fee`… */
  type: string;
  amount: number;
  /** Stripe's processing fee, without its IVA. */
  fee: number;
  /** The IVA Stripe charged on that fee (fee detail of type `tax`). */
  feeTax: number;
  net: number;
  currency: string;
  created: Date;
  /** `ch_…`, `re_…`, `po_…`; null when Stripe gave none. */
  sourceId: string | null;
  /** Customer of the charge (or of the refunded charge), when known. */
  customerId: string | null;
};

/**
 * A change of a subscription's lines (ADR 024): the plan's price, or an
 * extra's quantity. An existing line goes by `id`; a new one by `price`;
 * `deleted` removes an extra. Charged now for what is left of the period
 * (`always_invoice`, ADR 020 §5).
 */
export type SubscriptionChange = {
  subscriptionId: string;
  items: Array<{
    id?: string;
    price?: string;
    quantity?: number;
    deleted?: boolean;
  }>;
};

/** What a change costs: today (prorated) and at the next renewal. Cents. */
export type SubscriptionChangePreview = {
  amountDueToday: number;
  nextAmount: number | null;
  currency: string;
  nextChargeAt: Date | null;
};

export type RefundInput = {
  invoiceId: string;
  /** Cents; omitted for the full amount paid. */
  amount?: number;
  reason: string;
  staffId: string;
  idempotencyKey: string;
};

/**
 * Everything Kardo asks of Stripe, behind one interface so the APIs and the
 * sync logic can be tested with a fake. Every read returns a compact
 * snapshot (see snapshots.ts); `null` means the object does not exist.
 */
export type BillingGateway = {
  readonly livemode: boolean;
  verifyEvent(
    payload: Buffer | string,
    signature: string,
  ): Promise<BillingEventSnapshot>;
  createCustomer(input: {
    workspaceId: string;
    workspaceName: string;
    email: string;
    profileId: string;
    /** One Customer per person (ADR 024). */
    accountId?: string | null;
  }): Promise<string>;
  /** What a change of lines costs, without changing anything. */
  previewSubscriptionChange(
    change: SubscriptionChange,
  ): Promise<SubscriptionChangePreview>;
  /** Applies it only if today's charge is paid (else Stripe refuses and
   * nothing changes). */
  applySubscriptionChange(
    change: SubscriptionChange & { idempotencyKey: string },
  ): Promise<SubscriptionSnapshot>;
  createCheckoutSession(input: CheckoutInput): Promise<CheckoutSessionResult>;
  getCheckoutSession(id: string): Promise<CheckoutSessionState | null>;
  createPortalSession(input: PortalInput): Promise<string>;
  getSubscription(id: string): Promise<SubscriptionSnapshot | null>;
  getInvoice(id: string): Promise<InvoiceSnapshot | null>;
  getPrice(id: string): Promise<PriceSnapshot | null>;
  /** Every recurring Price (active or archived), optionally of one Product. */
  listPrices(filter?: { productId?: string }): Promise<PriceSnapshot[]>;
  getRefund(id: string): Promise<RefundSnapshot | null>;
  findInvoiceForPaymentIntent(paymentIntentId: string): Promise<string | null>;
  cancelSubscription(
    id: string,
    mode: "period_end" | "immediately",
    reason: string,
  ): Promise<SubscriptionSnapshot>;
  resumeSubscription(id: string): Promise<SubscriptionSnapshot>;
  extendTrial(id: string, trialEnd: Date): Promise<SubscriptionSnapshot>;
  refundInvoice(input: RefundInput): Promise<RefundSnapshot>;
  customerDashboardUrl(customerId: string): string;
  /**
   * Balance movements created in [from, to), for the monthly accounting
   * report (Staff API). Optional so fakes need not implement it; the
   * restricted key needs "Balance transactions: read".
   */
  listBalanceMovements?(
    from: Date,
    to: Date,
    limit?: number,
  ): Promise<BalanceMovement[]>;
};

export class BillingGatewayError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_REFUNDABLE"
      | "NOT_TRIALING"
      | "NOT_UPDATABLE"
      | "SIGNATURE_INVALID",
  ) {
    super(message);
    this.name = "BillingGatewayError";
  }
}

/** True for any error raised by the Stripe SDK (API, network, auth). */
export function isStripeError(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeError;
}

const SUBSCRIPTION_EXPAND = [
  "items.data.price.product",
  "default_payment_method",
  "customer.invoice_settings.default_payment_method",
] as const;

function isMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    (error.statusCode === 404 || error.code === "resource_missing")
  );
}

async function orNull<T>(action: () => Promise<T>): Promise<T | null> {
  try {
    return await action();
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function createStripeGateway(options: {
  secretKey: string;
  webhookSecret?: string;
  /** Tests point this at a stub server. */
  host?: string;
  port?: number;
  protocol?: "http" | "https";
}): BillingGateway {
  const stripe = new Stripe(options.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Kardo", url: "https://kardo.mx" },
    ...(options.host ? { host: options.host } : {}),
    ...(options.port ? { port: options.port } : {}),
    ...(options.protocol ? { protocol: options.protocol } : {}),
  });
  const livemode = /^(sk|rk)_live_/.test(options.secretKey);

  async function retrieveSubscription(id: string) {
    return toSubscriptionSnapshot(
      await stripe.subscriptions.retrieve(id, {
        expand: [...SUBSCRIPTION_EXPAND],
      }),
    );
  }

  return {
    livemode,

    async verifyEvent(payload, signature) {
      if (!options.webhookSecret) {
        throw new BillingGatewayError(
          "Webhook secret is not configured.",
          "SIGNATURE_INVALID",
        );
      }
      try {
        const event = await stripe.webhooks.constructEventAsync(
          payload,
          signature,
          options.webhookSecret,
        );
        return toEventSnapshot(event);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
          throw new BillingGatewayError(
            "Invalid Stripe signature.",
            "SIGNATURE_INVALID",
          );
        }
        throw error;
      }
    },

    async createCustomer(input) {
      const customer = await stripe.customers.create(
        {
          email: input.email,
          name: input.workspaceName,
          preferred_locales: ["es-419", "es"],
          metadata: {
            kardo_workspace_id: input.workspaceId,
            kardo_created_by: input.profileId,
            ...(input.accountId ? { kardo_account_id: input.accountId } : {}),
          },
        },
        // One Customer per person (per workspace before ADR 024) even if
        // two requests race.
        {
          idempotencyKey: input.accountId
            ? `kardo-customer-account-${input.accountId}`
            : `kardo-customer-${input.workspaceId}`,
        },
      );
      return customer.id;
    },

    async previewSubscriptionChange(change) {
      const subscription = await stripe.subscriptions.retrieve(
        change.subscriptionId,
      );
      const customer =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      const prorationDate = Math.floor(Date.now() / 1000);
      // `always_invoice`: the preview is the invoice made right away, with
      // only the prorations of the change.
      const today = await stripe.invoices.createPreview({
        ...(customer ? { customer } : {}),
        subscription: change.subscriptionId,
        subscription_details: {
          items: change.items,
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
        },
      });
      // Without prorations: the next renewal with the new lines.
      const next = await stripe.invoices.createPreview({
        ...(customer ? { customer } : {}),
        subscription: change.subscriptionId,
        subscription_details: {
          items: change.items,
          proration_behavior: "none",
        },
      });
      return {
        amountDueToday: Math.max(today.amount_due, 0),
        nextAmount: next.amount_due,
        currency: today.currency,
        nextChargeAt: next.period_end ? new Date(next.period_end * 1000) : null,
      };
    },

    async applySubscriptionChange(change) {
      return toSubscriptionSnapshot(
        await stripe.subscriptions.update(
          change.subscriptionId,
          {
            items: change.items,
            proration_behavior: "always_invoice",
            payment_behavior: "error_if_incomplete",
            expand: [...SUBSCRIPTION_EXPAND],
          },
          { idempotencyKey: change.idempotencyKey },
        ),
      );
    },

    async createCheckoutSession(input) {
      const session = await stripe.checkout.sessions.create(
        checkoutSessionParams(input),
      );
      if (input.uiMode === "embedded") {
        if (!session.client_secret) {
          throw new Error("Stripe returned no Checkout client secret.");
        }
        return {
          id: session.id,
          url: null,
          clientSecret: session.client_secret,
        };
      }
      if (!session.url) throw new Error("Stripe returned no Checkout URL.");
      return { id: session.id, url: session.url, clientSecret: null };
    },

    getCheckoutSession: (id) =>
      orNull(async () => {
        const session = await stripe.checkout.sessions.retrieve(id);
        const subscription = session.subscription;
        return {
          id: session.id,
          status: checkoutStatus(session.status),
          paymentStatus: paymentStatus(session.payment_status),
          workspaceId: session.client_reference_id ?? null,
          subscriptionId:
            typeof subscription === "string"
              ? subscription
              : (subscription?.id ?? null),
        };
      }),

    async createPortalSession(input) {
      if (input.flow === "subscription_update_confirm") {
        if (!input.subscriptionId || !input.priceId) {
          throw new BillingGatewayError(
            "A subscription and a target price are required.",
            "NOT_UPDATABLE",
          );
        }
        // The portal needs the subscription item to change; the mirror does
        // not keep it, so read it from Stripe.
        const subscription = await stripe.subscriptions.retrieve(
          input.subscriptionId,
        );
        const item = subscription.items.data[0];
        if (!item || subscription.items.data.length !== 1) {
          throw new BillingGatewayError(
            "Only single-item subscriptions can change plan here.",
            "NOT_UPDATABLE",
          );
        }
        const session = await stripe.billingPortal.sessions.create({
          customer: input.customerId,
          return_url: input.returnUrl,
          locale: "es-419",
          flow_data: {
            type: "subscription_update_confirm",
            subscription_update_confirm: {
              subscription: input.subscriptionId,
              items: [{ id: item.id, price: input.priceId, quantity: 1 }],
            },
            after_completion: {
              type: "redirect",
              redirect: { return_url: input.returnUrl },
            },
          },
        });
        return session.url;
      }
      const flowData =
        input.flow === "payment_method_update"
          ? { type: "payment_method_update" as const }
          : input.flow === "subscription_cancel" && input.subscriptionId
            ? {
                type: "subscription_cancel" as const,
                subscription_cancel: { subscription: input.subscriptionId },
              }
            : input.flow === "subscription_update" && input.subscriptionId
              ? {
                  type: "subscription_update" as const,
                  subscription_update: { subscription: input.subscriptionId },
                }
              : null;
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
        locale: "es-419",
        ...(flowData ? { flow_data: flowData } : {}),
      });
      return session.url;
    },

    getSubscription: (id) => orNull(() => retrieveSubscription(id)),

    getInvoice: (id) =>
      orNull(async () => toInvoiceSnapshot(await stripe.invoices.retrieve(id))),

    getPrice: (id) =>
      orNull(async () =>
        toPriceSnapshot(
          await stripe.prices.retrieve(id, { expand: ["product"] }),
        ),
      ),

    async listPrices(filter) {
      const prices: PriceSnapshot[] = [];
      for await (const price of stripe.prices.list({
        type: "recurring",
        limit: 100,
        expand: ["data.product"],
        ...(filter?.productId ? { product: filter.productId } : {}),
      })) {
        prices.push(toPriceSnapshot(price));
        if (prices.length >= 1000) break;
      }
      return prices;
    },

    getRefund: (id) =>
      orNull(async () =>
        toRefundSnapshot(await stripe.refunds.retrieve(id), livemode),
      ),

    async findInvoiceForPaymentIntent(paymentIntentId) {
      const payments = await stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntentId },
        limit: 1,
      });
      const invoice = payments.data[0]?.invoice;
      if (!invoice) return null;
      return typeof invoice === "string" ? invoice : (invoice.id ?? null);
    },

    async listBalanceMovements(from, to, limit = 5000) {
      const movements: BalanceMovement[] = [];
      const pages = stripe.balanceTransactions.list({
        created: {
          gte: Math.floor(from.getTime() / 1000),
          lt: Math.floor(to.getTime() / 1000),
        },
        limit: 100,
        expand: ["data.source"],
      });
      for await (const item of pages) {
        if (movements.length >= limit) break;
        const source = item.source as
          | string
          | {
              id?: string;
              object?: string;
              customer?: unknown;
              charge?: unknown;
            }
          | null;
        const sourceId =
          typeof source === "string" ? source : (source?.id ?? null);
        let customerId: string | null = null;
        if (source && typeof source === "object") {
          const customer =
            source.customer ??
            (source.charge && typeof source.charge === "object"
              ? (source.charge as { customer?: unknown }).customer
              : null);
          customerId =
            typeof customer === "string"
              ? customer
              : customer && typeof customer === "object"
                ? ((customer as { id?: string }).id ?? null)
                : null;
        }
        const feeTax = (item.fee_details ?? [])
          .filter((detail) => detail.type === "tax")
          .reduce((sum, detail) => sum + detail.amount, 0);
        movements.push({
          id: item.id,
          type: item.type,
          amount: item.amount,
          fee: item.fee - feeTax,
          feeTax,
          net: item.net,
          currency: item.currency,
          created: new Date(item.created * 1000),
          sourceId,
          customerId,
        });
      }
      return movements;
    },

    async cancelSubscription(id, mode, reason) {
      const details = { comment: reason.slice(0, 500) };
      const subscription =
        mode === "immediately"
          ? await stripe.subscriptions.cancel(id, {
              cancellation_details: details,
              expand: [...SUBSCRIPTION_EXPAND],
            })
          : await stripe.subscriptions.update(id, {
              cancel_at_period_end: true,
              cancellation_details: details,
              expand: [...SUBSCRIPTION_EXPAND],
            });
      return toSubscriptionSnapshot(subscription);
    },

    async resumeSubscription(id) {
      return toSubscriptionSnapshot(
        await stripe.subscriptions.update(id, {
          cancel_at_period_end: false,
          expand: [...SUBSCRIPTION_EXPAND],
        }),
      );
    },

    async extendTrial(id, trialEnd) {
      const current = await retrieveSubscription(id);
      if (current.status !== "trialing") {
        throw new BillingGatewayError(
          "Only a trialing subscription can be extended.",
          "NOT_TRIALING",
        );
      }
      return toSubscriptionSnapshot(
        await stripe.subscriptions.update(id, {
          trial_end: Math.floor(trialEnd.getTime() / 1000),
          proration_behavior: "none",
          expand: [...SUBSCRIPTION_EXPAND],
        }),
      );
    },

    async refundInvoice(input) {
      const payments = await stripe.invoicePayments.list({
        invoice: input.invoiceId,
        status: "paid",
        limit: 1,
      });
      const paymentIntent = payments.data[0]?.payment.payment_intent;
      const paymentIntentId =
        typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id;
      if (!paymentIntentId) {
        throw new BillingGatewayError(
          "The invoice has no card payment to refund.",
          "NOT_REFUNDABLE",
        );
      }
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          ...(input.amount ? { amount: input.amount } : {}),
          reason: "requested_by_customer",
          metadata: {
            kardo_invoice_id: input.invoiceId,
            kardo_reason: input.reason.slice(0, 500),
            kardo_staff_id: input.staffId,
          },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return toRefundSnapshot(refund, livemode);
    },

    customerDashboardUrl(customerId) {
      return `https://dashboard.stripe.com/${livemode ? "" : "test/"}customers/${customerId}`;
    },
  };
}
