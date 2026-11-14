import { describe, expect, it } from "vitest";
import type { LeadCreated } from "../src/index.js";
import { scheduleLeadDelivery } from "../src/worker.js";

function lead(deliveries: LeadCreated["deliveries"]): LeadCreated {
  return {
    id: "lead-1",
    createdAt: "2026-09-24T12:00:00.000Z",
    workspace: { id: "workspace-1", name: "Kardo Demo" },
    touchpoint: { id: "touchpoint-1", name: "Mostrador" },
    lead: { email: "ana@example.test" },
    deliveries,
  };
}

describe("scheduleLeadDelivery: the visitor's response never waits for delivery", () => {
  it("hands delivery off to ctx.waitUntil and returns before delivery finishes; closes the repository only afterwards", async () => {
    let resolveDelivery: (() => void) | undefined;
    const deliveryGate = new Promise<void>((resolve) => {
      resolveDelivery = resolve;
    });
    const deliverFn = async (
      _created: LeadCreated,
      _env: Record<string, never>,
      record: (outcome: {
        id: string;
        status: "sent";
        attempts: number;
      }) => Promise<void>,
    ): Promise<void> => {
      await deliveryGate;
      await record({ id: "delivery-1", status: "sent", attempts: 1 });
    };

    const waitUntilPromises: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromises.push(promise);
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    let closed = false;
    const recorded: unknown[] = [];
    const repository = {
      recordDeliveryResult: async (outcome: unknown) => {
        recorded.push(outcome);
      },
      close: async () => {
        closed = true;
      },
    };

    const created = lead([
      {
        id: "delivery-1",
        channel: "webhook",
        url: "https://example.test",
        secretCiphertext: "",
      },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: deliverFn's signature only needs to match deliverLead's shape structurally for this test.
    await scheduleLeadDelivery(created, {}, repository, ctx, deliverFn as any);

    // scheduleLeadDelivery itself has already resolved (it only *schedules*
    // the work), yet delivery has not progressed at all: proof the visitor's
    // response is never delayed by it.
    expect(closed).toBe(false);
    expect(recorded).toEqual([]);
    expect(waitUntilPromises).toHaveLength(1);

    resolveDelivery?.();
    await waitUntilPromises[0];

    expect(recorded).toEqual([
      { id: "delivery-1", status: "sent", attempts: 1 },
    ]);
    expect(closed).toBe(true);
  });

  it("closes the repository immediately when there is nothing to deliver, without touching ctx.waitUntil", async () => {
    let waitUntilCalled = false;
    const ctx = {
      waitUntil: () => {
        waitUntilCalled = true;
      },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    let closed = false;
    const repository = {
      recordDeliveryResult: async () => {},
      close: async () => {
        closed = true;
      },
    };

    await scheduleLeadDelivery(
      lead([]),
      {},
      repository,
      ctx,
      // biome-ignore lint/suspicious/noExplicitAny: never called in this case.
      (async () => {}) as any,
    );

    expect(waitUntilCalled).toBe(false);
    expect(closed).toBe(true);
  });
});
