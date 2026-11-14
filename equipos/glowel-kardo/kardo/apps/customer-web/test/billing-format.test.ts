import { describe, expect, it } from "vitest";
import {
  annualSavings,
  featureRows,
  formatMoney,
  formatMoneyWithCode,
  formatPriceLine,
  invoiceStatusView,
  isOpenSubscription,
  meterFor,
  paymentMethodLabel,
  planSourceLabel,
  staticLimitRows,
  subscriptionStatusView,
  trialSummary,
  usageRows,
  usageText,
} from "../src/features/billing/format.js";

const nbsp = /\s/g;
const plain = (text: string) => text.replace(nbsp, " ");

const subscription = {
  id: "sub_abc123456",
  status: "active",
  planCode: "esencial",
  planName: "Esencial",
  interval: "month",
  unitAmount: 29900,
  currency: "mxn",
  currentPeriodEnd: "2026-10-15T12:00:00.000Z",
  trialEnd: null,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  paymentMethod: null,
  createdAt: "2026-09-15T12:00:00.000Z",
} as const;

describe("money", () => {
  it("converts cents to pesos", () => {
    expect(plain(formatMoney(29900))).toBe("$299");
    expect(plain(formatMoney(29950))).toBe("$299.50");
    expect(plain(formatMoney(299000))).toBe("$2,990");
  });

  it("adds the currency code once", () => {
    expect(plain(formatMoneyWithCode(29900))).toBe("$299 MXN");
  });

  it("builds the price line with VAT", () => {
    expect(
      plain(
        formatPriceLine({
          unitAmount: 29900,
          currency: "mxn",
          interval: "month",
          taxInclusive: true,
        }),
      ),
    ).toBe("$299 MXN al mes, IVA incluido");
    expect(
      plain(
        formatPriceLine({
          unitAmount: 299000,
          currency: "mxn",
          interval: "year",
          taxInclusive: true,
        }),
      ),
    ).toBe("$2,990 MXN al año, IVA incluido");
  });
});

describe("meters", () => {
  it("is ok below 80 %, warning from 80 %, danger at 100 %", () => {
    expect(meterFor(7, 10).state).toBe("ok");
    expect(meterFor(8, 10).state).toBe("warning");
    expect(meterFor(9, 10).state).toBe("warning");
    expect(meterFor(10, 10).state).toBe("danger");
    expect(meterFor(12, 10)).toMatchObject({ state: "danger", ratio: 1 });
  });

  it("treats a missing limit as no limit", () => {
    const meter = meterFor(500, null);
    expect(meter).toMatchObject({ state: "ok", ratio: 0, limit: null });
    expect(usageText(meter)).toContain("sin límite");
  });

  it("writes '7 de 10'", () => {
    expect(usageText(meterFor(7, 10))).toBe("7 de 10");
  });

  it("builds one row per tracked limit, absent limits meaning none", () => {
    const rows = usageRows(
      { "touchpoints.max": 10, "links.max": null },
      { "touchpoints.max": 7 },
    );
    const touchpoints = rows.find((row) => row.key === "touchpoints.max");
    expect(touchpoints?.meter.state).toBe("ok");
    expect(touchpoints?.label).toContain("QR y etiquetas");
    expect(rows.find((row) => row.key === "links.max")?.meter.limit).toBeNull();
    expect(
      rows.find((row) => row.key === "members.max")?.meter.limit,
    ).toBeNull();
    expect(rows.some((row) => row.key === "leads.export")).toBe(false);
  });
});

describe("annual savings", () => {
  it("compares twelve months against the yearly price", () => {
    expect(
      annualSavings([
        { interval: "month", unitAmount: 29900 },
        { interval: "year", unitAmount: 299000 },
      ]),
    ).toEqual({ cents: 59800, percent: 17 });
  });

  it("is null without both prices or without savings", () => {
    expect(
      annualSavings([{ interval: "month", unitAmount: 29900 }]),
    ).toBeNull();
    expect(
      annualSavings([
        { interval: "month", unitAmount: 10000 },
        { interval: "year", unitAmount: 120000 },
      ]),
    ).toBeNull();
  });
});

describe("labels", () => {
  it("names the plan origin", () => {
    expect(planSourceLabel(null, null)).toBe("Beta sin límites");
    expect(
      planSourceLabel({ code: "x1", name: "X", source: "manual" }, null),
    ).toBe("Asignado por Kardo");
    expect(
      planSourceLabel({ code: "x1", name: "X", source: "default" }, null),
    ).toBe("Plan por defecto");
    expect(
      planSourceLabel({ code: "x1", name: "X", source: "trial" }, null),
    ).toBe("Prueba gratuita");
    expect(
      planSourceLabel({ code: "x1", name: "X", source: "subscription" }, null),
    ).toBe("Suscripción");
  });

  it("describes subscription states", () => {
    expect(subscriptionStatusView(subscription).label).toBe("Activa");
    expect(
      subscriptionStatusView({ ...subscription, status: "past_due" }),
    ).toEqual({ label: "Pago pendiente", tone: "warning" });
    expect(
      subscriptionStatusView({ ...subscription, status: "canceled" }).label,
    ).toBe("Cancelada");
    const trial = subscriptionStatusView({
      ...subscription,
      status: "trialing",
      trialEnd: "2026-10-01T12:00:00.000Z",
    });
    expect(trial.label).toMatch(/^Prueba hasta .*2026/);
    const scheduled = subscriptionStatusView({
      ...subscription,
      cancelAtPeriodEnd: true,
    });
    expect(scheduled.label).toMatch(/^Cancelación programada para .*octubre/);
  });

  it("knows which subscriptions are open", () => {
    expect(isOpenSubscription(subscription)).toBe(true);
    expect(isOpenSubscription({ ...subscription, status: "canceled" })).toBe(
      false,
    );
    expect(isOpenSubscription(null)).toBe(false);
  });

  it("formats the payment method", () => {
    expect(
      paymentMethodLabel({
        type: "card",
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2028,
      }),
    ).toBe("Visa terminada en 4242, vence 12/28");
    expect(paymentMethodLabel(null)).toBeNull();
  });

  it("lists features as included unless the plan sets them to false", () => {
    const rows = featureRows({
      "leads.export": true,
      "leads.webhook": false,
    });
    expect(rows.find((row) => row.key === "leads.export")?.included).toBe(true);
    expect(rows.find((row) => row.key === "leads.webhook")?.included).toBe(
      false,
    );
  });

  it("never shows what is not offered yet (AI, HTML mode, long analytics)", () => {
    const entitlements = {
      "ai.generations_month": 20,
      "ai.spend_cents_month": 200,
      "custom_html.enabled": true,
      "analytics.history_days": 365,
    };
    const keys = [
      ...featureRows(entitlements),
      ...usageRows(entitlements, {}),
      ...staticLimitRows(entitlements),
    ].map((row) => row.key);
    expect(keys).not.toContain("ai.generations_month");
    expect(keys).not.toContain("ai.spend_cents_month");
    expect(keys).not.toContain("custom_html.enabled");
    expect(keys).not.toContain("analytics.history_days");
  });
});

describe("invoice status", () => {
  const base = { amountPaid: 29900, amountRefunded: 0 };
  it("maps Stripe statuses", () => {
    expect(invoiceStatusView({ ...base, status: "paid" }).label).toBe("Pagada");
    expect(invoiceStatusView({ ...base, status: "open" }).label).toBe(
      "Pendiente",
    );
    expect(invoiceStatusView({ ...base, status: "void" }).label).toBe(
      "Anulada",
    );
    expect(invoiceStatusView({ ...base, status: "uncollectible" }).label).toBe(
      "Incobrable",
    );
  });

  it("flags total and partial refunds", () => {
    expect(
      invoiceStatusView({
        status: "paid",
        amountPaid: 29900,
        amountRefunded: 29900,
      }).label,
    ).toBe("Reembolsada");
    expect(
      invoiceStatusView({
        status: "paid",
        amountPaid: 29900,
        amountRefunded: 10000,
      }).label,
    ).toBe("Reembolsada parcialmente");
  });
});

describe("storage quantities", () => {
  it("reads MB under a gigabyte and GB above", async () => {
    const { formatQuantity, limitLabel } = await import(
      "../src/features/billing/format.js"
    );
    expect(formatQuantity(500, "assets.storage_mb")).toBe("500 MB");
    expect(formatQuantity(2048, "assets.storage_mb")).toBe("2 GB");
    expect(limitLabel(10240, "assets.storage_mb")).toBe("10 GB");
    expect(limitLabel(null, "assets.storage_mb")).toBe("Sin límite");
    expect(formatQuantity(1500)).toBe("1,500");
  });
});

describe("trialSummary (ADR 020)", () => {
  const trial = {
    planCode: "profesional",
    planName: "Profesional",
    interval: "month" as const,
    startedAt: "2026-09-29T18:00:00.000Z",
    endsAt: "2026-10-14T18:00:00.000Z",
    daysLeft: 11,
    status: "active" as const,
  };

  it("counts the days left and says nothing is charged", () => {
    const summary = trialSummary(trial);
    expect(summary?.title).toBe(
      "Te quedan 11 días de prueba del plan Profesional.",
    );
    expect(summary?.text).toContain("No se cobra nada");
    expect(summary?.text).toContain("5 días o más");
    expect(trialSummary({ ...trial, daysLeft: 1 })?.title).toBe(
      "Te queda 1 día de prueba del plan Profesional.",
    );
  });

  it("asks to pick a plan once it ended and hides a converted trial", () => {
    expect(
      trialSummary({ ...trial, status: "ended", daysLeft: 0 })?.text,
    ).toContain("Elige un plan");
    expect(trialSummary({ ...trial, status: "converted" })).toBeNull();
    expect(trialSummary(null)).toBeNull();
  });
});
