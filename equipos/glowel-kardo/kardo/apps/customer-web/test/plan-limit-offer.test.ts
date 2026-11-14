import type { BillingExtra, BillingMyAccount } from "@kardo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { limitOffer } from "../src/features/billing/limit-offer-model.js";
import { notifyPlanLimit, onPlanLimit } from "../src/lib/plan-required.js";

const price = (interval: "month" | "year", unitAmount: number) => ({
  id: `price_${interval}${unitAmount}`,
  interval,
  unitAmount,
  currency: "mxn",
  taxInclusive: true,
});

const extra = (
  code: BillingExtra["code"],
  units: number,
  month: number,
  year: number,
): BillingExtra => ({
  code,
  name: code,
  unitsPerQuantity: units,
  entitlementKey: code === "links" ? "links.max" : "touchpoints.max",
  quantity: 0,
  prices: [price("month", month), price("year", year)],
});

const account = (over: Partial<BillingMyAccount> = {}): BillingMyAccount => ({
  plan: { code: "negocio", name: "Negocio", source: "subscription" },
  organizationsUsed: 1,
  organizationsLimit: 3,
  canAddExtras: true,
  homeWorkspaceId: null,
  extras: [
    extra("touchpoints", 10, 4900, 49000),
    extra("links", 5, 2900, 29000),
  ],
  ...over,
});

describe("what a plan limit offers (A2-60)", () => {
  it("offers the 10 QR y etiquetas extra with its price", () => {
    const offer = limitOffer("touchpoints.max", account());
    expect(offer?.title).toBe(
      "Llegaste al límite de QR y etiquetas de tu plan",
    );
    expect(offer?.extraLabel).toBe(
      "Agregar 10 QR y etiquetas más ($49 al mes · $490 al año)",
    );
  });

  it("offers the 5 links extra", () => {
    expect(limitOffer("links.max", account())?.extraLabel).toBe(
      "Agregar 5 links más ($29 al mes · $290 al año)",
    );
  });

  it("offers nothing without a paid plan or for limits with no extra", () => {
    expect(
      limitOffer("touchpoints.max", account({ canAddExtras: false })),
    ).toBe(null);
    expect(limitOffer("members.max", account())).toBeNull();
    expect(limitOffer("touchpoints.max", null)).toBeNull();
    expect(limitOffer("links.max", account({ extras: [] }))).toBeNull();
  });
});

describe("the plan-limit event", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("announces only a PLAN_LIMIT that names its key", () => {
    const listeners = new Set<(event: Event) => void>();
    vi.stubGlobal("window", {
      dispatchEvent: (event: Event) => {
        for (const listener of listeners) listener(event);
        return true;
      },
      addEventListener: (_: string, l: (event: Event) => void) =>
        listeners.add(l),
      removeEventListener: (_: string, l: (event: Event) => void) =>
        listeners.delete(l),
    });
    vi.stubGlobal(
      "CustomEvent",
      class {
        detail: unknown;
        constructor(_: string, init: { detail: unknown }) {
          this.detail = init.detail;
        }
      },
    );
    const seen: string[] = [];
    const off = onPlanLimit((notice) => seen.push(notice.key));
    expect(notifyPlanLimit(403, "PLAN_LIMIT", { key: "links.max" })).toBe(true);
    expect(notifyPlanLimit(403, "PLAN_LIMIT", null)).toBe(false);
    expect(notifyPlanLimit(403, "PLAN_REQUIRED", { key: "links.max" })).toBe(
      false,
    );
    expect(seen).toEqual(["links.max"]);
    off();
    notifyPlanLimit(403, "PLAN_LIMIT", { key: "links.max" });
    expect(seen).toEqual(["links.max"]);
  });
});
