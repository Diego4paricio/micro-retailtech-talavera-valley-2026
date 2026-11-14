import type { Sql } from "postgres";
import type { BillingGateway } from "./gateway.js";
import {
  ACCESS_GRACE_DAYS,
  CONVERSION_COUPON,
  cancellationFolio,
  dayKey,
  enqueueNotice,
  type NoticePayload,
  TERMS_VERSION,
} from "./notices.js";
import {
  refreshAccountOverageTx,
  refreshPlanOverageTx,
} from "./plan-overage.js";
import type {
  BillingEventSnapshot,
  InvoiceSnapshot,
  PriceSnapshot,
  RefundSnapshot,
  SubscriptionSnapshot,
} from "./snapshots.js";
import { liveSubscriptionStatuses } from "./snapshots.js";

// ---------------------------------------------------------------------------
// Mirror of Stripe in `kardo_billing` (ADR 019). Only this module writes it,
// always as `kardo_billing_sync`. Every handler re-reads the object from
// Stripe under a per-object advisory lock, so events that arrive late or out
// of order can never overwrite newer data with older data.
// ---------------------------------------------------------------------------

export type SyncOutcome = {
  status: "processed" | "ignored";
  workspaceId: string | null;
  note?: string;
};

export type EventResult = SyncOutcome["status"] | "duplicate";

export type BillingSync = {
  /** Idempotent by `event.id`. Throws when processing fails, so the webhook
   * answers 500 and Stripe retries; the failure is recorded first. */
  processEvent(event: BillingEventSnapshot): Promise<EventResult>;
  /** Re-reads a subscription from Stripe and mirrors it. */
  syncSubscription(subscriptionId: string): Promise<SyncOutcome>;
  /** Mirrors a subscription Stripe just returned (after a staff action). */
  applySubscription(snapshot: SubscriptionSnapshot): Promise<SyncOutcome>;
  /** Mirrors a refund Operations just created. */
  applyRefund(
    snapshot: RefundSnapshot,
    requestedBy: string | null,
  ): Promise<SyncOutcome>;
  /** Mirrors every recurring Price and maps it to a plan by code. */
  syncCatalog(): Promise<{ prices: number; mappedToPlans: number }>;
  /**
   * Hourly job: every trial that ends within 7 days gets its notice, even
   * without a card (Stripe only announces invoices it will charge) or when
   * the card was added late. Re-reads each trial from Stripe first, so the
   * notice never says "no charge" when a card exists.
   */
  runScheduledNotices(): Promise<{ checked: number }>;
};

type Transaction = Sql;

async function withSync<T>(
  sql: Sql,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'kardo_billing_sync', true)`;
    return action(tx as unknown as Transaction);
  }) as Promise<T>;
}

async function lockObject(tx: Transaction, key: string): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`kardo-billing:${key}`}, 0))`;
}

/**
 * ADR 024: one person's subscriptions, invoices and Customer share her
 * account, and applying any of them recalculates the account. Every sync
 * transaction takes the account's lock FIRST, before any write and before
 * the object's lock, so two events of one account never wait on each other
 * in a cycle (an invoice event held its row and waited for the
 * subscription's lock while the subscription event, recalculating the
 * account, waited for that row: deadlock). Re-entrant within a transaction.
 */
async function lockAccountOfCustomer(
  tx: Transaction,
  customerId: string | null | undefined,
): Promise<void> {
  if (!customerId) return;
  const [row] = await tx<{ account_id: string | null }[]>`
    select account_id from kardo_billing.customers
    where stripe_customer_id = ${customerId}
  `;
  if (row?.account_id) await lockObject(tx, `account:${row.account_id}`);
}

async function workspaceOfCustomer(
  tx: Transaction,
  customerId: string,
): Promise<string | null> {
  const rows = await tx<{ workspace_id: string }[]>`
    select workspace_id from kardo_billing.customers
    where stripe_customer_id = ${customerId}
  `;
  return rows[0]?.workspace_id ?? null;
}

/** The person's billing account of a Customer (ADR 024). */
async function accountOfCustomer(
  tx: Transaction,
  customerId: string,
): Promise<string | null> {
  const rows = await tx<{ account_id: string | null }[]>`
    select account_id from kardo_billing.customers
    where stripe_customer_id = ${customerId}
  `;
  return rows[0]?.account_id ?? null;
}

/** An extra Kardo knows (the catalog may name one it does not). */
async function extraCodeOf(
  tx: Transaction,
  code: string | null,
): Promise<string | null> {
  if (!code) return null;
  const rows = await tx<{ code: string }[]>`
    select code from kardo_billing.extras where code = ${code}
  `;
  return rows[0]?.code ?? null;
}

async function planIdOf(
  tx: Transaction,
  planCode: string | null,
): Promise<string | null> {
  if (!planCode) return null;
  const rows = await tx<{ id: string }[]>`
    select id from kardo_core.plans where code = ${planCode}
  `;
  return rows[0]?.id ?? null;
}

async function audit(
  tx: Transaction,
  workspaceId: string,
  action: string,
  targetType: string,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  await tx`
    insert into kardo_audit.events (
      workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
    ) values (
      ${workspaceId}::uuid, null, 'service', ${action}, ${targetType}, null, 'succeeded',
      ${tx.json(metadata)}
    )
  `;
}

const isoOrNull = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

const DAY_MS = 86_400_000;

type OpenTrialRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  plan_name: string;
  billing_interval: "month" | "year";
  ends_at: Date;
  amount: string | number | null;
  currency: string | null;
  /** Never had a subscription: the conversion coupon applies. */
  offer: boolean;
};

/**
 * Kardo trial notices (ADR 020 §3): 7 and 3 days left (days 8 and 12 of a
 * 15-day trial) and the end. Only the latest one that applies is queued, so
 * a late tick never sends two at once; `dedupe_key` keeps each one unique.
 * Trials already converted, or covered by a staff courtesy plan, are skipped.
 */
async function enqueueTrialNotices(tx: Transaction): Promise<number> {
  const rows = await tx<OpenTrialRow[]>`
    select t.id, t.workspace_id, w.name as workspace_name, p.name as plan_name,
      t.billing_interval, t.ends_at, price.unit_amount as amount, price.currency,
      not exists (
        select 1 from kardo_billing.subscriptions s
        where (s.workspace_id = t.workspace_id or s.account_id = acc.id)
          and s.status not in ('incomplete', 'incomplete_expired')
      ) as offer
    from kardo_billing.trials t
    join kardo_core.workspaces w on w.id = t.workspace_id
    -- ADR 024: the trial is the person's; her account's plan covers it.
    left join kardo_billing.accounts acc on acc.profile_id = t.profile_id
    join kardo_core.plans p on p.id = t.plan_id
    left join lateral (
      select pr.unit_amount, pr.currency from kardo_billing.prices pr
      where pr.plan_id = t.plan_id and pr.active and pr.billing_interval = t.billing_interval
      order by pr.livemode desc, pr.unit_amount
      limit 1
    ) price on true
    where t.converted_at is null
      and t.ends_at <= now() + interval '7 days'
      and t.ends_at > now() - interval '2 days'
      and not exists (
        select 1 from kardo_billing.subscriptions s
        where (s.workspace_id = t.workspace_id or s.account_id = acc.id)
          and s.status in ('trialing', 'active', 'past_due')
      )
      and not exists (
        select 1 from kardo_billing.account_plans ap
        where ap.account_id = acc.id
          and (ap.override_until is null or ap.override_until > now())
      )
      and not exists (
        select 1 from kardo_billing.internal_workspaces i
        where i.workspace_id = t.workspace_id
      )
    order by t.ends_at
    limit 500
  `;
  const now = Date.now();
  for (const row of rows) {
    const endsAt = new Date(row.ends_at);
    const msLeft = endsAt.getTime() - now;
    const base: NoticePayload = {
      workspaceName: row.workspace_name,
      planName: row.plan_name,
      amount: row.amount === null ? null : Number(row.amount),
      currency: row.currency ?? "mxn",
      interval: row.billing_interval,
      trialEnd: endsAt.toISOString(),
    };
    // Staff may extend a trial (Operations): the end date is part of each
    // key, so the extended trial gets its own reminders and end notice.
    const endKey = `${row.id}:${dayKey(endsAt)}`;
    if (msLeft <= 0) {
      await enqueueNotice(tx, {
        workspaceId: row.workspace_id,
        kind: "trial_ended",
        dedupeKey: `trial_ended:${endKey}`,
        subscriptionId: null,
        payload: {
          ...base,
          graceEndsAt: new Date(
            endsAt.getTime() + ACCESS_GRACE_DAYS * DAY_MS,
          ).toISOString(),
          offerUntil: row.offer
            ? new Date(
                endsAt.getTime() + CONVERSION_COUPON.validDays * DAY_MS,
              ).toISOString()
            : null,
        },
      });
      continue;
    }
    const daysLeft = Math.ceil(msLeft / DAY_MS);
    const mark = daysLeft <= 3 ? 3 : 7;
    await enqueueNotice(tx, {
      workspaceId: row.workspace_id,
      kind: "trial_reminder",
      dedupeKey: `trial_reminder:${endKey}:${mark}`,
      subscriptionId: null,
      payload: { ...base, daysLeft },
    });
  }
  return rows.length;
}

async function noticeBase(
  tx: Transaction,
  workspaceId: string,
  planId: string | null,
  snapshot: SubscriptionSnapshot,
): Promise<NoticePayload> {
  const [names] = await tx<
    { workspace_name: string; plan_name: string | null }[]
  >`
    select w.name as workspace_name,
      (select p.name from kardo_core.plans p where p.id = ${planId}) as plan_name
    from kardo_core.workspaces w where w.id = ${workspaceId}::uuid
  `;
  return {
    workspaceName: names?.workspace_name ?? "tu organización",
    planName: names?.plan_name ?? snapshot.planCode ?? "Kardo",
    amount: snapshot.unitAmount,
    currency: snapshot.currency ?? "mxn",
    interval: snapshot.interval,
    termsVersion: TERMS_VERSION,
  };
}

/**
 * Notice before an automatic charge (LFPC: at least 5 calendar days; the
 * Stripe "upcoming renewal" event is set to 7). A trial without any card
 * gets the "trial ending" notice instead: nothing will be charged.
 */
async function enqueueChargeNotice(
  tx: Transaction,
  workspaceId: string,
  snapshot: SubscriptionSnapshot,
  at: Date | null,
  amount: number | null,
): Promise<void> {
  if (
    !liveSubscriptionStatuses.includes(snapshot.status) ||
    snapshot.cancelAtPeriodEnd
  ) {
    return;
  }
  const planId = await planIdOf(tx, snapshot.planCode);
  const base = await noticeBase(tx, workspaceId, planId, snapshot);
  const trialWithoutCard =
    snapshot.status === "trialing" && !snapshot.paymentMethod;
  // A trial's charge date is its end, whichever event announces it, so the
  // 7-day and the 3-day events share one dedupe key.
  const chargeAt =
    snapshot.status === "trialing"
      ? snapshot.trialEnd
      : (at ?? snapshot.currentPeriodEnd);
  const kind = trialWithoutCard ? "trial_ending" : "renewal_upcoming";
  await enqueueNotice(tx, {
    workspaceId,
    kind,
    dedupeKey: `${kind}:${snapshot.id}:${dayKey(chargeAt)}`,
    subscriptionId: snapshot.id,
    payload: {
      ...base,
      amount: amount ?? base.amount,
      chargeAt: isoOrNull(chargeAt),
      trialEnd: isoOrNull(snapshot.trialEnd),
    },
  });
}

const ignored = (
  note: string,
  workspaceId: string | null = null,
): SyncOutcome => ({
  status: "ignored",
  workspaceId,
  note,
});

/** Mirrors a Price. Returns whether it maps to a plan, or null when the
 * price is not Kardo's and was skipped. */
async function upsertPrice(
  tx: Transaction,
  price: PriceSnapshot,
): Promise<boolean | null> {
  const extraCode = await extraCodeOf(tx, price.extraCode);
  if (!price.planCode && !extraCode) {
    // The Stripe account may hold products that are not Kardo plans or
    // extras: only keep updating a price we already mirror (for example,
    // one whose plan code was removed), never start mirroring a foreign one.
    const known = await tx`
      select 1 from kardo_billing.prices where stripe_price_id = ${price.id}
    `;
    if (known.length === 0) return null;
  }
  const planId = await planIdOf(tx, price.planCode);
  const billingInterval = price.interval;
  if (price.lookupKey) {
    // A lookup key belongs to one Price at a time; a new Price created with
    // transfer_lookup_key takes it from the old one, which is re-read from
    // Stripe without it on its own event.
    await tx`
      update kardo_billing.prices set lookup_key = null, synced_at = now()
      where lookup_key = ${price.lookupKey} and stripe_price_id <> ${price.id}
    `;
  }
  await tx`
    insert into kardo_billing.prices (
      stripe_price_id, stripe_product_id, plan_id, extra_code, lookup_key, currency, unit_amount,
      billing_interval, interval_count, tax_behavior, active, livemode, synced_at
    ) values (
      ${price.id}, ${price.productId}, ${planId}, ${planId ? null : extraCode},
      ${price.lookupKey}, ${price.currency},
      ${price.unitAmount}, ${billingInterval}, ${price.intervalCount}, ${price.taxBehavior},
      ${price.active}, ${price.livemode}, now()
    )
    on conflict (stripe_price_id) do update set
      stripe_product_id = excluded.stripe_product_id,
      plan_id = excluded.plan_id,
      extra_code = excluded.extra_code,
      lookup_key = excluded.lookup_key,
      currency = excluded.currency,
      unit_amount = excluded.unit_amount,
      billing_interval = excluded.billing_interval,
      interval_count = excluded.interval_count,
      tax_behavior = excluded.tax_behavior,
      active = excluded.active,
      livemode = excluded.livemode,
      synced_at = now()
  `;
  return planId !== null || extraCode !== null;
}

async function applySubscriptionTx(
  tx: Transaction,
  snapshot: SubscriptionSnapshot,
): Promise<SyncOutcome> {
  const workspaceId = await workspaceOfCustomer(tx, snapshot.customerId);
  if (!workspaceId) return ignored("unknown customer");
  const accountId = await accountOfCustomer(tx, snapshot.customerId);

  const planId = await planIdOf(tx, snapshot.planCode);
  const previous = await tx<
    { status: string; plan_id: string | null; cancel_at_period_end: boolean }[]
  >`
    select status::text as status, plan_id, cancel_at_period_end
    from kardo_billing.subscriptions
    where stripe_subscription_id = ${snapshot.id}
  `;
  const pm = snapshot.paymentMethod;
  await tx`
    insert into kardo_billing.subscriptions (
      stripe_subscription_id, workspace_id, account_id, stripe_customer_id, status, plan_id,
      stripe_price_id, billing_interval, interval_count, unit_amount, currency,
      current_period_start, current_period_end, trial_start, trial_end,
      cancel_at_period_end, cancel_at, canceled_at, ended_at,
      cancellation_reason, cancellation_feedback,
      payment_method_type, payment_method_brand, payment_method_last4,
      payment_method_exp_month, payment_method_exp_year,
      latest_invoice_id, livemode, stripe_created_at, synced_at
    ) values (
      ${snapshot.id}, ${workspaceId}::uuid, ${accountId}::uuid, ${snapshot.customerId},
      ${snapshot.status}::kardo_billing.subscription_status, ${planId},
      ${snapshot.priceId}, ${snapshot.interval}, ${snapshot.intervalCount},
      ${snapshot.unitAmount}, ${snapshot.currency},
      ${snapshot.currentPeriodStart}, ${snapshot.currentPeriodEnd},
      ${snapshot.trialStart}, ${snapshot.trialEnd},
      ${snapshot.cancelAtPeriodEnd}, ${snapshot.cancelAt}, ${snapshot.canceledAt},
      ${snapshot.endedAt}, ${snapshot.cancellationReason}, ${snapshot.cancellationFeedback},
      ${pm?.type ?? null}, ${pm?.brand ?? null}, ${pm?.last4 ?? null},
      ${pm?.expMonth ?? null}, ${pm?.expYear ?? null},
      ${snapshot.latestInvoiceId}, ${snapshot.livemode}, ${snapshot.createdAt}, now()
    )
    on conflict (stripe_subscription_id) do update set
      account_id = coalesce(excluded.account_id, kardo_billing.subscriptions.account_id),
      status = excluded.status,
      plan_id = excluded.plan_id,
      stripe_price_id = excluded.stripe_price_id,
      billing_interval = excluded.billing_interval,
      interval_count = excluded.interval_count,
      unit_amount = excluded.unit_amount,
      currency = excluded.currency,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      trial_start = excluded.trial_start,
      trial_end = excluded.trial_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      cancel_at = excluded.cancel_at,
      canceled_at = excluded.canceled_at,
      ended_at = excluded.ended_at,
      cancellation_reason = excluded.cancellation_reason,
      cancellation_feedback = excluded.cancellation_feedback,
      payment_method_type = excluded.payment_method_type,
      payment_method_brand = excluded.payment_method_brand,
      payment_method_last4 = excluded.payment_method_last4,
      payment_method_exp_month = excluded.payment_method_exp_month,
      payment_method_exp_year = excluded.payment_method_exp_year,
      latest_invoice_id = excluded.latest_invoice_id,
      synced_at = now()
  `;

  if (snapshot.trialStart) {
    await tx`
      update kardo_billing.customers set
        trial_consumed_at = coalesce(trial_consumed_at, ${snapshot.trialStart}),
        trial_consumed_by = coalesce(
          trial_consumed_by,
          (select p.id from kardo_core.profiles p where p.id = ${snapshot.profileId}::uuid)
        ),
        updated_at = now()
      where stripe_customer_id = ${snapshot.customerId}
    `;
  }

  // Every line with its quantity (ADR 024): the plan's and each extra.
  const extrasBefore = await tx<{ extra_code: string; quantity: number }[]>`
    select extra_code, quantity from kardo_billing.subscription_items
    where stripe_subscription_id = ${snapshot.id} and extra_code is not null
  `;
  const itemIds = snapshot.items.map((item) => item.id);
  await tx`
    delete from kardo_billing.subscription_items
    where stripe_subscription_id = ${snapshot.id}
      and not (stripe_subscription_item_id = any(${itemIds}::text[]))
  `;
  for (const item of snapshot.items) {
    const itemPlan = await planIdOf(tx, item.planCode);
    const itemExtra = itemPlan ? null : await extraCodeOf(tx, item.extraCode);
    await tx`
      insert into kardo_billing.subscription_items (
        stripe_subscription_item_id, stripe_subscription_id, stripe_price_id,
        plan_id, extra_code, quantity, unit_amount, synced_at
      ) values (
        ${item.id}, ${snapshot.id}, ${item.priceId}, ${itemPlan}, ${itemExtra},
        ${item.quantity}, ${item.unitAmount}, now()
      )
      on conflict (stripe_subscription_item_id) do update set
        stripe_price_id = excluded.stripe_price_id,
        plan_id = excluded.plan_id,
        extra_code = excluded.extra_code,
        quantity = excluded.quantity,
        unit_amount = excluded.unit_amount,
        synced_at = now()
    `;
  }
  const extrasKey = (rows: { code: string | null; quantity: number }[]) =>
    rows
      .filter((row) => row.code)
      .map((row) => `${row.code}:${row.quantity}`)
      .sort()
      .join(",");
  const extrasChanged =
    extrasKey(
      extrasBefore.map((row) => ({
        code: row.extra_code,
        quantity: row.quantity,
      })),
    ) !==
    extrasKey(
      snapshot.items
        .filter((item) => !item.planCode)
        .map((item) => ({ code: item.extraCode, quantity: item.quantity })),
    );

  const before = previous[0];
  await enqueueSubscriptionNotices(tx, workspaceId, planId, snapshot, before);
  // Downgrade option B (ADR 023, per account since ADR 024): a plan or
  // extras with less room open the 14-day window at once; more room brings
  // back what was out.
  if (
    !before ||
    before.status !== snapshot.status ||
    before.plan_id !== planId ||
    extrasChanged
  ) {
    if (accountId) await refreshAccountOverageTx(tx, accountId);
    else await refreshPlanOverageTx(tx, workspaceId);
  }
  if (
    !before ||
    before.status !== snapshot.status ||
    before.plan_id !== planId
  ) {
    await audit(
      tx,
      workspaceId,
      "billing.subscription_changed",
      "subscription",
      {
        subscriptionId: snapshot.id,
        from: before?.status ?? null,
        to: snapshot.status,
        planCode: snapshot.planCode,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      },
    );
  }
  return { status: "processed", workspaceId };
}

/** Contract confirmation and cancellation confirmation (with folio). */
async function enqueueSubscriptionNotices(
  tx: Transaction,
  workspaceId: string,
  planId: string | null,
  snapshot: SubscriptionSnapshot,
  before: { status: string; cancel_at_period_end: boolean } | undefined,
): Promise<void> {
  const live = snapshot.status === "trialing" || snapshot.status === "active";
  const started = live && (!before || before.status === "incomplete");
  // Only cancellations someone asked for; failed payments are not "you
  // cancelled", and a trial that ends without a card had its own notice.
  const requested =
    snapshot.cancellationReason === null ||
    snapshot.cancellationReason === "cancellation_requested";
  const scheduled =
    before !== undefined &&
    !before.cancel_at_period_end &&
    snapshot.cancelAtPeriodEnd &&
    requested;
  const immediate =
    before !== undefined &&
    snapshot.status === "canceled" &&
    !["canceled", "trialing", "incomplete", "incomplete_expired"].includes(
      before.status,
    ) &&
    !before.cancel_at_period_end &&
    snapshot.cancellationReason === "cancellation_requested";
  if (!started && !scheduled && !immediate) return;

  const base = await noticeBase(tx, workspaceId, planId, snapshot);
  if (started) {
    const trialing = snapshot.status === "trialing";
    await enqueueNotice(tx, {
      workspaceId,
      kind: "subscription_started",
      dedupeKey: `started:${snapshot.id}`,
      subscriptionId: snapshot.id,
      payload: {
        ...base,
        trialEnd: trialing ? isoOrNull(snapshot.trialEnd) : null,
        chargeAt: isoOrNull(
          trialing ? snapshot.trialEnd : snapshot.currentPeriodEnd,
        ),
      },
    });
  }
  if (scheduled || immediate) {
    const folio = cancellationFolio(
      snapshot.id,
      snapshot.canceledAt ?? snapshot.cancelAt ?? new Date(),
    );
    await enqueueNotice(tx, {
      workspaceId,
      kind: "cancellation_confirmed",
      dedupeKey: `canceled:${snapshot.id}:${folio}`,
      subscriptionId: snapshot.id,
      payload: {
        ...base,
        folio,
        endsAt: scheduled
          ? isoOrNull(snapshot.cancelAt ?? snapshot.currentPeriodEnd)
          : null,
      },
    });
    await audit(
      tx,
      workspaceId,
      "billing.cancellation_confirmed",
      "subscription",
      {
        subscriptionId: snapshot.id,
        folio,
        mode: scheduled ? "period_end" : "immediately",
      },
    );
  }
}

async function applyInvoiceTx(
  tx: Transaction,
  invoice: InvoiceSnapshot,
): Promise<SyncOutcome> {
  const workspaceId = await workspaceOfCustomer(tx, invoice.customerId);
  if (!workspaceId) return ignored("unknown customer");
  await tx`
    insert into kardo_billing.invoices (
      stripe_invoice_id, workspace_id, stripe_customer_id, stripe_subscription_id,
      number, status, billing_reason, currency, subtotal, tax, total, amount_due,
      amount_paid, amount_remaining, hosted_invoice_url, invoice_pdf,
      period_start, period_end, paid_at, attempt_count, next_payment_attempt,
      livemode, stripe_created_at, synced_at
    ) values (
      ${invoice.id}, ${workspaceId}::uuid, ${invoice.customerId}, ${invoice.subscriptionId},
      ${invoice.number}, ${invoice.status}, ${invoice.billingReason}, ${invoice.currency},
      ${invoice.subtotal}, ${invoice.tax}, ${invoice.total}, ${invoice.amountDue},
      ${invoice.amountPaid}, ${invoice.amountRemaining}, ${invoice.hostedInvoiceUrl},
      ${invoice.invoicePdf}, ${invoice.periodStart}, ${invoice.periodEnd}, ${invoice.paidAt},
      ${invoice.attemptCount}, ${invoice.nextPaymentAttempt}, ${invoice.livemode},
      ${invoice.createdAt}, now()
    )
    on conflict (stripe_invoice_id) do update set
      stripe_subscription_id = excluded.stripe_subscription_id,
      number = excluded.number,
      status = excluded.status,
      billing_reason = excluded.billing_reason,
      subtotal = excluded.subtotal,
      tax = excluded.tax,
      total = excluded.total,
      amount_due = excluded.amount_due,
      amount_paid = excluded.amount_paid,
      amount_remaining = excluded.amount_remaining,
      hosted_invoice_url = excluded.hosted_invoice_url,
      invoice_pdf = excluded.invoice_pdf,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      paid_at = excluded.paid_at,
      attempt_count = excluded.attempt_count,
      next_payment_attempt = excluded.next_payment_attempt,
      synced_at = now()
  `;
  // ADR 020 §6: "factura de cada pago" asks for the CFDI of every payment
  // (the law gives 24 hours). Only fresh payments, never a resync of old
  // ones; one open request per payment. Never for a month already closed
  // (Mexico City): that payment belongs to the month's global invoice, and
  // asking now would invoice it twice (the same rule as `request_cfdi`,
  // relevo 18 decision 22; security review 2026-10).
  if (invoice.status === "paid" && invoice.amountPaid > 0 && invoice.paidAt) {
    await tx`
      insert into kardo_billing.cfdi_requests (
        workspace_id, account_id, stripe_invoice_id, fiscal_snapshot, requested_by
      )
      select ${workspaceId}::uuid, f.account_id, ${invoice.id},
        jsonb_build_object(
          'rfc', f.rfc, 'legalName', f.legal_name, 'taxRegime', f.tax_regime,
          'postalCode', f.postal_code, 'cfdiUse', f.cfdi_use, 'email', f.email
        ),
        null
      -- The fiscal profile is the account's (ADR 024), not the invoice's
      -- organization: match by the invoice workspace's billing account.
      from kardo_billing.fiscal_profiles f
      where (
          f.account_id = (
            select w.billing_account_id from kardo_core.workspaces w
            where w.id = ${workspaceId}::uuid
          )
          -- Fall back to the organization's own profile when it has no account
          -- yet (matches readFiscal; code review of 3255ddb).
          or (f.account_id is null and f.workspace_id = ${workspaceId}::uuid)
        )
        and f.invoice_each_payment
        and ${invoice.paidAt}::timestamptz > now() - interval '3 days'
        and date_trunc('month', ${invoice.paidAt}::timestamptz at time zone 'America/Mexico_City')
          = date_trunc('month', now() at time zone 'America/Mexico_City')
      on conflict do nothing
    `;
  }
  return { status: "processed", workspaceId };
}

async function applyRefundTx(
  tx: Transaction,
  gateway: BillingGateway,
  refund: RefundSnapshot,
  requestedBy: string | null,
): Promise<SyncOutcome> {
  const invoiceId =
    refund.invoiceId ??
    (refund.paymentIntentId
      ? await gateway.findInvoiceForPaymentIntent(refund.paymentIntentId)
      : null);
  if (!invoiceId) return ignored("refund without invoice");
  const invoices = await tx<{ workspace_id: string }[]>`
    select workspace_id from kardo_billing.invoices where stripe_invoice_id = ${invoiceId}
  `;
  let workspaceId = invoices[0]?.workspace_id ?? null;
  if (!workspaceId) {
    // The invoice may predate the mirror: fetch it first.
    const invoice = await gateway.getInvoice(invoiceId);
    if (!invoice) return ignored("unknown invoice");
    const outcome = await applyInvoiceTx(tx, invoice);
    if (outcome.status !== "processed") return outcome;
    workspaceId = outcome.workspaceId;
  }
  if (!workspaceId) return ignored("unknown invoice");

  await tx`
    insert into kardo_billing.refunds (
      stripe_refund_id, workspace_id, stripe_invoice_id, amount, currency, status,
      reason, requested_by, livemode, created_at, synced_at
    ) values (
      ${refund.id}, ${workspaceId}::uuid, ${invoiceId}, ${refund.amount}, ${refund.currency},
      ${refund.status}, ${refund.reason}, ${requestedBy}, ${refund.livemode},
      ${refund.createdAt}, now()
    )
    on conflict (stripe_refund_id) do update set
      status = excluded.status,
      amount = excluded.amount,
      reason = coalesce(kardo_billing.refunds.reason, excluded.reason),
      requested_by = coalesce(kardo_billing.refunds.requested_by, excluded.requested_by),
      synced_at = now()
  `;
  await tx`
    update kardo_billing.invoices set amount_refunded = (
      select coalesce(sum(r.amount), 0) from kardo_billing.refunds r
      where r.stripe_invoice_id = ${invoiceId} and r.status in ('pending', 'requires_action', 'succeeded')
    ), synced_at = now()
    where stripe_invoice_id = ${invoiceId}
  `;
  await audit(tx, workspaceId, "billing.refund_synced", "invoice", {
    refundId: refund.id,
    invoiceId,
    amount: refund.amount,
    status: refund.status,
  });
  return { status: "processed", workspaceId };
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
]);

const INVOICE_EVENTS = new Set([
  "invoice.created",
  "invoice.finalized",
  "invoice.updated",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.marked_uncollectible",
  "invoice.voided",
  "invoice.overdue",
  "invoice.upcoming",
]);

/** Events Kardo subscribes to; configure the webhook endpoint with these. */
export const BILLING_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  ...SUBSCRIPTION_EVENTS,
  ...INVOICE_EVENTS,
  "price.created",
  "price.updated",
  "price.deleted",
  "product.updated",
  "product.deleted",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "customer.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Never persist anything that looks like a secret or an email.
  return message
    .replace(/(sk|rk|whsec|pk)_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .slice(0, 500);
}

export function createBillingSync(
  sql: Sql,
  gateway: BillingGateway,
): BillingSync {
  async function syncSubscriptionTx(
    tx: Transaction,
    id: string,
  ): Promise<SyncOutcome> {
    await lockObject(tx, id);
    const snapshot = await gateway.getSubscription(id);
    if (!snapshot) return ignored("subscription not found");
    return applySubscriptionTx(tx, snapshot);
  }

  async function syncInvoiceTx(
    tx: Transaction,
    id: string,
  ): Promise<SyncOutcome> {
    await lockObject(tx, id);
    const invoice = await gateway.getInvoice(id);
    if (!invoice) return ignored("invoice not found");
    return applyInvoiceTx(tx, invoice);
  }

  async function dispatch(
    tx: Transaction,
    event: BillingEventSnapshot,
  ): Promise<SyncOutcome> {
    // Upcoming invoices are previews without an id.
    if (event.type === "invoice.upcoming") {
      const subscriptionId = event.invoiceSubscriptionId;
      if (!subscriptionId)
        return ignored("upcoming invoice without subscription");
      await lockObject(tx, subscriptionId);
      const snapshot = await gateway.getSubscription(subscriptionId);
      if (!snapshot) return ignored("subscription not found");
      const outcome = await applySubscriptionTx(tx, snapshot);
      if (outcome.status === "processed" && outcome.workspaceId) {
        await enqueueChargeNotice(
          tx,
          outcome.workspaceId,
          snapshot,
          event.upcomingAt,
          event.upcomingAmount,
        );
      }
      return outcome;
    }

    const objectId = event.objectId;
    if (!objectId) return ignored("event without object");

    if (event.type === "checkout.session.completed") {
      if (!event.subscriptionId)
        return ignored("checkout without subscription");
      const outcome = await syncSubscriptionTx(tx, event.subscriptionId);
      if (outcome.status === "processed" && outcome.workspaceId) {
        // Record of the express consent to the recurring charge.
        await audit(
          tx,
          outcome.workspaceId,
          "billing.checkout_completed",
          "subscription",
          {
            checkoutSessionId: objectId,
            subscriptionId: event.subscriptionId,
            termsAccepted: event.termsAccepted,
            termsVersion: TERMS_VERSION,
            acceptedAt: event.createdAt.toISOString(),
          },
        );
      }
      return outcome;
    }
    if (event.type === "customer.subscription.trial_will_end") {
      // Stripe sends this 3 days before; the notice usually went out 7 days
      // before with the upcoming invoice (same dedupe key, so only once).
      await lockObject(tx, objectId);
      const snapshot = await gateway.getSubscription(objectId);
      if (!snapshot) return ignored("subscription not found");
      const outcome = await applySubscriptionTx(tx, snapshot);
      if (outcome.status === "processed" && outcome.workspaceId) {
        await enqueueChargeNotice(
          tx,
          outcome.workspaceId,
          snapshot,
          snapshot.trialEnd,
          null,
        );
      }
      return outcome;
    }
    if (SUBSCRIPTION_EVENTS.has(event.type)) {
      return syncSubscriptionTx(tx, objectId);
    }
    if (INVOICE_EVENTS.has(event.type)) {
      const outcome = await syncInvoiceTx(tx, objectId);
      // Payment results change the subscription status (past_due, active).
      if (outcome.status === "processed" && event.invoiceSubscriptionId) {
        await syncSubscriptionTx(tx, event.invoiceSubscriptionId);
      }
      return outcome;
    }
    if (event.type.startsWith("price.")) {
      await lockObject(tx, objectId);
      const price = await gateway.getPrice(objectId);
      if (!price) return ignored("price not found");
      await upsertPrice(tx, price);
      return { status: "processed", workspaceId: null };
    }
    if (event.type.startsWith("product.")) {
      await lockObject(tx, objectId);
      for (const price of await gateway.listPrices({ productId: objectId })) {
        await upsertPrice(tx, price);
      }
      return { status: "processed", workspaceId: null };
    }
    if (event.type.startsWith("refund.")) {
      await lockObject(tx, objectId);
      const refund = await gateway.getRefund(objectId);
      if (!refund) return ignored("refund not found");
      return applyRefundTx(tx, gateway, refund, null);
    }
    if (event.type === "customer.updated") {
      const workspaceId = await workspaceOfCustomer(tx, objectId);
      if (!workspaceId) return ignored("unknown customer");
      await tx`
        update kardo_billing.customers
        set email = ${event.customerEmail}, updated_at = now()
        where stripe_customer_id = ${objectId}
      `;
      return { status: "processed", workspaceId };
    }
    if (event.type.startsWith("charge.dispute.")) {
      const workspaceId = event.customerId
        ? await workspaceOfCustomer(tx, event.customerId)
        : null;
      if (!workspaceId) return ignored("dispute without known customer");
      await audit(
        tx,
        workspaceId,
        `billing.${event.type.slice(7)}`,
        "dispute",
        {
          disputeId: objectId,
        },
      );
      return { status: "processed", workspaceId };
    }
    return ignored("event type not handled");
  }

  return {
    async processEvent(event) {
      try {
        return await withSync(sql, async (tx) => {
          await lockAccountOfCustomer(tx, event.customerId);
          const inserted = await tx`
            insert into kardo_billing.webhook_events (
              stripe_event_id, event_type, object_id, livemode, api_version, stripe_created_at
            ) values (
              ${event.id}, ${event.type}, ${event.objectId}, ${event.livemode},
              ${event.apiVersion}, ${event.createdAt}
            )
            on conflict (stripe_event_id) do nothing
            returning stripe_event_id
          `;
          const rows = await tx<{ status: string }[]>`
            select status from kardo_billing.webhook_events
            where stripe_event_id = ${event.id}
            for update
          `;
          if (inserted.length === 0) {
            const status = rows[0]?.status;
            if (status === "processed" || status === "ignored")
              return "duplicate";
            await tx`
              update kardo_billing.webhook_events set attempts = attempts + 1
              where stripe_event_id = ${event.id}
            `;
          }

          const outcome =
            event.livemode === gateway.livemode
              ? await dispatch(tx, event)
              : ignored("livemode mismatch");

          await tx`
            update kardo_billing.webhook_events set
              status = ${outcome.status},
              workspace_id = ${outcome.workspaceId},
              last_error = ${outcome.note ?? null},
              processed_at = now()
            where stripe_event_id = ${event.id}
          `;
          return outcome.status;
        });
      } catch (error) {
        await withSync(sql, async (tx) => {
          await tx`
            insert into kardo_billing.webhook_events (
              stripe_event_id, event_type, object_id, livemode, api_version,
              stripe_created_at, status, last_error
            ) values (
              ${event.id}, ${event.type}, ${event.objectId}, ${event.livemode},
              ${event.apiVersion}, ${event.createdAt}, 'failed', ${safeError(error)}
            )
            on conflict (stripe_event_id) do update set
              status = 'failed',
              attempts = kardo_billing.webhook_events.attempts + 1,
              last_error = excluded.last_error
          `;
        }).catch(() => undefined);
        throw error;
      }
    },

    async syncSubscription(subscriptionId) {
      // The account's lock goes first: its Customer comes from the mirror,
      // or from Stripe for a subscription Kardo has not seen yet.
      const [mirrored] = await withSync(
        sql,
        (tx) => tx<{ stripe_customer_id: string }[]>`
          select stripe_customer_id from kardo_billing.subscriptions
          where stripe_subscription_id = ${subscriptionId}
        `,
      );
      const customerId =
        mirrored?.stripe_customer_id ??
        (await gateway.getSubscription(subscriptionId))?.customerId ??
        null;
      return withSync(sql, async (tx) => {
        await lockAccountOfCustomer(tx, customerId);
        return syncSubscriptionTx(tx, subscriptionId);
      });
    },

    applySubscription(snapshot) {
      return withSync(sql, async (tx) => {
        await lockAccountOfCustomer(tx, snapshot.customerId);
        await lockObject(tx, snapshot.id);
        return applySubscriptionTx(tx, snapshot);
      });
    },

    applyRefund(snapshot, requestedBy) {
      return withSync(sql, async (tx) => {
        await lockObject(tx, snapshot.id);
        return applyRefundTx(tx, gateway, snapshot, requestedBy);
      });
    },

    async runScheduledNotices() {
      const due = await withSync(
        sql,
        (tx) =>
          tx<{ stripe_subscription_id: string; stripe_customer_id: string }[]>`
          select stripe_subscription_id, stripe_customer_id from kardo_billing.subscriptions
          where status = 'trialing' and not cancel_at_period_end
            and trial_end > now() and trial_end <= now() + interval '7 days'
          order by trial_end
          limit 200
        `,
      );
      for (const row of due) {
        await withSync(sql, async (tx) => {
          await lockAccountOfCustomer(tx, row.stripe_customer_id);
          await lockObject(tx, row.stripe_subscription_id);
          const snapshot = await gateway.getSubscription(
            row.stripe_subscription_id,
          );
          if (!snapshot) return;
          const outcome = await applySubscriptionTx(tx, snapshot);
          if (outcome.status === "processed" && outcome.workspaceId) {
            await enqueueChargeNotice(
              tx,
              outcome.workspaceId,
              snapshot,
              snapshot.trialEnd,
              null,
            );
          }
        });
      }
      const trials = await withSync(sql, enqueueTrialNotices);
      return { checked: due.length + trials };
    },

    async syncCatalog() {
      const prices = await gateway.listPrices();
      return withSync(sql, async (tx) => {
        await lockObject(tx, "catalog");
        let mirrored = 0;
        let mappedToPlans = 0;
        for (const price of prices) {
          const mapped = await upsertPrice(tx, price);
          if (mapped === null) continue;
          mirrored += 1;
          if (mapped) mappedToPlans += 1;
        }
        return { prices: mirrored, mappedToPlans };
      });
    },
  };
}
