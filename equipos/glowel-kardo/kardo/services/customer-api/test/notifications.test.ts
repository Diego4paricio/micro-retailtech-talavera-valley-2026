import type { Notification } from "@kardo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { CustomerSessionError } from "../src/customer-session.js";
import { InvalidCursorError, NotFoundError } from "../src/errors.js";
import { readinessStatus, statusKeyMatches } from "../src/health-ready.js";
import { createErrorWindow } from "../src/http/error-window.js";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  type NotificationRepository,
  toNotification,
} from "../src/repositories/notifications.js";
import { authHeader, subjectId, verifierFor } from "./helpers.js";

const notificationId = "7b9e2c1a-4d3f-4a5b-8c6d-1e2f3a4b5c6d";

const sample: Notification = {
  id: notificationId,
  category: "maintenance",
  title: "Mantenimiento el domingo",
  body: "El domingo 6 de octubre de 2 a 3 a. m. el panel puede tardar.",
  action: null,
  pinned: false,
  publishedAt: "2026-10-03T18:00:00.000Z",
  editedAt: null,
  expiresAt: null,
  readAt: null,
  workspace: null,
};

function memoryRepository(): NotificationRepository & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    listInbox: async (identity, query) => {
      calls.push(
        `list:${identity.subject}:${query.limit}:${query.cursor ?? ""}:${query.unread ?? false}`,
      );
      return {
        items: [sample],
        unreadCount: 1,
        autoOpen: true,
        nextCursor: null,
      };
    },
    markRead: async (identity, id) => {
      if (id !== notificationId) throw new NotFoundError();
      calls.push(`read:${identity.subject}:${id}`);
    },
    markAllRead: async (identity) => {
      calls.push(`read-all:${identity.subject}`);
    },
    markOpened: async (identity) => {
      calls.push(`opened:${identity.subject}`);
    },
  };
}

describe("notification routes", () => {
  it("lists the inbox of the signed-in person with defaults", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      notificationRepository: repository,
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/notifications",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [sample],
      unreadCount: 1,
      autoOpen: true,
      nextCursor: null,
    });
    expect(repository.calls).toEqual([`list:${subjectId}:20::false`]);
  });

  it("passes limit, cursor and unread through", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      notificationRepository: repository,
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/notifications?limit=5&cursor=abc&unread=true",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(repository.calls).toEqual([`list:${subjectId}:5:abc:true`]);
  });

  it("requires a session", async () => {
    const app = buildCustomerApi({
      sessionVerifier: {
        verify: async () => {
          throw new CustomerSessionError("missing");
        },
      },
      notificationRepository: memoryRepository(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/notifications",
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a limit above 100", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      notificationRepository: memoryRepository(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/notifications?limit=500",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(400);
  });

  it("marks one as read, and answers 404 for one the person cannot see", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      notificationRepository: repository,
    });
    const ok = await app.inject({
      method: "POST",
      url: `/v1/notifications/${notificationId}/read`,
      headers: authHeader,
    });
    expect(ok.statusCode).toBe(204);
    const missing = await app.inject({
      method: "POST",
      url: "/v1/notifications/00000000-0000-4000-8000-000000000000/read",
      headers: authHeader,
    });
    expect(missing.statusCode).toBe(404);
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/notifications/not-a-uuid/read",
      headers: authHeader,
    });
    expect(invalid.statusCode).toBe(400);
    expect(repository.calls).toEqual([`read:${subjectId}:${notificationId}`]);
  });

  it("marks all as read and remembers the bell was opened", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      notificationRepository: repository,
    });
    const all = await app.inject({
      method: "POST",
      url: "/v1/notifications/read-all",
      headers: authHeader,
    });
    const opened = await app.inject({
      method: "POST",
      url: "/v1/notifications/opened",
      headers: authHeader,
    });
    expect(all.statusCode).toBe(204);
    expect(opened.statusCode).toBe(204);
    expect(repository.calls).toEqual([
      `read-all:${subjectId}`,
      `opened:${subjectId}`,
    ]);
  });
});

describe("notification cursor", () => {
  it("round-trips pinned, microseconds and id", () => {
    const cursor = {
      pinned: 1 as const,
      publishUs: "1791043200123456",
      id: notificationId,
    };
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(
      cursor,
    );
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "x",
      Buffer.from("2|1|" + notificationId).toString("base64url"),
      Buffer.from("1|abc|" + notificationId).toString("base64url"),
      Buffer.from("1|1|nope").toString("base64url"),
      Buffer.from("1|1|" + notificationId + "|x").toString("base64url"),
    ]) {
      expect(() => decodeNotificationCursor(bad)).toThrow(InvalidCursorError);
    }
  });
});

describe("toNotification", () => {
  const row = {
    id: notificationId,
    category: "account" as const,
    title: "Revisamos tu QR",
    body: "Hola",
    action_label: "Ver QR y etiquetas",
    action_url: "/touchpoints",
    audience: "workspace",
    workspace_id: "f6399f75-b398-41cd-a299-92b6d236c1fd",
    workspace_name: "Florería Iris",
    pinned: true,
    publish_at: new Date("2026-10-03T18:00:00Z"),
    publish_us: "1",
    edited_at: null,
    expires_at: new Date("2026-10-10T00:00:00Z"),
    read_at: null,
  };

  it("names the organization only for workspace notifications", () => {
    expect(toNotification(row)).toMatchObject({
      action: { label: "Ver QR y etiquetas", url: "/touchpoints" },
      workspace: { name: "Florería Iris" },
      expiresAt: "2026-10-10T00:00:00.000Z",
      publishedAt: "2026-10-03T18:00:00.000Z",
    });
    expect(
      toNotification({ ...row, audience: "segment" }).workspace,
    ).toBeNull();
  });

  it("has no action unless both label and url exist", () => {
    expect(toNotification({ ...row, action_url: null }).action).toBeNull();
  });
});

describe("GET /health/ready", () => {
  const key = "k".repeat(40);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not exist without STATUS_PROBE_KEY", async () => {
    vi.stubEnv("STATUS_PROBE_KEY", undefined);
    const app = buildCustomerApi({ sessionVerifier: verifierFor() });
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    expect(response.statusCode).toBe(404);
  });

  it("is 404 with a wrong key and reports the database with the right one", async () => {
    vi.stubEnv("STATUS_PROBE_KEY", key);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      readinessProbe: {
        check: async () => ({
          ok: true,
          latencyMs: 12,
          queue: { oldestPendingSeconds: 40, pendingJobs: 2 },
        }),
      },
    });
    const wrong = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: { "x-kardo-status-key": "nope" },
    });
    expect(wrong.statusCode).toBe(404);
    const right = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: { "x-kardo-status-key": key },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json()).toMatchObject({
      service: "customer-api",
      status: "ok",
      database: { ok: true, latencyMs: 12 },
      publishQueue: { oldestPendingSeconds: 40, pendingJobs: 2 },
      errors: { windowSeconds: 300 },
    });
  });

  it("answers 503 when the database does not", async () => {
    vi.stubEnv("STATUS_PROBE_KEY", key);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      readinessProbe: {
        check: async () => ({ ok: false, latencyMs: 3001, queue: null }),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: { "x-kardo-status-key": key },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "error",
      publishQueue: null,
    });
  });
});

describe("readiness rules", () => {
  it("is degraded when the database is slow or 5xx pile up", () => {
    expect(
      readinessStatus(
        { ok: true, latencyMs: 20 },
        { requests: 100, serverErrors: 4 },
      ),
    ).toBe("ok");
    expect(
      readinessStatus(
        { ok: true, latencyMs: 2000 },
        { requests: 0, serverErrors: 0 },
      ),
    ).toBe("degraded");
    expect(
      readinessStatus(
        { ok: true, latencyMs: 20 },
        { requests: 100, serverErrors: 5 },
      ),
    ).toBe("degraded");
    // Many errors but a small share of a lot of traffic: still fine.
    expect(
      readinessStatus(
        { ok: true, latencyMs: 20 },
        { requests: 1000, serverErrors: 10 },
      ),
    ).toBe("ok");
    expect(
      readinessStatus(
        { ok: false, latencyMs: 0 },
        { requests: 0, serverErrors: 0 },
      ),
    ).toBe("error");
  });

  it("compares the key in constant time and rejects arrays", () => {
    expect(statusKeyMatches("abc", "abc")).toBe(true);
    expect(statusKeyMatches("abc", "abd")).toBe(false);
    expect(statusKeyMatches("abc", "abcd")).toBe(false);
    expect(statusKeyMatches("abc", ["abc"])).toBe(false);
    expect(statusKeyMatches("abc", undefined)).toBe(false);
  });

  it("counts responses and 5xx in a five-minute window", () => {
    const window = createErrorWindow(5);
    const t0 = Date.UTC(2026, 9, 3, 12, 0, 0);
    window.record(200, t0);
    window.record(500, t0 + 1000);
    window.record(503, t0 + 2 * 60_000);
    expect(window.snapshot(t0 + 3 * 60_000)).toEqual({
      windowSeconds: 300,
      requests: 3,
      serverErrors: 2,
    });
    // Six minutes later the first minute has left the window.
    expect(window.snapshot(t0 + 6 * 60_000)).toEqual({
      windowSeconds: 300,
      requests: 1,
      serverErrors: 1,
    });
  });
});
