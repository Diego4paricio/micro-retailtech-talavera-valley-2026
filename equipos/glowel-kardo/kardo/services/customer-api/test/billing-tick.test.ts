import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { BillingService } from "../src/billing/service.js";
import type { AppDependencies } from "../src/http/dependencies.js";
import { customerApiErrorHandler } from "../src/http/error-handler.js";
import { registerBillingRoutes } from "../src/routes/billing.js";

const key = "k".repeat(40);

function build(cronKey: string | null): {
  app: FastifyInstance;
  runScheduledTasks: ReturnType<typeof vi.fn>;
} {
  const runScheduledTasks = vi
    .fn()
    .mockResolvedValue({ trialsChecked: 2, sent: 1, failed: 0 });
  const billing = { runScheduledTasks } as unknown as BillingService;
  const app = Fastify();
  registerBillingRoutes(app, { billing } as unknown as AppDependencies, {
    cronKey,
  });
  app.setErrorHandler(customerApiErrorHandler);
  return { app, runScheduledTasks };
}

describe("POST /internal/billing/tick (hourly scheduler)", () => {
  it("runs the scheduled billing tasks with the right key", async () => {
    const { app, runScheduledTasks } = build(key);
    const response = await app.inject({
      method: "POST",
      url: "/internal/billing/tick",
      headers: { authorization: `Bearer ${key}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ trialsChecked: 2, sent: 1, failed: 0 });
    expect(runScheduledTasks).toHaveBeenCalledOnce();
    await app.close();
  });

  it("rejects a missing or wrong key", async () => {
    const { app, runScheduledTasks } = build(key);
    for (const authorization of [undefined, "Bearer nope", `Bearer ${key}x`]) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/billing/tick",
        ...(authorization ? { headers: { authorization } } : {}),
      });
      expect(response.statusCode).toBe(401);
    }
    expect(runScheduledTasks).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not exist without a configured key", async () => {
    const { app, runScheduledTasks } = build(null);
    const response = await app.inject({
      method: "POST",
      url: "/internal/billing/tick",
      headers: { authorization: `Bearer ${key}` },
    });
    expect(response.statusCode).toBe(404);
    expect(runScheduledTasks).not.toHaveBeenCalled();
    await app.close();
  });
});
