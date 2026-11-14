import type { FiscalProfile, WorkspaceBilling } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type InvoiceChoice,
  PlanChoiceView,
} from "../src/features/billing/PlanChoice.js";

const ready = {
  status: "ready" as const,
  choice: {
    plan: { code: "negocio", name: "Negocio" },
    price: {
      id: "price_TESTnegocio01",
      interval: "month",
      unitAmount: 119900,
      currency: "mxn",
      taxInclusive: true,
    },
    interval: "month",
  } as never,
  billing: { subscription: null } as unknown as WorkspaceBilling,
  fiscal: null,
};

const profile: FiscalProfile = {
  rfc: "CAU200101AB1",
  legalName: "Cafetería Aurora SA de CV",
  taxRegime: "601",
  postalCode: "06700",
  cfdiUse: "G03",
  email: "contabilidad@kardo.test",
  invoiceEachPayment: true,
  updatedAt: "2026-10-01T18:00:00.000Z",
};

const invoice = (overrides: Partial<InvoiceChoice> = {}): InvoiceChoice => ({
  wanted: false,
  profile: null,
  editing: false,
  busy: false,
  onToggle: () => {},
  onEdit: () => {},
  onCancelEdit: () => {},
  onSaveAndContinue: () => {},
  ...overrides,
});

const view = (choice: InvoiceChoice | null) =>
  renderToStaticMarkup(
    <PlanChoiceView
      busy={false}
      defaultEmail="duena@kardo.test"
      invoice={choice}
      offerText={null}
      onCancel={() => {}}
      onContinue={() => {}}
      state={ready}
    />,
  );

describe('"Necesito factura (CFDI)" while contracting (ADR 020 §6)', () => {
  it("offers the box, unticked, and explains the monthly global invoice", () => {
    const html = view(invoice());
    expect(html).toContain("Necesito factura (CFDI)");
    expect(html).toContain("factura global del mes");
    expect(html).not.toContain('checked=""');
    expect(html).toContain("Continuar a pago");
    expect(html).not.toContain("fiscal-rfc");
  });

  it("ticked without fiscal data: asks for it here, never the Constancia", () => {
    const html = view(invoice({ wanted: true }));
    expect(html).toContain('id="fiscal-rfc"');
    expect(html).toContain("Guardar y continuar a pago");
    expect(html).toContain("no necesitas subir tu Constancia");
    expect(html).toContain('value="duena@kardo.test"');
    // Contracting with the box ticked already means every payment.
    expect(html).not.toContain("Quiero factura de cada pago");
    expect(html).not.toContain('type="file"');
    // The form's own button continues; the card's button is hidden.
    expect(html).not.toContain(">Continuar a pago<");
  });

  it("ticked with saved data: shows whom it invoices and keeps paying in one step", () => {
    const html = view(invoice({ wanted: true, profile }));
    expect(html).toContain("CAU200101AB1");
    expect(html).toContain("Cafetería Aurora SA de CV");
    expect(html).toContain("Cambiar datos");
    expect(html).toContain("Continuar a pago");
    expect(html).not.toContain('id="fiscal-rfc"');
  });

  it("editing the saved data shows the form with that data", () => {
    const html = view(invoice({ wanted: true, profile, editing: true }));
    expect(html).toContain('value="CAU200101AB1"');
    expect(html).toContain("Guardar y continuar a pago");
  });

  it("without the invoice controller the card works as before", () => {
    const html = view(null);
    expect(html).not.toContain("Necesito factura");
    expect(html).toContain("Continuar a pago");
  });
});
