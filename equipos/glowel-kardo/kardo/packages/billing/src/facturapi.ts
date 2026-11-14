// ---------------------------------------------------------------------------
// CFDI 4.0 with Facturapi (ADR 020 §6, phase 2 brought forward in test mode;
// relevo 20, T5). Operations issues the invoice of a pending CFDI request;
// Kardo keeps the Facturapi id to download the PDF and the XML. A `sk_test_`
// key creates real XML and PDF that are not stamped by the SAT and have no
// fiscal validity; `sk_live_` stamps them.
// ---------------------------------------------------------------------------

/** SAT keys of the subscription (Docs/fiscal guide §5.3; still "no
 * verificadas" there: confirm them before issuing in live mode). */
export const KARDO_CFDI_PRODUCT = {
  /** Software como servicio. */
  productKey: "81112106",
  /** Unidad de servicio. */
  unitKey: "E48",
} as const;

export type FacturapiInvoiceInput = {
  customer: {
    /** As in the Constancia de Situación Fiscal, without the corporate
     * regime (CFDI 4.0). */
    legalName: string;
    taxId: string;
    /** c_RegimenFiscal. */
    taxSystem: string;
    zip: string;
    email: string;
  };
  description: string;
  /** Pesos, IVA included (16 %). */
  total: number;
  /** c_FormaPago: 04 credit card, 28 debit card. */
  paymentForm: string;
  /** c_UsoCFDI. */
  use: string;
  series?: string;
  /** Kardo's id of this CFDI (Facturapi `external_id`): a retry finds what
   * was already issued instead of issuing it again. */
  externalId?: string;
  /** Facturapi refuses a second invoice with the same key (409
   * `idempotency_key_in_use`), so a retried request never stamps twice. */
  idempotencyKey?: string;
};

export type FacturapiInvoice = {
  id: string;
  /** Folio fiscal; null while the invoice is `pending` (a SAT outage made
   * Facturapi answer 202 and keep stamping in the background). */
  uuid: string | null;
  /** `valid`, `pending`, `failed` or `canceled`. */
  status: string;
  total: number;
  livemode: boolean;
};

export type FacturapiDocument = { body: ArrayBuffer; contentType: string };

export type FacturapiClient = {
  readonly livemode: boolean;
  createInvoice(input: FacturapiInvoiceInput): Promise<FacturapiInvoice>;
  download(id: string, format: "pdf" | "xml"): Promise<FacturapiDocument>;
};

/** What the Staff API needs to issue: the client plus the lookup by
 * `external_id` that makes a retry reuse an invoice already issued. */
export type FacturapiIssuer = FacturapiClient & {
  findByExternalId(externalId: string): Promise<FacturapiInvoice[]>;
};

export class FacturapiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Facturapi's error code, e.g. `idempotency_key_in_use`. */
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "FacturapiError";
  }
}

const SAT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVOICE_ID = /^[A-Za-z0-9_-]{6,64}$/;

/** The request body Facturapi expects (v2), built apart to test it. */
export function facturapiInvoiceBody(input: FacturapiInvoiceInput) {
  return {
    customer: {
      legal_name: input.customer.legalName,
      tax_id: input.customer.taxId,
      tax_system: input.customer.taxSystem,
      email: input.customer.email,
      address: { zip: input.customer.zip },
    },
    items: [
      {
        quantity: 1,
        product: {
          description: input.description,
          product_key: KARDO_CFDI_PRODUCT.productKey,
          unit_key: KARDO_CFDI_PRODUCT.unitKey,
          price: Math.round(input.total * 100) / 100,
          tax_included: true,
          taxes: [{ type: "IVA", rate: 0.16 }],
        },
      },
    ],
    payment_form: input.paymentForm,
    // Paid in full already (Stripe charged it): Pago en una sola exhibición.
    payment_method: "PUE",
    use: input.use,
    ...(input.series ? { series: input.series } : {}),
    ...(input.externalId ? { external_id: input.externalId } : {}),
    ...(input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
  };
}

/** An invoice as Facturapi returns it. A `valid` one must carry its UUID. */
function toInvoice(
  value: Record<string, unknown>,
  fallbackTotal: number,
): FacturapiInvoice {
  const id = typeof value.id === "string" ? value.id : "";
  const status = typeof value.status === "string" ? value.status : "valid";
  const uuid =
    typeof value.uuid === "string" && SAT_UUID.test(value.uuid)
      ? value.uuid.toLowerCase()
      : null;
  if (!INVOICE_ID.test(id) || (status === "valid" && !uuid)) {
    throw new FacturapiError(
      "Facturapi returned an invoice without id or UUID.",
      502,
    );
  }
  return {
    id,
    uuid,
    status,
    total: typeof value.total === "number" ? value.total : fallbackTotal,
    livemode: value.livemode === true,
  };
}

export function createFacturapiClient(options: {
  secretKey: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}): FacturapiIssuer {
  const base = (options.baseUrl ?? "https://www.facturapi.io/v2").replace(
    /\/+$/,
    "",
  );
  if (!base.startsWith("https://")) {
    throw new FacturapiError("Facturapi must be reached over HTTPS.", 0);
  }
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const headers = { authorization: `Bearer ${options.secretKey}` };

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetchFn(`${base}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new FacturapiError("Facturapi could not be reached.", 0);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
        code?: unknown;
      } | null;
      const message =
        typeof body?.message === "string"
          ? body.message.slice(0, 300)
          : `Facturapi answered ${response.status}.`;
      const code =
        typeof body?.code === "string" ? body.code.slice(0, 64) : null;
      throw new FacturapiError(message, response.status, code);
    }
    return response;
  }

  return {
    livemode: /^sk_live_/.test(options.secretKey),

    async createInvoice(input) {
      const response = await call("/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(facturapiInvoiceBody(input)),
      });
      // 200 when stamped; 202 with `status: "pending"` and no UUID when the
      // SAT had an outage and Facturapi keeps stamping in the background.
      const value = (await response.json()) as Record<string, unknown>;
      return toInvoice(value, input.total);
    },

    async findByExternalId(externalId) {
      const response = await call(
        `/invoices?external_id=${encodeURIComponent(externalId)}&limit=50`,
      );
      const value = (await response.json()) as { data?: unknown };
      const data = Array.isArray(value.data) ? value.data : [];
      return data.flatMap((item) => {
        try {
          return [toInvoice(item as Record<string, unknown>, 0)];
        } catch {
          return [];
        }
      });
    },

    async download(id, format) {
      if (!INVOICE_ID.test(id)) {
        throw new FacturapiError("Invalid Facturapi invoice id.", 400);
      }
      const response = await call(
        `/invoices/${encodeURIComponent(id)}/${format}`,
      );
      return {
        body: await response.arrayBuffer(),
        contentType:
          format === "pdf"
            ? "application/pdf"
            : "application/xml; charset=utf-8",
      };
    },
  };
}
