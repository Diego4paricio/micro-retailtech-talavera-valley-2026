import { describe, expect, it } from "vitest";
import {
  accessSourceLabels,
  availableActions,
  canRefundInvoice,
  endOfDayIso,
  entitlementLabel,
  eventStatusView,
  extrasLine,
  formatMoney,
  formatPrice,
  holderLine,
  intervalLabel,
  invoiceStatusView,
  isCorporatePlanCode,
  isValidReason,
  meterView,
  monthlyChargeLine,
  nextDateOf,
  niceCeil,
  organizationsLine,
  parseOrganizationsMax,
  parsePesosToCents,
  paymentMethodSummary,
  refundableCents,
  subscriptionStatusView,
  validateRefund,
  validateTrialDays,
} from "../src/features/billing/format.js";

const nbsp = /\s/g;
const plain = (value: string) => value.replace(nbsp, " ");

describe("formatMoney / formatPrice", () => {
  it("drops decimals on whole pesos and keeps centavos otherwise", () => {
    expect(plain(formatMoney(49_900))).toBe("$499");
    expect(plain(formatMoney(49_950))).toBe("$499.50");
    expect(plain(formatMoney(0))).toBe("$0");
  });

  it("groups thousands with es-MX and can append the currency code", () => {
    expect(plain(formatMoney(129_900_00, "mxn", { withCode: true }))).toBe(
      "$129,900 MXN",
    );
  });

  it("formatPrice adds the interval and tolerates unknown amounts", () => {
    expect(plain(formatPrice(19_900, "mxn", "month"))).toBe("$199 / mes");
    expect(plain(formatPrice(199_000, "mxn", "year"))).toBe("$1,990 / año");
    expect(formatPrice(null, null, "month")).toBe("—");
  });
});

describe("niceCeil", () => {
  it("rounds chart maxima up to readable values", () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(1_234)).toBe(2_000);
    expect(niceCeil(2_100)).toBe(2_500);
    expect(niceCeil(4_100)).toBe(5_000);
    expect(niceCeil(10_000)).toBe(10_000);
  });
});

describe("status labels", () => {
  it("maps subscription states to Spanish labels and tones", () => {
    expect(subscriptionStatusView("active")).toEqual({
      label: "Activa",
      tone: "success",
    });
    expect(subscriptionStatusView("past_due").tone).toBe("warning");
    expect(subscriptionStatusView("unpaid").tone).toBe("danger");
    expect(subscriptionStatusView("canceled").label).toBe("Cancelada");
    expect(subscriptionStatusView("trialing").label).toBe("En prueba");
  });

  it("labels invoices, events and intervals", () => {
    expect(invoiceStatusView("paid").label).toBe("Pagada");
    expect(invoiceStatusView(null).label).toBe("Sin estado");
    expect(eventStatusView("failed").tone).toBe("danger");
    expect(eventStatusView("received").label).toBe("Recibido");
    expect(intervalLabel("month")).toBe("Mensual");
    expect(intervalLabel("year")).toBe("Anual");
    expect(intervalLabel(null)).toBe("—");
  });

  it("summarizes a saved card", () => {
    expect(
      paymentMethodSummary({
        type: "card",
        brand: "visa",
        last4: "4242",
        expMonth: 8,
        expYear: 2027,
      }),
    ).toBe("Visa terminada en 4242 (vence 08/27)");
    expect(paymentMethodSummary(null)).toBe("Sin método de pago");
  });
});

describe("nextDateOf / availableActions", () => {
  const base = {
    trialEnd: "2026-10-05T00:00:00Z",
    currentPeriodEnd: "2026-10-20T00:00:00Z",
    canceledAt: "2026-09-01T00:00:00Z",
    cancelAtPeriodEnd: false,
  };

  it("picks the date that matters for each state", () => {
    expect(nextDateOf({ ...base, status: "trialing" })).toEqual({
      label: "Fin de prueba",
      date: base.trialEnd,
    });
    expect(nextDateOf({ ...base, status: "active" }).label).toBe(
      "Próximo cobro",
    );
    expect(
      nextDateOf({ ...base, status: "active", cancelAtPeriodEnd: true }).label,
    ).toBe("Termina el");
    expect(nextDateOf({ ...base, status: "canceled" }).date).toBe(
      base.canceledAt,
    );
  });

  it("offers only the actions that apply", () => {
    expect(
      availableActions({ status: "active", cancelAtPeriodEnd: false }),
    ).toEqual({
      cancel: true,
      cancelPeriodEnd: true,
      resume: false,
      extendTrial: false,
      resync: true,
    });
    const scheduled = availableActions({
      status: "active",
      cancelAtPeriodEnd: true,
    });
    expect(scheduled.resume).toBe(true);
    expect(scheduled.cancelPeriodEnd).toBe(false);
    expect(scheduled.cancel).toBe(true);
    expect(
      availableActions({ status: "trialing", cancelAtPeriodEnd: false })
        .extendTrial,
    ).toBe(true);
    const ended = availableActions({
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    expect(ended.cancel).toBe(false);
    expect(ended.resume).toBe(false);
  });
});

describe("meterView", () => {
  it("computes usage against a numeric limit", () => {
    const view = meterView("touchpoints.max", 10, 8);
    expect(view).toMatchObject({ kind: "limit", limit: 10, usage: 8 });
    expect(view.kind === "limit" && view.ratio).toBe(0.8);
    expect(view.kind === "limit" && view.tone).toBe("warning");
    expect(meterView("touchpoints.max", 10, 10)).toMatchObject({
      tone: "danger",
    });
    expect(meterView("touchpoints.max", 10, 2)).toMatchObject({
      tone: "success",
    });
  });

  it("treats null as no limit and a zero limit as full", () => {
    expect(meterView("links.max", null, 4)).toMatchObject({
      limit: null,
      ratio: null,
      tone: "neutral",
    });
    expect(meterView("links.max", 0, 0)).toMatchObject({ ratio: 1 });
  });

  it("recognizes features, by value or by key", () => {
    expect(meterView("leads.export", true, undefined)).toEqual({
      kind: "feature",
      enabled: true,
    });
    expect(meterView("custom_html.enabled", undefined, undefined)).toEqual({
      kind: "feature",
      enabled: false,
    });
  });

  it("uses the contract label and falls back to the raw key", () => {
    expect(entitlementLabel("links.max")).toBe("Links");
    expect(entitlementLabel("algo.nuevo")).toBe("algo.nuevo");
  });
});

describe("reasons", () => {
  it("requires 3 to 500 characters after trimming", () => {
    expect(isValidReason("  ab ")).toBe(false);
    expect(isValidReason("abc")).toBe(true);
    expect(isValidReason("a".repeat(501))).toBe(false);
  });
});

describe("refunds", () => {
  const invoice = {
    status: "paid" as const,
    amountPaid: 49_900,
    amountRefunded: 10_000,
    currency: "mxn",
  };

  it("computes what can still be refunded", () => {
    expect(refundableCents(invoice)).toBe(39_900);
    expect(refundableCents({ amountPaid: 100, amountRefunded: 500 })).toBe(0);
    expect(canRefundInvoice(invoice)).toBe(true);
    expect(canRefundInvoice({ ...invoice, status: "open" })).toBe(false);
    expect(canRefundInvoice({ ...invoice, amountRefunded: 49_900 })).toBe(
      false,
    );
  });

  it("parses pesos into cents", () => {
    expect(parsePesosToCents("100")).toBe(10_000);
    expect(parsePesosToCents("1,234.5")).toBe(123_450);
    expect(parsePesosToCents("0.07")).toBe(7);
    expect(parsePesosToCents("12.345")).toBeNull();
    expect(parsePesosToCents("-5")).toBeNull();
    expect(parsePesosToCents("abc")).toBeNull();
  });

  it("empty input refunds the remaining balance", () => {
    expect(validateRefund("", invoice)).toEqual({ ok: true, amount: 39_900 });
  });

  it("accepts an amount up to paid minus refunded", () => {
    expect(validateRefund("100", invoice)).toEqual({
      ok: true,
      amount: 10_000,
    });
    expect(validateRefund("399", invoice)).toEqual({
      ok: true,
      amount: 39_900,
    });
  });

  it("rejects zero, invalid and excessive amounts", () => {
    expect(validateRefund("0", invoice).ok).toBe(false);
    expect(validateRefund("hola", invoice).ok).toBe(false);
    const over = validateRefund("399.01", invoice);
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toMatch(/no puede superar/);
  });

  it("rejects everything when nothing is left to refund", () => {
    expect(validateRefund("", { ...invoice, amountRefunded: 49_900 }).ok).toBe(
      false,
    );
  });
});

describe("validateTrialDays", () => {
  it("accepts whole days from 1 to 60", () => {
    expect(validateTrialDays("7")).toEqual({ ok: true, days: 7 });
    expect(validateTrialDays("60")).toEqual({ ok: true, days: 60 });
  });

  it("rejects out of range and non-integer input", () => {
    expect(validateTrialDays("0").ok).toBe(false);
    expect(validateTrialDays("61").ok).toBe(false);
    expect(validateTrialDays("2.5").ok).toBe(false);
    expect(validateTrialDays("").ok).toBe(false);
  });
});

describe("endOfDayIso", () => {
  it("returns an ISO instant for a valid date and null otherwise", () => {
    const iso = endOfDayIso("2026-12-31");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(iso ?? "").getTime()).toBeGreaterThan(
      new Date("2026-12-31T00:00:00Z").getTime() - 86_400_000,
    );
    expect(endOfDayIso("")).toBeNull();
    expect(endOfDayIso("31/12/2026")).toBeNull();
    expect(endOfDayIso("2026-13-45")).toBeNull();
  });
});

describe("customer notices (LFPC)", () => {
  it("labels every notice kind and status", async () => {
    const { noticeKindLabel, noticeStatusView } = await import(
      "../src/features/billing/format.js"
    );
    expect(noticeKindLabel("renewal_upcoming")).toBe("Aviso de renovación");
    expect(noticeKindLabel("cancellation_confirmed")).toBe(
      "Confirmación de cancelación",
    );
    expect(noticeStatusView("sent")).toEqual({
      label: "Enviado",
      tone: "success",
    });
    expect(noticeStatusView("skipped").tone).toBe("danger");
  });
});

describe("billing account (ADR 024)", () => {
  const account = {
    holderName: "Mariana Ríos",
    holderEmail: "mariana@ejemplo.mx",
    organizationsUsed: 2,
    organizationsLimit: 3,
  };

  it("labels organizations out of the plan", () => {
    expect(accessSourceLabels.excluded).toBe("Fuera del plan");
  });

  it("writes the person, organizations, extras and monthly charge", () => {
    expect(holderLine(account)).toBe("Mariana Ríos · mariana@ejemplo.mx");
    expect(holderLine({ holderName: null, holderEmail: null })).toBe(
      "Sin titular",
    );
    expect(organizationsLine(account)).toBe("2 de 3");
    expect(organizationsLine({ ...account, organizationsLimit: null })).toBe(
      "2, sin tope",
    );
    expect(extrasLine([])).toBe("Sin extras");
    expect(
      extrasLine([
        { code: "touchpoints", name: "10 QR y etiquetas más", quantity: 1 },
      ]),
    ).toBe("10 QR y etiquetas más ×1");
    expect(plain(monthlyChargeLine(42800))).toBe("$428 / mes");
    expect(monthlyChargeLine(null)).toBe("—");
  });

  it("reads the organizations field of the manual plan", () => {
    expect(isCorporatePlanCode("corporativo")).toBe(true);
    expect(isCorporatePlanCode("negocio")).toBe(false);
    expect(parseOrganizationsMax("")).toEqual({ ok: true, value: null });
    expect(parseOrganizationsMax(" 12 ")).toEqual({ ok: true, value: 12 });
    expect(parseOrganizationsMax("1001")).toEqual({ ok: false });
    expect(parseOrganizationsMax("2.5")).toEqual({ ok: false });
  });
});
