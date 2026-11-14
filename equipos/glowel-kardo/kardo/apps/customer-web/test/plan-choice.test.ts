import type { BillingPlanList, BillingSubscription } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  choiceOfferText,
  choiceRoute,
  choiceSummary,
  readPlanChoice,
  resolvePlanChoice,
  withoutPlanChoice,
} from "../src/features/billing/plan-choice.js";
import { handleBillingDemo } from "../src/lib/demo/billing.js";

const plain = (text: string) => text.replace(/\s/g, " ");
const catalog = handleBillingDemo(
  "/v1/billing/plans",
  "GET",
  {},
) as BillingPlanList;

const offer = {
  percentOff: 20,
  months: 3,
  interval: "month",
  validUntil: "2026-10-14T18:00:00.000Z",
} as const;

describe("plan choice from the pricing page", () => {
  it("reads the address", () => {
    expect(readPlanChoice("")).toBeNull();
    expect(readPlanChoice("?workspace=abc")).toBeNull();
    expect(
      readPlanChoice("?workspace=abc&elegir=esencial&periodo=anual"),
    ).toEqual({ code: "esencial", period: "anual", workspaceId: "abc" });
  });

  it("removes only its parameters", () => {
    const url = withoutPlanChoice(
      "https://app.kardo.mx/settings/plan?workspace=abc&elegir=esencial&periodo=anual&x=1",
    );
    expect(url.search).toBe("?x=1");
  });

  it("maps mensual and anual to the monthly and yearly price", () => {
    const monthly = resolvePlanChoice(catalog, "profesional", "mensual");
    expect(monthly?.price.id).toBe("price_demoProfesionalMes");
    expect(monthly?.interval).toBe("month");
    const yearly = resolvePlanChoice(catalog, "profesional", "anual");
    expect(yearly?.price.id).toBe("price_demoProfesionalAnio");
  });

  it("rejects an unknown plan or period", () => {
    expect(resolvePlanChoice(catalog, "platino", "mensual")).toBeNull();
    expect(resolvePlanChoice(catalog, "profesional", "semanal")).toBeNull();
    expect(resolvePlanChoice(catalog, "profesional", null)).toBeNull();
    const yearOnly: BillingPlanList = {
      ...catalog,
      plans: catalog.plans.map((plan) => ({
        ...plan,
        prices: plan.prices.filter((price) => price.interval === "year"),
      })),
    };
    expect(resolvePlanChoice(yearOnly, "profesional", "mensual")).toBeNull();
  });

  it("summarizes the purchase with VAT included", () => {
    const choice = resolvePlanChoice(catalog, "profesional", "mensual");
    if (!choice) throw new Error("plan not found");
    expect(plain(choiceSummary(choice))).toBe(
      "Vas a contratar Profesional mensual: $379 IVA incluido",
    );
    expect(choiceOfferText(choice, offer)).toBe(
      "Con 20 % de descuento en tus 3 primeros meses",
    );
    expect(choiceOfferText(choice, null)).toBeNull();
  });

  it("never offers the coupon on the yearly price", () => {
    const choice = resolvePlanChoice(catalog, "profesional", "anual");
    if (!choice) throw new Error("plan not found");
    expect(plain(choiceSummary(choice))).toContain("Profesional anual");
    expect(choiceOfferText(choice, offer)).toBeNull();
  });

  it("goes through the portal only with a live subscription", () => {
    const sub = (status: string) => ({ status }) as BillingSubscription;
    expect(choiceRoute(null)).toBe("checkout");
    expect(choiceRoute(sub("canceled"))).toBe("checkout");
    expect(choiceRoute(sub("incomplete_expired"))).toBe("checkout");
    for (const status of ["trialing", "active", "past_due"])
      expect(choiceRoute(sub(status))).toBe("portal");
  });
});
