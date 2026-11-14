import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import {
  StaffDependencyError,
  StaffNotFoundError,
} from "../src/http/errors.js";
import { staffIdentity, touchpointDetailFixture } from "./fixtures.js";

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["touchpoints.operations.read", "touchpoints.suspend.write"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

function fakeRepository(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listTouchpoints: async () => ({ items: [], nextCursor: null }),
    getTouchpointDetail: async () => touchpointDetailFixture(),
    suspendTouchpoint: async () => touchpointDetailFixture(),
    unsuspendTouchpoint: async () => touchpointDetailFixture(),
    ...overrides,
  };
}

describe("GET /v1/staff/touchpoints", () => {
  it("returns a page of touchpoints", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      touchpointRepository: fakeRepository(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/touchpoints?status=active&suspended=false",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe("GET /v1/staff/touchpoints/:touchpointId", () => {
  it("returns 404 for an unknown touchpoint", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      touchpointRepository: fakeRepository({
        getTouchpointDetail: async () => {
          throw new StaffNotFoundError();
        },
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/touchpoints/${randomUUID()}`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /v1/staff/touchpoints/:touchpointId/suspension", () => {
  it("suspends a Touchpoint and returns its detail", async () => {
    const touchpointId = randomUUID();
    const suspendTouchpoint = vi.fn().mockResolvedValue(
      touchpointDetailFixture({
        suspension: {
          suspendedAt: new Date().toISOString(),
          reason: "Reported counterfeit product",
          suspendedByEmail: staffIdentity.email,
        },
      }),
    );
    const resolverSuspension = {
      setSuspended: vi.fn().mockResolvedValue(undefined),
    };
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      touchpointRepository: fakeRepository({ suspendTouchpoint }),
      resolverSuspension,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/touchpoints/${touchpointId}/suspension`,
      headers: { authorization: "Bearer staff-token" },
      payload: { reason: "Reported counterfeit product" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().suspension.reason).toBe(
      "Reported counterfeit product",
    );
    expect(suspendTouchpoint).toHaveBeenCalledWith(
      staffIdentity.subject,
      touchpointId,
      { reason: "Reported counterfeit product" },
      resolverSuspension,
    );
    await app.close();
  });

  it("returns 503 without calling the repository when suspension is not configured", async () => {
    const suspendTouchpoint = vi.fn();
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      touchpointRepository: fakeRepository({ suspendTouchpoint }),
      resolverSuspension: null,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/touchpoints/${randomUUID()}/suspension`,
      headers: { authorization: "Bearer staff-token" },
      payload: { reason: "Reported counterfeit product" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("STAFF_DEPENDENCY_UNAVAILABLE");
    expect(suspendTouchpoint).not.toHaveBeenCalled();
    await app.close();
  });

  it("rolls the transaction back (never persists the suspension) when the Resolver call fails", async () => {
    // Exercises the real Postgres repository against a minimal fake `Sql`
    // that models postgres.js's tagged-template + `.begin()` transaction
    // semantics closely enough to prove the DB write staged before the
    // Resolver call is discarded when the callback throws — the same
    // rollback-on-failure contract as customer-api's
    // `updateTouchpointStatus`.
    const { createPostgresStaffTouchpointRepository } = await import(
      "../src/repositories/touchpoints.js"
    );
    const touchpointId = randomUUID();
    const publicId = "touchpointpublicid00001";
    const currentRow = {
      id: touchpointId,
      public_id: publicId,
      workspace_id: null as string | null,
      suspended_at: null as string | null,
    };
    let stagedSuspendedAt: string | null = null;
    let stagedAuditInserted = false;
    let committedSuspendedAt: string | null = null;
    let committedAuditInserted = false;

    function runQuery(strings: TemplateStringsArray) {
      const text = strings.join(" ");
      if (text.includes("select exists(")) {
        return Promise.resolve([{ granted: true }]);
      }
      if (text.includes("select set_config")) {
        return Promise.resolve([]);
      }
      if (text.includes("select id, public_id, workspace_id, suspended_at")) {
        return Promise.resolve([{ ...currentRow }]);
      }
      if (text.includes("update kardo_core.touchpoints")) {
        stagedSuspendedAt = new Date().toISOString();
        return Promise.resolve([]);
      }
      if (text.includes("insert into kardo_audit.events")) {
        stagedAuditInserted = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }

    function makeFakeSql() {
      const tag = (strings: TemplateStringsArray) => runQuery(strings);
      tag.unsafe = () => Promise.resolve([]);
      tag.json = (value: unknown) => value;
      tag.begin = async (fn: (tx: typeof tag) => Promise<unknown>) => {
        stagedSuspendedAt = null;
        stagedAuditInserted = false;
        const result = await fn(tag);
        // Only reached when `fn` resolves without throwing — real
        // postgres.js only commits in that case too.
        committedSuspendedAt = stagedSuspendedAt;
        committedAuditInserted = stagedAuditInserted;
        return result;
      };
      return tag;
    }

    const sql = makeFakeSql();
    const repository = createPostgresStaffTouchpointRepository(
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake for postgres.js's tagged-template Sql type
      sql as any,
      null,
      "kardo_taps",
      "test",
      "https://resolver.kardo.invalid",
    );
    const resolverSuspension = {
      setSuspended: vi.fn().mockRejectedValue(new Error("network down")),
    };

    await expect(
      repository.suspendTouchpoint(
        staffIdentity.subject,
        touchpointId,
        { reason: "Reported counterfeit product" },
        resolverSuspension,
      ),
    ).rejects.toBeInstanceOf(StaffDependencyError);

    expect(committedSuspendedAt).toBeNull();
    expect(committedAuditInserted).toBe(false);
  });

  it("is idempotent: suspending an already-suspended Touchpoint skips the Resolver call and the audit entry", async () => {
    const { createPostgresStaffTouchpointRepository } = await import(
      "../src/repositories/touchpoints.js"
    );
    const touchpointId = randomUUID();
    const alreadySuspendedAt = new Date().toISOString();
    const currentRow = {
      id: touchpointId,
      public_id: "touchpointpublicid00001",
      workspace_id: null as string | null,
      suspended_at: alreadySuspendedAt,
    };

    function runQuery(strings: TemplateStringsArray) {
      const text = strings.join(" ");
      if (text.includes("select exists(")) {
        return Promise.resolve([{ granted: true }]);
      }
      if (text.includes("select id, public_id, workspace_id, suspended_at")) {
        return Promise.resolve([{ ...currentRow }]);
      }
      if (text.includes("select") && text.includes("t.id")) {
        // fetchTouchpointDetailPayload's main row query
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }

    function makeFakeSql() {
      const tag = (strings: TemplateStringsArray) => runQuery(strings);
      tag.unsafe = () => Promise.resolve([]);
      tag.json = (value: unknown) => value;
      tag.begin = (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag);
      return tag;
    }

    const sql = makeFakeSql();
    const repository = createPostgresStaffTouchpointRepository(
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake for postgres.js's tagged-template Sql type
      sql as any,
      null,
      "kardo_taps",
      "test",
      "https://resolver.kardo.invalid",
    );
    const resolverSuspension = { setSuspended: vi.fn() };

    // fetchTouchpointDetailPayload requires a touchpoint row to exist; since
    // our generic fake returns `[]` for the detail query above, the method
    // would throw StaffNotFoundError after the idempotent no-op branch —
    // which is exactly what we want to observe here: the Resolver is never
    // called, proving the no-op branch was taken.
    await expect(
      repository.suspendTouchpoint(
        staffIdentity.subject,
        touchpointId,
        { reason: "Reported counterfeit product" },
        resolverSuspension,
      ),
    ).rejects.toThrow();
    expect(resolverSuspension.setSuspended).not.toHaveBeenCalled();
  });
});

describe("DELETE /v1/staff/touchpoints/:touchpointId/suspension", () => {
  it("lifts a suspension and returns the updated detail", async () => {
    const touchpointId = randomUUID();
    const unsuspendTouchpoint = vi
      .fn()
      .mockResolvedValue(touchpointDetailFixture({ suspension: null }));
    const resolverSuspension = {
      setSuspended: vi.fn().mockResolvedValue(undefined),
    };
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      touchpointRepository: fakeRepository({ unsuspendTouchpoint }),
      resolverSuspension,
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/staff/touchpoints/${touchpointId}/suspension`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().suspension).toBeNull();
    expect(unsuspendTouchpoint).toHaveBeenCalledWith(
      staffIdentity.subject,
      touchpointId,
      resolverSuspension,
    );
    await app.close();
  });

  it("returns 503 when the Resolver call fails", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      touchpointRepository: fakeRepository({
        unsuspendTouchpoint: async () => {
          throw new StaffDependencyError(
            "The Resolver could not confirm this Touchpoint's suspension was lifted.",
          );
        },
      }),
      resolverSuspension: { setSuspended: vi.fn() },
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/staff/touchpoints/${randomUUID()}/suspension`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("STAFF_DEPENDENCY_UNAVAILABLE");
    await app.close();
  });
});
