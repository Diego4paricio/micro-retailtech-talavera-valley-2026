import {
  type BillingEntitlementKey,
  type BillingInterval,
  type BillingInvoice,
  type BillingPrice,
  type BillingSubscription,
  billingEntitlements,
  isLiveSubscriptionStatus,
  type PlanSource,
  type WorkspaceBilling,
} from "@kardo/contracts";
import { getDatePreferences } from "../../lib/date-preferences.js";

/**
 * Pure helpers for the billing screen: money, dates, labels, meters. No React
 * and no I/O so they can be tested in isolation. Amounts are cents of the
 * currency with VAT included (ADR 019).
 */

const locale = "es-MX";

export type BillingTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Cents → "$299" (whole pesos) or "$299.50". */
export function formatMoney(cents: number, currency = "mxn"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "$299 MXN": the amount followed by the currency code. */
export function formatMoneyWithCode(cents: number, currency = "mxn"): string {
  const code = currency.toUpperCase();
  const text = formatMoney(cents, currency);
  return text.includes(code) ? text : `${text} ${code}`;
}

const intervalPhrase: Record<BillingInterval, string> = {
  month: "al mes",
  year: "al año",
};

export function intervalLabel(interval: BillingInterval): string {
  return interval === "month" ? "Mensual" : "Anual";
}

/** "$299 MXN al mes, IVA incluido". */
export function formatPriceLine(
  price: {
    unitAmount: number;
    currency: string;
    interval: BillingInterval;
    taxInclusive?: boolean | undefined;
  },
  options: { vat?: boolean } = {},
): string {
  const base = `${formatMoneyWithCode(price.unitAmount, price.currency)} ${intervalPhrase[price.interval]}`;
  const vat = options.vat ?? price.taxInclusive ?? true;
  return vat ? `${base}, IVA incluido` : base;
}

/** The person's zone (Configuración → Preferencias); the browser's if none. */
export function zoneOption(): Intl.DateTimeFormatOptions {
  const { timeZone } = getDatePreferences();
  return timeZone ? { timeZone } : {};
}

/** "29 de septiembre de 2026". Empty string for missing dates. */
export function formatLongDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    ...zoneOption(),
    dateStyle: "long",
  }).format(date);
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    ...zoneOption(),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

// --- Plan and subscription ---------------------------------------------------

export function planSourceLabel(
  plan: WorkspaceBilling["plan"],
  subscription: BillingSubscription | null,
): string {
  if (!plan) return "Beta sin límites";
  const labels: Record<PlanSource, string> = {
    subscription: "Suscripción",
    manual: "Asignado por Kardo",
    trial: "Prueba gratuita",
    default: "Plan por defecto",
  };
  if (plan.source === "subscription" && !subscription) return "Suscripción";
  return labels[plan.source];
}

/**
 * The Kardo trial line under the plan (ADR 020): days left and end date
 * while it runs, the end date once it ended without a contract.
 */
export function trialSummary(trial: WorkspaceBilling["trial"]): {
  title: string;
  text: string;
} | null {
  if (!trial || trial.status === "converted") return null;
  const end = formatLongDate(trial.endsAt) ?? "";
  if (trial.status === "ended")
    return {
      title: `Tu prueba del plan ${trial.planName} terminó el ${end}.`,
      text: "No se hizo ningún cargo. Elige un plan para seguir editando.",
    };
  return {
    title:
      trial.daysLeft === 1
        ? `Te queda 1 día de prueba del plan ${trial.planName}.`
        : `Te quedan ${trial.daysLeft} días de prueba del plan ${trial.planName}.`,
    text: `Termina el ${end}. No se cobra nada hasta que contrates. Si eliges tu plan con 5 días o más de anticipación, el primer cargo es el día que termina tu prueba.`,
  };
}

export function isOpenSubscription(
  subscription: BillingSubscription | null | undefined,
): subscription is BillingSubscription {
  return !!subscription && isLiveSubscriptionStatus(subscription.status);
}

export function subscriptionStatusView(subscription: BillingSubscription): {
  label: string;
  tone: BillingTone;
} {
  if (subscription.cancelAtPeriodEnd && isOpenSubscription(subscription)) {
    const date = formatLongDate(
      subscription.cancelAt ?? subscription.currentPeriodEnd,
    );
    return {
      label: date
        ? `Cancelación programada para ${date}`
        : "Cancelación programada",
      tone: "warning",
    };
  }
  switch (subscription.status) {
    case "trialing": {
      const date = formatLongDate(subscription.trialEnd);
      return {
        label: date ? `Prueba hasta ${date}` : "En prueba",
        tone: "info",
      };
    }
    case "active":
      return { label: "Activa", tone: "success" };
    case "past_due":
      return { label: "Pago pendiente", tone: "warning" };
    case "unpaid":
      return { label: "Pago pendiente", tone: "danger" };
    case "canceled":
    case "incomplete_expired":
      return { label: "Cancelada", tone: "neutral" };
    case "paused":
      return { label: "En pausa", tone: "neutral" };
    default:
      return { label: "Pendiente de confirmar", tone: "info" };
  }
}

const brandNames: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

/** "Visa terminada en 4242, vence 12/28". Null without a payment method. */
export function paymentMethodLabel(
  method: BillingSubscription["paymentMethod"],
): string | null {
  if (!method) return null;
  const brand = method.brand
    ? (brandNames[method.brand.toLowerCase()] ?? method.brand)
    : method.type === "card"
      ? "Tarjeta"
      : "Método de pago";
  const ending = method.last4 ? ` terminada en ${method.last4}` : "";
  let expiry = "";
  if (method.expMonth && method.expYear) {
    expiry = `, vence ${String(method.expMonth).padStart(2, "0")}/${String(method.expYear % 100).padStart(2, "0")}`;
  }
  return `${brand}${ending}${expiry}`;
}

// --- Usage and limits --------------------------------------------------------

export const meterWarningRatio = 0.8;

export type MeterState = "ok" | "warning" | "danger";

export type Meter = {
  /** null when the plan has no limit. */
  limit: number | null;
  usage: number;
  /** 0 to 1, capped; 0 without a limit. */
  ratio: number;
  state: MeterState;
};

export function meterFor(usage: number, limit: number | null): Meter {
  if (limit === null) return { limit, usage, ratio: 0, state: "ok" };
  if (limit <= 0) return { limit, usage, ratio: 1, state: "danger" };
  const raw = usage / limit;
  const state: MeterState =
    raw >= 1 ? "danger" : raw >= meterWarningRatio ? "warning" : "ok";
  return { limit, usage, ratio: Math.min(1, raw), state };
}

/** Numeric limit for a key: absent, null or non-numeric means "no limit". */
export function limitValue(
  entitlements: WorkspaceBilling["entitlements"],
  key: string,
): number | null {
  const value = entitlements[key];
  return typeof value === "number" ? value : null;
}

/** Labels without their unit suffix: the value already carries it. */
export function displayLabel(label: string): string {
  return label.replace(/\s*\((MB|GB)\)$/, "");
}

/** A count in the key's unit: storage reads "500 MB" or "2 GB". */
export function formatQuantity(value: number, key?: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (key === "assets.storage_mb") {
    return value >= 1024
      ? `${format.format(value / 1024)} GB`
      : `${format.format(value)} MB`;
  }
  return format.format(value);
}

export function limitLabel(limit: number | null, key?: string): string {
  return limit === null ? "Sin límite" : formatQuantity(limit, key);
}

/** "7 de 10" or "7 en uso, sin límite". */
export function usageText(meter: Meter, key?: string): string {
  return meter.limit === null
    ? `${formatQuantity(meter.usage, key)} en uso, sin límite`
    : `${formatQuantity(meter.usage, key)} de ${formatQuantity(meter.limit, key)}`;
}

/**
 * Entitlements the panel does not show yet: the Estudio's AI and HTML mode
 * are not deployed, and analytics keeps 3 months whatever the plan says
 * (relevo 18 §0: never promise what does not exist). Shown again when they
 * ship.
 */
const notOfferedYet: ReadonlySet<string> = new Set([
  "ai.generations_month",
  "ai.spend_cents_month",
  "custom_html.enabled",
  "analytics.history_days",
]);

export type UsageRow = {
  key: BillingEntitlementKey;
  label: string;
  meter: Meter;
};

/** One meter per limit whose usage the API reports. */
export function usageRows(
  entitlements: WorkspaceBilling["entitlements"],
  usage: WorkspaceBilling["usage"],
): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const [key, definition] of Object.entries(billingEntitlements)) {
    if (definition.kind !== "limit" || !definition.usage) continue;
    if (notOfferedYet.has(key)) continue;
    rows.push({
      key: key as BillingEntitlementKey,
      label: displayLabel(definition.label),
      meter: meterFor(usage[key] ?? 0, limitValue(entitlements, key)),
    });
  }
  return rows;
}

/** Limits without usage tracking (for example, analytics history). */
export function staticLimitRows(
  entitlements: Record<string, number | boolean | null>,
): { key: BillingEntitlementKey; label: string; value: string }[] {
  const rows: { key: BillingEntitlementKey; label: string; value: string }[] =
    [];
  for (const [key, definition] of Object.entries(billingEntitlements)) {
    if (definition.kind !== "limit" || definition.usage) continue;
    if (notOfferedYet.has(key)) continue;
    rows.push({
      key: key as BillingEntitlementKey,
      label: displayLabel(definition.label),
      value: limitLabel(limitValue(entitlements, key), key),
    });
  }
  return rows;
}

/** Features: included unless the plan sets them explicitly to false. */
export function featureRows(
  entitlements: Record<string, number | boolean | null>,
): { key: BillingEntitlementKey; label: string; included: boolean }[] {
  const rows: {
    key: BillingEntitlementKey;
    label: string;
    included: boolean;
  }[] = [];
  for (const [key, definition] of Object.entries(billingEntitlements)) {
    if (definition.kind !== "feature") continue;
    if (notOfferedYet.has(key)) continue;
    // An absent or null feature means "no restriction" (ADR 019).
    rows.push({
      key: key as BillingEntitlementKey,
      label: displayLabel(definition.label),
      included: entitlements[key] !== false,
    });
  }
  return rows;
}

// --- Catalog -----------------------------------------------------------------

export type AnnualSavings = { cents: number; percent: number };

/** What paying yearly saves against twelve monthly payments; null if nothing. */
export function annualSavings(
  prices: readonly Pick<BillingPrice, "interval" | "unitAmount">[],
): AnnualSavings | null {
  const month = prices.find((price) => price.interval === "month");
  const year = prices.find((price) => price.interval === "year");
  if (!month || !year || month.unitAmount <= 0) return null;
  const cents = month.unitAmount * 12 - year.unitAmount;
  if (cents <= 0) return null;
  return {
    cents,
    percent: Math.round((cents / (month.unitAmount * 12)) * 100),
  };
}

export function priceFor(
  prices: readonly BillingPrice[],
  interval: BillingInterval,
): BillingPrice | null {
  return (
    prices.find((price) => price.interval === interval) ?? prices[0] ?? null
  );
}

// --- Invoices ----------------------------------------------------------------

export function invoiceStatusView(
  invoice: Pick<BillingInvoice, "status" | "amountPaid" | "amountRefunded">,
): { label: string; tone: BillingTone } {
  if (invoice.amountRefunded > 0) {
    return invoice.amountPaid > 0 &&
      invoice.amountRefunded >= invoice.amountPaid
      ? { label: "Reembolsada", tone: "neutral" }
      : { label: "Reembolsada parcialmente", tone: "neutral" };
  }
  switch (invoice.status) {
    case "paid":
      return { label: "Pagada", tone: "success" };
    case "open":
      return { label: "Pendiente", tone: "warning" };
    case "void":
      return { label: "Anulada", tone: "neutral" };
    case "uncollectible":
      return { label: "Incobrable", tone: "danger" };
    case "draft":
      return { label: "Borrador", tone: "neutral" };
    default:
      return { label: "Sin estado", tone: "neutral" };
  }
}
