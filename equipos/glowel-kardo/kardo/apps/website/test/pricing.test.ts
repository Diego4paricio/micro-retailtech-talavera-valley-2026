import { afterEach, describe, expect, it } from "vitest";
import {
  formatPesos,
  limitRows,
  loadPricing,
  organizationsByPlan,
  planHighlights,
  pricingPublished,
  signUpHref,
} from "@/lib/pricing";

describe("pricing from the billing catalog", () => {
  const environment = process.env.KARDO_ENV;
  afterEach(() => {
    process.env.KARDO_ENV = environment;
  });

  it("shows the paid plans and Corporativo, never a free or retired plan", () => {
    const pricing = loadPricing();
    expect(pricing.plans.map((plan) => plan.code)).toEqual([
      "esencial",
      "profesional",
      "negocio",
      "corporativo",
    ]);
    for (const plan of pricing.plans.filter((p) => !p.contactOnly)) {
      expect(plan.monthly).toBeGreaterThan(0);
      expect(plan.yearly).toBeGreaterThan(0);
    }
    const corporate = pricing.plans.find((plan) => plan.contactOnly);
    expect(corporate?.monthly).toBeNull();
  });

  it("says how many organizations each plan covers and sells the extras (ADR 024)", () => {
    const pricing = loadPricing();
    const byCode = Object.fromEntries(pricing.plans.map((p) => [p.code, p]));
    expect(
      ["esencial", "profesional", "negocio"].map(
        (code) => byCode[code]?.entitlements["organizations.max"],
      ),
    ).toEqual([1, 3, 5]);
    expect(organizationsByPlan(pricing)).toBe(
      "1 en Esencial, 3 en Profesional y 5 en Negocio",
    );
    expect(planHighlights(byCode.esencial as never)[0]).toBe("1 organización");
    expect(planHighlights(byCode.profesional as never)[0]).toBe(
      "3 organizaciones",
    );
    expect(limitRows[0]?.key).toBe("organizations.max");
    expect(pricing.extras.map((extra) => extra.code)).toEqual([
      "organization",
      "touchpoints",
      "links",
    ]);
    for (const extra of pricing.extras) {
      expect(extra.monthly).toBeGreaterThan(0);
      expect(extra.yearly).toBeGreaterThan(0);
    }
  });

  it("recommends the trial plan and says how the annual price works", () => {
    const pricing = loadPricing();
    expect(pricing.plans.filter((plan) => plan.recommended)).toHaveLength(1);
    expect(pricing.trialPlanName).toBe("Profesional");
    expect(pricing.trialDays).toBe(15);
    // The yearly price always costs less than 12 months; the saving differs
    // by plan (owner decision of 2026-10-01: 2 months on Profesional and
    // Negocio, $198 on Esencial).
    for (const plan of pricing.plans.filter((p) => !p.contactOnly)) {
      expect(plan.yearly).toBeLessThan((plan.monthly ?? 0) * 12);
      expect(plan.yearlySavings).toBe(
        (plan.monthly ?? 0) * 12 - (plan.yearly ?? 0),
      );
    }
    const byCode = Object.fromEntries(pricing.plans.map((p) => [p.code, p]));
    expect(byCode.esencial?.yearlySavings).toBe(198);
    expect(byCode.profesional?.yearlySavings).toBe(
      2 * (byCode.profesional?.monthly ?? 0),
    );
    expect(byCode.negocio?.yearlySavings).toBe(
      2 * (byCode.negocio?.monthly ?? 0),
    );
    expect(pricing.annualMaxFreeMonths).toBe(2);
  });

  it("is a draft until the owner approves it: hidden in production", () => {
    const pricing = loadPricing();
    process.env.KARDO_ENV = "development";
    expect(pricingPublished(pricing)).toBe(true);
    process.env.KARDO_ENV = "production";
    expect(pricingPublished(pricing)).toBe(pricing.approved);
    expect(pricingPublished({ ...pricing, approved: true })).toBe(true);
  });

  it("promises only limits the platform enforces today", () => {
    const keys = limitRows.map((row) => row.key);
    // Estudio (ADR 018) not deployed; analytics keep three months (ADR 006).
    expect(keys).not.toContain("ai.generations_month");
    expect(keys).not.toContain("custom_html.enabled");
    expect(keys).not.toContain("analytics.history_days");
    for (const plan of loadPricing().plans) {
      // Descriptions come from the catalog (also Stripe's product text).
      expect(plan.description).not.toMatch(/\bIA\b|inteligencia|HTML/i);
      for (const line of planHighlights(plan)) {
        expect(line).not.toMatch(/\bIA\b|inteligencia|HTML|historial/i);
      }
    }
  });

  it("formats pesos and builds the sign up link", () => {
    expect(formatPesos(1199)).toBe("$1,199");
    expect(formatPesos(165.83)).toBe("$165.83");
    expect(
      signUpHref("https://app.kardo.mx/registro", "profesional", "year"),
    ).toBe("https://app.kardo.mx/registro?plan=profesional&periodo=anual");
  });
});
