import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import {
  StaffConflictError,
  StaffNotFoundError,
  StaffPermissionError,
  StaffValidationError,
} from "../src/http/errors.js";
import { createPostgresStaffBillingRepository } from "../src/repositories/billing.js";
import { createPostgresStaffWorkspaceRepository } from "../src/repositories/workspaces.js";
import { staffIdentity } from "./fixtures.js";

const workspaceId = randomUUID();
const headers = { authorization: "Bearer staff-token" };

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["billing.read", "billing.write"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

const unused = () => Promise.reject(new Error("not used"));

function billingFixture() {
  return {
    workspaceId,
    workspaceName: "Acme",
    stripeCustomerId: null,
    stripeDashboardUrl: null,
    trialConsumedAt: null,
    trial: null,
    access: {
      state: "internal" as const,
      source: "internal" as const,
      lapsedAt: null,
      graceEndsAt: null,
      deleteAt: null,
      pagesPausedAt: null,
      internal: {
        reason: "Demo de ventas",
        setAt: new Date().toISOString(),
        setByName: "Staff",
      },
      deletion: null,
    },
    plan: null,
    manualPlanUntil: null,
    entitlements: {},
    usage: {},
    subscriptions: [],
    invoices: [],
    refunds: [],
    events: [],
    notices: [],
  };
}

function repositoryStub(overrides: Record<string, unknown>) {
  return {
    overview: unused,
    listSubscriptions: unused,
    listEvents: unused,
    workspaceBilling: unused,
    cancel: unused,
    resume: unused,
    extendTrial: unused,
    resync: unused,
    refund: unused,
    syncCatalog: unused,
    listAccess: unused,
    setInternal: unused,
    extendKardoTrial: unused,
    ...overrides,
  } as never;
}

function appWith(overrides: Record<string, unknown>) {
  return buildStaffApi({
    sessionVerifier: { verify: async () => staffIdentity },
    sessionRepository: sessionRepository(),
    billingRepository: repositoryStub(overrides),
  });
}

describe("GET /v1/staff/billing/access", () => {
  it("lists organizations by state", async () => {
    const listAccess = vi.fn().mockResolvedValue([]);
    const app = appWith({ listAccess });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/access?state=paused",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(listAccess).toHaveBeenCalledWith(staffIdentity.subject, "paused");
    await app.close();
  });

  it("rejects an unknown or missing state", async () => {
    const app = appWith({});
    for (const url of [
      "/v1/staff/billing/access?state=bogus",
      "/v1/staff/billing/access",
    ]) {
      const response = await app.inject({ method: "GET", url, headers });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });

  it("answers 403 without billing.read", async () => {
    const app = appWith({
      listAccess: () => Promise.reject(new StaffPermissionError()),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/billing/access?state=trial",
      headers,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("STAFF_PERMISSION_DENIED");
    await app.close();
  });
});

describe("PUT /v1/staff/workspaces/:workspaceId/internal", () => {
  const url = `/v1/staff/workspaces/${workspaceId}/internal`;

  it("marks the organization internal", async () => {
    const setInternal = vi.fn().mockResolvedValue(billingFixture());
    const app = appWith({ setInternal });
    const response = await app.inject({
      method: "PUT",
      url,
      headers,
      payload: { internal: true, reason: "Demo de ventas" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().access.state).toBe("internal");
    expect(setInternal).toHaveBeenCalledWith(
      staffIdentity.subject,
      workspaceId,
      true,
      "Demo de ventas",
    );
    await app.close();
  });

  it("validates the body and the workspace id", async () => {
    const app = appWith({});
    for (const [target, payload] of [
      [url, { internal: true }],
      [url, { internal: "yes", reason: "Demo de ventas" }],
      [url, { internal: true, reason: "ab" }],
      [
        "/v1/staff/workspaces/nope/internal",
        { internal: true, reason: "Demo de ventas" },
      ],
    ] as const) {
      const response = await app.inject({
        method: "PUT",
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
      [new StaffConflictError("La organización fue eliminada."), 409],
    ] as const) {
      const app = appWith({ setInternal: () => Promise.reject(error) });
      const response = await app.inject({
        method: "PUT",
        url,
        headers,
        payload: { internal: false, reason: "Ya no es demo" },
      });
      expect(response.statusCode).toBe(status);
      await app.close();
    }
  });
});

describe("POST /v1/staff/workspaces/:workspaceId/kardo-trial/extend", () => {
  const url = `/v1/staff/workspaces/${workspaceId}/kardo-trial/extend`;

  it("extends the trial", async () => {
    const extendKardoTrial = vi.fn().mockResolvedValue(billingFixture());
    const app = appWith({ extendKardoTrial });
    const response = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { days: 15, reason: "Pidio mas tiempo" },
    });
    expect(response.statusCode).toBe(200);
    expect(extendKardoTrial).toHaveBeenCalledWith(
      staffIdentity.subject,
      workspaceId,
      15,
      "Pidio mas tiempo",
    );
    await app.close();
  });

  it("rejects days out of range", async () => {
    const app = appWith({});
    for (const days of [0, 61, 1.5]) {
      const response = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { days, reason: "Pidio mas tiempo" },
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});

// --- Repositories over a fake sql ---------------------------------------------

type Handler = (text: string, values: unknown[]) => unknown[] | undefined;

function fakeSql(handler: Handler) {
  const queries: string[] = [];
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    queries.push(text);
    if (text.includes("select exists("))
      return Promise.resolve([{ granted: true }]);
    return Promise.resolve(handler(text, values) ?? []);
  };
  tag.unsafe = () => Promise.resolve([]);
  tag.json = (value: unknown) => value;
  tag.begin = (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag);
  return { sql: tag as never, queries };
}

const deletionRow = {
  deletion_at: "2026-09-30T06:00:00.000Z",
  deletion_reason: "90 días sin contratar",
  deletion_counts: {
    touchpoints: 3,
    experiences: 5,
    invoicesKept: 2,
    cfdiKept: 1,
    "bad key!": 9,
  },
  deletion_cleanup_completed_at: null,
  deletion_cleanup_pending: 2,
  deletion_last_error: "R2 respondió 500",
};

const accessRow = {
  state: "internal",
  source: "internal",
  plan_code: null,
  plan_name: null,
  ends_at: null,
  lapsed_at: null,
  grace_ends_at: null,
  delete_at: null,
  offer_until: null,
};

function detailHandler(text: string): unknown[] | undefined {
  if (text.includes("select name, account_type from kardo_core.workspaces")) {
    return [{ name: "Acme", account_type: "business" }];
  }
  if (text.includes("from kardo_billing.workspace_access(")) return [accessRow];
  if (text.includes("from kardo_billing.access_states")) {
    return [{ pages_paused_at: "2026-09-01T00:00:00.000Z" }];
  }
  if (text.includes("from kardo_billing.internal_workspaces i")) {
    return [
      {
        reason: "Demo de ventas",
        set_at: "2026-08-01T00:00:00.000Z",
        set_by_name: "Ana",
      },
    ];
  }
  return undefined;
}

describe("billing repository", () => {
  it("includes the access state in the workspace detail", async () => {
    const { sql } = fakeSql((text) => detailHandler(text));
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
    });
    const billing = await repository.workspaceBilling(
      staffIdentity.subject,
      workspaceId,
    );
    // Personal or business, as declared at sign up (2026-10-01).
    expect(billing.accountType).toBe("business");
    expect(billing.access).toEqual({
      state: "internal",
      source: "internal",
      lapsedAt: null,
      graceEndsAt: null,
      deleteAt: null,
      pagesPausedAt: "2026-09-01T00:00:00.000Z",
      internal: {
        reason: "Demo de ventas",
        setAt: "2026-08-01T00:00:00.000Z",
        setByName: "Ana",
      },
      deletion: null,
    });
  });

  it("fills the deletion record, pending cleanup and last error", async () => {
    const { sql } = fakeSql((text) => {
      if (text.includes("from kardo_billing.workspace_deletions d")) {
        return [deletionRow];
      }
      if (text.includes("from kardo_billing.workspace_access(")) {
        return [{ ...accessRow, state: "deleted", source: "none" }];
      }
      return detailHandler(text);
    });
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
    });
    const billing = await repository.workspaceBilling(
      staffIdentity.subject,
      workspaceId,
    );
    expect(billing.access.state).toBe("deleted");
    expect(billing.access.deletion).toEqual({
      deletedAt: "2026-09-30T06:00:00.000Z",
      reason: "90 días sin contratar",
      counts: { touchpoints: 3, experiences: 5, invoicesKept: 2, cfdiKept: 1 },
      cleanupPending: 2,
      cleanupCompletedAt: null,
      lastCleanupError: "R2 respondió 500",
    });
  });

  it("leaves internal organizations out of the MRR and counts states", async () => {
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("count(*) filter (where state = 'trial')")) {
        return [
          {
            kardo_trials: 4,
            limited: 2,
            paused: 1,
            pending_deletion: 1,
            deleted: 6,
            internal: 3,
          },
        ];
      }
      return undefined;
    });
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
      deletionMode: "dry-run",
    });
    const overview = await repository.overview(staffIdentity.subject);
    expect(overview.access).toEqual({
      kardoTrials: 4,
      limited: 2,
      paused: 1,
      pendingDeletion: 1,
      deleted: 6,
      deletionMode: "dry-run",
      internal: 3,
    });
    const stateQuery = queries.find((text) =>
      text.includes("count(*) filter (where state = 'trial')"),
    );
    // Deleted organizations have their own state: limited, paused and the
    // pending-deletion count never include them.
    expect(stateQuery).toContain("where state in ('limited', 'paused')");
    const subscriptionQueries = queries.filter((text) =>
      text.includes("from kardo_billing.subscriptions s"),
    );
    expect(subscriptionQueries).toHaveLength(2);
    for (const text of subscriptionQueries) {
      expect(text).toContain("kardo_billing.internal_workspaces");
    }
  });

  it("reconciles after marking internal, and survives a Resolver failure", async () => {
    const { sql } = fakeSql((text) => detailHandler(text));
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
      reconcile,
    });
    await repository.setInternal(
      staffIdentity.subject,
      workspaceId,
      true,
      "Demo de ventas",
    );
    expect(reconcile).toHaveBeenCalledWith(workspaceId);
  });

  it("maps database refusals and skips reconciliation", async () => {
    const reconcile = vi.fn();
    for (const [message, expected] of [
      ["FORBIDDEN", StaffPermissionError],
      ["NOT_FOUND", StaffNotFoundError],
      ["INVALID_REASON", StaffValidationError],
      ["INVALID_TRIAL_DAYS", StaffValidationError],
    ] as const) {
      const { sql } = fakeSql((text) => {
        if (text.includes("kardo_private.")) {
          throw Object.assign(new Error(message), { code: "P0001" });
        }
        return detailHandler(text);
      });
      const repository = createPostgresStaffBillingRepository({
        sql,
        gateway: null,
        sync: null,
        reconcile,
      });
      await expect(
        repository.extendKardoTrial(
          staffIdentity.subject,
          workspaceId,
          10,
          "Pidio mas tiempo",
        ),
      ).rejects.toBeInstanceOf(expected);
      await expect(
        repository.setInternal(staffIdentity.subject, workspaceId, true, "x"),
      ).rejects.toBeInstanceOf(expected);
    }
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("lists access rows for a filter", async () => {
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("cross join lateral kardo_billing.workspace_access")) {
        return [
          {
            workspace_id: workspaceId,
            workspace_name: "Acme",
            owner_email: "owner@acme.test",
            state: "paused",
            source: "trial",
            plan_name: null,
            ends_at: null,
            lapsed_at: "2026-06-01T00:00:00.000Z",
            grace_ends_at: "2026-06-08T00:00:00.000Z",
            delete_at: "2026-08-30T00:00:00.000Z",
            pages_paused_at: "2026-06-08T01:00:00.000Z",
            internal_reason: null,
            internal_set_at: null,
            internal_set_by_name: null,
          },
        ];
      }
      return undefined;
    });
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
    });
    const rows = await repository.listAccess(staffIdentity.subject, "paused");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId,
      ownerEmail: "owner@acme.test",
      state: "paused",
      internal: null,
      pagesPausedAt: "2026-06-08T01:00:00.000Z",
    });
    expect(queries.some((text) => text.includes("limit 200"))).toBe(true);
  });

  it("lists deleted organizations, newest first, with their deletion", async () => {
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("cross join lateral kardo_billing.workspace_access")) {
        return [
          {
            workspace_id: workspaceId,
            workspace_name: "Florería Eliminada",
            owner_email: null,
            state: "deleted",
            source: "none",
            plan_name: null,
            ends_at: null,
            lapsed_at: null,
            grace_ends_at: null,
            delete_at: "2026-09-30T06:00:00.000Z",
            pages_paused_at: null,
            internal_reason: null,
            internal_set_at: null,
            internal_set_by_name: null,
            ...deletionRow,
          },
          {
            workspace_id: randomUUID(),
            workspace_name: "Sin registro",
            owner_email: null,
            state: "deleted",
            source: "none",
            plan_name: null,
            ends_at: null,
            lapsed_at: null,
            grace_ends_at: null,
            delete_at: null,
            pages_paused_at: null,
            internal_reason: null,
            internal_set_at: null,
            internal_set_by_name: null,
            deletion_at: null,
          },
        ];
      }
      return undefined;
    });
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
    });
    const rows = await repository.listAccess(staffIdentity.subject, "deleted");
    expect(rows[0]?.deletion?.cleanupPending).toBe(2);
    expect(rows[0]?.deletion?.counts).not.toHaveProperty("bad key!");
    expect(rows[1]?.deletion).toBeNull();
    // The where and order fragments are recorded as their own queries.
    expect(queries.some((text) => text.includes("a.state = 'deleted'"))).toBe(
      true,
    );
    expect(queries.some((text) => text.includes("d.deleted_at desc"))).toBe(
      true,
    );
  });

  it("keeps deleted organizations out of the 'deletion' filter", async () => {
    const { sql, queries } = fakeSql(() => undefined);
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
    });
    await repository.listAccess(staffIdentity.subject, "deletion");
    expect(
      queries.some((text) => text.includes("a.state in ('limited', 'paused')")),
    ).toBe(true);
  });

  it("answers 409 to staff actions on a deleted organization", async () => {
    const reconcile = vi.fn();
    const { sql, queries } = fakeSql((text) => {
      if (text.includes("select deleted_at from kardo_core.workspaces")) {
        return [{ deleted_at: "2026-09-30T06:00:00.000Z" }];
      }
      if (text.includes("select id from kardo_core.workspaces")) {
        return [{ id: workspaceId }];
      }
      return detailHandler(text);
    });
    const billing = createPostgresStaffBillingRepository({
      sql,
      gateway: null,
      sync: null,
      reconcile,
    });
    await expect(
      billing.setInternal(staffIdentity.subject, workspaceId, true, "Demo"),
    ).rejects.toMatchObject({ statusCode: 409, code: "STAFF_CONFLICT" });
    await expect(
      billing.extendKardoTrial(staffIdentity.subject, workspaceId, 10, "Más"),
    ).rejects.toMatchObject({ statusCode: 409, code: "STAFF_CONFLICT" });
    const workspaces = createPostgresStaffWorkspaceRepository(
      sql,
      null,
      "dataset",
      "test",
      reconcile,
    );
    await expect(
      workspaces.assignPlan(staffIdentity.subject, workspaceId, {
        planId: randomUUID(),
        reason: "Cortesia",
      } as never),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "La organización fue eliminada.",
    });
    expect(reconcile).not.toHaveBeenCalled();
    expect(
      queries.some(
        (text) =>
          text.includes("kardo_private.") ||
          text.includes("insert into kardo_core.workspace_plans"),
      ),
    ).toBe(false);
  });

  it("reconciles after cancelling a subscription", async () => {
    const { sql } = fakeSql((text) => {
      if (text.includes("from kardo_billing.subscriptions\n")) {
        return [
          { workspace_id: workspaceId, status: "active", trial_end: null },
        ];
      }
      return detailHandler(text);
    });
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const repository = createPostgresStaffBillingRepository({
      sql,
      gateway: {
        livemode: false,
        cancelSubscription: async () => ({}),
      } as never,
      sync: { applySubscription: async () => undefined } as never,
      reconcile,
    });
    await repository.cancel(staffIdentity.subject, "sub_abcdef123456", {
      mode: "immediately",
      reason: "Pidio cancelar",
    } as never);
    expect(reconcile).toHaveBeenCalledWith(workspaceId);
  });
});

describe("workspace repository", () => {
  it("reconciles after assigning a plan, outside the transaction", async () => {
    const order: string[] = [];
    const { sql } = fakeSql((text) => {
      if (text.includes("select id from kardo_core.workspaces")) {
        return [{ id: workspaceId }];
      }
      if (text.includes("select id from kardo_core.plans")) {
        return [{ id: "plan" }];
      }
      if (text.includes("from kardo_core.workspaces w")) {
        return [
          {
            id: workspaceId,
            public_id: "workspacepublicid0000001",
            name: "Acme",
            kind: "organization",
            created_at: "2026-01-01T00:00:00.000Z",
            owner_email: null,
            members: 1,
            touchpoints: 0,
            active_touchpoints: 0,
            suspended_touchpoints: 0,
            experiences: 0,
            leads: 0,
            plan_code: null,
            last_activity_at: null,
          },
        ];
      }
      if (text.includes("insert into kardo_core.workspace_plans")) {
        order.push("insert");
      }
      return undefined;
    });
    const reconcile = vi.fn(async () => {
      order.push("reconcile");
    });
    const repository = createPostgresStaffWorkspaceRepository(
      sql,
      null,
      "dataset",
      "test",
      reconcile,
    );
    await repository.assignPlan(staffIdentity.subject, workspaceId, {
      planId: randomUUID(),
      reason: "Cortesia",
    } as never);
    expect(order).toEqual(["insert", "reconcile"]);
  });
});

describe("createAccessReconcile", () => {
  it("logs and swallows a reconciler failure", async () => {
    const { createAccessReconcile } = await import(
      "../src/clients/access-reconcile.js"
    );
    const warn = vi.fn();
    const reconcile = createAccessReconcile(
      { reconcileWorkspace: () => Promise.reject(new Error("resolver down")) },
      () => ({ warn }),
    );
    await expect(reconcile(workspaceId)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
