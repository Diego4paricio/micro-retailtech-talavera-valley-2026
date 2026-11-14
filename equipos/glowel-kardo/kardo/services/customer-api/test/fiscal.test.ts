import type { WorkspaceFiscal } from "@kardo/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { FiscalRepository } from "../src/billing/fiscal.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

const fiscalState: WorkspaceFiscal = {
  profile: {
    rfc: "FLI120101AB1",
    legalName: "Florería Lila SA de CV",
    taxRegime: "601",
    postalCode: "06700",
    cfdiUse: "G03",
    email: "contabilidad@florerialila.mx",
    invoiceEachPayment: false,
    updatedAt: "2026-10-05T18:00:00.000Z",
  },
  requests: [],
  requestableInvoiceIds: ["in_TESTcfdi01"],
};

function fakeFiscal(): FiscalRepository {
  return {
    get: vi.fn().mockResolvedValue(fiscalState),
    save: vi.fn().mockResolvedValue(fiscalState),
    remove: vi.fn().mockResolvedValue({ ...fiscalState, profile: null }),
    requestCfdi: vi.fn().mockResolvedValue({
      id: "9d6f2e10-9b39-4f8e-9a1a-6b5a2f0d1c22",
      invoiceId: "in_TESTcfdi01",
      status: "pending",
      requestedAt: "2026-10-05T18:05:00.000Z",
      issuedAt: null,
      satUuid: null,
      notes: null,
      automatic: false,
      document: null,
    }),
    cfdiDocument: vi.fn().mockResolvedValue({
      providerInvoiceId: "65f0a1b2c3d4e5f6a7b8c9d0",
      test: true,
    }),
  };
}

const valid = {
  rfc: "FLI120101AB1",
  legalName: "Florería Lila SA de CV",
  taxRegime: "601",
  postalCode: "06700",
  cfdiUse: "G03",
  email: "contabilidad@florerialila.mx",
  invoiceEachPayment: true,
};

describe("fiscal data and CFDI requests (ADR 020 §6)", () => {
  it("reads the fiscal data", async () => {
    const fiscal = fakeFiscal();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), fiscal });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/fiscal`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(fiscalState);
    await app.close();
  });

  it("saves valid data and refuses a bad RFC, CP or regime before the database", async () => {
    const fiscal = fakeFiscal();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), fiscal });
    const ok = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/billing/fiscal`,
      headers: authHeader,
      payload: valid,
    });
    expect(ok.statusCode).toBe(200);
    expect(fiscal.save).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      valid,
    );
    for (const bad of [
      { ...valid, rfc: "abc" },
      { ...valid, postalCode: "0670" },
      { ...valid, taxRegime: "999" },
      { ...valid, cfdiUse: "X99" },
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/billing/fiscal`,
        headers: authHeader,
        payload: bad,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(fiscal.save).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("deletes the fiscal data", async () => {
    const fiscal = fakeFiscal();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), fiscal });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/billing/fiscal`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile).toBeNull();
    await app.close();
  });

  it("requests the CFDI of one payment", async () => {
    const fiscal = fakeFiscal();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), fiscal });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/invoices/in_TESTcfdi01/cfdi`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().request.status).toBe("pending");
    expect(fiscal.requestCfdi).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      "in_TESTcfdi01",
    );
    const bad = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/invoices/nope/cfdi`,
      headers: authHeader,
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});

describe("CFDI documents with Facturapi (ADR 020 §6, phase 2)", () => {
  const requestId = "9d6f2e10-9b39-4f8e-9a1a-6b5a2f0d1c22";
  const facturapi = () => ({
    livemode: false,
    createInvoice: vi.fn(),
    download: vi.fn().mockResolvedValue({
      body: new TextEncoder().encode("%PDF-1.7").buffer,
      contentType: "application/pdf",
    }),
  });

  it("downloads the PDF from Facturapi as an attachment", async () => {
    const fiscal = fakeFiscal();
    const provider = facturapi();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      fiscal,
      facturapi: provider,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/cfdi/${requestId}/pdf`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toContain(
      'filename="factura-kardo-prueba-9d6f2e10.pdf"',
    );
    expect(response.body).toBe("%PDF-1.7");
    expect(provider.download).toHaveBeenCalledWith(
      "65f0a1b2c3d4e5f6a7b8c9d0",
      "pdf",
    );
    await app.close();
  });

  it("answers 404 for a CFDI without a Facturapi document", async () => {
    const fiscal = fakeFiscal();
    vi.mocked(fiscal.cfdiDocument).mockResolvedValue(null);
    const provider = facturapi();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      fiscal,
      facturapi: provider,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/cfdi/${requestId}/xml`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(404);
    expect(provider.download).not.toHaveBeenCalled();
    await app.close();
  });

  it("answers 503 without FACTURAPI_KEY and 400 for another format", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      fiscal: fakeFiscal(),
      facturapi: null,
    });
    const unavailable = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/cfdi/${requestId}/pdf`,
      headers: authHeader,
    });
    expect(unavailable.statusCode).toBe(503);
    const bad = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/cfdi/${requestId}/zip`,
      headers: authHeader,
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});
