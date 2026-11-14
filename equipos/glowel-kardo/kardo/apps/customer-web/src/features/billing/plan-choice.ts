import type {
  BillingConversionOffer,
  BillingInterval,
  BillingPlan,
  BillingPlanList,
  BillingPrice,
  BillingSubscription,
} from "@kardo/contracts";
import { formatMoney, isOpenSubscription } from "./format.js";

/**
 * The Website's pricing page sends the customer to
 * `settings/plan?workspace=<uuid>&elegir=<code>&periodo=<mensual|anual>`
 * (ADR 020). These helpers read that address and decide what to do with it.
 */

export type PlanChoiceRequest = {
  code: string;
  period: string | null;
  workspaceId: string | null;
};

const intervals: Record<string, BillingInterval> = {
  mensual: "month",
  anual: "year",
};

/** The request in the address, or null when there is no `elegir`. */
export function readPlanChoice(search: string): PlanChoiceRequest | null {
  const query = new URLSearchParams(search);
  const code = query.get("elegir");
  if (!code) return null;
  return {
    code,
    period: query.get("periodo"),
    workspaceId: query.get("workspace"),
  };
}

/** Removes the parameters of the request so a refresh does not repeat it. */
export function withoutPlanChoice(href: string): URL {
  const url = new URL(href);
  url.searchParams.delete("elegir");
  url.searchParams.delete("periodo");
  url.searchParams.delete("workspace");
  return url;
}

export type PlanChoice = {
  plan: BillingPlan;
  price: BillingPrice;
  interval: BillingInterval;
};

/** The plan and price asked for. No fallback to another period. */
export function resolvePlanChoice(
  catalog: BillingPlanList,
  code: string,
  period: string | null,
): PlanChoice | null {
  const interval = period ? intervals[period] : undefined;
  if (!interval) return null;
  const plan = catalog.plans.find((item) => item.code === code);
  const price = plan?.prices.find((item) => item.interval === interval);
  return plan && price ? { plan, price, interval } : null;
}

/** With a live subscription the change goes through the portal. */
export function choiceRoute(
  subscription: BillingSubscription | null | undefined,
): "portal" | "checkout" {
  return isOpenSubscription(subscription) ? "portal" : "checkout";
}

/**
 * Where "Continuar a pago" goes: the portal with a live subscription; else
 * Checkout inside the panel when Stripe.js can run there (publishable key),
 * or Stripe's hosted page as the fallback (relevo 20, T1).
 */
export function paymentRoute(
  subscription: BillingSubscription | null | undefined,
  embeddedAvailable: boolean,
): "portal" | "embedded" | "hosted" {
  if (choiceRoute(subscription) === "portal") return "portal";
  return embeddedAvailable ? "embedded" : "hosted";
}

export function choiceSummary(choice: PlanChoice): string {
  const period = choice.interval === "month" ? "mensual" : "anual";
  return `Vas a contratar ${choice.plan.name} ${period}: ${formatMoney(choice.price.unitAmount, choice.price.currency)} IVA incluido`;
}

/** The coupon only applies to the monthly price. */
export function choiceOfferText(
  choice: PlanChoice,
  offer: BillingConversionOffer | null | undefined,
): string | null {
  if (!offer || choice.interval !== "month") return null;
  const months =
    offer.months === 1 ? "tu primer mes" : `tus ${offer.months} primeros meses`;
  return `Con ${offer.percentOff} % de descuento en ${months}`;
}
