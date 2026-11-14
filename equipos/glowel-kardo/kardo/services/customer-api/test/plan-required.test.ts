import type { CustomerPermission } from "@kardo/domain";
import { customerPermissions } from "@kardo/domain";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import { PlanRequiredError, WorkspaceAccessError } from "../src/errors.js";
import {
  isPlanGated,
  requireMembershipWithPermission,
} from "../src/repositories/context.js";
import { createPostgresMemberRepository } from "../src/repositories/members.js";
import { createPostgresWorkspaceProfileRepository } from "../src/repositories/workspace-profile.js";
import { subjectId, workspaceId } from "./helpers.js";

// A tagged-template stand-in for postgres.js: the membership query returns
// `role`, the access query returns `state`; every query is recorded.
function fakeSql(role: string | null, state: string) {
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    queries.push(text);
    if (text.includes("workspace_memberships")) {
      return Promise.resolve(role ? [{ role }] : []);
    }
    if (text.includes("kardo_billing.workspace_access")) {
      return Promise.resolve([{ state }]);
    }
    return Promise.resolve([]);
  }) as unknown as Sql;
  return { sql, queries };
}

const identity = { subject: subjectId, email: "owner@kardo.test" };

describe("PLAN_REQUIRED at the single authorization point (ADR 020 §4)", () => {
  const writes: CustomerPermission[] = [
    "workspace.manage",
    "members.manage",
    "touchpoints.manage",
    "touchpoints.retire",
    "experiences.edit",
    "experiences.publish",
    "assets.manage",
    "experiences.custom_html",
  ];
  const open: CustomerPermission[] = [
    "leads.read",
    "leads.manage",
    "analytics.read",
    "ownership.transfer",
    "billing.read",
    "billing.manage",
  ];

  it("gates exactly the permissions that create or change content", () => {
    expect(writes.every(isPlanGated)).toBe(true);
    expect(open.some(isPlanGated)).toBe(false);
    // Every permission is classified: a new one must be added on purpose.
    expect([...writes, ...open].sort()).toEqual(
      [...customerPermissions].sort(),
    );
  });

  for (const state of ["limited", "paused"] as const) {
    it(`refuses writes when the organization is ${state}`, async () => {
      for (const permission of writes) {
        const { sql } = fakeSql("owner", state);
        const error = await requireMembershipWithPermission(
          sql,
          identity,
          workspaceId,
          permission,
        ).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(PlanRequiredError);
        expect((error as PlanRequiredError).accessState).toBe(state);
        expect((error as PlanRequiredError).statusCode).toBe(403);
      }
    });

    it(`keeps reading, exporting and billing open when ${state}`, async () => {
      for (const permission of open) {
        const { sql, queries } = fakeSql("owner", state);
        await expect(
          requireMembershipWithPermission(
            sql,
            identity,
            workspaceId,
            permission,
          ),
        ).resolves.toBe("owner");
        expect(queries.some((q) => q.includes("workspace_access"))).toBe(false);
      }
    });
  }

  for (const state of ["internal", "active", "trial", "legacy"]) {
    it(`lets a ${state} organization write`, async () => {
      const { sql } = fakeSql("owner", state);
      await expect(
        requireMembershipWithPermission(
          sql,
          identity,
          workspaceId,
          "touchpoints.manage",
        ),
      ).resolves.toBe("owner");
    });
  }

  it("finishing sign up works without a plan (it starts the trial)", async () => {
    const { sql } = fakeSql("owner", "limited");
    await expect(
      requireMembershipWithPermission(
        sql,
        identity,
        workspaceId,
        "workspace.manage",
        { allowWithoutPlan: true },
      ),
    ).resolves.toBe("owner");
  });

  it("checks the role before the plan: a viewer gets 403 access denied", async () => {
    const { sql, queries } = fakeSql("viewer", "limited");
    await expect(
      requireMembershipWithPermission(
        sql,
        identity,
        workspaceId,
        "touchpoints.manage",
      ),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(queries.some((q) => q.includes("workspace_access"))).toBe(false);
  });
});

/** `fakeSql` with `begin` (one fake transaction) and `json`, for the
 * repositories that open their own `withCustomerContext`. */
function fakeTransactional(
  role: string,
  state: string,
  answer: (text: string) => unknown[] | undefined,
) {
  const { sql, queries } = fakeSql(role, state);
  const tx = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      const rows = answer(text);
      if (rows) {
        queries.push(text);
        return Promise.resolve(rows);
      }
      return (sql as unknown as (...args: unknown[]) => unknown)(
        strings,
        ...values,
      );
    },
    { json: (value: unknown) => value },
  );
  const withBegin = Object.assign(tx, {
    begin: (action: (transaction: unknown) => Promise<unknown>) => action(tx),
  }) as unknown as Sql;
  return { sql: withBegin, queries };
}

describe("an organization without a plan yet (2026-10-03, finding 7)", () => {
  it("lists its pending invitations", async () => {
    const { sql, queries } = fakeTransactional("owner", "limited", (text) => {
      if (text.includes("select kind from kardo_core.workspaces"))
        return [{ kind: "organization" }];
      if (text.includes("from kardo_core.workspace_invitations")) return [];
      return undefined;
    });
    await expect(
      createPostgresMemberRepository(sql).listInvitations(
        identity,
        workspaceId,
      ),
    ).resolves.toEqual([]);
    expect(queries.some((q) => q.includes("workspace_access"))).toBe(false);
  });

  it("saves the business data of an organization that has no plan yet", async () => {
    const profile = { industry: "belleza" as const, phone: "33 1234 5678" };
    const { sql, queries } = fakeTransactional("owner", "limited", (text) =>
      text.includes("update kardo_core.workspaces") ? [{ profile }] : undefined,
    );
    await expect(
      createPostgresWorkspaceProfileRepository(sql).updateProfile(
        identity,
        workspaceId,
        profile,
      ),
    ).resolves.toEqual(profile);
    expect(queries.some((q) => q.includes("workspace_access"))).toBe(false);
    expect(
      queries.some((q) => q.includes("update kardo_core.workspaces")),
    ).toBe(true);
  });
});
