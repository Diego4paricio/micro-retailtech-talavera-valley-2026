/**
 * Client for the Cloudflare Workers Analytics Engine SQL API
 * (`POST /accounts/{id}/analytics_engine/sql`, body = raw SQL text — this
 * endpoint has no bind-parameter support). The Resolver writes one data
 * point per Tap/click/lead event with:
 *
 *   index1 = Touchpoint publicId
 *   blob1  = revision, blob2 = event type ('tap'|'click'|'lead')
 *   blob3  = channel ('nfc'|'qr'|'link'), blob4 = environment
 *   double1 = 1
 *
 * so every query here sums `_sample_interval * double1` (the standard
 * Analytics Engine pattern for an accurate count under sampling) and filters
 * on those columns.
 *
 * Because the SQL API takes a literal query string, every value interpolated
 * into it is a potential injection point:
 *  - `publicId`s are validated against the Touchpoint public-id shape before
 *    being embedded, and any id that does not match is dropped rather than
 *    sent.
 *  - The configured `environment` is validated against a closed
 *    `[a-z0-9_-]` charset and the query is refused outright otherwise —
 *    quote-doubling alone (`'` → `''`) is the right escape for standard SQL
 *    string literals, but this endpoint's dialect is ClickHouse's, which
 *    also treats a backslash as an escape character inside a string literal
 *    (unlike standard SQL); restricting the charset sidesteps that
 *    entirely instead of trying to escape it.
 * Both are the only values ever spliced into these query strings; everything
 * else (the dataset name, `days`) is similarly whitelisted/validated below.
 */

export type AnalyticsEngineRow = Record<string, string | number | null>;

export type AnalyticsEngineClient = {
  query(sql: string): Promise<AnalyticsEngineRow[]>;
};

export class AnalyticsEngineError extends Error {}

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;
const DATASET_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;
const ENVIRONMENT_PATTERN = /^[a-z0-9_-]{1,32}$/;

export const analyticsDaysWhitelist = [7, 30, 90] as const;
export type AnalyticsDays = (typeof analyticsDaysWhitelist)[number];

export function isAnalyticsDays(value: number): value is AnalyticsDays {
  return (analyticsDaysWhitelist as readonly number[]).includes(value);
}

/** Filters to only the publicIds that match the Touchpoint public-id shape,
 * dropping anything else instead of ever interpolating it into SQL. */
export function sanitizePublicIds(publicIds: readonly string[]): string[] {
  return publicIds.filter((id) => PUBLIC_ID_PATTERN.test(id));
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlIdList(publicIds: readonly string[]): string {
  return publicIds.map(sqlStringLiteral).join(",");
}

/**
 * Analytics Engine rejects (422) a query whose `IN (...)` list is too long —
 * around 280 Touchpoint ids. Large workspaces are asked in batches of this
 * many; every fold below sums by key, so concatenated rows add up the same.
 */
export const ENGINE_ID_BATCH = 200;

async function queryInBatches(
  client: AnalyticsEngineClient,
  publicIds: readonly string[],
  build: (idList: string) => string,
): Promise<AnalyticsEngineRow[]> {
  const rows: AnalyticsEngineRow[] = [];
  for (let start = 0; start < publicIds.length; start += ENGINE_ID_BATCH) {
    const batch = publicIds.slice(start, start + ENGINE_ID_BATCH);
    rows.push(...(await client.query(build(sqlIdList(batch)))));
  }
  return rows;
}

function assertDatasetName(dataset: string): string {
  if (!DATASET_NAME_PATTERN.test(dataset)) {
    throw new AnalyticsEngineError(
      "Configured analytics dataset name is invalid.",
    );
  }
  return dataset;
}

/** Rejects the configured environment outright unless it is a closed
 * `[a-z0-9_-]` charset (see module doc), then returns it as a quoted SQL
 * string literal. */
function assertSafeEnvironmentLiteral(environment: string): string {
  if (!ENVIRONMENT_PATTERN.test(environment)) {
    throw new AnalyticsEngineError(
      "Configured analytics environment is invalid.",
    );
  }
  return sqlStringLiteral(environment);
}

export function createCloudflareAnalyticsEngineClient(input: {
  accountId: string;
  apiToken: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): AnalyticsEngineClient {
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = input.timeoutMs ?? 5_000;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/analytics_engine/sql`;
  return {
    async query(sql) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.apiToken}`,
            "content-type": "text/plain",
          },
          body: sql,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new AnalyticsEngineError(
            `Analytics Engine query failed with status ${response.status}.`,
          );
        }
        const payload = (await response.json()) as {
          data?: AnalyticsEngineRow[];
        };
        return payload.data ?? [];
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type ChannelCounts = { nfc: number; qr: number; link: number };

export function emptyChannelCounts(): ChannelCounts {
  return { nfc: 0, qr: 0, link: 0 };
}

function addToChannel(
  counts: ChannelCounts,
  channel: string,
  amount: number,
): void {
  if (channel === "nfc" || channel === "qr" || channel === "link") {
    counts[channel] += amount;
  }
}

export type HourAggregate = {
  taps: number;
  clicks: number;
  channels: ChannelCounts;
};

export type TouchpointAggregate = {
  taps: number;
  clicks: number;
  channels: ChannelCounts;
};

export type RevisionTotal = {
  publicId: string;
  revision: number;
  taps: number;
  clicks: number;
};

export type TapClickAggregates = {
  /** Every UTC hour across the full `days` window, keyed by that hour's ISO
   * start (`2026-09-25T01:00:00.000Z`) — the repository layer re-buckets these
   * into local-timezone calendar days (`daily`) and a local weekday×hour
   * matrix (`weekdayHour`), since Analytics Engine itself only aggregates in
   * UTC. */
  periodHourly: Map<string, HourAggregate>;
  /** Last 24 hours only, one UTC bucket per hour (same ISO keys), taps only —
   * matches the contract's `hourly` field, whose semantics stay plain UTC
   * regardless of the requested time zone. */
  hourly: Map<string, number>;
  /** Keyed by Touchpoint publicId. */
  perTouchpoint: Map<string, TouchpointAggregate>;
  /** Taps/clicks per `(Touchpoint publicId, publication revision)` — the join
   * key the repository uses to resolve each aggregate to the Experience that
   * was actually live for that revision. */
  revisions: RevisionTotal[];
  totals: {
    taps: number;
    clicks: number;
    channels: ChannelCounts;
    /** Clicks by the channel the visit came from. */
    clickChannels: ChannelCounts;
  };
};

function emptyAggregates(): TapClickAggregates {
  return {
    periodHourly: new Map(),
    hourly: new Map(),
    perTouchpoint: new Map(),
    revisions: [],
    totals: {
      taps: 0,
      clicks: 0,
      channels: emptyChannelCounts(),
      clickChannels: emptyChannelCounts(),
    },
  };
}

function toCount(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

const CLICKHOUSE_DATETIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/;

/**
 * Analytics Engine returns `DateTime` columns as `YYYY-MM-DD HH:MM:SS` in UTC,
 * without an offset. `new Date()` would read that string as the *server's*
 * local time (shifting every bucket on a non-UTC host), so it is normalized
 * here to an explicit UTC ISO key. Returns null for anything unparseable.
 */
export function analyticsHourKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = CLICKHOUSE_DATETIME.exec(value);
  const parsed = new Date(match ? `${match[1]}T${match[2]}Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function startOfUtcHour(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
  );
}

/**
 * Runs the Analytics Engine queries the current-period summary needs — two,
 * in parallel — and folds the rows into per-hour (for the full period and the
 * last 24 h), per-Touchpoint and per-revision aggregates. Returns empty
 * aggregates (never throws) when there are no valid publicIds to query, so
 * callers can treat "nothing to query" and "queried and got nothing" the same
 * way; a genuine client/network failure is left to the caller, which should
 * treat it as `source: "unavailable"`.
 */
export async function fetchTapClickAggregates(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
  publicIds: readonly string[];
  now?: Date;
}): Promise<TapClickAggregates> {
  const safeIds = sanitizePublicIds(input.publicIds);
  if (safeIds.length === 0) return emptyAggregates();

  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);

  // One row per (Touchpoint, revision, event, channel): enough to derive the
  // per-Touchpoint totals, the channel split and the per-Experience breakdown.
  const breakdownSql = (idList: string) => `
    SELECT index1 AS public_id, blob1 AS revision, blob2 AS event_type, blob3 AS channel,
           SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND index1 IN (${idList})
      AND blob2 IN ('tap', 'click')
      AND timestamp > NOW() - INTERVAL '${input.days}' DAY
    GROUP BY public_id, revision, event_type, channel
  `;
  const periodHourlySql = (idList: string) => `
    SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob2 AS event_type, blob3 AS channel,
           SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND index1 IN (${idList})
      AND blob2 IN ('tap', 'click')
      AND timestamp > NOW() - INTERVAL '${input.days}' DAY
    GROUP BY hour, event_type, channel
    ORDER BY hour ASC
  `;

  const [breakdownRows, periodHourlyRows] = await Promise.all([
    queryInBatches(input.client, safeIds, breakdownSql),
    queryInBatches(input.client, safeIds, periodHourlySql),
  ]);

  const aggregates = emptyAggregates();
  const revisions = new Map<string, RevisionTotal>();

  for (const row of breakdownRows) {
    const publicId = String(row.public_id ?? "");
    const eventType = String(row.event_type ?? "");
    const channel = String(row.channel ?? "");
    const total = toCount(row.total);
    if (!publicId || total === 0) continue;
    const existing = aggregates.perTouchpoint.get(publicId) ?? {
      taps: 0,
      clicks: 0,
      channels: emptyChannelCounts(),
    };
    const revision = Number(row.revision ?? 0);
    const hasRevision = Number.isInteger(revision) && revision > 0;
    const revisionKey = `${publicId}:${revision}`;
    const revisionTotal = hasRevision
      ? (revisions.get(revisionKey) ?? {
          publicId,
          revision,
          taps: 0,
          clicks: 0,
        })
      : null;
    if (eventType === "tap") {
      existing.taps += total;
      addToChannel(existing.channels, channel, total);
      aggregates.totals.taps += total;
      addToChannel(aggregates.totals.channels, channel, total);
      if (revisionTotal) revisionTotal.taps += total;
    } else if (eventType === "click") {
      existing.clicks += total;
      aggregates.totals.clicks += total;
      addToChannel(aggregates.totals.clickChannels, channel, total);
      if (revisionTotal) revisionTotal.clicks += total;
    }
    aggregates.perTouchpoint.set(publicId, existing);
    if (revisionTotal) revisions.set(revisionKey, revisionTotal);
  }
  aggregates.revisions = [...revisions.values()];

  const lastDayStart = startOfUtcHour(input.now ?? new Date()) - 23 * 3_600_000;
  for (const row of periodHourlyRows) {
    const hour = analyticsHourKey(row.hour);
    const eventType = String(row.event_type ?? "");
    const channel = String(row.channel ?? "");
    const total = toCount(row.total);
    if (!hour || total === 0) continue;
    const existing = aggregates.periodHourly.get(hour) ?? {
      taps: 0,
      clicks: 0,
      channels: emptyChannelCounts(),
    };
    if (eventType === "tap") {
      existing.taps += total;
      addToChannel(existing.channels, channel, total);
      if (Date.parse(hour) >= lastDayStart) {
        aggregates.hourly.set(hour, (aggregates.hourly.get(hour) ?? 0) + total);
      }
    } else if (eventType === "click") {
      existing.clicks += total;
    }
    aggregates.periodHourly.set(hour, existing);
  }

  return aggregates;
}

export type PreviousPeriodAggregates = {
  taps: number;
  clicks: number;
  channels: ChannelCounts;
  /** Touchpoint publicIds with at least one tap in the previous period. */
  tappedPublicIds: Set<string>;
  /** Taps/clicks per UTC hour (ISO keys), to rebuild the previous days. */
  periodHourly: Map<string, { taps: number; clicks: number }>;
};

/**
 * The period immediately preceding the current one (same length):
 * `(NOW() - 2*days, NOW() - days]`. Two queries in parallel — per Touchpoint
 * and channel, and per UTC hour — so the summary can compare every
 * indicator (channels, reach, peak hour, the daily series) and not only the
 * totals. Leads for that window come from Postgres, independently.
 */
export async function fetchPreviousPeriodAggregates(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
  publicIds: readonly string[];
}): Promise<PreviousPeriodAggregates> {
  const empty: PreviousPeriodAggregates = {
    taps: 0,
    clicks: 0,
    channels: emptyChannelCounts(),
    tappedPublicIds: new Set(),
    periodHourly: new Map(),
  };
  const safeIds = sanitizePublicIds(input.publicIds);
  if (safeIds.length === 0) return empty;

  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);
  const window = `
      AND timestamp > NOW() - INTERVAL '${input.days * 2}' DAY
      AND timestamp <= NOW() - INTERVAL '${input.days}' DAY`;

  const breakdownSql = (idList: string) => `
    SELECT index1 AS public_id, blob2 AS event_type, blob3 AS channel,
           SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND index1 IN (${idList})
      AND blob2 IN ('tap', 'click')${window}
    GROUP BY public_id, event_type, channel
  `;
  const hourlySql = (idList: string) => `
    SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob2 AS event_type,
           SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND index1 IN (${idList})
      AND blob2 IN ('tap', 'click')${window}
    GROUP BY hour, event_type
    ORDER BY hour ASC
  `;
  const [breakdownRows, hourlyRows] = await Promise.all([
    queryInBatches(input.client, safeIds, breakdownSql),
    queryInBatches(input.client, safeIds, hourlySql),
  ]);

  const result = empty;
  for (const row of breakdownRows) {
    const total = toCount(row.total);
    if (total === 0) continue;
    const eventType = String(row.event_type ?? "");
    if (eventType === "tap") {
      result.taps += total;
      addToChannel(result.channels, String(row.channel ?? ""), total);
      const publicId = String(row.public_id ?? "");
      if (publicId) result.tappedPublicIds.add(publicId);
    } else if (eventType === "click") {
      result.clicks += total;
    }
  }
  for (const row of hourlyRows) {
    const hour = analyticsHourKey(row.hour);
    const total = toCount(row.total);
    if (!hour || total === 0) continue;
    const bucket = result.periodHourly.get(hour) ?? { taps: 0, clicks: 0 };
    if (row.event_type === "tap") bucket.taps += total;
    else if (row.event_type === "click") bucket.clicks += total;
    result.periodHourly.set(hour, bucket);
  }
  return result;
}

export type EngineSummary = {
  aggregates: TapClickAggregates;
  previous: PreviousPeriodAggregates;
};

/**
 * Short-lived, in-process memo of Analytics Engine answers. Engine data lands
 * with a delay of its own, so reusing an answer for a few seconds changes
 * nothing for the customer while making repeated reads (switching a filter
 * back, a second tab, a refetch after navigation) skip the HTTP round trips.
 * Keys are derived from the already-authorized Touchpoint ids, so an entry can
 * only ever be returned to a caller whose membership check passed. Concurrent
 * callers share one in-flight request; failures are never cached.
 */
export function createEngineSummaryCache(options?: {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}) {
  const ttlMs = options?.ttlMs ?? 30_000;
  const maxEntries = options?.maxEntries ?? 200;
  const now = options?.now ?? Date.now;
  const entries = new Map<
    string,
    { at: number; value: Promise<EngineSummary> }
  >();

  return {
    get(
      key: string,
      load: () => Promise<EngineSummary>,
    ): Promise<EngineSummary> {
      const current = now();
      const hit = entries.get(key);
      if (hit && current - hit.at < ttlMs) {
        // Refresh recency for the LRU order.
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
      }
      const value = load();
      entries.set(key, { at: current, value });
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key);
      });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return value;
    },
  };
}

export type EngineSummaryCache = ReturnType<typeof createEngineSummaryCache>;

/** Stable cache key for one engine read: the id set is order-insensitive. */
export function engineSummaryKey(input: {
  dataset: string;
  environment: string;
  days: AnalyticsDays;
  publicIds: readonly string[];
}): string {
  const ids = [...new Set(sanitizePublicIds(input.publicIds))].sort();
  return `${input.dataset}|${input.environment}|${input.days}|${ids.join(",")}`;
}

/** Current- and previous-period aggregates, fetched together (four
 * Analytics Engine queries in parallel) and memoized in `cache`. */
export function fetchEngineSummary(input: {
  client: AnalyticsEngineClient;
  cache: EngineSummaryCache;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
  publicIds: readonly string[];
}): Promise<EngineSummary> {
  return input.cache.get(engineSummaryKey(input), async () => {
    const [aggregates, previous] = await Promise.all([
      fetchTapClickAggregates(input),
      fetchPreviousPeriodAggregates(input),
    ]);
    return { aggregates, previous };
  });
}

/** «Pruébalo» (relevo 36): when the first visit through one channel arrived. */
export type FirstVisitFinder = (input: {
  publicId: string;
  channel: "nfc" | "qr" | "link";
  /** Only visits after this moment count. */
  since: Date;
}) => Promise<string | null>;

const CHANNELS = new Set(["nfc", "qr", "link"]);
/** Analytics Engine keeps 3 months; never ask beyond that. */
const MAX_FIRST_VISIT_MINUTES = 89 * 24 * 60;

/**
 * The first «tap» of one Touchpoint through one channel since a moment, or
 * null when there is none yet. Every spliced value is checked first: the
 * public id against its shape, the channel against a closed list and the
 * window as a whole number of minutes.
 */
export async function fetchFirstVisit(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  publicId: string;
  channel: "nfc" | "qr" | "link";
  since: Date;
  now?: Date;
}): Promise<string | null> {
  const [publicId] = sanitizePublicIds([input.publicId]);
  if (!publicId || !CHANNELS.has(input.channel)) return null;
  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);
  const now = input.now ?? new Date();
  const minutes = Math.min(
    MAX_FIRST_VISIT_MINUTES,
    Math.max(1, Math.ceil((now.getTime() - input.since.getTime()) / 60_000)),
  );
  const rows = await input.client.query(`
    SELECT MIN(timestamp) AS first, SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND index1 = ${sqlStringLiteral(publicId)}
      AND blob2 = 'tap'
      AND blob3 = ${sqlStringLiteral(input.channel)}
      AND timestamp > NOW() - INTERVAL '${minutes}' MINUTE
  `);
  const row = rows[0];
  if (!row || !(Number(row.total) > 0)) return null;
  return analyticsTimestamp(row.first) ?? now.toISOString();
}

/** Analytics Engine answers "2026-10-07 18:41:05" in UTC. */
function analyticsTimestamp(value: string | number | null | undefined) {
  if (typeof value !== "string" || !value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
