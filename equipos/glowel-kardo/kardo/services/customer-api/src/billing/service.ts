import { createHash } from "node:crypto";
import {
  type AccessReconciler,
  type AccessTickResult,
  type BillingEventSnapshot,
  type BillingGateway,
  BillingGatewayError,
  type BillingPauseClient,
  type BillingSync,
  type CheckoutBranding,
  CONVERSION_COUPON,
  cents,
  type EventResult,
  type InvoiceRow,
  invoiceColumns,
  isStripeError,
  KEEP_TRIAL_MIN_DAYS,
  liveSubscriptionStatuses,
  type NoticeSender,
  openSubscriptionStatuses,
  type PlanOverageTickResult,
  type PortalFlow,
  readWorkspaceAccess,
  readWorkspaceTrial,
  runPlanOverageTick,
  type SubscriptionChange,
  type SubscriptionRow,
  subscriptionColumns,
  toMirroredAccess,
  toMirroredInvoice,
  toMirroredSubscription,
  type VisitsByTouchpoint,
} from "@kardo/billing";
import {
  type BillingAccount,
  type BillingChangeResult,
  type BillingCheckout,
  type BillingCheckoutMode,
  type BillingCheckoutStatus,
  type BillingExtra,
  type BillingExtraCode,
  type BillingMyAccount,
  type BillingPlan,
  type BillingPlanList,
  billingExtraCodes,
  type ChangeBillingExtras,
  type WorkspaceAccess,
  type WorkspaceBilling,
} from "@kardo/contracts";
import { canCustomer } from "@kardo/domain";
import type { Sql } from "postgres";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  UnavailableError,
  WorkspaceAccessError,
} from "../errors.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "../repositories/context.js";
import { readEffectivePlan, readWorkspaceUsage } from "./entitlements.js";

// ---------------------------------------------------------------------------
// Suscripciones (ADR 019), customer side. Reads go through the customer
// role and RLS; Stripe is only called to start Checkout or the Customer
// Portal. The webhook hands verified events to `@kardo/billing`'s sync.
// ---------------------------------------------------------------------------

export type BillingService = {
  listPlans(identity: CustomerIdentity): Promise<BillingPlanList>;
  /** ADR 024: the caller's own account (for «Crear organización»). */
  getMyAccount(identity: CustomerIdentity): Promise<BillingMyAccount>;
  getWorkspaceBilling(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WorkspaceBilling>;
  createCheckout(
    identity: CustomerIdentity,
    workspaceId: string,
    priceId: string,
    mode?: BillingCheckoutMode,
  ): Promise<BillingCheckout>;
  /** Return page of the embedded Checkout. A completed session mirrors its
   * subscription at once (the webhook does the same later, idempotently). */
  getCheckoutStatus(
    identity: CustomerIdentity,
    workspaceId: string,
    sessionId: string,
  ): Promise<BillingCheckoutStatus>;
  createPortal(
    identity: CustomerIdentity,
    workspaceId: string,
    flow: PortalFlow,
    priceId?: string | null,
  ): Promise<string>;
  /** ADR 024: add or remove extras (preview, or apply when `confirm`). */
  changeExtras(
    identity: CustomerIdentity,
    workspaceId: string,
    input: ChangeBillingExtras,
  ): Promise<BillingChangeResult>;
  /** ADR 024: change the plan of a subscription with extras (the Stripe
   * portal only changes single-line subscriptions). */
  changePlan(
    identity: CustomerIdentity,
    workspaceId: string,
    priceId: string,
    confirm: boolean,
  ): Promise<BillingChangeResult>;
  /** ADR 020 §4: access state for the panel's banner (any member). */
  getWorkspaceAccess(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WorkspaceAccess>;
  handleWebhook(
    payload: Buffer,
    signature: string | undefined,
  ): Promise<EventResult>;
  /** Hourly: trial and access notices, pausing and resuming public pages,
   * and delivery of pending notices. */
  runScheduledTasks(): Promise<{
    trialsChecked: number;
    sent: number;
    failed: number;
    access?: AccessTickResult;
    planOverage?: PlanOverageTickResult;
  }>;
};

export class WebhookSignatureError extends ApiError {
  constructor() {
    super("VALIDATION_FAILED", 400, "Invalid webhook signature.");
  }
}

const billingUnavailable = () =>
  new UnavailableError(
    "BILLING_UNAVAILABLE",
    "Billing is not configured in this environment.",
  );

/** Stripe refused or could not be reached (portal flow disabled, network,
 * revoked key): the panel gets 503, the details go to the log. */
async function viaStripe<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isStripeError(error)) {
      const failure = billingUnavailable();
      failure.cause = error;
      throw failure;
    }
    throw error;
  }
}

export function unavailableBillingService(): BillingService {
  return {
    listPlans: () => Promise.reject(billingUnavailable()),
    getMyAccount: () => Promise.reject(billingUnavailable()),
    getWorkspaceBilling: () => Promise.reject(billingUnavailable()),
    createCheckout: () => Promise.reject(billingUnavailable()),
    getCheckoutStatus: () => Promise.reject(billingUnavailable()),
    createPortal: () => Promise.reject(billingUnavailable()),
    changeExtras: () => Promise.reject(billingUnavailable()),
    changePlan: () => Promise.reject(billingUnavailable()),
    getWorkspaceAccess: () => Promise.reject(billingUnavailable()),
    handleWebhook: () => Promise.reject(billingUnavailable()),
    runScheduledTasks: () => Promise.reject(billingUnavailable()),
  };
}

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_default: boolean;
  trial_days: number | null;
  entitlements: Record<string, unknown> | null;
};

type PriceRow = {
  stripe_price_id: string;
  plan_id: string;
  billing_interval: "month" | "year";
  unit_amount: string | number;
  currency: string;
  tax_behavior: string | null;
};

function entitlementsOf(
  raw: Record<string, unknown> | null,
): BillingPlan["entitlements"] {
  const result: BillingPlan["entitlements"] = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isInteger(value) && value >= 0)
    ) {
      result[key] = value;
    }
  }
  return result;
}

type SubscriptionChangeItems = SubscriptionChange["items"];

type ExtraRow = {
  code: string;
  name: string;
  entitlement_key: string;
  units_per_quantity: number;
};

type ExtraPriceRow = PriceRow & { extra_code: string };

type AccountJson = {
  holderName: string | null;
  isHolder: boolean;
  organizationsUsed: number;
  organizationsLimit: number | null;
  extras: Record<string, number>;
  organizations: {
    id: string;
    name: string;
    excluded: boolean;
    internal: boolean;
  }[];
};

/** Whose plan covers an organization, and whether the caller is that
 * person (ADR 024: only they pay, change the plan and add extras). */
type AccountScope = { accountId: string | null; isHolder: boolean };

async function accountScope(
  tx: Sql,
  workspaceId: string,
): Promise<AccountScope> {
  const [row] = await tx<{ account_id: string | null; holder: boolean }[]>`
    select w.billing_account_id as account_id,
      kardo_billing.is_account_holder(w.billing_account_id) as holder
    from kardo_core.workspaces w where w.id = ${workspaceId}::uuid
  `;
  return { accountId: row?.account_id ?? null, isHolder: row?.holder ?? false };
}

/** Billing writes: Owner of the organization and, with an account, the
 * person whose plan it is. */
function requireHolder(scope: AccountScope): void {
  if (scope.accountId && !scope.isHolder) throw new WorkspaceAccessError();
}

const isExtraCode = (code: string): code is BillingExtraCode =>
  (billingExtraCodes as readonly string[]).includes(code);

export type BillingServiceOptions = {
  sql: Sql;
  /** Null when Stripe is not configured: reads still work, actions 503. */
  gateway: BillingGateway | null;
  sync: BillingSync | null;
  customerAppOrigin: string;
  taxRateId: string | null;
  trialRequiresCard: boolean;
  requireTermsConsent: boolean;
  /** Public Terms page (BILLING_TERMS_URL), linked from Checkout. */
  termsUrl: string | null;
  /** Null without an email provider: notices stay queued in the database. */
  notices: NoticeSender | null;
  /** Retries the cleanup of deleted accounts' spaces (ADR 023) when the
   * billing deletion is off and so does not run it. */
  pendingCleanup?: (() => Promise<unknown>) | null;
  /** Downgrade option B (ADR 023): the hourly part (reminders, the default
   * rule, Resolver pauses). Omitted in tests that do not exercise it. */
  planOverage?: {
    pause: BillingPauseClient | null;
    visits: VisitsByTouchpoint | null;
    onError?: (workspaceId: string, error: unknown) => void;
  };
  /** ADR 020 §4: pauses and resumes public pages; notices of the access
   * states. Null in tests that do not exercise it. */
  access?: AccessReconciler | null;
  /** BILLING_DELETE_ENABLED=true: announce deletions (the hourly tick also
   * deletes; ADR 020, addendum of 2026-10-01). */
  deletionEnabled?: boolean;
  /** Kardo look in Checkout; null keeps the Stripe account's branding. */
  checkoutBranding?: CheckoutBranding | null;
};

export function createBillingService(
  options: BillingServiceOptions,
): BillingService {
  const { sql, gateway, sync } = options;
  const livemode = gateway?.livemode ?? false;
  const returnUrl = (workspaceId: string, extra = "") =>
    `${options.customerAppOrigin.replace(/\/+$/, "")}/settings/plan?workspace=${workspaceId}${extra}`;

  async function loadPlans(tx: Sql): Promise<BillingPlan[]> {
    const plans = await tx<PlanRow[]>`
      select p.id, p.code, p.name, p.description, p.is_default, p.trial_days,
        (select jsonb_object_agg(e.key, e.value) from kardo_core.plan_entitlements e
         where e.plan_id = p.id) as entitlements
      from kardo_core.plans p
      where p.is_active and (p.is_public or p.is_default)
      order by p.sort_order, p.created_at
      limit 20
    `;
    if (plans.length === 0) return [];
    const prices = await tx<PriceRow[]>`
      select stripe_price_id, plan_id, billing_interval, unit_amount, currency, tax_behavior
      from kardo_billing.prices
      where active and livemode = ${livemode}
        and plan_id = any(${plans.map((plan) => plan.id)}::uuid[])
        and billing_interval in ('month', 'year')
        and coalesce(interval_count, 1) = 1
        and unit_amount is not null
      order by unit_amount
    `;
    return plans.map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      isDefault: plan.is_default,
      trialDays: plan.trial_days,
      entitlements: entitlementsOf(plan.entitlements),
      prices: prices
        .filter((price) => price.plan_id === plan.id)
        .slice(0, 4)
        .map((price) => ({
          id: price.stripe_price_id,
          interval: price.billing_interval,
          unitAmount: cents(price.unit_amount),
          currency: price.currency,
          // Kardo prices always include IVA (manual inclusive Tax Rate or
          // Price tax_behavior); only an explicit "exclusive" says otherwise.
          taxInclusive: price.tax_behavior !== "exclusive",
        })),
    }));
  }

  /** The person's account that covers the organization, with its extras
   * and their prices (ADR 024). */
  async function readAccount(
    tx: Sql,
    workspaceId: string,
  ): Promise<BillingAccount | null> {
    const [row] = await tx<{ account: AccountJson | null }[]>`
      select kardo_billing.workspace_account(${workspaceId}::uuid) as account
    `;
    const account = row?.account;
    if (!account) return null;
    const extras = await tx<ExtraRow[]>`
      select code, name, entitlement_key, units_per_quantity
      from kardo_billing.extras order by sort_order, code
    `;
    const prices = await tx<ExtraPriceRow[]>`
      select stripe_price_id, plan_id, extra_code, billing_interval, unit_amount, currency, tax_behavior
      from kardo_billing.prices
      where active and livemode = ${livemode} and extra_code is not null
        and billing_interval in ('month', 'year')
        and coalesce(interval_count, 1) = 1
        and unit_amount is not null
      order by unit_amount
    `;
    // ADR 024: the plan is the holder's. An Admin who is not the holder may
    // read their own organization's billing state, but must not learn who the
    // holder is (holderName falls back to the holder's email) nor enumerate
    // the holder's other organizations they are not a member of (security
    // review 2026-10-12). The holder keeps the full account view.
    const organizations = account.isHolder
      ? account.organizations.slice(0, 1000)
      : account.organizations.filter((org) => org.id === workspaceId);
    return {
      holderName: account.isHolder ? account.holderName : null,
      isHolder: account.isHolder,
      organizationsUsed: account.organizationsUsed,
      organizationsLimit: account.organizationsLimit,
      organizations,
      extras: extras
        .filter((extra) => isExtraCode(extra.code))
        .map(
          (extra): BillingExtra => ({
            code: extra.code as BillingExtraCode,
            name: extra.name,
            unitsPerQuantity: extra.units_per_quantity,
            entitlementKey: extra.entitlement_key,
            quantity: Number(account.extras[extra.code] ?? 0),
            prices: prices
              .filter((price) => price.extra_code === extra.code)
              .slice(0, 4)
              .map((price) => ({
                id: price.stripe_price_id,
                interval: price.billing_interval,
                unitAmount: cents(price.unit_amount),
                currency: price.currency,
                taxInclusive: price.tax_behavior !== "exclusive",
              })),
          }),
        ),
    };
  }

  type LiveSubscription = {
    stripe_subscription_id: string;
    billing_interval: "month" | "year" | null;
    plan_id: string | null;
  };

  async function loadChange(
    identity: CustomerIdentity,
    workspaceId: string,
    build: (
      tx: Sql,
      subscription: LiveSubscription,
    ) => Promise<SubscriptionChangeItems>,
  ) {
    return withCustomerContext(sql, identity, async (tx) => {
      await requireMembershipWithPermission(
        tx,
        identity,
        workspaceId,
        "billing.manage",
      );
      const scope = await accountScope(tx, workspaceId);
      requireHolder(scope);
      if (!scope.accountId) {
        throw new ConflictError(
          "EXTRAS_NEED_PLAN",
          "The organization has no billing account.",
        );
      }
      const [subscription] = await tx<LiveSubscription[]>`
        select stripe_subscription_id, billing_interval, plan_id
        from kardo_billing.subscriptions
        where account_id = ${scope.accountId}::uuid
          and status::text = any(${[...liveSubscriptionStatuses]}::text[])
        order by stripe_created_at desc
        limit 1
      `;
      if (!subscription) {
        throw new ConflictError(
          "EXTRAS_NEED_PLAN",
          "Choose a plan before changing it or adding extras.",
        );
      }
      return {
        subscriptionId: subscription.stripe_subscription_id,
        items: await build(tx, subscription),
      };
    });
  }

  /** Preview, or apply and mirror at once (the webhook does it again). */
  async function runChange(
    identity: CustomerIdentity,
    workspaceId: string,
    change: { subscriptionId: string; items: SubscriptionChangeItems },
    confirm: boolean,
    action: string,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<BillingChangeResult> {
    if (!gateway) throw billingUnavailable();
    if (change.items.length === 0) {
      return {
        status: confirm ? "applied" : "preview",
        amountDueToday: 0,
        nextAmount: null,
        currency: "mxn",
        nextChargeAt: null,
      };
    }
    const preview = await viaStripe(() =>
      gateway.previewSubscriptionChange(change),
    );
    const result: BillingChangeResult = {
      status: "preview",
      amountDueToday: preview.amountDueToday,
      nextAmount: preview.nextAmount,
      currency: preview.currency,
      nextChargeAt: preview.nextChargeAt
        ? preview.nextChargeAt.toISOString()
        : null,
    };
    if (!confirm) return result;
    try {
      await gateway.applySubscriptionChange({
        ...change,
        idempotencyKey: `kardo-${action}-${change.subscriptionId}-${createHash(
          "sha256",
        )
          .update(JSON.stringify(change.items))
          .update(String(Math.floor(Date.now() / 60_000)))
          .digest("hex")
          .slice(0, 32)}`,
      });
    } catch (error) {
      // `error_if_incomplete`: the card was declined and nothing changed.
      if (
        isStripeError(error) &&
        (error as { type?: string }).type === "StripeCardError"
      ) {
        throw new ConflictError(
          "BILLING_PAYMENT_FAILED",
          "The card was declined; nothing changed.",
        );
      }
      throw await viaStripe(() => Promise.reject(error)).catch((e) => e);
    }
    if (sync)
      await sync.syncSubscription(change.subscriptionId).catch(() => null);
    await withCustomerContext(sql, identity, (tx) =>
      insertAuditEvent(tx, {
        workspaceId,
        actorSubject: identity.subject,
        action,
        targetType: "subscription",
        targetId: null,
        result: "succeeded",
        metadata: {
          subscriptionId: change.subscriptionId,
          amountDueToday: preview.amountDueToday,
          ...metadata,
        },
      }),
    );
    return { ...result, status: "applied" };
  }

  return {
    async listPlans(identity) {
      const plans = await withCustomerContext(sql, identity, loadPlans);
      return { checkoutAvailable: gateway !== null, plans };
    },

    async getWorkspaceBilling(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        );
        const scope = await accountScope(tx, workspaceId);
        const { plan, entitlements } = await readEffectivePlan(tx, workspaceId);
        const usage = await readWorkspaceUsage(tx, workspaceId);
        const [trial] = await tx<{ available: boolean }[]>`
          select kardo_billing.trial_available(${workspaceId}::uuid) as available
        `;
        // The person's subscription and invoices (only they read them since
        // ADR 024); before accounts, the organization's.
        const owned = scope.accountId
          ? tx`s.account_id = ${scope.accountId}::uuid`
          : tx`s.workspace_id = ${workspaceId}::uuid`;
        const subscriptions = await tx<SubscriptionRow[]>`
          select ${subscriptionColumns(tx)}
          from kardo_billing.subscriptions s
          left join kardo_core.plans p on p.id = s.plan_id
          where ${owned}
          order by (s.status::text = any(${[...liveSubscriptionStatuses]}::text[])) desc,
            s.stripe_created_at desc
          limit 1
        `;
        const invoices = await tx<InvoiceRow[]>`
          select ${invoiceColumns(tx)}
          from kardo_billing.invoices
          where ${
            scope.accountId
              ? tx`account_id = ${scope.accountId}::uuid`
              : tx`workspace_id = ${workspaceId}::uuid`
          } and status is distinct from 'draft'
          order by stripe_created_at desc
          limit 24
        `;
        const subscription = subscriptions[0];
        const account = await readAccount(tx, workspaceId);
        return {
          checkoutAvailable: gateway !== null,
          canManage:
            canCustomer(role, "billing.manage") &&
            (!scope.accountId || scope.isHolder),
          plan,
          entitlements,
          usage,
          subscription: subscription
            ? toMirroredSubscription(subscription)
            : null,
          trialAvailable: trial?.available ?? false,
          trial: await readWorkspaceTrial(tx, workspaceId),
          invoices: invoices.map(toMirroredInvoice),
          account,
        };
      });
    },

    async createCheckout(identity, workspaceId, priceId, mode = "hosted") {
      if (!gateway) throw billingUnavailable();
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.manage",
        );
        const scope = await accountScope(tx, workspaceId);
        requireHolder(scope);
        // One Checkout at a time per person (per workspace before ADR 024):
        // two tabs cannot both create a Customer or a second subscription.
        await tx`select pg_advisory_xact_lock(hashtextextended(${`kardo-billing-checkout:${scope.accountId ?? workspaceId}`}, 0))`;

        const [price] = await tx<
          {
            plan_id: string;
            trial_days: number | null;
            billing_interval: "month" | "year";
          }[]
        >`
          select pr.plan_id, p.trial_days, pr.billing_interval
          from kardo_billing.prices pr
          join kardo_core.plans p on p.id = pr.plan_id
          where pr.stripe_price_id = ${priceId} and pr.active
            and pr.livemode = ${livemode}
            and p.is_active and p.is_public
            and pr.billing_interval in ('month', 'year')
        `;
        if (!price) {
          throw new ConflictError(
            "BILLING_CONFLICT",
            "This price is not available.",
          );
        }

        const open = await tx<{ stripe_subscription_id: string }[]>`
          select stripe_subscription_id from kardo_billing.subscriptions
          where ${
            scope.accountId
              ? tx`account_id = ${scope.accountId}::uuid`
              : tx`workspace_id = ${workspaceId}::uuid`
          }
            and status::text = any(${[...openSubscriptionStatuses]}::text[])
          limit 1
        `;
        if (open.length > 0) {
          // Changing plan goes through the Customer Portal.
          throw new ConflictError(
            "BILLING_CONFLICT",
            "The workspace already has a subscription.",
          );
        }

        const [workspace] = await tx<{ name: string }[]>`
          select name from kardo_core.workspaces where id = ${workspaceId}::uuid
        `;
        // One Customer per person (ADR 024); it remembers the organization
        // where it started paying, for notices.
        const existing = await tx<{ stripe_customer_id: string }[]>`
          select stripe_customer_id from kardo_billing.customers
          where ${
            scope.accountId
              ? tx`account_id = ${scope.accountId}::uuid and livemode = ${livemode}`
              : tx`workspace_id = ${workspaceId}::uuid`
          }
          limit 1
        `;
        let customerId = existing[0]?.stripe_customer_id;
        if (!customerId) {
          customerId = await viaStripe(() =>
            gateway.createCustomer({
              workspaceId,
              workspaceName: workspace?.name ?? "Kardo",
              email: identity.email,
              profileId: identity.subject,
              accountId: scope.accountId,
            }),
          );
          await tx`
            insert into kardo_billing.customers (
              workspace_id, account_id, stripe_customer_id, livemode, email, created_by
            ) values (
              ${workspaceId}::uuid, ${scope.accountId}::uuid, ${customerId}, ${livemode},
              ${identity.email.toLowerCase()}, ${identity.subject}::uuid
            )
          `;
        }

        // ADR 020: paying during the Kardo trial keeps its remaining days
        // (first charge when it ends) if at least KEEP_TRIAL_MIN_DAYS are
        // left; otherwise the charge is immediate. A Stripe trial (ADR 019,
        // plan `trial_days`) only applies to an organization that never had
        // a Kardo trial.
        const kardoTrial = await readWorkspaceTrial(tx, workspaceId);
        const trialEnd =
          kardoTrial?.status === "active" &&
          new Date(kardoTrial.endsAt).getTime() - Date.now() >=
            KEEP_TRIAL_MIN_DAYS * 86_400_000
            ? new Date(kardoTrial.endsAt)
            : null;
        const [trial] = await tx<{ available: boolean }[]>`
          select kardo_billing.trial_available(${workspaceId}::uuid) as available
        `;
        const trialDays =
          !kardoTrial && price.trial_days && trial?.available
            ? price.trial_days
            : null;
        // ADR 020 §1: 20 % off the first 3 monthly charges, up to 7 days
        // after the trial ended, for an organization that never paid.
        const access = await readWorkspaceAccess(tx, workspaceId);
        const couponId =
          price.billing_interval === "month" &&
          !trialEnd &&
          access?.offer_until &&
          new Date(access.offer_until).getTime() > Date.now()
            ? CONVERSION_COUPON.id
            : null;

        const sessionReturn = returnUrl(
          workspaceId,
          "&checkout=return&session_id={CHECKOUT_SESSION_ID}",
        );
        const session = await viaStripe(() =>
          gateway.createCheckoutSession({
            customerId,
            priceId,
            workspaceId,
            profileId: identity.subject,
            accountId: scope.accountId,
            trialDays,
            trialEnd,
            trialRequiresCard: options.trialRequiresCard,
            taxRateId: options.taxRateId,
            requireTermsConsent: options.requireTermsConsent,
            termsUrl: options.termsUrl,
            uiMode: mode,
            // Both Checkouts come back with the session id: the panel asks
            // Stripe for it and shows the plan active at once.
            successUrl: sessionReturn,
            cancelUrl: returnUrl(workspaceId, "&checkout=canceled"),
            returnUrl: sessionReturn,
            interval: price.billing_interval,
            couponId,
            branding: options.checkoutBranding ?? null,
          }),
        );

        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "billing.checkout_started",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: {
            priceId,
            mode,
            checkoutSessionId: session.id,
            trialDays,
            firstChargeAt: trialEnd ? trialEnd.toISOString() : null,
            couponId,
          },
        });
        return {
          mode,
          sessionId: session.id,
          url: session.url,
          clientSecret: session.clientSecret,
        };
      });
    },

    async getCheckoutStatus(identity, workspaceId, sessionId) {
      if (!gateway) throw billingUnavailable();
      await withCustomerContext(sql, identity, (tx) =>
        requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        ),
      );
      const session = await viaStripe(() =>
        gateway.getCheckoutSession(sessionId),
      );
      // Only the workspace that started it may read it.
      if (!session || session.workspaceId !== workspaceId) {
        throw new NotFoundError("Checkout session not found.");
      }
      if (session.status === "complete" && session.subscriptionId && sync) {
        // Best effort: on failure the webhook (and the hourly tick) catch up.
        const synced = await sync
          .syncSubscription(session.subscriptionId)
          .catch(() => null);
        // Paused pages come back and the contract notice goes out after the
        // answer: the return page only needs the mirror (the webhook and
        // the hourly tick retry both anyway).
        if (synced?.status === "processed") {
          void (async () => {
            await options.access?.resumeReactivated().catch(() => 0);
            await options.notices?.deliverPending(10).catch(() => undefined);
          })();
        }
      }
      const subscriptionActive = session.subscriptionId
        ? await withCustomerContext(sql, identity, async (tx) => {
            const rows = await tx<{ live: boolean }[]>`
              select status::text = any(${[...liveSubscriptionStatuses]}::text[]) as live
              from kardo_billing.subscriptions
              where stripe_subscription_id = ${session.subscriptionId}
            `;
            return rows[0]?.live ?? false;
          })
        : false;
      return {
        status: session.status,
        paymentStatus: session.paymentStatus,
        subscriptionActive,
      };
    },

    async createPortal(identity, workspaceId, flow, priceId = null) {
      if (!gateway) throw billingUnavailable();
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.manage",
        );
        const scope = await accountScope(tx, workspaceId);
        requireHolder(scope);
        const customers = await tx<{ stripe_customer_id: string }[]>`
          select stripe_customer_id from kardo_billing.customers
          where ${
            scope.accountId
              ? tx`account_id = ${scope.accountId}::uuid and livemode = ${livemode}`
              : tx`workspace_id = ${workspaceId}::uuid`
          }
          limit 1
        `;
        const customerId = customers[0]?.stripe_customer_id;
        if (!customerId) {
          throw new ConflictError(
            "BILLING_CONFLICT",
            "The workspace has no billing account yet.",
          );
        }
        if (flow === "subscription_update_confirm") {
          // ADR 020 §2: "Elegir" on /precios/ with a live subscription opens
          // the portal on the confirmation of that exact price, with the
          // prorated amount shown before accepting.
          const [target] = priceId
            ? await tx<{ stripe_price_id: string }[]>`
                select pr.stripe_price_id
                from kardo_billing.prices pr
                join kardo_core.plans p on p.id = pr.plan_id
                where pr.stripe_price_id = ${priceId} and pr.active
                  and pr.livemode = ${livemode}
                  and p.is_active and p.is_public
                  and pr.billing_interval in ('month', 'year')
              `
            : [];
          if (!target) {
            throw new ConflictError(
              "BILLING_CONFLICT",
              "This price is not available.",
            );
          }
        }
        let subscriptionId: string | null = null;
        if (
          flow === "subscription_update" ||
          flow === "subscription_update_confirm" ||
          flow === "subscription_cancel"
        ) {
          const live = await tx<{ stripe_subscription_id: string }[]>`
            select stripe_subscription_id from kardo_billing.subscriptions
            where ${
              scope.accountId
                ? tx`account_id = ${scope.accountId}::uuid`
                : tx`workspace_id = ${workspaceId}::uuid`
            }
              and status::text = any(${[...liveSubscriptionStatuses]}::text[])
            order by stripe_created_at desc
            limit 1
          `;
          subscriptionId = live[0]?.stripe_subscription_id ?? null;
          if (!subscriptionId) {
            throw new ConflictError(
              "BILLING_CONFLICT",
              "The workspace has no active subscription.",
            );
          }
        }
        try {
          return await viaStripe(() =>
            gateway.createPortalSession({
              customerId,
              returnUrl: returnUrl(workspaceId),
              flow,
              subscriptionId,
              priceId,
            }),
          );
        } catch (error) {
          if (error instanceof BillingGatewayError) {
            throw new ConflictError("BILLING_CONFLICT", error.message);
          }
          throw error;
        }
      });
    },

    async getMyAccount(identity) {
      return withCustomerContext(sql, identity, async (tx) => {
        const [own] = await tx<{ id: string }[]>`
          select a.id from kardo_billing.accounts a
          where a.profile_id = ${identity.subject}::uuid
        `;
        const [home] = own
          ? await tx<{ id: string }[]>`
              select w.id from kardo_core.workspaces w
              join kardo_core.workspace_memberships m
                on m.workspace_id = w.id and m.profile_id = ${identity.subject}::uuid
              where w.billing_account_id = ${own.id}::uuid
                and w.kind = 'organization' and w.deleted_at is null
              order by w.created_at
              limit 1
            `
          : [];
        if (!home) {
          return {
            plan: null,
            organizationsUsed: 0,
            organizationsLimit: 1,
            canAddExtras: false,
            homeWorkspaceId: null,
            extras: [],
          };
        }
        const { plan } = await readEffectivePlan(tx, home.id);
        const account = await readAccount(tx, home.id);
        const [live] = await tx<{ live: boolean }[]>`
          select exists (
            select 1 from kardo_billing.subscriptions s
            where s.account_id = ${own?.id ?? null}::uuid
              and s.status::text = any(${[...liveSubscriptionStatuses]}::text[])
          ) as live
        `;
        return {
          plan,
          organizationsUsed: account?.organizationsUsed ?? 0,
          organizationsLimit: account?.organizationsLimit ?? 1,
          canAddExtras: live?.live ?? false,
          homeWorkspaceId: home.id,
          extras: account?.extras ?? [],
        };
      });
    },

    async changeExtras(identity, workspaceId, input) {
      if (!gateway) throw billingUnavailable();
      const change = await loadChange(
        identity,
        workspaceId,
        async (tx, subscription) => {
          const items = await tx<
            { id: string; extra_code: string; quantity: number }[]
          >`
            select stripe_subscription_item_id as id, extra_code, quantity
            from kardo_billing.subscription_items
            where stripe_subscription_id = ${subscription.stripe_subscription_id}
              and extra_code is not null
          `;
          const prices = await tx<
            { stripe_price_id: string; extra_code: string }[]
          >`
            select stripe_price_id, extra_code from kardo_billing.prices
            where extra_code is not null and active and livemode = ${livemode}
              and billing_interval = ${subscription.billing_interval ?? "month"}
              and coalesce(interval_count, 1) = 1
            order by unit_amount
          `;
          const lines: SubscriptionChangeItems = [];
          for (const code of billingExtraCodes) {
            const quantity = input.quantities[code];
            if (quantity === undefined) continue;
            const current = items.find((item) => item.extra_code === code);
            if (current) {
              if (current.quantity === quantity) continue;
              lines.push(
                quantity === 0
                  ? { id: current.id, deleted: true }
                  : { id: current.id, quantity },
              );
            } else if (quantity > 0) {
              const price = prices.find((row) => row.extra_code === code);
              if (!price) {
                throw new ConflictError(
                  "BILLING_CONFLICT",
                  "This extra is not available.",
                );
              }
              lines.push({ price: price.stripe_price_id, quantity });
            }
          }
          return lines;
        },
      );
      return runChange(
        identity,
        workspaceId,
        change,
        input.confirm,
        "billing.extras_changed",
        {
          organization: input.quantities.organization ?? null,
          touchpoints: input.quantities.touchpoints ?? null,
          links: input.quantities.links ?? null,
        },
      );
    },

    async changePlan(identity, workspaceId, priceId, confirm) {
      if (!gateway) throw billingUnavailable();
      const change = await loadChange(
        identity,
        workspaceId,
        async (tx, subscription) => {
          const [target] = await tx<
            { billing_interval: "month" | "year"; plan_id: string }[]
          >`
            select pr.billing_interval, pr.plan_id
            from kardo_billing.prices pr
            join kardo_core.plans p on p.id = pr.plan_id
            where pr.stripe_price_id = ${priceId} and pr.active
              and pr.livemode = ${livemode}
              and p.is_active and p.is_public
              and pr.billing_interval in ('month', 'year')
          `;
          if (!target) {
            throw new ConflictError(
              "BILLING_CONFLICT",
              "This price is not available.",
            );
          }
          const items = await tx<
            {
              id: string;
              plan_id: string | null;
              extra_code: string | null;
              quantity: number;
            }[]
          >`
            select stripe_subscription_item_id as id, plan_id, extra_code, quantity
            from kardo_billing.subscription_items
            where stripe_subscription_id = ${subscription.stripe_subscription_id}
          `;
          const planLine = items.find((item) => item.plan_id);
          if (!planLine) {
            throw new ConflictError(
              "BILLING_CONFLICT",
              "The subscription is still syncing; try again in a minute.",
            );
          }
          const lines: SubscriptionChangeItems = [
            { id: planLine.id, price: priceId, quantity: 1 },
          ];
          // A new interval moves the extras to their price of that interval:
          // Stripe charges every line of a subscription on the same cycle.
          if (target.billing_interval !== subscription.billing_interval) {
            const prices = await tx<
              { stripe_price_id: string; extra_code: string }[]
            >`
              select stripe_price_id, extra_code from kardo_billing.prices
              where extra_code is not null and active and livemode = ${livemode}
                and billing_interval = ${target.billing_interval}
                and coalesce(interval_count, 1) = 1
              order by unit_amount
            `;
            for (const item of items.filter((line) => line.extra_code)) {
              const price = prices.find(
                (row) => row.extra_code === item.extra_code,
              );
              if (!price) {
                throw new ConflictError(
                  "BILLING_CONFLICT",
                  "An extra has no price for that interval.",
                );
              }
              lines.push({
                id: item.id,
                price: price.stripe_price_id,
                quantity: item.quantity,
              });
            }
          }
          return lines;
        },
      );
      return runChange(
        identity,
        workspaceId,
        change,
        confirm,
        "billing.plan_changed",
        { priceId },
      );
    },

    async getWorkspaceAccess(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        const role = await requireMembership(tx, identity, workspaceId);
        const row = await readWorkspaceAccess(tx, workspaceId);
        if (!row) throw new WorkspaceAccessError();
        return {
          ...toMirroredAccess(row, {
            deletionEnabled: options.deletionEnabled ?? false,
          }),
          canManage: canCustomer(role, "billing.manage"),
        };
      });
    },

    async handleWebhook(payload, signature) {
      if (!gateway || !sync) throw billingUnavailable();
      if (!signature) throw new WebhookSignatureError();
      let event: BillingEventSnapshot;
      try {
        event = await gateway.verifyEvent(payload, signature);
      } catch (error) {
        if (error instanceof BillingGatewayError) {
          throw new WebhookSignatureError();
        }
        throw error;
      }
      const result = await sync.processEvent(event);
      // ADR 020 §4: a subscription that just came alive brings paused
      // pages back at once, printed QR codes included. Best effort: the
      // hourly tick retries, and Stripe must not retry because of it.
      if (result === "processed") {
        await options.access?.resumeReactivated().catch(() => 0);
      }
      // Contract, renewal and cancellation notices queued by this (or an
      // earlier, failed) delivery go out now; failures stay queued for the
      // next event and never make Stripe retry.
      await options.notices?.deliverPending(10);
      return result;
    },

    async runScheduledTasks() {
      if (!sync) throw billingUnavailable();
      const { checked } = await sync.runScheduledNotices();
      const access = options.access
        ? await options.access.runAccessTick()
        : undefined;
      const planOverage = options.planOverage
        ? await runPlanOverageTick({ sql, ...options.planOverage })
        : undefined;
      if (!options.deletionEnabled && options.pendingCleanup)
        await options.pendingCleanup().catch(() => undefined);
      const delivery = (await options.notices?.deliverPending(50)) ?? {
        sent: 0,
        failed: 0,
      };
      return {
        trialsChecked: checked,
        ...delivery,
        ...(access ? { access } : {}),
        ...(planOverage ? { planOverage } : {}),
      };
    },
  };
}
