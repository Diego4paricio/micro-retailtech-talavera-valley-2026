import type { Sql } from "postgres";
import type { InvoiceStatus, SubscriptionStatus } from "./snapshots.js";

// ---------------------------------------------------------------------------
// Mirror rows → API shapes, shared by the Customer and Staff APIs. The
// output types match `BillingSubscription` and `BillingInvoice` in
// @kardo/contracts structurally (this package does not depend on it).
// ---------------------------------------------------------------------------

export type SubscriptionRow = {
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan_code: string | null;
  plan_name: string | null;
  billing_interval: string | null;
  unit_amount: string | number | null;
  currency: string | null;
  current_period_end: Date | null;
  trial_end: Date | null;
  cancel_at_period_end: boolean;
  cancel_at: Date | null;
  canceled_at: Date | null;
  payment_method_type: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  stripe_created_at: Date;
};

export type MirroredSubscription = {
  id: string;
  status: SubscriptionStatus;
  planCode: string | null;
  planName: string | null;
  interval: "month" | "year" | null;
  unitAmount: number | null;
  currency: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  paymentMethod: {
    type: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null;
  createdAt: string;
};

export type InvoiceRow = {
  stripe_invoice_id: string;
  number: string | null;
  status: InvoiceStatus | null;
  total: string | number;
  amount_paid: string | number;
  amount_refunded: string | number;
  currency: string;
  period_start: Date | null;
  period_end: Date | null;
  paid_at: Date | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  stripe_created_at: Date;
};

export type MirroredInvoice = {
  id: string;
  number: string | null;
  status: InvoiceStatus | null;
  total: number;
  amountPaid: number;
  amountRefunded: number;
  currency: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  createdAt: string;
};

const iso = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

/** `bigint` columns arrive as strings; amounts stay far below 2^53. */
export const cents = (value: string | number): number => Number(value);

/** Columns `toMirroredSubscription` reads, for `from kardo_billing.subscriptions s
 * left join kardo_core.plans p on p.id = s.plan_id`. */
export const subscriptionColumns = (sql: Sql) => sql`
  s.stripe_subscription_id, s.status::text as status, p.code as plan_code,
  p.name as plan_name, s.billing_interval, s.unit_amount, s.currency,
  s.current_period_end, s.trial_end, s.cancel_at_period_end, s.cancel_at,
  s.canceled_at, s.payment_method_type, s.payment_method_brand,
  s.payment_method_last4, s.payment_method_exp_month,
  s.payment_method_exp_year, s.stripe_created_at
`;

/** Columns `toMirroredInvoice` reads, for `from kardo_billing.invoices`. */
export const invoiceColumns = (sql: Sql) => sql`
  stripe_invoice_id, number, status, total, amount_paid, amount_refunded,
  currency, period_start, period_end, paid_at, hosted_invoice_url,
  invoice_pdf, stripe_created_at
`;

export function toMirroredSubscription(
  row: SubscriptionRow,
): MirroredSubscription {
  const interval =
    row.billing_interval === "month" || row.billing_interval === "year"
      ? row.billing_interval
      : null;
  return {
    id: row.stripe_subscription_id,
    status: row.status,
    planCode: row.plan_code,
    planName: row.plan_name,
    interval,
    unitAmount: row.unit_amount === null ? null : cents(row.unit_amount),
    currency: row.currency,
    currentPeriodEnd: iso(row.current_period_end),
    trialEnd: iso(row.trial_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelAt: iso(row.cancel_at),
    canceledAt: iso(row.canceled_at),
    paymentMethod: row.payment_method_type
      ? {
          type: row.payment_method_type,
          brand: row.payment_method_brand,
          last4: row.payment_method_last4,
          expMonth: row.payment_method_exp_month,
          expYear: row.payment_method_exp_year,
        }
      : null,
    createdAt: new Date(row.stripe_created_at).toISOString(),
  };
}

export function toMirroredInvoice(row: InvoiceRow): MirroredInvoice {
  return {
    id: row.stripe_invoice_id,
    number: row.number,
    status: row.status,
    total: cents(row.total),
    amountPaid: cents(row.amount_paid),
    amountRefunded: cents(row.amount_refunded),
    currency: row.currency,
    periodStart: iso(row.period_start),
    periodEnd: iso(row.period_end),
    paidAt: iso(row.paid_at),
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdf: row.invoice_pdf,
    createdAt: new Date(row.stripe_created_at).toISOString(),
  };
}

// --- Kardo trial (ADR 020 §3) ------------------------------------------------

const DAY_MS = 86_400_000;

/** Same shape as `BillingTrial` in @kardo/contracts. */
export type MirroredTrial = {
  planCode: string;
  planName: string;
  interval: "month" | "year";
  startedAt: string;
  endsAt: string;
  daysLeft: number;
  status: "active" | "ended" | "converted";
};

type TrialRow = {
  plan_code: string;
  plan_name: string;
  billing_interval: "month" | "year";
  started_at: Date;
  ends_at: Date;
  converted_at: Date | null;
};

export function toMirroredTrial(
  row: TrialRow,
  now: number = Date.now(),
): MirroredTrial {
  const endsAt = new Date(row.ends_at);
  const msLeft = endsAt.getTime() - now;
  const status = row.converted_at
    ? "converted"
    : msLeft <= 0
      ? "ended"
      : "active";
  return {
    planCode: row.plan_code,
    planName: row.plan_name,
    interval: row.billing_interval,
    startedAt: new Date(row.started_at).toISOString(),
    endsAt: endsAt.toISOString(),
    daysLeft: status === "active" ? Math.ceil(msLeft / DAY_MS) : 0,
    status,
  };
}

/**
 * The Kardo trial that covers an organization: since ADR 024, the trial of
 * the person whose plan covers it (any member may read it, for the panel's
 * banner).
 */
export async function readWorkspaceTrial(
  tx: Sql,
  workspaceId: string,
): Promise<MirroredTrial | null> {
  const [row] = await tx<TrialRow[]>`
    select plan_code, plan_name, billing_interval, started_at, ends_at, converted_at
    from kardo_billing.workspace_trial(${workspaceId}::uuid)
  `;
  return row ? toMirroredTrial(row) : null;
}
