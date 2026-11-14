import { describe, expect, it, vi } from "vitest";
import {
  createFacturapiClient,
  FacturapiError,
  facturapiInvoiceBody,
} from "../src/facturapi.js";

const input = {
  customer: {
    legalName: "Cafetería Aurora",
    taxId: "CAU200101AB1",
    taxSystem: "601",
    zip: "06700",
    email: "contabilidad@kardo.test",
  },
  description: "Suscripción a Kardo, recibo KARDO-0101",
  total: 1199,
  paymentForm: "04",
  use: "G03",
  series: "KARDO",
};

describe("Facturapi invoice body (CFDI 4.0)", () => {
  it("one service line with IVA included and the Kardo SAT keys", () => {
    expect(facturapiInvoiceBody(input)).toEqual({
      customer: {
        legal_name: "Cafetería Aurora",
        tax_id: "CAU200101AB1",
        tax_system: "601",
        email: "contabilidad@kardo.test",
        address: { zip: "06700" },
      },
      items: [
        {
          quantity: 1,
          product: {
            description: "Suscripción a Kardo, recibo KARDO-0101",
            product_key: "81112106",
            unit_key: "E48",
            price: 1199,
            tax_included: true,
            taxes: [{ type: "IVA", rate: 0.16 }],
          },
        },
      ],
      payment_form: "04",
      payment_method: "PUE",
      use: "G03",
      series: "KARDO",
    });
  });
});

describe("Facturapi client", () => {
  it("creates the invoice with the secret key and returns id and UUID", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        id: "65f0a1b2c3d4e5f6a7b8c9d0",
        uuid: "9F1C2A3B-4D5E-4F60-8A7B-1C2D3E4F5A6B",
        status: "valid",
        total: 1199,
        livemode: false,
      }),
    );
    const client = createFacturapiClient({
      secretKey: "sk_test_abcdefghijklmnop",
      fetchFn,
    });
    expect(client.livemode).toBe(false);
    const invoice = await client.createInvoice(input);
    expect(invoice).toEqual({
      id: "65f0a1b2c3d4e5f6a7b8c9d0",
      uuid: "9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b",
      status: "valid",
      total: 1199,
      livemode: false,
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://www.facturapi.io/v2/invoices");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk_test_abcdefghijklmnop",
    );
  });

  it("passes Facturapi's message on a rejection", async () => {
    const client = createFacturapiClient({
      secretKey: "sk_test_abcdefghijklmnop",
      fetchFn: async () =>
        Response.json({ message: "El RFC no es válido" }, { status: 400 }),
    });
    const failure = await client.createInvoice(input).catch((e) => e);
    expect(failure).toBeInstanceOf(FacturapiError);
    expect(failure.status).toBe(400);
    expect(failure.message).toBe("El RFC no es válido");
  });

  it("sends the external id and the idempotency key when given", () => {
    const body = facturapiInvoiceBody({
      ...input,
      externalId: "kardo-cfdi-1",
      idempotencyKey: "kardo-cfdi-1-0",
    });
    expect(body).toMatchObject({
      external_id: "kardo-cfdi-1",
      idempotency_key: "kardo-cfdi-1-0",
    });
    expect(facturapiInvoiceBody(input)).not.toHaveProperty("idempotency_key");
  });

  it("a 202 during a SAT outage comes back pending, without UUID", async () => {
    const client = createFacturapiClient({
      secretKey: "sk_test_abcdefghijklmnop",
      fetchFn: async () =>
        Response.json(
          { id: "65f0a1b2c3d4e5f6a7b8c9d0", status: "pending", total: 1199 },
          { status: 202 },
        ),
    });
    await expect(client.createInvoice(input)).resolves.toMatchObject({
      id: "65f0a1b2c3d4e5f6a7b8c9d0",
      uuid: null,
      status: "pending",
    });
    // A "valid" invoice without its folio fiscal is never accepted.
    const broken = createFacturapiClient({
      secretKey: "sk_test_abcdefghijklmnop",
      fetchFn: async () =>
        Response.json({ id: "65f0a1b2c3d4e5f6a7b8c9d0", status: "valid" }),
    });
    await expect(broken.createInvoice(input)).rejects.toThrow(/UUID/);
  });

  it("keeps Facturapi's error code (a used idempotency key is a 409)", async () => {
    const client = createFacturapiClient({
      secretKey: "sk_test_abcdefghijklmnop",
      fetchFn: async () =>
        Response.json(
          {
            message: "La clave de idempotencia ya está siendo usada.",
            code: "idempotency_key_in_use",
          },
          { status: 409 },
        ),
    });
    const failure = await client.createInvoice(input).catch((e) => e);
    expect(failure).toMatchObject({
      status: 409,
      code: "idempotency_key_in_use",
    });
  });

  it("finds the invoices of one external id", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: "65f0a1b2c3d4e5f6a7b8c9d0",
            uuid: "9F1C2A3B-4D5E-4F60-8A7B-1C2D3E4F5A6B",
            status: "valid",
            total: 1199,
            livemode: false,
          },
          { id: "bad id", status: "valid" },
        ],
      }),
    );
    const client = createFacturapiClient({
      secretKey: "sk_test_abcdefghijklmnop",
      fetchFn,
    });
    const found = await client.findByExternalId("kardo-cfdi-1&x=1");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://www.facturapi.io/v2/invoices?external_id=kardo-cfdi-1%26x%3D1&limit=50",
    );
    expect(found).toEqual([
      {
        id: "65f0a1b2c3d4e5f6a7b8c9d0",
        uuid: "9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b",
        status: "valid",
        total: 1199,
        livemode: false,
      },
    ]);
  });

  it("downloads only by a valid id, over HTTPS", async () => {
    const fetchFn = vi.fn(async () => new Response("<cfdi/>"));
    const client = createFacturapiClient({
      secretKey: "sk_live_abcdefghijklmnop",
      fetchFn,
    });
    expect(client.livemode).toBe(true);
    const xml = await client.download("65f0a1b2c3d4e5f6a7b8c9d0", "xml");
    expect(xml.contentType).toContain("application/xml");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://www.facturapi.io/v2/invoices/65f0a1b2c3d4e5f6a7b8c9d0/xml",
    );
    await expect(client.download("../secrets", "pdf")).rejects.toThrow(
      FacturapiError,
    );
    expect(() =>
      createFacturapiClient({
        secretKey: "sk_test_abcdefghijklmnop",
        baseUrl: "http://evil.example",
      }),
    ).toThrow(FacturapiError);
  });
});
