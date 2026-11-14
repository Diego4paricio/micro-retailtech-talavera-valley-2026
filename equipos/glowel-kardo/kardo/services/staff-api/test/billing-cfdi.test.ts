import { randomUUID } from "node:crypto";
import { FacturapiError } from "@kardo/billing";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import {
  StaffConflictError,
  StaffNotFoundError,
  StaffPermissionError,
  StaffValidationError,
} from "../src/http/errors.js";
import {
  createPostgresStaffBillingRepository,
  previousMexicoMonth,
} from "../src/repositories/billing.js";
import { staffIdentity } from "./fixtures.js";

const requestId = randomUUID();
const satUuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const headers = { authorization: "Bearer staff-token" };
const unused = () => Promise.reject(new Error("not used"));

function appWith(overrides: Record<string, unknown>) {
  return buildStaffApi({
    sessionVerifier: { verify: async () => staffIdentity },
    sessionRepository: {
      getActiveStaffSession: async () => ({
        ...staffIdentity,
        displayName: "Staff",
        permissions: ["billing.read", "billing.write"],
      }),
      readDiagnostics: unused,
    },
    billingRepository: {
      overview: unused,
      listSubscriptions: unused,
      listEvents: unused,
      workspaceBilling: unused,
      listCfdiRequests: unused,
      resolveCfdiRequest: unused,
      issueCfdiWithFacturapi: unused,
      cfdiDocument: unused,
      globalInvoice: unused,
      accountingMonth: unused,
      ...overrides,
    } as never,
  });
}

const cfdiFixture = {
  id: requestId,
  invoiceId: "in_1234567890",
  status: "issued",
  requestedAt: "2026-09-29T10:00:00.000Z",
  issuedAt: "2026-09-29T12:00:00.000Z",
  satUuid,
  notes: null,
  automatic: false,
  workspaceId: randomUUID(),
  workspaceName: "Acme",
  invoiceNumber: "A-0001",
  amountPaid: 29900,
  tax: 4124,
  currency: "mxn",
  paidAt: "2026-09-29T09:00:00.000Z",
  fiscal: {
    rfc: "XAXX010101AB1",
    legalName: "Acme SA",
    taxRegime: "601",
    postalCode: "01000",
    cfdiUse: "G03",
    email: "a@acme.mx",
  },
  stripeInvoiceUrl: "https://dashboard.stripe.com/test/invoices/in_1234567890",
  handledAt: "2026-09-29T12:00:00.000Z",
  document: null,
  facturapi: null,
};

describe("CFDI routes", () => {
  it("lists pending requests by default and accepts each status", async () => {
    const listCfdiRequests = vi.fn().mockResolvedValue([cfdiFixture]);
    const app = appWith({ listCfdiRequests });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/cfdi",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(listCfdiRequests).toHaveBeenLastCalledWith(
      staffIdentity.subject,
      "pending",
    );
    for (const status of ["pending", "issued", "rejected", "canceled"]) {
      const ok = await app.inject({
        method: "GET",
        url: `/v1/staff/billing/cfdi?status=${status}`,
        headers,
      });
      expect(ok.statusCode).toBe(200);
    }
    const bad = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/cfdi?status=bogus",
      headers,
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("answers 403 without billing.read", async () => {
    const app = appWith({
      listCfdiRequests: () => Promise.reject(new StaffPermissionError()),
      globalInvoice: () => Promise.reject(new StaffPermissionError()),
    });
    for (const url of [
      "/v1/staff/billing/cfdi",
      "/v1/staff/billing/global-invoice",
    ]) {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode).toBe(403);
    }
    await app.close();
  });

  it("resolves a request and validates the body and the id", async () => {
    const resolveCfdiRequest = vi.fn().mockResolvedValue(cfdiFixture);
    const app = appWith({ resolveCfdiRequest });
    const url = `/v1/staff/billing/cfdi/${requestId}/resolve`;
    const ok = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { status: "issued", satUuid },
    });
    expect(ok.statusCode).toBe(200);
    expect(resolveCfdiRequest).toHaveBeenCalledWith(
      staffIdentity.subject,
      requestId,
      { status: "issued", satUuid },
    );
    for (const [target, payload] of [
      [url, { status: "issued", satUuid: "not-a-uuid" }],
      [url, { status: "pending" }],
      [url, { status: "rejected", notes: "x".repeat(501) }],
      [url, {}],
      ["/v1/staff/billing/cfdi/nope/resolve", { status: "issued", satUuid }],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: target,
        headers,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it("maps refusals to their status", async () => {
    for (const [error, status] of [
      [new StaffPermissionError(), 403],
      [new StaffNotFoundError(), 404],
      [new StaffValidationError(), 400],
      [new StaffConflictError("no"), 409],
    ] as const) {
      const app = appWith({ resolveCfdiRequest: () => Promise.reject(error) });
      const response = await app.inject({
        method: "POST",
        url: `/v1/staff/billing/cfdi/${requestId}/resolve`,
        headers,
        payload: { status: "rejected", notes: "RFC incorrecto" },
      });
      expect(response.statusCode).toBe(status);
      await app.close();
    }
  });

  it("validates the global invoice month", async () => {
    const globalInvoice = vi.fn().mockResolvedValue({
      month: "2026-08",
      currency: "mxn",
      total: 0,
      tax: 0,
      items: [],
    });
    const app = appWith({ globalInvoice });
    const ok = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/global-invoice?month=2026-08",
      headers,
    });
    expect(ok.statusCode).toBe(200);
    expect(globalInvoice).toHaveBeenLastCalledWith(
      staffIdentity.subject,
      "2026-08",
    );
    await app.inject({
      method: "GET",
      url: "/v1/staff/billing/global-invoice",
      headers,
    });
    expect(globalInvoice).toHaveBeenLastCalledWith(
      staffIdentity.subject,
      undefined,
    );
    for (const month of ["2026-13", "2026-8", "agosto", "2026-00"]) {
      const bad = await app.inject({
        method: "GET",
        url: `/v1/staff/billing/global-invoice?month=${month}`,
        headers,
      });
      expect(bad.statusCode).toBe(400);
    }
    await app.close();
  });

  it("serves the accounting month for a valid month, uncached", async () => {
    const { buildAccountingMonth } = await import(
      "../src/repositories/accounting.js"
    );
    const report = buildAccountingMonth({
      month: "2026-09",
      livemode: false,
      currency: "mxn",
      now: new Date("2026-10-02T12:00:00Z"),
      payments: [
        {
          invoiceId: "in_1234567890",
          number: "A-0001",
          workspaceName: "=Acme",
          customerId: "cus_1234567890",
          paidAt: new Date("2026-09-29T09:00:00Z"),
          amountPaid: 29900,
          total: 29900,
          tax: 4124,
          refunded: 0,
          internal: false,
          requests: [],
        },
      ],
      refunds: [],
      canceledEarlier: [],
      stripe: null,
      truncated: false,
    });
    const accountingMonth = vi.fn().mockResolvedValue(report);
    const app = appWith({ accountingMonth });
    const ok = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/accounting?month=2026-09",
      headers,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.json()).toMatchObject({
      month: "2026-09",
      totals: { global: { count: 1, total: 29900 } },
      stripe: null,
    });
    expect(accountingMonth).toHaveBeenLastCalledWith(
      staffIdentity.subject,
      "2026-09",
    );
    const bad = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/accounting?month=2026-13",
      headers,
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});

// --- Repository over a fake sql -------------------------------------------------

type Handler = (
  text: string,
  values: unknown[],
  granted: boolean,
) => unknown[] | undefined;

function fakeSql(
  handler: Handler = () => undefined,
  options: { granted?: boolean } = {},
) {
  const queries: { text: string; values: unknown[] }[] = [];
  const granted = options.granted ?? true;
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    queries.push({ text, values });
    if (text.includes("select exists(")) {
      return Promise.resolve([{ granted }]);
    }
    return Promise.resolve(handler(text, values, granted) ?? []);
  };
  tag.unsafe = () => Promise.resolve([]);
  tag.json = (value: unknown) => value;
  tag.begin = (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag);
  return { sql: tag as never, queries };
}

function repository(sql: never, now?: () => Date) {
  return createPostgresStaffBillingRepository({
    sql,
    gateway: null,
    sync: null,
    ...(now ? { now } : {}),
  });
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: requestId,
  stripe_invoice_id: "in_1234567890",
  status: "pending",
  requested_at: new Date("2026-09-29T10:00:00.000Z"),
  issued_at: null,
  sat_uuid: null,
  notes: null,
  requested_by: null,
  handled_at: null,
  fiscal_snapshot: {
    rfc: "XAXX010101AB1",
    legalName: "Acme SA",
    taxRegime: "601",
    postalCode: "01000",
    cfdiUse: "G03",
    email: "a@acme.mx",
  },
  workspace_id: randomUUID(),
  workspace_name: "Acme",
  number: "A-0001",
  amount_paid: "29900",
  tax: "4124",
  currency: "mxn",
  paid_at: new Date("2026-09-29T09:00:00.000Z"),
  livemode: false,
  ...overrides,
});

describe("CFDI repository", () => {
  it("lists pending oldest first and maps the row", async () => {
    const { sql, queries } = fakeSql((text) =>
      text.includes("where r.status") ? [row()] : undefined,
    );
    const list = await repository(sql).listCfdiRequests(
      staffIdentity.subject,
      "pending",
    );
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: requestId,
      automatic: true,
      amountPaid: 29900,
      tax: 4124,
      fiscal: { rfc: "XAXX010101AB1", cfdiUse: "G03" },
      stripeInvoiceUrl:
        "https://dashboard.stripe.com/test/invoices/in_1234567890",
    });
    const text = queries.map((query) => query.text).join("\n");
    expect(text).toContain("r.requested_at asc");
    expect(text).not.toContain("handled_at desc");
    expect(text).toContain("limit 200");
  });

  it("orders the handled lists by attention date descending", async () => {
    const { sql, queries } = fakeSql();
    await repository(sql).listCfdiRequests(staffIdentity.subject, "issued");
    const text = queries.map((query) => query.text).join("\n");
    expect(text).toContain("r.handled_at desc");
    expect(text).not.toContain("r.requested_at asc");
  });

  it("links live payments to the live dashboard", async () => {
    const { sql } = fakeSql((text) =>
      text.includes("where r.status") ? [row({ livemode: true })] : undefined,
    );
    const [item] = await repository(sql).listCfdiRequests(
      staffIdentity.subject,
      "pending",
    );
    expect(item?.stripeInvoiceUrl).toBe(
      "https://dashboard.stripe.com/invoices/in_1234567890",
    );
  });

  it("refuses the list and the resolution without the permission", async () => {
    const { sql, queries } = fakeSql(() => undefined, { granted: false });
    const repo = repository(sql);
    await expect(
      repo.listCfdiRequests(staffIdentity.subject, "pending"),
    ).rejects.toBeInstanceOf(StaffPermissionError);
    await expect(
      repo.resolveCfdiRequest(staffIdentity.subject, requestId, {
        status: "issued",
        satUuid,
      }),
    ).rejects.toBeInstanceOf(StaffPermissionError);
    await expect(
      repo.globalInvoice(staffIdentity.subject, "2026-08"),
    ).rejects.toBeInstanceOf(StaffPermissionError);
    expect(
      queries.some((query) => query.text.includes("resolve_cfdi_request")),
    ).toBe(false);
  });

  it("calls the function and returns the updated request", async () => {
    const { sql, queries } = fakeSql((text) =>
      text.includes("where r.id")
        ? [row({ status: "issued", sat_uuid: satUuid })]
        : undefined,
    );
    const result = await repository(sql).resolveCfdiRequest(
      staffIdentity.subject,
      requestId,
      { status: "issued", satUuid },
    );
    expect(result.status).toBe("issued");
    expect(result.satUuid).toBe(satUuid);
    const call = queries.find((query) =>
      query.text.includes("resolve_cfdi_request"),
    );
    expect(call?.values).toEqual([requestId, "issued", satUuid, null]);
  });

  it("maps the database refusals", async () => {
    for (const [message, expected] of [
      ["FORBIDDEN", StaffPermissionError],
      ["NOT_FOUND", StaffNotFoundError],
      ["INVALID_STATUS", StaffValidationError],
      ["INVALID_SAT_UUID", StaffValidationError],
      ["INVALID_REASON", StaffValidationError],
      ["INVALID_TRANSITION", StaffConflictError],
    ] as const) {
      const { sql } = fakeSql((text) => {
        if (text.includes("resolve_cfdi_request")) {
          throw Object.assign(new Error(message), { code: "P0001" });
        }
        return undefined;
      });
      await expect(
        repository(sql).resolveCfdiRequest(staffIdentity.subject, requestId, {
          status: "rejected",
          notes: "RFC incorrecto",
        }),
      ).rejects.toBeInstanceOf(expected);
    }
  });

  it("does not hide unexpected database errors", async () => {
    const { sql } = fakeSql((text) => {
      if (text.includes("resolve_cfdi_request")) {
        throw Object.assign(new Error("boom"), { code: "XX000" });
      }
      return undefined;
    });
    await expect(
      repository(sql).resolveCfdiRequest(staffIdentity.subject, requestId, {
        status: "rejected",
        notes: "RFC incorrecto",
      }),
    ).rejects.toThrow("boom");
  });
});

describe("global invoice repository", () => {
  it("defaults to the previous month in Mexico City", () => {
    // 2026-10-01 03:00Z is still 30 September in Mexico (UTC-6).
    expect(previousMexicoMonth(new Date("2026-10-01T03:00:00Z"))).toBe(
      "2026-08",
    );
    expect(previousMexicoMonth(new Date("2026-10-01T07:00:00Z"))).toBe(
      "2026-09",
    );
    expect(previousMexicoMonth(new Date("2027-01-15T12:00:00Z"))).toBe(
      "2026-12",
    );
  });

  it("queries the calendar month bounds and excludes live CFDI and internal", async () => {
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("coalesce(sum(i.amount_paid)")) {
        return [{ total: "59800", tax: "8248", currency: "mxn" }];
      }
      if (text.includes("limit 2000")) {
        return [
          {
            stripe_invoice_id: "in_1234567890",
            number: "A-0001",
            workspace_name: "Acme",
            paid_at: new Date("2026-08-10T15:00:00.000Z"),
            amount_paid: "29900",
            tax: "4124",
          },
          {
            stripe_invoice_id: "in_0987654321",
            number: null,
            workspace_name: "Beta",
            paid_at: new Date("2026-08-11T15:00:00.000Z"),
            amount_paid: "29900",
            tax: null,
          },
        ];
      }
      return undefined;
    });
    const result = await repository(
      sql,
      () => new Date("2026-09-30T18:00:00Z"),
    ).globalInvoice(staffIdentity.subject);
    expect(result.month).toBe("2026-08");
    expect(result.total).toBe(59800);
    expect(result.tax).toBe(8248);
    expect(result.items).toHaveLength(2);
    expect(result.items[1]).toMatchObject({ tax: null, number: null });
    const text = queries.map((query) => query.text).join("\n");
    expect(text).toContain("i.status = 'paid'");
    expect(text).toContain("i.amount_paid > 0");
    expect(text).toContain("America/Mexico_City");
    expect(text).toContain("status in ('pending', 'issued')");
    expect(text).toContain("kardo_billing.internal_workspaces");
    const values = queries.flatMap((query) => query.values);
    expect(values).toContain("2026-08-01");
    expect(values).toContain("2026-09-01");
  });

  it("rolls December over to January and defaults the currency to mxn", async () => {
    const { sql, queries } = fakeSql(() => undefined);
    const result = await repository(sql).globalInvoice(
      staffIdentity.subject,
      "2026-12",
    );
    expect(result).toEqual({
      month: "2026-12",
      currency: "mxn",
      total: 0,
      tax: 0,
      items: [],
    });
    const values = queries.flatMap((query) => query.values);
    expect(values).toContain("2026-12-01");
    expect(values).toContain("2027-01-01");
  });

  it("rejects a malformed month", async () => {
    const { sql } = fakeSql(() => undefined);
    await expect(
      repository(sql).globalInvoice(staffIdentity.subject, "2026-13"),
    ).rejects.toBeInstanceOf(StaffValidationError);
  });
});

describe("CFDI with Facturapi (ADR 020 §6, phase 2)", () => {
  const issued = {
    id: "fapi_inv_0001",
    uuid: "9F1C2A3B-4D5E-4F60-8A7B-1C2D3E4F5A6B",
    status: "valid",
    total: 299,
    livemode: false,
  };
  const facturapiFake = () => ({
    livemode: false,
    findByExternalId: vi.fn().mockResolvedValue([]),
    createInvoice: vi.fn().mockResolvedValue(issued),
    download: vi.fn().mockResolvedValue({
      body: new TextEncoder().encode("%PDF").buffer,
      contentType: "application/pdf",
    }),
  });

  it("issues a pending request with the fiscal data of the request", async () => {
    const facturapi = facturapiFake();
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("from kardo_billing.cfdi_requests\n          where id"))
        return [{ status: "pending" }];
      if (text.includes("where r.id"))
        return [
          row({
            status: queries.some((q) =>
              q.text.includes("issue_cfdi_with_provider"),
            )
              ? "issued"
              : "pending",
            provider: "facturapi",
            provider_livemode: false,
          }),
        ];
      return undefined;
    });
    const result = await createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
      facturapi,
    }).issueCfdiWithFacturapi(staffIdentity.subject, requestId, {
      paymentForm: "28",
    });
    expect(facturapi.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: {
          legalName: "Acme SA",
          taxId: "XAXX010101AB1",
          taxSystem: "601",
          zip: "01000",
          email: "a@acme.mx",
        },
        total: 299,
        paymentForm: "28",
        use: "G03",
        externalId: `kardo-cfdi-${requestId}`,
        idempotencyKey: `kardo-cfdi-${requestId}-0`,
      }),
    );
    expect(facturapi.findByExternalId).toHaveBeenCalledWith(
      `kardo-cfdi-${requestId}`,
    );
    const call = queries.find((q) =>
      q.text.includes("issue_cfdi_with_provider"),
    );
    expect(call?.values).toEqual(
      expect.arrayContaining([requestId, issued.uuid, issued.id, false]),
    );
    expect(result.document).toEqual({ provider: "facturapi", test: true });
    expect(result.facturapi).toBe("test");
  });

  it("never issues twice: only a pending request", async () => {
    const facturapi = facturapiFake();
    const { sql } = fakeSql((text) =>
      text.includes("from kardo_billing.cfdi_requests\n          where id")
        ? [{ status: "issued" }]
        : undefined,
    );
    await expect(
      createPostgresStaffBillingRepository({
        sql,
        gateway: null,
        sync: null,
        facturapi,
      }).issueCfdiWithFacturapi(staffIdentity.subject, requestId, {
        paymentForm: "04",
      }),
    ).rejects.toBeInstanceOf(StaffConflictError);
    expect(facturapi.createInvoice).not.toHaveBeenCalled();
  });

  // A pending request whose fake SQL records the issue call.
  const pendingSql = () =>
    fakeSql((text) => {
      if (text.includes("from kardo_billing.cfdi_requests\n          where id"))
        return [{ status: "pending" }];
      if (text.includes("where r.id"))
        return [row({ status: "pending", provider: "facturapi" })];
      return undefined;
    });
  const issueWith = (
    facturapi: ReturnType<typeof facturapiFake>,
    sql: ReturnType<typeof fakeSql>["sql"],
  ) =>
    createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
      facturapi,
    }).issueCfdiWithFacturapi(staffIdentity.subject, requestId, {
      paymentForm: "04",
    });

  it("a retry reuses the CFDI Facturapi already issued for the request", async () => {
    const facturapi = facturapiFake();
    facturapi.findByExternalId.mockResolvedValue([
      { ...issued, uuid: issued.uuid.toLowerCase(), id: "fapi_inv_prev1" },
    ]);
    const { sql, queries } = pendingSql();
    await issueWith(facturapi, sql);
    expect(facturapi.createInvoice).not.toHaveBeenCalled();
    const call = queries.find((q) =>
      q.text.includes("issue_cfdi_with_provider"),
    );
    expect(call?.values).toEqual(
      expect.arrayContaining([requestId, "fapi_inv_prev1"]),
    );
  });

  it("while Facturapi is still stamping (202) it neither issues again nor marks it", async () => {
    const facturapi = facturapiFake();
    facturapi.createInvoice.mockResolvedValue({
      ...issued,
      uuid: null,
      status: "pending",
    });
    const first = pendingSql();
    await expect(issueWith(facturapi, first.sql)).rejects.toThrow(
      /still stamping/,
    );
    expect(
      first.queries.some((q) => q.text.includes("issue_cfdi_with_provider")),
    ).toBe(false);
    // The next attempt finds that same invoice and does not create another.
    facturapi.findByExternalId.mockResolvedValue([
      { ...issued, uuid: null, status: "pending" },
    ]);
    await expect(issueWith(facturapi, pendingSql().sql)).rejects.toThrow(
      /still stamping/,
    );
    expect(facturapi.createInvoice).toHaveBeenCalledTimes(1);
  });

  it("a failed invoice spends its key: the next attempt uses a new one", async () => {
    const facturapi = facturapiFake();
    facturapi.findByExternalId.mockResolvedValue([
      { ...issued, uuid: null, status: "failed", id: "fapi_inv_fail1" },
    ]);
    await issueWith(facturapi, pendingSql().sql);
    expect(facturapi.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `kardo-cfdi-${requestId}-1` }),
    );
  });

  it("when a racing attempt took the key (409), it records that invoice", async () => {
    const facturapi = facturapiFake();
    facturapi.createInvoice.mockRejectedValue(
      new FacturapiError(
        "La clave de idempotencia ya está siendo usada.",
        409,
        "idempotency_key_in_use",
      ),
    );
    facturapi.findByExternalId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...issued, uuid: issued.uuid.toLowerCase() }]);
    const { sql, queries } = pendingSql();
    await issueWith(facturapi, sql);
    expect(
      queries.some((q) => q.text.includes("issue_cfdi_with_provider")),
    ).toBe(true);
  });

  it("is unavailable without FACTURAPI_KEY", async () => {
    const { sql } = fakeSql();
    await expect(
      repository(sql).issueCfdiWithFacturapi(staffIdentity.subject, requestId, {
        paymentForm: "04",
      }),
    ).rejects.toThrow(/not configured/);
  });

  it("the route defaults to credit card (04)", async () => {
    const issueCfdiWithFacturapi = vi
      .fn()
      .mockResolvedValue({ ...cfdiFixture, facturapi: "test" });
    const app = appWith({ issueCfdiWithFacturapi });
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/billing/cfdi/${requestId}/facturapi`,
      headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(issueCfdiWithFacturapi).toHaveBeenCalledWith(
      staffIdentity.subject,
      requestId,
      { paymentForm: "04" },
    );
    const bad = await app.inject({
      method: "POST",
      url: `/v1/staff/billing/cfdi/${requestId}/facturapi`,
      headers,
      payload: { paymentForm: "01" },
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});
