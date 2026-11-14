import type {
  BillingAccount,
  BillingChangeResult,
  BillingExtra,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  coveredNames,
  currentExtraQuantities,
  extraActionLabel,
  extraPriceText,
  extraRowValue,
  extrasChangeLine,
  extrasTotal,
  foreignPlanText,
  meterNote,
  nextChargeNote,
  planChangeLine,
} from "../src/features/billing/extras-model.js";
import { usageRows } from "../src/features/billing/format.js";

const price = (interval: "month" | "year", unitAmount: number) => ({
  id: `price_extra${interval}x`,
  interval,
  unitAmount,
  currency: "mxn",
  taxInclusive: true,
});

const extra = (quantity: number): BillingExtra => ({
  code: "organization",
  name: "Organización extra",
  unitsPerQuantity: 1,
  entitlementKey: "organizations.max",
  quantity,
  prices: [price("month", 9900), price("year", 99000)],
});

const result = (over: Partial<BillingChangeResult>): BillingChangeResult => ({
  status: "preview",
  amountDueToday: 6600,
  nextAmount: 47800,
  currency: "mxn",
  nextChargeAt: null,
  ...over,
});

const account = (over: Partial<BillingAccount> = {}): BillingAccount => ({
  holderName: "Mariana Ríos",
  isHolder: true,
  organizationsUsed: 2,
  organizationsLimit: 3,
  organizations: [
    { id: "a", name: "Local Centro", excluded: false, internal: false },
    { id: "b", name: "Terraza", excluded: false, internal: false },
  ],
  extras: [extra(0)],
  ...over,
});

describe("extras rows", () => {
  it("shows the price of the subscription's interval", () => {
    expect(extraPriceText(extra(0), "month")).toBe("$99 al mes");
    expect(extraPriceText(extra(0), "year")).toBe("$990 al año");
  });

  it("shows both prices before there is a subscription", () => {
    expect(extraPriceText(extra(0), null)).toBe("$99 al mes · $990 al año");
  });

  it("adds the quantity only when there is some", () => {
    expect(extraRowValue(extra(0), "month")).toBe("$99 al mes");
    expect(extraRowValue(extra(2), "month")).toBe("$99 al mes ×2");
  });

  it("offers Agregar, or Cambiar when there is some", () => {
    expect(extraActionLabel(extra(0))).toBe("Agregar");
    expect(extraActionLabel(extra(1))).toBe("Cambiar");
  });
});

describe("what a change costs today", () => {
  it("says it in one line, monthly", () => {
    expect(extrasChangeLine(result({}), "month")).toBe(
      "Hoy pagas $66 por lo que falta del mes. Después, $478 al mes con tu plan.",
    );
  });

  it("says it in one line, annual", () => {
    expect(
      extrasChangeLine(
        result({ amountDueToday: 81200, nextAmount: 460000 }),
        "year",
      ),
    ).toBe("Hoy pagas $812 por lo que falta del año. Después, $4,600 al año.");
  });

  it("says nothing is charged today when taking one away", () => {
    expect(extrasChangeLine(result({ amountDueToday: 0 }), "month")).toBe(
      "Hoy no pagas nada. Después, $478 al mes con tu plan.",
    );
  });

  it("describes a plan change with extras", () => {
    expect(
      planChangeLine(
        result({ amountDueToday: 18000, nextAmount: 42800 }),
        "month",
      ),
    ).toBe("Hoy pagas $180. Después, $428 al mes.");
    expect(planChangeLine(result({ amountDueToday: 0 }), "year")).toBe(
      "Hoy no pagas nada. Después, $478 al año.",
    );
  });

  it("explains the next charge with its extras", () => {
    expect(nextChargeNote([extra(0)])).toBeNull();
    expect(nextChargeNote([extra(1)])).toBe("Incluye un extra");
    expect(nextChargeNote([extra(2)])).toBe("Incluye 2 extras");
    // Added from list prices here: said so.
    expect(nextChargeNote([extra(1)], { approximate: true })).toBe(
      "Incluye un extra (monto aprox.)",
    );
    expect(extrasTotal([extra(2)], "month")).toBe(19800);
    expect(currentExtraQuantities([extra(2)])).toEqual({ organization: 2 });
  });
});

describe("the person's account", () => {
  it("lists the organizations the plan covers", () => {
    expect(coveredNames(account())).toBe("Local Centro y Terraza");
    expect(
      coveredNames(
        account({
          organizations: [
            { id: "a", name: "Uno", excluded: false, internal: false },
            { id: "b", name: "Dos", excluded: true, internal: false },
            { id: "c", name: "Tres", excluded: false, internal: false },
          ],
        }),
      ),
    ).toBe("Uno, Dos (en pausa) y Tres");
  });

  it("names whose plan it is for an Admin", () => {
    expect(foreignPlanText("Profesional", "Luis Pérez")).toBe(
      "Profesional de Luis Pérez · esa persona lo administra",
    );
  });

  it("says whose pool the QR y etiquetas share", () => {
    expect(meterNote("touchpoints.max", account())).toBe(
      "Entre tus 2 organizaciones",
    );
    expect(
      meterNote("touchpoints.max", account({ organizationsUsed: 1 })),
    ).toBeNull();
    // Links share the same pool.
    expect(meterNote("links.max", account())).toBe(
      "Entre tus 2 organizaciones",
    );
    expect(meterNote("members.max", account())).toBeNull();
    // The AI quotas are the account's, not each organization's.
    expect(meterNote("ai.generations_month", account())).toBe(
      "Es de tu cuenta: lo comparten todas tus organizaciones",
    );
    expect(meterNote("touchpoints.max", null)).toBeNull();
    expect(meterNote("touchpoints.max", account({ isHolder: false }))).toBe(
      "Entre las organizaciones de Mariana Ríos",
    );
  });

  it("puts Organizaciones first among the meters", () => {
    const rows = usageRows(
      { "organizations.max": 3, "touchpoints.max": 60 },
      { "organizations.max": 2, "touchpoints.max": 7 },
    );
    expect(rows[0]).toMatchObject({
      key: "organizations.max",
      label: "Organizaciones",
      meter: { usage: 2, limit: 3 },
    });
  });
});
