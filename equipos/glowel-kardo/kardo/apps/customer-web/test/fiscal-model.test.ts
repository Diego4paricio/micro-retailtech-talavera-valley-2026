import type { CfdiRequest } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  canManageFiscal,
  cfdiStatusView,
  emptyFiscalForm,
  hasErrors,
  invoiceFiscalView,
  normalizeRfc,
  postalCodeError,
  rfcError,
  toUpsert,
  validateFiscalForm,
} from "../src/features/billing/fiscal-model.js";

const valid = {
  ...emptyFiscalForm("pagos@ejemplo.mx"),
  rfc: "abc010203xy1",
  legalName: "Tacos del Norte SA de CV",
  taxRegime: "601",
  postalCode: "64000",
};

const request = (overrides: Partial<CfdiRequest> = {}): CfdiRequest => ({
  id: "0b9f3a4e-0000-4000-8000-000000000001",
  invoiceId: "in_demoInvoice0001",
  status: "pending",
  requestedAt: "2026-09-10T10:00:00.000Z",
  issuedAt: null,
  satUuid: null,
  notes: null,
  automatic: false,
  ...overrides,
});

describe("RFC", () => {
  it("normalizes to uppercase without spaces or dashes", () => {
    expect(normalizeRfc(" abc-010203 xy1 ")).toBe("ABC010203XY1");
  });
  it("accepts 12 and 13 characters", () => {
    expect(rfcError("ABC010203XY1")).toBeNull();
    expect(rfcError("ABCD010203XY1")).toBeNull();
  });
  it("rejects empty, short and malformed values", () => {
    expect(rfcError("")).toMatch(/Escribe tu RFC/);
    expect(rfcError("ABC0102")).toMatch(/12 caracteres/);
    expect(rfcError("ABC01020XXXY")).toMatch(/Revisa tu RFC/);
  });
  it("rejects the generic RFCs", () => {
    expect(rfcError("XAXX010101000")).toMatch(/genéricos/);
    expect(rfcError("xexx010101000")).toMatch(/genéricos/);
  });
});

describe("postal code", () => {
  it("needs exactly 5 digits", () => {
    expect(postalCodeError("64000")).toBeNull();
    expect(postalCodeError("6400")).toMatch(/5 dígitos/);
    expect(postalCodeError("6400a")).toMatch(/5 dígitos/);
    expect(postalCodeError("")).toMatch(/Escribe/);
  });
});

describe("form validation", () => {
  it("has no errors for a complete form and builds the body", () => {
    expect(hasErrors(validateFiscalForm(valid))).toBe(false);
    expect(toUpsert(valid)).toEqual({
      rfc: "ABC010203XY1",
      legalName: "Tacos del Norte SA de CV",
      taxRegime: "601",
      postalCode: "64000",
      cfdiUse: "G03",
      email: "pagos@ejemplo.mx",
      invoiceEachPayment: false,
    });
  });
  it("defaults the use to G03 and flags every missing field", () => {
    const errors = validateFiscalForm(emptyFiscalForm());
    expect(emptyFiscalForm().cfdiUse).toBe("G03");
    expect(Object.keys(errors).sort()).toEqual([
      "email",
      "legalName",
      "postalCode",
      "rfc",
      "taxRegime",
    ]);
  });
  it("rejects a bad email and an unknown regime", () => {
    const errors = validateFiscalForm({
      ...valid,
      email: "sin-arroba",
      taxRegime: "999",
    });
    expect(errors.email).toBeDefined();
    expect(errors.taxRegime).toBeDefined();
  });
});

describe("request status text", () => {
  it("maps each status", () => {
    expect(cfdiStatusView(request()).text).toBe("Factura pedida");
    expect(
      cfdiStatusView(
        request({
          status: "issued",
          satUuid: "a1b2c3d4-0000-4000-8000-000000000001",
        }),
      ).text,
    ).toBe("Factura emitida · folio fiscal A1B2C3D4…");
    expect(
      cfdiStatusView(request({ status: "rejected", notes: "RFC no coincide" }))
        .text,
    ).toBe("Factura rechazada: RFC no coincide");
    expect(cfdiStatusView(request({ status: "canceled" })).text).toBe(
      "Factura cancelada",
    );
  });
});

describe("invoice fiscal view", () => {
  const fiscal = {
    profile: null,
    requests: [request({ invoiceId: "in_old000001" })],
    requestableInvoiceIds: ["in_current01"],
  };
  it("offers the request only for requestable ids", () => {
    expect(
      invoiceFiscalView({ id: "in_current01", status: "paid" }, fiscal),
    ).toEqual({ kind: "can-request", hasProfile: false });
    expect(
      invoiceFiscalView({ id: "in_other0001", status: "paid" }, fiscal),
    ).toEqual({ kind: "global" });
  });
  it("shows the request state when there is one", () => {
    const view = invoiceFiscalView(
      { id: "in_old000001", status: "paid" },
      fiscal,
    );
    expect(view?.kind).toBe("request");
  });
  it("shows nothing for unpaid invoices", () => {
    expect(
      invoiceFiscalView({ id: "in_draft0001", status: "open" }, fiscal),
    ).toBeNull();
  });
});

describe("roles", () => {
  it("only the account holder manages fiscal data", () => {
    const billing = (over: Record<string, unknown>) =>
      ({ canManage: false, account: null, ...over }) as never;
    // Holder of the account: yes. An Admin who is not the holder: no.
    expect(canManageFiscal(billing({ account: { isHolder: true } }))).toBe(
      true,
    );
    expect(
      canManageFiscal(
        billing({ canManage: true, account: { isHolder: false } }),
      ),
    ).toBe(false);
    // No account yet (older organization): the plan manager.
    expect(canManageFiscal(billing({ canManage: true }))).toBe(true);
    expect(canManageFiscal(null)).toBe(false);
  });
});
