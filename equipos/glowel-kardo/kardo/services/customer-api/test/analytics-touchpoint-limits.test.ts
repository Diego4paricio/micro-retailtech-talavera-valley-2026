import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { describe, expect, it } from "vitest";
import type { AnalyticsEngineRow } from "../src/analytics-engine.js";
import { createPostgresAnalyticsRepository } from "../src/repositories/analytics.js";
import { subjectId, workspaceId } from "./helpers.js";

/**
 * A9-23, A9-24, A9-26: the repository's own ordering, cap and grouping
 * rules, exercised through `createPostgresAnalyticsRepository` with a fake
 * Postgres client (mirrors `analytics-early-read.test.ts`) and a fake
 * Analytics Engine client that answers the «breakdown» query with canned
 * per-Touchpoint tap totals (everything else — periodHourly, the previous
 * period — answers empty, which is fine: these tests only care about the
 * per-Touchpoint ordering and the group tree).
 */

type FakeTouchpoint = {
  id: string;
  public_id: string;
  name: string;
  status: "assigned" | "active" | "paused" | "retired";
  group_id: string | null;
  kind: "nfc" | "qr" | "other" | "link";
};

type FakeGroup = { id: string; name: string; parent_id: string | null };

function fakeSql(touchpoints: FakeTouchpoint[], groups: FakeGroup[] = []): Sql {
  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("set_config")) return Promise.resolve([]);
    const member = values.includes(subjectId);
    return Promise.resolve([
      {
        role: member ? "owner" : null,
        touchpoints: member ? touchpoints : [],
        groups: member ? groups : [],
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

/** `tapsByPublicId` feeds the «breakdown» query only; every other Analytics
 * Engine query used by the summary answers empty rows. Large id sets go out
 * in batches (`ENGINE_ID_BATCH`), so each answer is filtered to the ids that
 * batch's query actually asked for — otherwise a batched entry would be
 * double (or 6×) counted, once per batch. */
function fakeEngineClient(tapsByPublicId: Record<string, number>) {
  return {
    query: async (sql: string): Promise<AnalyticsEngineRow[]> => {
      if (!sql.includes("GROUP BY public_id, revision, event_type, channel"))
        return [];
      return Object.entries(tapsByPublicId)
        .filter(([publicId]) => sql.includes(`'${publicId}'`))
        .map(([publicId, taps]) => ({
          public_id: publicId,
          revision: 1,
          event_type: "tap",
          channel: "qr",
          total: taps,
        }));
    },
  };
}

function touchpoint(
  index: number,
  overrides: Partial<FakeTouchpoint> = {},
): FakeTouchpoint {
  const padded = String(index).padStart(4, "0");
  return {
    id: randomUUID(),
    public_id: `tp${padded}aaaaaaaaaa`,
    name: `Mesa ${index}`,
    status: "active",
    group_id: null,
    kind: "qr",
    ...overrides,
  };
}

describe("analytics repository: A9-23 the touchpoints list is capped at 1000, ordered by taps", () => {
  it("sorts by taps desc before the cut and reports how many were left out", async () => {
    const total = 1001;
    const touchpoints = Array.from({ length: total }, (_, i) =>
      touchpoint(i, { public_id: `tp${String(i).padStart(4, "0")}aaaaaaaaaa` }),
    );
    // touchpoint 0 gets the most taps, touchpoint(total-1) the fewest (but
    // never zero): taps = total - index.
    const tapsByPublicId: Record<string, number> = {};
    touchpoints.forEach((row, i) => {
      tapsByPublicId[row.public_id] = total - i;
    });

    const repository = createPostgresAnalyticsRepository(
      fakeSql(touchpoints),
      fakeEngineClient(tapsByPublicId),
      "kardo_taps",
      "test",
    );

    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );

    expect(summary.touchpoints).toHaveLength(1000);
    expect(summary.touchpointsOmitted).toBe(1);
    // Highest-taps touchpoint first; the list stays sorted all the way down.
    expect(summary.touchpoints[0]?.taps).toBe(1001);
    const taps = summary.touchpoints.map((row) => row.taps);
    for (let i = 1; i < taps.length; i += 1) {
      expect((taps[i] ?? 0) <= (taps[i - 1] ?? 0)).toBe(true);
    }
    // The dropped one had the single lowest count (1); the list's own
    // lowest is the next one up (2) — never zero, so a reader can tell the
    // cut happened without mistaking the tail for "no accesses".
    expect(taps[taps.length - 1]).toBe(2);
  });

  it("breaks ties by name, not by creation order", async () => {
    const touchpoints = [
      touchpoint(1, { public_id: "tpbetaaaaaaaaaaa", name: "Beta" }),
      touchpoint(2, { public_id: "tpalfaaaaaaaaaaa", name: "Alfa" }),
      touchpoint(3, { public_id: "tpgamaaaaaaaaaaa", name: "Gama" }),
    ];
    const tapsByPublicId = {
      tpbetaaaaaaaaaaa: 5,
      tpalfaaaaaaaaaaa: 5,
      tpgamaaaaaaaaaaa: 5,
    };
    const repository = createPostgresAnalyticsRepository(
      fakeSql(touchpoints),
      fakeEngineClient(tapsByPublicId),
      "kardo_taps",
      "test",
    );
    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );
    expect(summary.touchpoints.map((row) => row.name)).toEqual([
      "Alfa",
      "Beta",
      "Gama",
    ]);
    expect(summary.touchpointsOmitted).toBe(0);
  });

  it("tags each row with its kind, including links", async () => {
    const touchpoints = [
      touchpoint(1, { public_id: "tpqrcodeaaaaaaaaa", kind: "qr" }),
      touchpoint(2, { public_id: "tplinkaaaaaaaaaaa", kind: "link" }),
    ];
    const repository = createPostgresAnalyticsRepository(
      fakeSql(touchpoints),
      fakeEngineClient({}),
      "kardo_taps",
      "test",
    );
    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );
    const byPublicId = new Map(
      touchpoints.map((row, i) => [row.id, row.kind] as const),
    );
    for (const row of summary.touchpoints) {
      expect(row.kind).toBe(byPublicId.get(row.touchpointId));
    }
  });
});

describe("analytics repository: A9-24 «QR y etiquetas activos» never counts Links", () => {
  it("excludes links from activeTouchpoints and the active/total KPI", async () => {
    const touchpoints = [
      touchpoint(1, {
        public_id: "tpqractiveaaaaaaa",
        kind: "qr",
        status: "active",
      }),
      touchpoint(2, {
        public_id: "tpnfcactiveaaaaaa",
        kind: "nfc",
        status: "active",
      }),
      touchpoint(3, {
        public_id: "tplinkactiveaaaaa",
        kind: "link",
        status: "active",
      }),
      touchpoint(4, {
        public_id: "tplinkpausedaaaaa",
        kind: "link",
        status: "paused",
      }),
    ];
    const repository = createPostgresAnalyticsRepository(
      fakeSql(touchpoints),
      fakeEngineClient({}),
      "kardo_taps",
      "test",
    );
    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );
    // 2 physical active Touchpoints; the 2 Links (active and paused) count
    // toward neither active nor total.
    expect(summary.activeTouchpoints).toBe(2);
    expect(summary.kpis?.touchpoints).toEqual({ active: 2, total: 2 });
    // But the full breakdown list still carries every Link, as «Por QR,
    // etiqueta o link» (A9-24).
    expect(summary.touchpoints).toHaveLength(4);
  });
});

describe("analytics repository: A9-26 every group is returned, including zeros", () => {
  it("keeps a visit-free group, with its depth and the whole subtree summed up", async () => {
    const salon = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      name: "Salón",
      parent_id: null,
    };
    const terraza = {
      id: "aaaaaaaa-0000-0000-0000-000000000002",
      name: "Terraza",
      parent_id: salon.id,
    };
    const bodega = {
      id: "aaaaaaaa-0000-0000-0000-000000000003",
      name: "Bodega",
      parent_id: null,
    };
    const touchpoints = [
      touchpoint(1, {
        public_id: "tpsalonmesaaaaaaa",
        group_id: salon.id,
      }),
      touchpoint(2, {
        public_id: "tpterrazamesaaaaa",
        group_id: terraza.id,
      }),
    ];
    // `group_path` is what `inGroupTree` reads; the fake Postgres row needs
    // it set the way the real left join would (root first).
    const withPaths = touchpoints.map((row) => ({
      ...row,
      group_path:
        row.group_id === terraza.id ? [salon.id, terraza.id] : [salon.id],
    }));
    const tapsByPublicId = {
      tpsalonmesaaaaaaa: 3,
      tpterrazamesaaaaa: 7,
    };
    const repository = createPostgresAnalyticsRepository(
      fakeSql(withPaths, [salon, terraza, bodega]),
      fakeEngineClient(tapsByPublicId),
      "kardo_taps",
      "test",
    );
    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );
    const byName = new Map(
      (summary.groups ?? []).map((group) => [group.name, group]),
    );
    // Salón: its own 3 taps plus Terraza's 7 (groups nest, ADR 021).
    expect(byName.get("Salón")).toMatchObject({ depth: 0, taps: 10 });
    expect(byName.get("Terraza")).toMatchObject({ depth: 1, taps: 7 });
    // Bodega has no Touchpoints at all: it stays in the list at zero
    // instead of being filtered out (that used to force the panel to
    // recompute the whole tree itself).
    expect(byName.get("Bodega")).toMatchObject({
      depth: 0,
      taps: 0,
      clicks: 0,
      leads: 0,
    });
    expect(summary.groups).toHaveLength(3);
  });

  it("caps the list at 200 groups", async () => {
    const groups = Array.from({ length: 201 }, (_, i) => ({
      id: `bbbbbbbb-0000-0000-0000-${String(i).padStart(12, "0")}`,
      name: `Grupo ${String(i).padStart(3, "0")}`,
      parent_id: null,
    }));
    const repository = createPostgresAnalyticsRepository(
      fakeSql([], groups),
      fakeEngineClient({}),
      "kardo_taps",
      "test",
    );
    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );
    expect(summary.groups).toHaveLength(200);
  });

  it("never loops forever on a corrupted, cyclical parent chain", async () => {
    const looped: FakeGroup[] = [
      {
        id: "cccccccc-0000-0000-0000-000000000001",
        name: "A",
        parent_id: "cccccccc-0000-0000-0000-000000000002",
      },
      {
        id: "cccccccc-0000-0000-0000-000000000002",
        name: "B",
        parent_id: "cccccccc-0000-0000-0000-000000000001",
      },
    ];
    const repository = createPostgresAnalyticsRepository(
      fakeSql([], looped),
      fakeEngineClient({}),
      "kardo_taps",
      "test",
    );
    const summary = await repository.getSummary(
      { subject: subjectId, email: "owner@kardo.test" },
      workspaceId,
      { days: 7, timeZone: "UTC" },
    );
    // Neither A nor B has a null parent, so the walk from the root never
    // reaches them — it returns instead of spinning forever.
    expect(summary.groups).toEqual([]);
  });
});
