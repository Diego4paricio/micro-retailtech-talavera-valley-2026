import type { BillingInvoice, WorkspaceFiscal } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FiscalFormView,
  FiscalSectionView,
} from "../src/features/billing/FiscalSection.js";
import { emptyFiscalForm } from "../src/features/billing/fiscal-model.js";
import { InvoiceList } from "../src/features/billing/InvoiceList.js";
import type { FiscalController } from "../src/features/billing/use-fiscal.js";

const invoice = (id: string): BillingInvoice => ({
  id,
  number: `N-${id}`,
  status: "paid",
  total: 44900,
  amountPaid: 44900,
  amountRefunded: 0,
  currency: "mxn",
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-10-01T00:00:00.000Z",
  paidAt: "2026-09-01T00:00:00.000Z",
  hostedInvoiceUrl: null,
  invoicePdf: null,
  createdAt: "2026-09-01T00:00:00.000Z",
});

const controller = (
  fiscal: Partial<WorkspaceFiscal> = {},
  formOpen = false,
): FiscalController => ({
  fiscal: {
    profile: null,
    requests: [],
    requestableInvoiceIds: [],
    ...fiscal,
  },
  busy: null,
  error: null,
  clearError: () => {},
  save: async () => true,
  remove: async () => true,
  requestCfdi: async () => true,
  openForm: () => {},
  formOpen,
  setFormOpen: () => {},
});

const profile = {
  rfc: "ABC010203XY1",
  legalName: "Tacos del Norte SA de CV",
  taxRegime: "601" as const,
  postalCode: "64000",
  cfdiUse: "G03" as const,
  email: "pagos@ejemplo.mx",
  invoiceEachPayment: true,
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("Datos de facturación", () => {
  it("invites to add the data without asking for the Constancia file", () => {
    const html = renderToStaticMarkup(
      <FiscalSectionView defaultEmail="" fiscal={controller()} />,
    );
    expect(html).toContain("¿Necesitas factura (CFDI)?");
    expect(html).toContain("factura global del mes");
    expect(html).toContain("Agregar datos de facturación");
    expect(html).not.toContain('type="file"');
  });

  it("shows the saved data with Editar and Borrar", () => {
    const html = renderToStaticMarkup(
      <FiscalSectionView defaultEmail="" fiscal={controller({ profile })} />,
    );
    expect(html).toContain("ABC010203XY1");
    expect(html).toContain("601 · General de Ley Personas Morales");
    expect(html).toContain("Editar");
    expect(html).toContain("Borrar mis datos fiscales");
  });

  it("renders the form with its fields, the note and a disabled Guardar", () => {
    const html = renderToStaticMarkup(
      <FiscalFormView
        busy={false}
        initial={emptyFiscalForm()}
        onCancel={() => {}}
        onSave={() => {}}
      />,
    );
    expect(html).toContain("RFC");
    expect(html).toContain("como aparece en tu Constancia");
    expect(html).toContain("Código postal del domicilio fiscal");
    expect(html).toContain("G03 · Gastos en general");
    expect(html).toContain("Quiero factura de cada pago");
    expect(html).toContain(
      "Solo pedimos los datos; no necesitas subir tu Constancia.",
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Guardar/);
    expect(html).toContain("Cancelar");
  });
});

describe("Facturas con CFDI", () => {
  const invoices = [invoice("in_current01"), invoice("in_oldpaid01")];

  it("offers Pedir factura only for requestable ids", () => {
    const html = renderToStaticMarkup(
      <InvoiceList
        fiscal={controller({
          profile,
          requestableInvoiceIds: ["in_current01"],
        })}
        invoices={invoices}
      />,
    );
    expect(html.match(/Pedir factura/g)).toHaveLength(1);
    expect(html).toContain("Incluido en la factura global del mes");
  });

  it("points to the form when there are no fiscal data", () => {
    const html = renderToStaticMarkup(
      <InvoiceList
        fiscal={controller({ requestableInvoiceIds: ["in_current01"] })}
        invoices={invoices}
      />,
    );
    expect(html).toContain("Agrega tus datos fiscales para pedir tu factura");
  });

  it("shows the request status instead of the button", () => {
    const html = renderToStaticMarkup(
      <InvoiceList
        fiscal={controller({
          profile,
          requests: [
            {
              id: "0b9f3a4e-0000-4000-8000-000000000001",
              invoiceId: "in_oldpaid01",
              status: "pending",
              requestedAt: "2026-09-02T00:00:00.000Z",
              issuedAt: null,
              satUuid: null,
              notes: null,
              automatic: false,
            },
          ],
        })}
        invoices={[invoice("in_oldpaid01")]}
      />,
    );
    expect(html).toContain("Factura pedida");
    expect(html).not.toContain("Pedir factura");
  });

  it("shows nothing fiscal without a controller (Editor, Viewer)", () => {
    const html = renderToStaticMarkup(<InvoiceList invoices={invoices} />);
    expect(html).not.toContain("Pedir factura");
    expect(html).not.toContain("factura global");
  });
});

describe("demo fiscal", () => {
  const store = new Map<string, string>();
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  async function demo() {
    vi.stubGlobal("window", {
      location: { search: "", origin: "http://localhost", pathname: "/" },
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
    vi.resetModules();
    return import("../src/lib/demo/billing.js");
  }
  const base = "/v1/workspaces/x/billing";

  it("saves, requests a CFDI and deletes coherently", async () => {
    const { handleBillingDemo, handleFiscalDemo } = await demo();
    // The first purchase keeps the trial (no charge yet); changing plan
    // afterwards charges today and creates the paid invoice.
    for (const priceId of ["price_demoEsencialMes", "price_demoNegocioMes"])
      handleBillingDemo(`${base}/checkout`, "POST", {
        priceId,
        workspaceId: "x",
      });
    const empty = handleFiscalDemo(
      `${base}/fiscal`,
      "GET",
      {},
    ) as WorkspaceFiscal;
    expect(empty.profile).toBeNull();
    expect(empty.requestableInvoiceIds).toEqual(["in_demoInvoice0001"]);
    expect(() =>
      handleFiscalDemo(`${base}/invoices/in_demoInvoice0001/cfdi`, "POST", {}),
    ).toThrow();

    const { updatedAt: _, ...body } = profile;
    const saved = handleFiscalDemo(
      `${base}/fiscal`,
      "PUT",
      body,
    ) as WorkspaceFiscal;
    expect(saved.profile?.rfc).toBe("ABC010203XY1");

    const result = handleFiscalDemo(
      `${base}/invoices/in_demoInvoice0001/cfdi`,
      "POST",
      {},
    );
    expect("request" in result && result.request.status).toBe("pending");
    const after = handleFiscalDemo(
      `${base}/fiscal`,
      "GET",
      {},
    ) as WorkspaceFiscal;
    expect(after.requests).toHaveLength(1);
    expect(after.requestableInvoiceIds).toEqual([]);

    const removed = handleFiscalDemo(
      `${base}/fiscal`,
      "DELETE",
      {},
    ) as WorkspaceFiscal;
    expect(removed.profile).toBeNull();
    expect(removed.requests).toHaveLength(1);
  });
});
