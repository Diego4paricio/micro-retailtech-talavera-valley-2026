import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { UnavailableError, WorkspaceAccessError } from "../src/errors.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

const defaultSettings = {
  notifyEmail: false,
  notifyRecipients: [],
  webhookUrl: null,
  webhookConfigured: false,
  emailAvailable: false,
};

describe("lead delivery routes", () => {
  it("rejects an editor reading lead-delivery settings (owner/admin only)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadDeliveryRepository: {
        getSettings: async () => {
          throw new WorkspaceAccessError();
        },
        updateSettings: async () => {
          throw new Error("not used");
        },
        testWebhook: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/lead-delivery`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns default settings when none exist yet", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadDeliveryRepository: {
        getSettings: async () => defaultSettings,
        updateSettings: async () => {
          throw new Error("not used");
        },
        testWebhook: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/lead-delivery`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(defaultSettings);
    await app.close();
  });

  it("returns the plaintext secret exactly once, right after rotation", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadDeliveryRepository: {
        getSettings: async () => defaultSettings,
        updateSettings: async () => ({
          settings: { ...defaultSettings, webhookConfigured: true },
          webhookSecret: `whsec_${"a".repeat(43)}`,
        }),
        testWebhook: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/lead-delivery`,
      headers: authHeader,
      payload: {
        notifyEmail: false,
        notifyRecipients: [],
        webhookUrl: null,
        rotateWebhookSecret: true,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().webhookSecret).toBe(`whsec_${"a".repeat(43)}`);
    await app.close();
  });

  it("returns 503 WEBHOOK_UNAVAILABLE when webhook signing is not configured", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadDeliveryRepository: {
        getSettings: async () => defaultSettings,
        updateSettings: async () => {
          throw new UnavailableError(
            "WEBHOOK_UNAVAILABLE",
            "Webhook signing is not configured.",
          );
        },
        testWebhook: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/lead-delivery`,
      headers: authHeader,
      payload: {
        notifyEmail: false,
        notifyRecipients: [],
        webhookUrl: "https://hooks.example.com/kardo",
        rotateWebhookSecret: true,
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("WEBHOOK_UNAVAILABLE");
    await app.close();
  });

  it("sends a signed test event and reports the delivery result", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadDeliveryRepository: {
        getSettings: async () => defaultSettings,
        updateSettings: async () => {
          throw new Error("not used");
        },
        testWebhook: async () => ({ delivered: true, status: 200 }),
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/lead-delivery/test`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ delivered: true, status: 200 });
    await app.close();
  });

  it("enforces the sensitive rate limit on the webhook test endpoint", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      rateLimit: { sensitive: { limit: 1, windowMs: 60_000 } },
      leadDeliveryRepository: {
        getSettings: async () => defaultSettings,
        updateSettings: async () => {
          throw new Error("not used");
        },
        testWebhook: async () => ({ delivered: true, status: 200 }),
      },
    });
    const url = `/v1/workspaces/${workspaceId}/lead-delivery/test`;
    const first = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
    });
    const second = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    await app.close();
  });
});
