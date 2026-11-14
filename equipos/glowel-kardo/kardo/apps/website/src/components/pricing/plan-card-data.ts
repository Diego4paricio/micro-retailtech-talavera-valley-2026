import {
  formatPesos,
  type Pricing,
  planHighlights,
  signUpHref,
} from "@/lib/pricing";
import { panel } from "@/lib/site";
import type { PlanCard } from "./PlanCards";

/** The plan columns of the home page and /precios/, from the catalog. */
export function planCards(pricing: Pricing): PlanCard[] {
  return pricing.plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    description: plan.description,
    recommended: plan.recommended,
    contactOnly: plan.contactOnly,
    monthly: plan.monthly === null ? null : formatPesos(plan.monthly),
    yearly: plan.yearly === null ? null : formatPesos(plan.yearly),
    yearlyPerMonth:
      plan.yearly === null
        ? null
        : formatPesos(Math.round((plan.yearly / 12) * 100) / 100),
    yearlySavings:
      plan.yearlySavings === null ? null : formatPesos(plan.yearlySavings),
    highlights: plan.contactOnly
      ? [
          "Las organizaciones que necesites",
          "Todo lo que incluye el plan más alto",
          "Límites según tu operación",
          "Atención directa para arrancar",
        ]
      : planHighlights(plan),
    monthHref: signUpHref(panel.signUp, plan.code, "month"),
    yearHref: signUpHref(panel.signUp, plan.code, "year"),
  }));
}

export const corporateMessage =
  "Hola, me interesa el plan Corporativo de Kardo";
