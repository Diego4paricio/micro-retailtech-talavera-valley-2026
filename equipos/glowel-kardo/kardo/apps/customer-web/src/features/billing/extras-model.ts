import type {
  BillingAccount,
  BillingChangeResult,
  BillingExtra,
  BillingInterval,
  BillingPrice,
  ChangeBillingExtras,
  WorkspaceBilling,
} from "@kardo/contracts";
import { formatMoney, isOpenSubscription } from "./format.js";

/**
 * Extras and the person's account (ADR 024), in the panel's words. Pure: the
 * screens and the tests share it.
 */

/** Sent after extras or the plan changed, so the billing page reloads. */
export const BILLING_CHANGED_EVENT = "kardo:billing-changed";

const perInterval: Record<BillingInterval, string> = {
  month: "al mes",
  year: "al año",
};

const periodWord: Record<BillingInterval, string> = {
  month: "mes",
  year: "año",
};

/** The viewer is the person whose plan covers the organization. */
export function isAccountHolder(billing: WorkspaceBilling): boolean {
  return billing.account ? billing.account.isHolder : billing.canManage;
}

/** The extra's price for one interval, or null when it has none. */
export function extraPrice(
  extra: BillingExtra,
  interval: BillingInterval,
): BillingPrice | null {
  return extra.prices.find((price) => price.interval === interval) ?? null;
}

/**
 * «$99 al mes» for the subscription's interval; without a subscription both
 * prices: «$99 al mes · $990 al año».
 */
export function extraPriceText(
  extra: BillingExtra,
  interval: BillingInterval | null,
): string {
  const text = (price: BillingPrice) =>
    `${formatMoney(price.unitAmount, price.currency)} ${perInterval[price.interval]}`;
  if (interval) {
    const price = extraPrice(extra, interval);
    return price ? text(price) : "";
  }
  return (["month", "year"] as const)
    .map((item) => extraPrice(extra, item))
    .filter((price): price is BillingPrice => price !== null)
    .map(text)
    .join(" · ");
}

/** The price, plus «×1» when the account already pays for some. */
export function extraRowValue(
  extra: BillingExtra,
  interval: BillingInterval | null,
): string {
  const price = extraPriceText(extra, interval);
  return extra.quantity > 0 ? `${price} ×${extra.quantity}` : price;
}

/** The label of a row's action. */
export function extraActionLabel(extra: BillingExtra): string {
  return extra.quantity > 0 ? "Cambiar" : "Agregar";
}

/** A paid, live subscription of the viewer's own account takes extras. */
export function canAddExtras(billing: WorkspaceBilling): boolean {
  return (
    !!billing.account &&
    isAccountHolder(billing) &&
    billing.checkoutAvailable &&
    isOpenSubscription(billing.subscription) &&
    !!billing.subscription.interval
  );
}

/** Some extra is paid now: the portal cannot change such a subscription. */
export function hasExtras(billing: WorkspaceBilling): boolean {
  return !!billing.account?.extras.some((extra) => extra.quantity > 0);
}

/**
 * APPROXIMATE: what the extras add to each renewal, in cents, from list
 * prices (no coupon, no VAT adjustments). The exact amount comes from the
 * server (`nextAmountQuantities`); this is only the fallback while it loads
 * or when it is not available.
 */
export function extrasTotal(
  extras: BillingExtra[],
  interval: BillingInterval | null,
): number {
  if (!interval) return 0;
  return extras.reduce(
    (sum, extra) =>
      sum + (extraPrice(extra, interval)?.unitAmount ?? 0) * extra.quantity,
    0,
  );
}

/** How many extras the account pays now. */
export function extrasCount(extras: BillingExtra[]): number {
  return extras.reduce((sum, extra) => sum + extra.quantity, 0);
}

/**
 * The quantities of the extras as they are today: asking the server for a
 * preview with these (`confirm: false`) returns the next charge it will make.
 */
export function currentExtraQuantities(
  extras: BillingExtra[],
): ChangeBillingExtras["quantities"] {
  const quantities: ChangeBillingExtras["quantities"] = {};
  for (const extra of extras) quantities[extra.code] = extra.quantity;
  return quantities;
}

/** «Incluye un extra» under the next charge; «aprox.» when we only added
 * list prices ourselves. */
export function nextChargeNote(
  extras: BillingExtra[],
  options: { approximate?: boolean } = {},
): string | null {
  const count = extrasCount(extras);
  if (count === 0) return null;
  const base = `Incluye ${count === 1 ? "un extra" : `${count} extras`}`;
  return options.approximate ? `${base} (monto aprox.)` : base;
}

/** The one line under the stepper, from the preview of the change. */
export function extrasChangeLine(
  result: BillingChangeResult,
  interval: BillingInterval,
): string {
  const today =
    result.amountDueToday > 0
      ? `Hoy pagas ${formatMoney(result.amountDueToday, result.currency)} por lo que falta del ${periodWord[interval]}.`
      : "Hoy no pagas nada.";
  if (result.nextAmount === null) return today;
  const next = formatMoney(result.nextAmount, result.currency);
  return interval === "month"
    ? `${today} Después, ${next} al mes con tu plan.`
    : `${today} Después, ${next} al año.`;
}

/** The one line of the plan change when the subscription has extras. */
export function planChangeLine(
  result: BillingChangeResult,
  interval: BillingInterval,
): string {
  const today =
    result.amountDueToday > 0
      ? `Hoy pagas ${formatMoney(result.amountDueToday, result.currency)}.`
      : "Hoy no pagas nada.";
  if (result.nextAmount === null) return today;
  return `${today} Después, ${formatMoney(result.nextAmount, result.currency)} ${perInterval[interval]}.`;
}

/** The note under «QR y etiquetas» and «Links» (one pool): whose it is. */
export function meterNote(
  key: string,
  account: BillingAccount | null,
): string | null {
  // The AI quotas are the account's: one cap for all its organizations.
  if (
    account &&
    (key === "ai.generations_month" || key === "ai.spend_cents_month")
  )
    return account.isHolder
      ? "Es de tu cuenta: lo comparten todas tus organizaciones"
      : "Es de la cuenta: lo comparten todas sus organizaciones";
  if (!account || (key !== "touchpoints.max" && key !== "links.max"))
    return null;
  if (!account.isHolder)
    return account.holderName
      ? `Entre las organizaciones de ${account.holderName}`
      : "Entre las organizaciones de esa persona";
  const count = account.organizationsUsed;
  return count > 1 ? `Entre tus ${count} organizaciones` : null;
}

/** Names of the organizations the plan covers; paused ones say so. */
export function coveredNames(account: BillingAccount): string {
  const names = account.organizations.map((organization) =>
    organization.excluded
      ? `${organization.name} (en pausa)`
      : organization.name,
  );
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return names.join(" y ");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** «Profesional de Luis Pérez · esa persona lo administra». */
export function foreignPlanText(
  planName: string,
  holderName: string | null,
): string {
  return `${planName} de ${holderName ?? "otra persona"} · esa persona lo administra`;
}
