import { describe, expect, it, vi } from "vitest";
import {
  type DeliveryEnv,
  type DeliveryOutcome,
  deliverLead,
  type LeadCreated,
  type LeadDeliveryTarget,
  validateWebhookUrl,
} from "../src/delivery.js";
import { encryptWebhookSecret } from "../src/webhook-crypto.js";

const webhookKey = Buffer.alloc(32, 3).toString("base64url");

function lead(deliveries: LeadDeliveryTarget[]): LeadCreated {
  return {
    id: "lead-1",
    createdAt: "2026-09-24T12:00:00.000Z",
    workspace: { id: "workspace-1", name: "Kardo Demo" },
    touchpoint: { id: "touchpoint-1", name: "Mostrador" },
    lead: { name: "Ana", email: "ana@example.test", phone: "+52 55 1234 5678" },
    deliveries,
  };
}

function collectOutcomes(): {
  outcomes: DeliveryOutcome[];
  record: (outcome: DeliveryOutcome) => Promise<void>;
} {
  const outcomes: DeliveryOutcome[] = [];
  return { outcomes, record: async (outcome) => void outcomes.push(outcome) };
}

describe("validateWebhookUrl: SSRF defense", () => {
  it("accepts a plain https url on the default port", () => {
    expect(validateWebhookUrl("https://example.test/webhook")).toEqual({
      ok: true,
    });
  });

  it.each([
    ["http (not https)", "http://example.test/webhook"],
    ["credentials embedded", "https://user:pass@example.test/webhook"],
    ["a non-standard port", "https://example.test:8443/webhook"],
    ["an IPv4 literal", "https://127.0.0.1/webhook"],
    ["an IPv6 literal", "https://[::1]/webhook"],
    ["localhost", "https://localhost/webhook"],
    ["a .local host", "https://printer.local/webhook"],
    ["a .internal host", "https://service.internal/webhook"],
    ["an unparsable url", "not a url"],
  ])("rejects %s", (_label, url) => {
    expect(validateWebhookUrl(url)).toEqual({
      ok: false,
      reason: "WEBHOOK_URL_INVALID",
    });
  });
});

describe("deliverLead: webhook channel", () => {
  it("signs and posts the documented payload shape and headers, then records 'sent'", async () => {
    const secretCiphertext = await encryptWebhookSecret(
      "whsec_test",
      webhookKey,
      "workspace-1",
    );
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 200 });
      },
    );
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "https://example.test/hook",
          secretCiphertext,
        },
      ]),
      { LEAD_WEBHOOK_KEY: webhookKey } satisfies DeliveryEnv,
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(outcomes).toEqual([
      { id: "delivery-1", status: "sent", attempts: 1 },
    ]);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("expected one call");
    expect(call.url).toBe("https://example.test/hook");
    const headers = new Headers(call.init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("user-agent")).toBe("Kardo-Webhooks/1");
    expect(headers.get("x-kardo-event")).toBe("lead.created");
    expect(headers.get("x-kardo-delivery")).toBe("delivery-1");
    expect(headers.get("x-kardo-signature")).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(call.init.redirect).toBe("manual");
    const body = JSON.parse(String(call.init.body));
    expect(body).toEqual({
      event: "lead.created",
      id: "lead-1",
      createdAt: "2026-09-24T12:00:00.000Z",
      workspace: { id: "workspace-1", name: "Kardo Demo" },
      touchpoint: { id: "touchpoint-1", name: "Mostrador" },
      lead: {
        name: "Ana",
        email: "ana@example.test",
        phone: "+52 55 1234 5678",
        message: null,
      },
    });
  });

  it("fails without attempting a network call when the SSRF check rejects the url", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "http://example.test/hook",
          secretCiphertext: "",
        },
      ]),
      { LEAD_WEBHOOK_KEY: webhookKey },
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      {
        id: "delivery-1",
        status: "failed",
        attempts: 0,
        lastError: "WEBHOOK_URL_INVALID",
      },
    ]);
  });

  it("fails with WEBHOOK_SECRET_UNAVAILABLE, without a network call, when LEAD_WEBHOOK_KEY is missing", async () => {
    const secretCiphertext = await encryptWebhookSecret(
      "whsec_test",
      webhookKey,
      "workspace-1",
    );
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "https://example.test/hook",
          secretCiphertext,
        },
      ]),
      {},
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      {
        id: "delivery-1",
        status: "failed",
        attempts: 0,
        lastError: "WEBHOOK_SECRET_UNAVAILABLE",
      },
    ]);
  });

  it("fails with WEBHOOK_SECRET_UNAVAILABLE when the stored secret cannot be decrypted (e.g. wrong AAD)", async () => {
    const secretCiphertext = await encryptWebhookSecret(
      "whsec_test",
      webhookKey,
      "some-other-workspace",
    );
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "https://example.test/hook",
          secretCiphertext,
        },
      ]),
      { LEAD_WEBHOOK_KEY: webhookKey },
      record,
      {
        fetchFn: (async () =>
          new Response(null, { status: 200 })) as unknown as typeof fetch,
      },
    );

    expect(outcomes).toEqual([
      {
        id: "delivery-1",
        status: "failed",
        attempts: 0,
        lastError: "WEBHOOK_SECRET_UNAVAILABLE",
      },
    ]);
  });

  it("does not retry a 3xx redirect response (redirect: manual means it was not followed)", async () => {
    const secretCiphertext = await encryptWebhookSecret(
      "whsec_test",
      webhookKey,
      "workspace-1",
    );
    const fetchFn = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.test" },
        }),
    );
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "https://example.test/hook",
          secretCiphertext,
        },
      ]),
      { LEAD_WEBHOOK_KEY: webhookKey },
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([
      {
        id: "delivery-1",
        status: "failed",
        attempts: 1,
        lastError: "REDIRECT_NOT_FOLLOWED",
      },
    ]);
  });

  it("retries a transient HTTP failure once before giving up", async () => {
    const secretCiphertext = await encryptWebhookSecret(
      "whsec_test",
      webhookKey,
      "workspace-1",
    );
    const fetchFn = vi.fn(async () => new Response(null, { status: 500 }));
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "https://example.test/hook",
          secretCiphertext,
        },
      ]),
      { LEAD_WEBHOOK_KEY: webhookKey },
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(outcomes).toEqual([
      {
        id: "delivery-1",
        status: "failed",
        attempts: 2,
        lastError: "HTTP_500",
      },
    ]);
  });

  it("marks a delivery failed after a timeout, without hanging the call", async () => {
    const secretCiphertext = await encryptWebhookSecret(
      "whsec_test",
      webhookKey,
      "workspace-1",
    );
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-1",
          channel: "webhook",
          url: "https://example.test/hook",
          secretCiphertext,
        },
      ]),
      { LEAD_WEBHOOK_KEY: webhookKey },
      record,
      { fetchFn: fetchFn as unknown as typeof fetch, timeoutMs: 15 },
    );

    expect(outcomes).toEqual([
      { id: "delivery-1", status: "failed", attempts: 2, lastError: "TIMEOUT" },
    ]);
  }, 10_000);
});

describe("deliverLead: email channel", () => {
  it("sends via Resend with escaped HTML and the expected subject", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 200 });
      },
    );
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-2",
          channel: "email",
          recipients: ["owner@example.test"],
        },
      ]),
      { RESEND_API_KEY: "resend-key", LEAD_EMAIL_FROM: "leads@kardo.test" },
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(outcomes).toEqual([
      { id: "delivery-2", status: "sent", attempts: 1 },
    ]);
    const call = calls[0];
    if (!call) throw new Error("expected one call");
    expect(call.url).toBe("https://api.resend.com/emails");
    const headers = new Headers(call.init.headers);
    expect(headers.get("authorization")).toBe("Bearer resend-key");
    const body = JSON.parse(String(call.init.body));
    expect(body.from).toBe("leads@kardo.test");
    expect(body.to).toEqual(["owner@example.test"]);
    expect(body.subject).toBe("Nuevo contacto en Mostrador");
    expect(body.text).toContain("ana@example.test");
  });

  it("escapes lead fields in the HTML body", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const { record } = collectOutcomes();
    const xssLead = lead([
      {
        id: "delivery-2",
        channel: "email",
        recipients: ["owner@example.test"],
      },
    ]);
    xssLead.lead.name = "<script>alert(1)</script>";

    await deliverLead(
      xssLead,
      { RESEND_API_KEY: "resend-key", LEAD_EMAIL_FROM: "leads@kardo.test" },
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.html).not.toContain("<script>");
    expect(body.html).toContain("&lt;script&gt;");
  });

  it("fails without a network call when Resend is not configured (no RESEND_API_KEY/LEAD_EMAIL_FROM)", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const { outcomes, record } = collectOutcomes();

    await deliverLead(
      lead([
        {
          id: "delivery-2",
          channel: "email",
          recipients: ["owner@example.test"],
        },
      ]),
      {},
      record,
      { fetchFn: fetchFn as unknown as typeof fetch },
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([
      {
        id: "delivery-2",
        status: "failed",
        attempts: 0,
        lastError: "EMAIL_NOT_CONFIGURED",
      },
    ]);
  });
});

describe("deliverLead: nothing configured", () => {
  it("delivers nothing (and calls record for nothing) when there are no pending channels", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const { outcomes, record } = collectOutcomes();
    await deliverLead(lead([]), {}, record, {
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcomes).toEqual([]);
  });
});
