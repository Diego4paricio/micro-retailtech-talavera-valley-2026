import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "../src/errors.js";
import {
  createPostgresAnalyticsRepository,
  inGroupTree,
} from "../src/repositories/analytics.js";
import { otherSubjectId, subjectId, workspaceId } from "./helpers.js";

// Security review 2026-10: the early Analytics Engine read starts only for
// someone already authorized for that workspace, never for a stranger who
// just knows its id.

const touchpoint = {
  id: "31f7a4dc-0bb7-450e-91c6-342045d779e9",
  public_id: "kardotesttouchpoint01",
  name: "Mesa 1",
  status: "active",
  group_id: null,
};

function fakeSql(): Sql {
  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("set_config")) return Promise.resolve([]);
    const member = values.includes(subjectId);
    return Promise.resolve([
      {
        role: member ? "owner" : null,
        touchpoints: member ? [touchpoint] : [],
        groups: [],
        leads: [],
        previous_leads: [],
        publications: [],
      },
    ]);
  }) as unknown as Sql;
  const sql = tx as unknown as Sql & {
    begin: (fn: (t: Sql) => Promise<unknown>) => Promise<unknown>;
  };
  sql.begin = (fn) => fn(tx);
  return sql;
}

describe("analytics: early read of Analytics Engine", () => {
  it("a stranger who knows the workspace id never triggers a Cloudflare query", async () => {
    const query = vi.fn(async () => []);
    const repository = createPostgresAnalyticsRepository(
      fakeSql(),
      { query },
      "kardo_taps",
      "test",
    );
    const owner = { subject: subjectId, email: "owner@kardo.test" };
    const stranger = { subject: otherSubjectId, email: "otro@kardo.test" };

    // The owner's first request reads Cloudflare (after authorizing) and
    // leaves the hint for later requests.
    await repository.getSummary(owner, workspaceId, {
      days: 7,
      timeZone: "UTC",
    });
    const afterOwner = query.mock.calls.length;
    expect(afterOwner).toBeGreaterThan(0);

    // The stranger is refused, and no early read started for them.
    await expect(
      repository.getSummary(stranger, workspaceId, {
        days: 7,
        timeZone: "UTC",
      }),
    ).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(query.mock.calls.length).toBe(afterOwner);
  });
});

describe("analytics: a group's numbers include its whole tree (ADR 021)", () => {
  const local = "5e6f7081-92a3-4b4c-8d5e-6f708192a3b4";
  const terraza = "7b8c9d0e-1f20-4a3b-8c4d-5e6f7a8b9c0d";

  it("counts a Touchpoint in a subgroup for every group above it", () => {
    const mesa = { group_id: terraza, group_path: [local, terraza] };
    expect(inGroupTree(mesa, terraza)).toBe(true);
    expect(inGroupTree(mesa, local)).toBe(true);
    expect(inGroupTree({ group_id: local, group_path: [local] }, terraza)).toBe(
      false,
    );
  });

  it("still matches a row without a path by its own group", () => {
    expect(inGroupTree({ group_id: terraza, group_path: null }, terraza)).toBe(
      true,
    );
    expect(inGroupTree({ group_id: null, group_path: null }, terraza)).toBe(
      false,
    );
  });
});
