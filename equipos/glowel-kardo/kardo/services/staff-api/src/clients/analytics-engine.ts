/**
 * Client for the Cloudflare Workers Analytics Engine SQL API
 * (`POST /accounts/{id}/analytics_engine/sql`, body = raw SQL text — this
 * endpoint has no bind-parameter support). The Resolver writes one data
 * point per tap/click/lead event with:
 *
 *   index1 = Touchpoint publicId
 *   blob1  = revision, blob2 = event type ('tap'|'click'|'lead')
 *   blob3  = channel ('nfc'|'qr'|'link'), blob4 = environment
 *   double1 = 1
 *
 * so every query here sums `_sample_interval * double1` (the standard
 * Analytics Engine pattern for an accurate count under sampling).
 *
 * Kardo Operations is platform-wide: unlike the Customer API (which always
 * scopes to one workspace's known Touchpoint ids), most queries here need no
 * `index1 IN (...)` filter at all — only `blob4 = <environment>` — which
 * keeps them both simpler and inherently bounded (a handful of
 * event-type/channel/day groups, never proportional to the number of
 * Touchpoints). The one exception (`fetchTopTappedPublicIds`, used to find
 * which workspaces to show in the metrics overview) is bounded with an
 * explicit `ORDER BY ... LIMIT`.
 *
 * Because the SQL API takes a literal query string, every value interpolated
 * into it is a potential injection point:
 *  - `publicId`s are validated against the Touchpoint public-id shape before
 *    being embedded, and any id that does not match is dropped rather than
 *    sent.
 *  - The configured `environment` is validated against a closed
 *    `[a-z0-9_-]` charset and the query is refused outright otherwise —
 *    quote-doubling alone is the right escape for standard SQL string
 *    literals, but this endpoint's dialect is ClickHouse's, which also
 *    treats a backslash as an escape character inside a string literal
 *    (unlike standard SQL); restricting the charset sidesteps that entirely.
 *  - `days` is always one of the closed `analyticsDaysWhitelist` values.
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

function toCount(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export type PlatformTapSummary = {
  total: number;
  clicks: number;
  byChannel: ChannelCounts;
  /** Taps by channel, keyed by UTC calendar day (`YYYY-MM-DD`), oldest day
   * may be absent if it had no traffic — callers fill the gaps. */
  daily: Map<string, ChannelCounts>;
};

/** Platform-wide tap/click totals and per-day channel breakdown for the
 * period, with no Touchpoint-id filter at all (see module doc). Throws
 * `AnalyticsEngineError` on a query/network failure; callers should catch
 * this and fall back to `taps: null` rather than fail the whole request. */
export async function fetchPlatformTapSummary(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
}): Promise<PlatformTapSummary> {
  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);

  const totalsSql = `
    SELECT blob2 AS event_type, blob3 AS channel,
           SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND timestamp > NOW() - INTERVAL '${input.days}' DAY
    GROUP BY event_type, channel
  `;
  const dailySql = `
    SELECT toDate(timestamp) AS day, blob3 AS channel,
           SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND blob2 = 'tap'
      AND timestamp > NOW() - INTERVAL '${input.days}' DAY
    GROUP BY day, channel
    ORDER BY day ASC
  `;

  const [totalsRows, dailyRows] = await Promise.all([
    input.client.query(totalsSql),
    input.client.query(dailySql),
  ]);

  const byChannel = emptyChannelCounts();
  let total = 0;
  let clicks = 0;
  for (const row of totalsRows) {
    const eventType = String(row.event_type ?? "");
    const channel = String(row.channel ?? "");
    const amount = toCount(row.total);
    if (amount === 0) continue;
    if (eventType === "tap") {
      total += amount;
      addToChannel(byChannel, channel, amount);
    } else if (eventType === "click") {
      clicks += amount;
    }
  }

  const daily = new Map<string, ChannelCounts>();
  for (const row of dailyRows) {
    const day = String(row.day ?? "").slice(0, 10);
    const channel = String(row.channel ?? "");
    const amount = toCount(row.total);
    if (!day || amount === 0) continue;
    const existing = daily.get(day) ?? emptyChannelCounts();
    addToChannel(existing, channel, amount);
    daily.set(day, existing);
  }

  return { total, clicks, byChannel, daily };
}

/** Platform-wide tap total for the period immediately preceding the current
 * one (same length): `(NOW() - 2*days, NOW() - days]`. */
export async function fetchPreviousPlatformTapTotal(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
}): Promise<number> {
  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);

  const sql = `
    SELECT SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND blob2 = 'tap'
      AND timestamp > NOW() - INTERVAL '${input.days * 2}' DAY
      AND timestamp <= NOW() - INTERVAL '${input.days}' DAY
  `;
  const rows = await input.client.query(sql);
  return toCount(rows[0]?.total);
}

/** The `limit` most-tapped Touchpoint publicIds in the period, bounded by
 * `ORDER BY ... LIMIT` in the Analytics Engine query itself rather than by an
 * `IN (...)` filter — used to discover which workspaces to surface in
 * `topWorkspaces` without already knowing their Touchpoint ids. */
export async function fetchTopTappedPublicIds(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
  limit: number;
}): Promise<Map<string, number>> {
  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 1000);

  const sql = `
    SELECT index1 AS public_id, SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND blob2 = 'tap'
      AND timestamp > NOW() - INTERVAL '${input.days}' DAY
    GROUP BY public_id
    ORDER BY total DESC
    LIMIT ${limit}
  `;
  const rows = await input.client.query(sql);
  const result = new Map<string, number>();
  for (const row of rows) {
    const publicId = String(row.public_id ?? "");
    const amount = toCount(row.total);
    if (!publicId || amount === 0) continue;
    result.set(publicId, amount);
  }
  return result;
}

/** Summed taps for a known, small set of Touchpoint publicIds (a single
 * workspace's or a single Touchpoint's) over the period — the scoped
 * counterpart to the platform-wide functions above, used for
 * `taps30Days`. */
export async function fetchTapsForPublicIds(input: {
  client: AnalyticsEngineClient;
  dataset: string;
  environment: string;
  days: AnalyticsDays;
  publicIds: readonly string[];
}): Promise<number> {
  const safeIds = sanitizePublicIds(input.publicIds);
  if (safeIds.length === 0) return 0;

  const dataset = assertDatasetName(input.dataset);
  const environment = assertSafeEnvironmentLiteral(input.environment);
  const idList = sqlIdList(safeIds);

  const sql = `
    SELECT SUM(_sample_interval * double1) AS total
    FROM ${dataset}
    WHERE blob4 = ${environment}
      AND blob2 = 'tap'
      AND index1 IN (${idList})
      AND timestamp > NOW() - INTERVAL '${input.days}' DAY
  `;
  const rows = await input.client.query(sql);
  return toCount(rows[0]?.total);
}
