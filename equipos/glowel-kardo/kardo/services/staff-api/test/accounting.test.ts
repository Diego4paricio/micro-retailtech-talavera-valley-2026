import type { BalanceMovement } from "@kardo/billing";
import { describe, expect, it } from "vitest";
import {
  type AccountingInput,
  type AccountingPaymentRow,
  type AccountingRequest,
  accountingPath,
  buildAccountingMonth,
  mexicoMonth,
  splitIva,
} from "../src/repositories/accounting.js";

const request = (
  status: AccountingRequest["status"],
  overrides: Partial<AccountingRequest> = {},
): AccountingRequest => ({
  status,
  satUuid:
    status === "issued" || status === "canceled"
      ? "5f0c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
      : null,
  provider: "facturapi",
  providerLivemode: true,
  requestedAt: new Date("2026-10-10T18:00:00Z"),
  ...overrides,
});

let next = 0;
const payment = (
  overrides: Partial<AccountingPaymentRow> = {},
): AccountingPaymentRow => {
  next += 1;
  return {
    invoiceId: `in_TESTacct${String(next).padStart(3, "0")}`,
    number: `KARDO-${String(next).padStart(4, "0")}`,
    workspaceName: `Org ${next}`,
    customerId: `cus_TESTacct${next}`,
    paidAt: new Date("2026-10-10T17:00:00Z"),
    amountPaid: 19900,
    total: 19900,
    tax: 2745,
    refunded: 0,
    internal: false,
    requests: [],
    ...overrides,
  };
};

const charge = (
  row: AccountingPaymentRow,
  overrides: Partial<BalanceMovement> = {},
): BalanceMovement => ({
  id: `txn_${row.invoiceId}`,
  type: "charge",
  amount: row.amountPaid,
  fee: 1116,
  feeTax: 179,
  net: row.amountPaid - 1295,
  currency: "mxn",
  created: new Date(row.paidAt.getTime() - 2_000),
  sourceId: `ch_${row.invoiceId.slice(3)}`,
  customerId: row.customerId,
  ...overrides,
});

const base = (overrides: Partial<AccountingInput> = {}): AccountingInput => ({
  month: "2026-10",
  livemode: true,
  currency: "mxn",
  now: new Date("2026-11-01T12:00:00Z"),
  payments: [],
  refunds: [],
  canceledEarlier: [],
  stripe: [],
  truncated: false,
  ...overrides,
});

describe("IVA and months", () => {
  it("breaks the 16 % IVA out of what was charged", () => {
    expect(splitIva(19900)).toEqual({ base: 17155, iva: 2745 });
    expect(splitIva(219000)).toEqual({ base: 188793, iva: 30207 });
    expect(splitIva(15920)).toEqual({ base: 13724, iva: 2196 });
    for (const cents of [1, 99, 37900, 69900, 699000, 123457]) {
      const { base, iva } = splitIva(cents);
      expect(base + iva).toBe(cents);
    }
  });

  it("cuts the month in Mexico City time", () => {
    expect(mexicoMonth(new Date("2026-11-01T05:59:59Z"))).toBe("2026-10");
    expect(mexicoMonth(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11");
  });
});

describe("one path per payment", () => {
  it("issued wins, then pending, then internal, then the global", () => {
    expect(accountingPath([request("issued")], false).path).toBe("individual");
    expect(
      accountingPath([request("rejected"), request("issued")], true).path,
    ).toBe("individual");
    expect(accountingPath([request("pending")], false).path).toBe(
      "individual_pending",
    );
    expect(accountingPath([request("rejected")], false).path).toBe("global");
    expect(accountingPath([request("canceled")], false).path).toBe("global");
    expect(accountingPath([], false).path).toBe("global");
    expect(accountingPath([], true).path).toBe("internal");
  });

  it("every payment counts once and the paths add up to the month", () => {
    const rows = [
      payment({ requests: [request("issued")] }),
      payment({ requests: [request("pending")] }),
      payment({ requests: [request("rejected")] }),
      payment({ amountPaid: 219000, total: 219000, tax: 30207 }),
      payment({ internal: true }),
    ];
    const report = buildAccountingMonth(
      base({ payments: rows, stripe: rows.map((row) => charge(row)) }),
    );
    const { totals } = report;
    expect(report.payments.map((item) => item.path)).toEqual([
      "individual",
      "individual_pending",
      "global",
      "global",
      "internal",
    ]);
    const paths = [
      totals.individual,
      totals.individual_pending,
      totals.global,
      totals.internal,
    ];
    expect(paths.reduce((sum, item) => sum + item.count, 0)).toBe(5);
    for (const key of ["total", "base", "iva"] as const) {
      expect(paths.reduce((sum, item) => sum + item[key], 0)).toBe(
        totals.all[key],
      );
    }
    expect(totals.all.total).toBe(19900 * 4 + 219000);
    expect(report.payments[0]?.satUuid).toBe(
      "5f0c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    );
    const kinds = report.warnings.map((warning) => warning.kind);
    expect(kinds).toContain("cfdi_pending");
    expect(kinds).toContain("internal_payment");
    expect(kinds).not.toContain("stripe_unmatched");
    expect(kinds).not.toContain("kardo_unmatched_payment");
  });

  it("flags a CFDI asked for after the month closed and a canceled one", () => {
    const late = payment({
      requests: [
        request("issued", { requestedAt: new Date("2026-11-01T07:00:00Z") }),
      ],
    });
    const canceled = payment({ requests: [request("canceled")] });
    const report = buildAccountingMonth(
      base({
        payments: [late, canceled],
        canceledEarlier: [
          {
            invoiceId: "in_TESTacctOld",
            number: "KARDO-0900",
            paidAt: new Date("2026-09-20T18:00:00Z"),
          },
        ],
        stripe: null,
      }),
    );
    const byKind = (kind: string) =>
      report.warnings.filter((warning) => warning.kind === kind);
    expect(byKind("cfdi_requested_late")).toHaveLength(1);
    expect(byKind("cfdi_canceled")).toHaveLength(2);
    expect(byKind("cfdi_canceled")[1]?.message).toContain("2026-09");
    expect(byKind("stripe_unavailable")).toHaveLength(1);
    expect(report.stripe).toBeNull();
  });

  it("a test CFDI is an alarm only in live mode", () => {
    const rows = [
      payment({
        requests: [request("issued", { providerLivemode: false })],
      }),
    ];
    const live = buildAccountingMonth(base({ payments: rows, stripe: null }));
    expect(live.payments[0]?.cfdiTest).toBe(true);
    expect(live.warnings.some((w) => w.kind === "cfdi_test")).toBe(true);
    const test = buildAccountingMonth(
      base({ payments: rows, stripe: null, livemode: false }),
    );
    expect(test.warnings.some((w) => w.kind === "cfdi_test")).toBe(false);
  });

  it("IVA comes from what was charged when a credit balance paid part", () => {
    const row = payment({ amountPaid: 11566, total: 19900, tax: 2745 });
    const report = buildAccountingMonth(
      base({ payments: [row], stripe: null }),
    );
    expect(report.payments[0]).toMatchObject({
      total: 11566,
      ...splitIva(11566),
    });
    expect(report.warnings.some((w) => w.kind === "balance_applied")).toBe(
      true,
    );
  });
});

describe("reconciliation with Stripe", () => {
  it("matches each payment to its charge and adds up the fees and their IVA", () => {
    const a = payment();
    const b = payment({ amountPaid: 37900, total: 37900, tax: 5228 });
    const report = buildAccountingMonth(
      base({
        payments: [a, b],
        stripe: [
          charge(a),
          charge(b, { fee: 2000, feeTax: 320 }),
          {
            id: "txn_fee",
            type: "stripe_fee",
            amount: -500,
            fee: 0,
            feeTax: 0,
            net: -500,
            currency: "mxn",
            created: new Date("2026-10-31T12:00:00Z"),
            sourceId: null,
            customerId: null,
          },
        ],
      }),
    );
    expect(report.payments.map((item) => item.stripeChargeId)).toEqual([
      `ch_${a.invoiceId.slice(3)}`,
      `ch_${b.invoiceId.slice(3)}`,
    ]);
    expect(report.payments[1]).toMatchObject({
      stripeFee: 2000,
      stripeFeeIva: 320,
    });
    expect(report.stripe).toEqual({
      charges: { count: 2, amount: 19900 + 37900 },
      refunds: { count: 0, amount: 0 },
      fees: {
        amount: 1116 + 2000 + 500,
        iva: 179 + 320,
        total: 1116 + 2000 + 500 + 179 + 320,
      },
      net: 19900 + 37900 - (1116 + 2000 + 500 + 179 + 320),
      matchedCharges: 2,
    });
  });

  it("a charge never pays two payments, and leftovers on both sides are flagged", () => {
    const a = payment({ customerId: "cus_TESTsame" });
    const b = payment({ customerId: "cus_TESTsame" });
    const stray: BalanceMovement = {
      ...charge(a),
      id: "txn_stray",
      customerId: "cus_TESTother",
      sourceId: "ch_TESTstray01",
    };
    const report = buildAccountingMonth(
      base({ payments: [a, b], stripe: [charge(a), stray] }),
    );
    expect(report.payments.filter((item) => item.stripeChargeId)).toHaveLength(
      1,
    );
    const kinds = report.warnings.map((warning) => warning.kind);
    expect(
      kinds.filter((kind) => kind === "kardo_unmatched_payment"),
    ).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "stripe_unmatched")).toHaveLength(1);
  });

  it("refunds: totals, the path of the original payment and Stripe's side", () => {
    const paid = payment({ requests: [request("issued")] });
    const report = buildAccountingMonth(
      base({
        payments: [],
        refunds: [
          {
            refundId: "re_TESTacct001",
            invoiceId: paid.invoiceId,
            number: paid.number,
            workspaceName: paid.workspaceName,
            createdAt: new Date("2026-10-15T18:00:00Z"),
            status: "succeeded",
            amount: 8334,
            invoicePaidAt: new Date("2026-09-15T18:00:00Z"),
            internal: false,
            requests: paid.requests,
          },
        ],
        stripe: [
          {
            id: "txn_re",
            type: "refund",
            amount: -8334,
            fee: 0,
            feeTax: 0,
            net: -8334,
            currency: "mxn",
            created: new Date("2026-10-15T18:00:00Z"),
            sourceId: "re_TESTacct001",
            customerId: null,
          },
        ],
      }),
    );
    expect(report.refunds[0]).toMatchObject({
      originalPath: "individual",
      originalMonth: "2026-09",
      ...splitIva(8334),
    });
    expect(report.totals.refunds).toEqual({
      count: 1,
      total: 8334,
      ...splitIva(8334),
    });
    expect(report.stripe?.refunds).toEqual({ count: 1, amount: 8334 });
    const refundWarning = report.warnings.find((w) => w.kind === "refund");
    expect(refundWarning?.message).toContain("egreso");
    expect(report.warnings.some((w) => w.kind === "stripe_unmatched")).toBe(
      false,
    );
  });
});
