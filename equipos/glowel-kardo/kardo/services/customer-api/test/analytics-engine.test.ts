import { describe, expect, it } from "vitest";
import {
  type AnalyticsEngineClient,
  AnalyticsEngineError,
  analyticsHourKey,
  createEngineSummaryCache,
  ENGINE_ID_BATCH,
  type EngineSummary,
  engineSummaryKey,
  fetchPreviousPeriodAggregates,
  fetchTapClickAggregates,
  sanitizePublicIds,
} from "../src/analytics-engine.js";

describe("sanitizePublicIds", () => {
  it("keeps only ids matching the Touchpoint public-id shape", () => {
    expect(
      sanitizePublicIds([
        "c2fc661f2bdf4d5092c3112db0bcc3ef",
        "abcdefghijklmnop",
      ]),
    ).toEqual(["c2fc661f2bdf4d5092c3112db0bcc3ef", "abcdefghijklmnop"]);
  });

  it.each([
    "short",
    "has spaces here abcdefgh",
    "quote'; drop table taps; --",
    "semicolon;injection1234567",
    "a".repeat(33),
  ])("drops an invalid or malicious id: %s", (candidate) => {
    expect(sanitizePublicIds([candidate])).toEqual([]);
  });
});

describe("fetchTapClickAggregates", () => {
  it("never interpolates an invalid publicId into the SQL sent to the client", async () => {
    const queries: string[] = [];
    const client: AnalyticsEngineClient = {
      query: async (sql) => {
        queries.push(sql);
        return [];
      },
    };

    await fetchTapClickAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: [
        "c2fc661f2bdf4d5092c3112db0bcc3ef",
        "'; DROP TABLE kardo_taps; --",
        "abcdefgh' OR '1'='1",
      ],
    });

    expect(queries.length).toBeGreaterThan(0);
    for (const sql of queries) {
      expect(sql).not.toContain("DROP TABLE");
      expect(sql).not.toContain("OR '1'='1");
      expect(sql).toContain("c2fc661f2bdf4d5092c3112db0bcc3ef");
    }
  });

  it("queries nothing and returns empty aggregates when every id is invalid", async () => {
    let called = false;
    const client: AnalyticsEngineClient = {
      query: async () => {
        called = true;
        return [];
      },
    };

    const result = await fetchTapClickAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ["short", "'; DROP TABLE kardo_taps; --"],
    });

    expect(called).toBe(false);
    expect(result.totals).toEqual({
      taps: 0,
      clicks: 0,
      channels: { nfc: 0, qr: 0, link: 0 },
      clickChannels: { nfc: 0, qr: 0, link: 0 },
    });
  });

  it("sums tap and click totals from the aggregated rows", async () => {
    const client: AnalyticsEngineClient = {
      query: async (sql) => {
        if (sql.includes("GROUP BY public_id")) {
          return [
            {
              public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
              event_type: "tap",
              channel: "qr",
              total: 5,
            },
            {
              public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
              event_type: "click",
              channel: "qr",
              total: 2,
            },
          ];
        }
        return [];
      },
    };

    const result = await fetchTapClickAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ["c2fc661f2bdf4d5092c3112db0bcc3ef"],
    });

    expect(result.totals.taps).toBe(5);
    expect(result.totals.clicks).toBe(2);
    expect(result.totals.channels.qr).toBe(5);
  });

  it("rejects an environment value outside the safe charset instead of interpolating it", async () => {
    const client: AnalyticsEngineClient = {
      query: async () => [],
    };
    await expect(
      fetchTapClickAggregates({
        client,
        dataset: "kardo_taps",
        environment: "test'; DROP TABLE kardo_taps; --",
        days: 7,
        publicIds: ["c2fc661f2bdf4d5092c3112db0bcc3ef"],
      }),
    ).rejects.toThrow(AnalyticsEngineError);
  });

  it("rejects an environment value containing a backslash (ClickHouse escape char)", async () => {
    const client: AnalyticsEngineClient = { query: async () => [] };
    await expect(
      fetchTapClickAggregates({
        client,
        dataset: "kardo_taps",
        environment: "test\\',(select 1)",
        days: 7,
        publicIds: ["c2fc661f2bdf4d5092c3112db0bcc3ef"],
      }),
    ).rejects.toThrow(AnalyticsEngineError);
  });
});

describe("fetchPreviousPeriodAggregates", () => {
  it("queries the shifted window and folds channels, reach and hours", async () => {
    const sent: string[] = [];
    const client: AnalyticsEngineClient = {
      query: async (sql) => {
        sent.push(sql);
        if (sql.includes("toStartOfInterval"))
          return [
            { hour: "2026-09-20 14:00:00", event_type: "tap", total: 3 },
            { hour: "2026-09-20 14:00:00", event_type: "click", total: 1 },
          ];
        return [
          {
            public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
            event_type: "tap",
            channel: "qr",
            total: 3,
          },
          {
            public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
            event_type: "click",
            channel: "qr",
            total: 1,
          },
        ];
      },
    };
    const result = await fetchPreviousPeriodAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ["c2fc661f2bdf4d5092c3112db0bcc3ef"],
    });
    expect(result.taps).toBe(3);
    expect(result.clicks).toBe(1);
    expect(result.channels).toEqual({ nfc: 0, qr: 3, link: 0 });
    expect([...result.tappedPublicIds]).toEqual([
      "c2fc661f2bdf4d5092c3112db0bcc3ef",
    ]);
    expect(result.periodHourly.get("2026-09-20T14:00:00.000Z")).toEqual({
      taps: 3,
      clicks: 1,
    });
    expect(sent).toHaveLength(2);
    for (const sql of sent) {
      expect(sql).toContain("INTERVAL '14' DAY");
      expect(sql).toContain("INTERVAL '7' DAY");
    }
  });

  it("returns zeros without querying when every publicId is invalid", async () => {
    let called = false;
    const client: AnalyticsEngineClient = {
      query: async () => {
        called = true;
        return [];
      },
    };
    const result = await fetchPreviousPeriodAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ["short"],
    });
    expect(called).toBe(false);
    expect(result.taps).toBe(0);
    expect(result.tappedPublicIds.size).toBe(0);
  });
});

describe("fetchTapClickAggregates revisions", () => {
  it("groups taps and clicks by (publicId, revision) from the breakdown query", async () => {
    const client: AnalyticsEngineClient = {
      query: async (sql) =>
        sql.includes("GROUP BY public_id")
          ? [
              {
                public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
                revision: 3,
                event_type: "tap",
                channel: "nfc",
                total: 4,
              },
              {
                public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
                revision: 3,
                event_type: "click",
                channel: "nfc",
                total: 1,
              },
              {
                public_id: "c2fc661f2bdf4d5092c3112db0bcc3ef",
                revision: "2",
                event_type: "tap",
                channel: "qr",
                total: 9,
              },
            ]
          : [],
    };
    const result = await fetchTapClickAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 30,
      publicIds: ["c2fc661f2bdf4d5092c3112db0bcc3ef"],
    });
    expect(result.revisions).toHaveLength(2);
    const revision3 = result.revisions.find((entry) => entry.revision === 3);
    expect(revision3).toMatchObject({ taps: 4, clicks: 1 });
    const revision2 = result.revisions.find((entry) => entry.revision === 2);
    expect(revision2).toMatchObject({ taps: 9, clicks: 0 });
    expect(result.totals).toEqual({
      taps: 13,
      clicks: 1,
      channels: { nfc: 4, qr: 9, link: 0 },
      clickChannels: { nfc: 1, qr: 0, link: 0 },
    });
  });

  it("runs two queries and derives the last 24 h from the hourly series", async () => {
    const sent: string[] = [];
    const now = new Date("2026-09-27T15:30:00Z");
    const client: AnalyticsEngineClient = {
      query: async (sql) => {
        sent.push(sql);
        if (!sql.includes("toStartOfInterval")) return [];
        return [
          // Analytics Engine returns DateTime without an offset, in UTC.
          {
            hour: "2026-09-27 14:00:00",
            event_type: "tap",
            channel: "qr",
            total: 3,
          },
          {
            hour: "2026-09-25 01:00:00",
            event_type: "tap",
            channel: "nfc",
            total: 5,
          },
          {
            hour: "2026-09-27 14:00:00",
            event_type: "click",
            channel: "qr",
            total: 1,
          },
        ];
      },
    };
    const result = await fetchTapClickAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ["c2fc661f2bdf4d5092c3112db0bcc3ef"],
      now,
    });
    expect(sent).toHaveLength(2);
    expect(result.periodHourly.get("2026-09-27T14:00:00.000Z")).toEqual({
      taps: 3,
      clicks: 1,
      channels: { nfc: 0, qr: 3, link: 0 },
    });
    expect(result.periodHourly.get("2026-09-25T01:00:00.000Z")?.taps).toBe(5);
    expect([...result.hourly]).toEqual([["2026-09-27T14:00:00.000Z", 3]]);
  });
});

describe("analyticsHourKey", () => {
  it("reads offset-less Analytics Engine DateTimes as UTC", () => {
    expect(analyticsHourKey("2026-09-25 01:00:00")).toBe(
      "2026-09-25T01:00:00.000Z",
    );
    expect(analyticsHourKey("2026-09-25T01:00:00Z")).toBe(
      "2026-09-25T01:00:00.000Z",
    );
  });

  it("rejects values that are not dates", () => {
    expect(analyticsHourKey("not a date")).toBeNull();
    expect(analyticsHourKey(42)).toBeNull();
    expect(analyticsHourKey(null)).toBeNull();
  });
});

describe("engine summary cache", () => {
  const summary: EngineSummary = {
    aggregates: {
      periodHourly: new Map(),
      hourly: new Map(),
      perTouchpoint: new Map(),
      revisions: [],
      totals: { taps: 1, clicks: 0, channels: { nfc: 1, qr: 0, link: 0 } },
    },
    previous: {
      taps: 0,
      clicks: 0,
      channels: { nfc: 0, qr: 0, link: 0 },
      tappedPublicIds: new Set(),
      periodHourly: new Map(),
    },
  };

  it("keys by the id set regardless of order or invalid ids", () => {
    const base = {
      dataset: "kardo_taps",
      environment: "test",
      days: 7 as const,
    };
    expect(
      engineSummaryKey({
        ...base,
        publicIds: ["bbbbbbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaaaaaa", "x'--"],
      }),
    ).toBe(
      engineSummaryKey({
        ...base,
        publicIds: ["aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbb"],
      }),
    );
    expect(
      engineSummaryKey({
        ...base,
        days: 30,
        publicIds: ["aaaaaaaaaaaaaaaaaaaa"],
      }),
    ).not.toBe(
      engineSummaryKey({ ...base, publicIds: ["aaaaaaaaaaaaaaaaaaaa"] }),
    );
  });

  it("shares one read within the TTL and reloads after it", async () => {
    let clock = 0;
    let loads = 0;
    const cache = createEngineSummaryCache({ ttlMs: 1_000, now: () => clock });
    const load = async () => {
      loads += 1;
      return summary;
    };
    await Promise.all([cache.get("k", load), cache.get("k", load)]);
    expect(loads).toBe(1);
    clock = 999;
    await cache.get("k", load);
    expect(loads).toBe(1);
    clock = 1_000;
    await cache.get("k", load);
    expect(loads).toBe(2);
  });

  it("never caches a failure", async () => {
    const cache = createEngineSummaryCache();
    await expect(
      cache.get("k", () => Promise.reject(new Error("timeout"))),
    ).rejects.toThrow("timeout");
    await expect(cache.get("k", async () => summary)).resolves.toBe(summary);
  });

  it("evicts the least recently used entry past the limit", async () => {
    let loads = 0;
    const cache = createEngineSummaryCache({ maxEntries: 2 });
    const load = async () => {
      loads += 1;
      return summary;
    };
    await cache.get("a", load);
    await cache.get("b", load);
    await cache.get("a", load); // refreshes "a"
    await cache.get("c", load); // evicts "b"
    expect(loads).toBe(3);
    await cache.get("a", load);
    expect(loads).toBe(3);
    await cache.get("b", load);
    expect(loads).toBe(4);
  });
});

describe("large workspaces are asked in batches", () => {
  // Analytics Engine answers 422 when the id list is too long (~280 ids).
  const ids = Array.from(
    { length: 450 },
    (_, index) => `touchpoint${String(index).padStart(10, "0")}`,
  );
  const hour = "2026-10-02 12:00:00";

  function recordingClient() {
    const lists: number[] = [];
    const client: AnalyticsEngineClient = {
      async query(sql) {
        const list = /IN \(([^)]*)\)/.exec(sql)?.[1] ?? "";
        const batch = list
          .split(",")
          .filter((item) => item.includes("touchpoint"));
        lists.push(batch.length);
        const first = batch[0]?.replaceAll("'", "") ?? "";
        // Every batch reports one tap in the same hour, from its first id.
        if (sql.includes("revision"))
          return [
            {
              public_id: first,
              revision: "1",
              event_type: "tap",
              channel: "qr",
              total: 1,
            },
          ];
        if (sql.includes("public_id"))
          return [
            { public_id: first, event_type: "tap", channel: "qr", total: 1 },
          ];
        if (sql.includes("blob3 AS channel"))
          return [{ hour, event_type: "tap", channel: "qr", total: 1 }];
        return [{ hour, event_type: "tap", total: 1 }];
      },
    };
    return { client, lists };
  }

  it("never sends more than the batch size, and adds the answers up", async () => {
    const { client, lists } = recordingClient();
    const current = await fetchTapClickAggregates({
      client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ids,
      now: new Date("2026-10-02T12:30:00.000Z"),
    });
    expect(Math.max(...lists)).toBeLessThanOrEqual(ENGINE_ID_BATCH);
    // Two queries, three batches each.
    expect(lists).toHaveLength(6);
    expect(current.totals.taps).toBe(3);
    expect(current.perTouchpoint.size).toBe(3);
    const [only] = [...current.periodHourly.values()];
    expect(current.periodHourly.size).toBe(1);
    expect(only?.taps).toBe(3);

    const before = recordingClient();
    const previous = await fetchPreviousPeriodAggregates({
      client: before.client,
      dataset: "kardo_taps",
      environment: "test",
      days: 7,
      publicIds: ids,
    });
    expect(Math.max(...before.lists)).toBeLessThanOrEqual(ENGINE_ID_BATCH);
    expect(previous.taps).toBe(3);
    expect(previous.tappedPublicIds.size).toBe(3);
    expect([...previous.periodHourly.values()][0]?.taps).toBe(3);
  });
});
