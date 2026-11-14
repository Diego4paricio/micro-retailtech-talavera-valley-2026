import type { Touchpoint } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { fetchFirstVisit } from "../src/analytics-engine.js";
import { buildCustomerApi } from "../src/app.js";
import {
  planObjectUpdate,
  probeTarget,
  toTouchpointObject,
} from "../src/repositories/touchpoints.js";
import {
  authHeader,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const empty = {
  qr_last_export_at: null,
  object_prepared_at: null,
  object_tested_at: null,
  object_backup_at: null,
  object_placed_at: null,
  object_replacing_at: null,
  object_replace_ready_at: null,
  object_replace_prepared_at: null,
  object_replace_tested_at: null,
};

describe("the object's state (relevo 36)", () => {
  it("is pending, then ready, then placed, and replacing wins over all", () => {
    expect(toTouchpointObject(empty).state).toBe("pending");
    const written = { ...empty, object_prepared_at: "2026-10-07T18:00:00Z" };
    expect(toTouchpointObject(written).state).toBe("ready");
    const placed = { ...written, object_placed_at: "2026-10-07T18:10:00Z" };
    expect(toTouchpointObject(placed)).toMatchObject({
      state: "placed",
      preparedAt: "2026-10-07T18:00:00.000Z",
      placedAt: "2026-10-07T18:10:00.000Z",
    });
    expect(
      toTouchpointObject({
        ...placed,
        object_replacing_at: "2026-10-08T10:00:00Z",
      }).state,
    ).toBe("replacing");
  });

  it("carries the QR download as the first QR step", () => {
    expect(
      toTouchpointObject({
        ...empty,
        qr_last_export_at: new Date("2026-10-07T12:00:00Z"),
      }).downloadedAt,
    ).toBe("2026-10-07T12:00:00.000Z");
  });
});

describe("planObjectUpdate", () => {
  const nfc = { kind: "nfc" as const, replacing: false };
  const qr = { kind: "qr" as const, replacing: false };

  it("marks and undoes a step on its own column", () => {
    expect(planObjectUpdate(nfc, { action: "done", step: "prepared" })).toEqual(
      { kind: "mark", column: "object_prepared_at" },
    );
    expect(planObjectUpdate(qr, { action: "undo", step: "placed" })).toEqual({
      kind: "unmark",
      column: "object_placed_at",
    });
  });

  it("refuses Links, a backup QR outside NFC and a step without a step", () => {
    expect(() =>
      planObjectUpdate(
        { kind: "link", replacing: false },
        { action: "done", step: "placed" },
      ),
    ).toThrow(/Link/);
    expect(() =>
      planObjectUpdate(qr, { action: "done", step: "backup" }),
    ).toThrow(/respaldo/);
    expect(() => planObjectUpdate(nfc, { action: "done" })).toThrow(/paso/);
  });

  it("only replaces an NFC chip, and its steps need a replacement under way", () => {
    expect(planObjectUpdate(nfc, { action: "start_replace" })).toEqual({
      kind: "start_replace",
    });
    expect(() => planObjectUpdate(qr, { action: "start_replace" })).toThrow(
      /NFC/,
    );
    expect(() =>
      planObjectUpdate(nfc, { action: "done", step: "replace_ready" }),
    ).toThrow(/reemplazando/);
    expect(
      planObjectUpdate(
        { kind: "nfc", replacing: true },
        { action: "done", step: "replace_prepared" },
      ),
    ).toEqual({ kind: "mark", column: "object_replace_prepared_at" });
  });

  it("finishes the replacement when the new chip is placed", () => {
    expect(
      planObjectUpdate(
        { kind: "nfc", replacing: true },
        { action: "done", step: "placed" },
      ),
    ).toEqual({ kind: "finish_replace" });
  });
});

describe("probeTarget («Pruébalo»)", () => {
  const touchpoint = (object: Partial<ReturnType<typeof toTouchpointObject>>) =>
    ({
      id: touchpointId,
      publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
      operationalName: "Tarjeta en recepción",
      physicalType: "card",
      kind: "nfc",
      status: "active",
      createdAt: "2026-10-01T00:00:00.000Z",
      object: { ...toTouchpointObject(empty), ...object },
    }) as Touchpoint;
  const live = { live_experience_id: "e1" } as never;

  it("waits for the NFC channel since the chip was written, with slack", () => {
    const target = probeTarget(
      live,
      touchpoint({ preparedAt: "2026-10-07T18:00:00.000Z" }),
    );
    expect(target).toMatchObject({
      done: false,
      step: "tested",
      column: "object_tested_at",
      channel: "nfc",
    });
    expect(target?.since.toISOString()).toBe("2026-10-07T17:58:00.000Z");
  });

  it("looks for the new card while a chip is being replaced", () => {
    expect(
      probeTarget(
        live,
        touchpoint({
          state: "replacing",
          replacingAt: "2026-10-08T10:00:00.000Z",
          replacePreparedAt: "2026-10-08T10:05:00.000Z",
        }),
      ),
    ).toMatchObject({ step: "replace_tested", done: false });
  });

  it("never counts a visit from before the step was opened (an undone test, a reload)", () => {
    const written = touchpoint({ preparedAt: "2026-10-01T10:00:00.000Z" });
    const reopened = probeTarget(
      live,
      written,
      new Date("2026-10-07T18:30:00.000Z"),
      new Date("2026-10-07T18:31:00.000Z"),
    );
    expect(reopened?.since.toISOString()).toBe("2026-10-07T18:29:00.000Z");
    // A clock ahead of the server's never moves the window into the future.
    const ahead = probeTarget(
      live,
      written,
      new Date("2026-10-07T19:00:00.000Z"),
      new Date("2026-10-07T18:31:00.000Z"),
    );
    expect(ahead?.since.toISOString()).toBe("2026-10-07T18:30:00.000Z");
    // Never earlier than the step itself.
    const early = probeTarget(
      live,
      written,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(early?.since.toISOString()).toBe("2026-10-01T09:58:00.000Z");
  });

  it("has nothing to look for without a live page", () => {
    expect(
      probeTarget({ live_experience_id: null } as never, touchpoint({})),
    ).toBeNull();
  });
});

describe("fetchFirstVisit", () => {
  it("asks only for taps of that channel in the window and reads UTC", async () => {
    let sent = "";
    const first = await fetchFirstVisit({
      client: {
        query: async (sql) => {
          sent = sql;
          return [{ first: "2026-10-07 18:41:05", total: 1 }];
        },
      },
      dataset: "kardo_taps",
      environment: "dev",
      publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
      channel: "nfc",
      since: new Date("2026-10-07T18:00:00Z"),
      now: new Date("2026-10-07T18:30:30Z"),
    });
    expect(first).toBe("2026-10-07T18:41:05.000Z");
    expect(sent).toContain("index1 = 'c2fc661f2bdf4d5092c3112db0bcc3ef'");
    expect(sent).toContain("blob3 = 'nfc'");
    expect(sent).toContain("blob2 = 'tap'");
    expect(sent).toContain("INTERVAL '31' MINUTE");
  });

  it("never sends a malformed public id and says null when nothing came", async () => {
    let called = false;
    const client = {
      query: async () => {
        called = true;
        return [{ first: null, total: 0 }];
      },
    };
    const base = {
      client,
      dataset: "kardo_taps",
      environment: "dev",
      channel: "qr" as const,
      since: new Date(),
    };
    expect(await fetchFirstVisit({ ...base, publicId: "x' OR 1=1 --" })).toBe(
      null,
    );
    expect(called).toBe(false);
    expect(
      await fetchFirstVisit({
        ...base,
        publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
      }),
    ).toBe(null);
  });
});

describe("object routes", () => {
  it("saves a step and returns the Touchpoint, and probes with the configured finder", async () => {
    const calls: unknown[] = [];
    const finder = async () => null;
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointObjectProbe: finder,
      touchpointRepository: {
        updateTouchpointObject: async (_identity, ws, id, input) => {
          calls.push({ ws, id, input });
          return {
            id,
            publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
            operationalName: "Tarjeta",
            physicalType: "card",
            status: "active",
          };
        },
        probeTouchpointObject: async (
          _identity,
          _ws,
          id,
          findFirstVisit,
          openedAt,
        ) => {
          expect(findFirstVisit).toBe(finder);
          expect(openedAt?.toISOString()).toBe("2026-10-07T18:30:00.000Z");
          return {
            touchpoint: {
              id,
              publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
              operationalName: "Tarjeta",
              physicalType: "card",
              status: "active",
            },
            detected: false,
            source: "analytics",
          };
        },
      } as never,
    });
    const saved = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/object`,
      headers: authHeader,
      payload: { action: "done", step: "prepared" },
    });
    expect(saved.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        ws: workspaceId,
        id: touchpointId,
        input: { action: "done", step: "prepared" },
      },
    ]);
    const invalid = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/object`,
      headers: authHeader,
      payload: { action: "done", step: "printed" },
    });
    expect(invalid.statusCode).toBe(400);
    const probe = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/object/probe`,
      headers: authHeader,
      payload: { since: "2026-10-07T18:30:00.000Z" },
    });
    expect(probe.statusCode).toBe(200);
    expect(probe.json()).toMatchObject({
      detected: false,
      source: "analytics",
    });
    await app.close();
  });
});
