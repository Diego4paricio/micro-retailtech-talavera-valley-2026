import type { WorkspaceAccess, WorkspaceBilling } from "@kardo/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  type BillingService,
  unavailableBillingService,
  WebhookSignatureError,
} from "../src/billing/service.js";
import {
  ConflictError,
  NotFoundError,
  PlanLimitError,
  PlanRequiredError,
} from "../src/errors.js";
import type { WorkspaceExport } from "../src/workspace-export.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

const billingState: WorkspaceBilling = {
  checkoutAvailable: true,
  canManage: true,
  plan: { code: "negocio", name: "Negocio", source: "subscription" },
  entitlements: { "touchpoints.max": 10, "custom_html.enabled": false },
  usage: { "touchpoints.max": 7 },
  subscription: null,
  trialAvailable: true,
  trial: null,
  invoices: [],
  account: {
    holderName: "Mariana Ríos",
    isHolder: true,
    organizationsUsed: 2,
    organizationsLimit: 3,
    organizations: [],
    extras: [],
  },
};

const accessState: WorkspaceAccess = {
  state: "limited",
  source: "trial",
  planCode: "negocio",
  planName: "Negocio",
  endsAt: null,
  daysLeft: null,
  lapsedAt: "2026-10-14T18:00:00.000Z",
  graceEndsAt: "2026-10-21T18:00:00.000Z",
  deleteAt: "2027-01-12T18:00:00.000Z",
  deletionSoon: false,
  canManage: true,
  offer: {
    percentOff: 20,
    months: 3,
    interval: "month",
    validUntil: "2026-10-21T18:00:00.000Z",
  },
};

const exportDocument: WorkspaceExport = {
  format: "kardo.workspace-export",
  version: 1,
  exportedAt: "2026-10-15T18:00:00.000Z",
  workspace: {
    id: workspaceId,
    name: "Florería Lila",
    kind: "organization",
    createdAt: "2026-09-30T18:00:00.000Z",
    profile: null,
  },
  members: [],
  groups: [],
  touchpoints: [],
  experiences: [],
  leads: [],
  leadsTruncated: false,
};

const hostedCheckout = {
  mode: "hosted" as const,
  sessionId: "cs_test_a1B2c3D4e5F6g7",
  url: "https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4e5F6g7",
  clientSecret: null,
};

const changePreview = {
  status: "preview" as const,
  amountDueToday: 6600,
  nextAmount: 47800,
  currency: "mxn",
  nextChargeAt: "2026-11-03T18:00:00.000Z",
};

function fakeBilling(overrides: Partial<BillingService> = {}): BillingService {
  return {
    listPlans: vi
      .fn()
      .mockResolvedValue({ checkoutAvailable: true, plans: [] }),
    getWorkspaceBilling: vi.fn().mockResolvedValue(billingState),
    createCheckout: vi.fn().mockResolvedValue(hostedCheckout),
    getCheckoutStatus: vi.fn().mockResolvedValue({
      status: "complete",
      paymentStatus: "paid",
      subscriptionActive: true,
    }),
    createPortal: vi
      .fn()
      .mockResolvedValue("https://billing.stripe.com/p/session/test_1"),
    handleWebhook: vi.fn().mockResolvedValue("processed"),
    changeExtras: vi.fn().mockResolvedValue(changePreview),
    getMyAccount: vi.fn().mockResolvedValue({
      plan: { code: "profesional", name: "Profesional", source: "trial" },
      organizationsUsed: 2,
      organizationsLimit: 3,
      canAddExtras: false,
      homeWorkspaceId: workspaceId,
      extras: [],
    }),
    changePlan: vi.fn().mockResolvedValue(changePreview),
    getWorkspaceAccess: vi.fn().mockResolvedValue(accessState),
    runScheduledTasks: vi.fn(),
    ...overrides,
  };
}

describe("extras and plan changes (ADR 024)", () => {
  it("previews adding an organization and passes the quantities through", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/billing/extras`,
      headers: authHeader,
      payload: { quantities: { organization: 1 }, confirm: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(changePreview);
    expect(billing.changeExtras).toHaveBeenCalledWith(
      expect.objectContaining({ email: "customer@kardo.test" }),
      workspaceId,
      { quantities: { organization: 1 }, confirm: false },
    );
    await app.close();
  });

  it("rejects more extras than allowed and drops unknown ones", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const tooMany = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/billing/extras`,
      headers: authHeader,
      payload: { quantities: { organization: 999 }, confirm: true },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(billing.changeExtras).not.toHaveBeenCalled();
    const unknown = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/billing/extras`,
      headers: authHeader,
      payload: { quantities: { seats: 1 }, confirm: true },
    });
    expect(unknown.statusCode).toBe(200);
    expect(billing.changeExtras).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      { quantities: {}, confirm: true },
    );
    await app.close();
  });

  it("answers the caller's own account", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/billing/account",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      organizationsUsed: 2,
      organizationsLimit: 3,
    });
    await app.close();
  });

  it("changes the plan through Kardo with the amount first", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/plan-change`,
      headers: authHeader,
      payload: { priceId: "price_ProfesionalAnual1", confirm: false },
    });
    expect(response.statusCode).toBe(200);
    expect(billing.changePlan).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      "price_ProfesionalAnual1",
      false,
    );
    await app.close();
  });
});

describe("billing routes", () => {
  it("returns the workspace billing state", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(billingState);
    await app.close();
  });

  it("returns an active Kardo trial with its plan as the source", async () => {
    const trialState: WorkspaceBilling = {
      ...billingState,
      plan: { code: "profesional", name: "Profesional", source: "trial" },
      trial: {
        planCode: "profesional",
        planName: "Profesional",
        interval: "month",
        startedAt: "2026-09-29T18:00:00.000Z",
        endsAt: "2026-10-14T18:00:00.000Z",
        daysLeft: 15,
        status: "active",
      },
    };
    const billing = fakeBilling({
      getWorkspaceBilling: vi.fn().mockResolvedValue(trialState),
    });
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().trial).toEqual(trialState.trial);
    expect(response.json().plan.source).toBe("trial");
    await app.close();
  });

  it("requires a session", async () => {
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: async () => {
          const { CustomerSessionError } = await import(
            "../src/customer-session.js"
          );
          throw new CustomerSessionError();
        },
      },
      billing: fakeBilling(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/billing/plans",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("starts a Checkout for a valid price id only", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const ok = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/checkout`,
      headers: authHeader,
      payload: { priceId: "price_NegocioMes01" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(hostedCheckout);
    expect(billing.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.any(String) }),
      workspaceId,
      "price_NegocioMes01",
      "hosted",
    );

    const bad = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/checkout`,
      headers: authHeader,
      payload: { priceId: "https://evil.example" },
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("starts an embedded Checkout and returns its client secret", async () => {
    const embedded = {
      mode: "embedded" as const,
      sessionId: "cs_test_e1M2b3E4d5D6e7",
      url: null,
      clientSecret: "cs_test_e1M2b3E4d5D6e7_secret_x9Y8z7",
    };
    const billing = fakeBilling({
      createCheckout: vi.fn().mockResolvedValue(embedded),
    });
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const ok = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/checkout`,
      headers: authHeader,
      payload: { priceId: "price_NegocioMes01", mode: "embedded" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(embedded);
    expect(billing.createCheckout).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      "price_NegocioMes01",
      "embedded",
    );

    const bad = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/checkout`,
      headers: authHeader,
      payload: { priceId: "price_NegocioMes01", mode: "popup" },
    });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it("reads the state of a Checkout for the return page", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const ok = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/checkout/cs_test_a1B2c3D4e5F6g7`,
      headers: authHeader,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({
      status: "complete",
      paymentStatus: "paid",
      subscriptionActive: true,
    });
    expect(billing.getCheckoutStatus).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      "cs_test_a1B2c3D4e5F6g7",
    );

    const malformed = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/checkout/sub_123`,
      headers: authHeader,
    });
    expect(malformed.statusCode).toBe(400);
    await app.close();
  });

  it("answers 404 for a Checkout of another workspace", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({
        getCheckoutStatus: vi
          .fn()
          .mockRejectedValue(new NotFoundError("Checkout session not found.")),
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing/checkout/cs_test_a1B2c3D4e5F6g7`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("answers 409 when the workspace already has a subscription", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({
        createCheckout: vi
          .fn()
          .mockRejectedValue(
            new ConflictError("BILLING_CONFLICT", "Already subscribed."),
          ),
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/checkout`,
      headers: authHeader,
      payload: { priceId: "price_NegocioMes01" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("BILLING_CONFLICT");
    await app.close();
  });

  it("opens the portal with the default flow", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/portal`,
      headers: authHeader,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(billing.createPortal).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      "default",
      null,
    );
    await app.close();
  });

  it("answers 503 when billing is not configured", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: unavailableBillingService(),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/portal`,
      headers: authHeader,
      payload: { flow: "payment_method_update" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("BILLING_UNAVAILABLE");
    await app.close();
  });
});

describe("Stripe webhook", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

  it("hands the exact raw bytes and signature to the service", async () => {
    const handleWebhook = vi.fn().mockResolvedValue("processed");
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({ handleWebhook }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=abc",
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, result: "processed" });
    const [payload, signature] = handleWebhook.mock.calls[0] ?? [];
    expect(Buffer.isBuffer(payload)).toBe(true);
    expect((payload as Buffer).toString("utf8")).toBe(body);
    expect(signature).toBe("t=1,v1=abc");
    await app.close();
  });

  it("rejects a bad signature with 400", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({
        handleWebhook: vi.fn().mockRejectedValue(new WebhookSignatureError()),
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe/webhook",
      headers: { "content-type": "application/json" },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("answers 500 when processing fails, so Stripe retries", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({
        handleWebhook: vi.fn().mockRejectedValue(new Error("db down")),
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=abc",
      },
      payload: body,
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("db down");
    await app.close();
  });

  it("keeps JSON parsing for every other route", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/checkout`,
      headers: { ...authHeader, "content-type": "application/json" },
      payload: JSON.stringify({ priceId: "price_NegocioMes01" }),
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe("PlanLimitError", () => {
  it("renders 403 PLAN_LIMIT with the limit details", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({
        getWorkspaceBilling: vi.fn().mockRejectedValue(
          new PlanLimitError({
            key: "touchpoints.max",
            limit: 10,
            usage: 10,
            planCode: "negocio",
          }),
        ),
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "PLAN_LIMIT",
      key: "touchpoints.max",
      limit: 10,
      usage: 10,
      planCode: "negocio",
    });
    await app.close();
  });
});

describe("access state (ADR 020 §4)", () => {
  it("returns the banner state for any member", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/access`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(accessState);
    await app.close();
  });

  it("requires a session", async () => {
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: async () => {
          const { CustomerSessionError } = await import(
            "../src/customer-session.js"
          );
          throw new CustomerSessionError();
        },
      },
      billing: fakeBilling(),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/access`,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("downloads the organization as a JSON attachment", async () => {
    // Domain audit A2-64: the export is the organization's, not billing's.
    const workspaceExporter = {
      exportWorkspace: vi.fn().mockResolvedValue(exportDocument),
    };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceExporter,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/export`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="kardo-organizacion-2026-10-15.json"',
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual(exportDocument);
    await app.close();
  });

  it("renders 403 PLAN_REQUIRED with the access state", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      billing: fakeBilling({
        getWorkspaceBilling: vi
          .fn()
          .mockRejectedValue(new PlanRequiredError("paused")),
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/billing`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "PLAN_REQUIRED",
      accessState: "paused",
    });
    await app.close();
  });

  it("passes the target price to the portal confirmation flow", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/portal`,
      headers: authHeader,
      payload: {
        flow: "subscription_update_confirm",
        priceId: "price_TESTnegocio01",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(billing.createPortal).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      "subscription_update_confirm",
      "price_TESTnegocio01",
    );
    await app.close();
  });

  it("rejects a malformed target price", async () => {
    const billing = fakeBilling();
    const app = buildCustomerApi({ sessionVerifier: verifierFor(), billing });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/billing/portal`,
      headers: authHeader,
      payload: { flow: "subscription_update_confirm", priceId: "nope" },
    });
    expect(response.statusCode).toBe(400);
    expect(billing.createPortal).not.toHaveBeenCalled();
    await app.close();
  });
});
