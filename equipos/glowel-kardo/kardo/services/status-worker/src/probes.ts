import type { HealthReady, StatusComponentId } from "@kardo/contracts";

/**
 * Kardo's own checks (ADR 022 §4), every minute. Each one reports a
 * *signal*; `compute.ts` turns signals into the level customers see (two in
 * a row to change, so one network blip never paints the panel red).
 */

export type ProbeId =
  | "api"
  | "queue"
  | "resolver"
  | "publisher"
  | "assets"
  | "analytics"
  | "panel-app";

export const probeIds: readonly ProbeId[] = [
  "api",
  "queue",
  "resolver",
  "publisher",
  "assets",
  "analytics",
  "panel-app",
];

export type Signal =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage";

export type ProbeResult = {
  id: ProbeId;
  configured: boolean;
  /** `null`: not configured, or no answer to judge (the queue when the API
   * is down). A `null` signal never moves the level. */
  signal: Signal | null;
  ok: boolean | null;
  slow: boolean;
  latencyMs: number | null;
  httpStatus: number | null;
  error: string | null;
  detail: string | null;
  checkedAt: string;
};

/** Which customer areas each check speaks for. */
export const probeComponents: Record<ProbeId, readonly StatusComponentId[]> = {
  // Saving, publishing and the AI all go through the Customer API.
  api: ["panel", "publishing", "ai"],
  queue: ["publishing"],
  resolver: ["pages"],
  publisher: ["publishing"],
  assets: ["files"],
  // Visits are still served if the analytics Worker fails; forms are not.
  analytics: ["analytics"],
  "panel-app": ["panel"],
};

const failSignal: Record<Exclude<ProbeId, "queue">, Signal> = {
  api: "major_outage",
  resolver: "major_outage",
  publisher: "major_outage",
  assets: "major_outage",
  analytics: "partial_outage",
  "panel-app": "major_outage",
};

/** Slower than this (ms), an answer counts as `degraded`. */
export const SLOW_MS = 3000;
export const PROBE_TIMEOUT_MS = 8000;
/** Publish queue age: more than 5 min is slow, more than 20 a partial outage. */
export const QUEUE_DEGRADED_SECONDS = 300;
export const QUEUE_OUTAGE_SECONDS = 1200;

export const PROBE_USER_AGENT = "KardoStatusBot/1.0";

export type ProbeEnv = {
  STATUS_PROBE_KEY?: string | undefined;
  CUSTOMER_API_URL?: string | undefined;
  CUSTOMER_APP_URL?: string | undefined;
  RESOLVER_URL?: string | undefined;
  PUBLISHER_URL?: string | undefined;
  ASSETS_URL?: string | undefined;
  ANALYTICS_URL?: string | undefined;
  STATUS_PROBE_PUBLIC_ID?: string | undefined;
  STATUS_PROBE_MARKER?: string | undefined;
  RESOLVER?: Fetcher | undefined;
  PUBLISHER?: Fetcher | undefined;
  ANALYTICS?: Fetcher | undefined;
  ASSETS_WORKER?: Fetcher | undefined;
};

type FetchLike = (request: Request) => Promise<Response>;

type Target = { fetch: FetchLike; url: string } | null;

function target(
  binding: Fetcher | undefined,
  url: string | undefined,
  fallbackHost: string,
  globalFetch: FetchLike,
): Target {
  if (binding) {
    return {
      fetch: (request) => binding.fetch(request),
      url: url || `https://${fallbackHost}`,
    };
  }
  if (url) return { fetch: globalFetch, url };
  return null;
}

export function queueSignal(oldestPendingSeconds: number): Signal {
  if (oldestPendingSeconds > QUEUE_OUTAGE_SECONDS) return "partial_outage";
  if (oldestPendingSeconds > QUEUE_DEGRADED_SECONDS) return "degraded";
  return "operational";
}

function notConfigured(id: ProbeId, now: Date): ProbeResult {
  return {
    id,
    configured: false,
    signal: null,
    ok: null,
    slow: false,
    latencyMs: null,
    httpStatus: null,
    error: null,
    detail: null,
    checkedAt: now.toISOString(),
  };
}

type Timed = {
  response: Response | null;
  latencyMs: number;
  error: string | null;
};

async function timedFetch(
  fetchFn: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<Timed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetchFn(
      new Request(url, {
        headers: { "user-agent": PROBE_USER_AGENT, ...headers },
        signal: controller.signal,
        redirect: "manual",
      }),
    );
    return { response, latencyMs: Date.now() - started, error: null };
  } catch (error) {
    return {
      response: null,
      latencyMs: Date.now() - started,
      error: controller.signal.aborted
        ? `Sin respuesta en ${PROBE_TIMEOUT_MS / 1000} s`
        : error instanceof Error
          ? error.message.slice(0, 200)
          : "No respondió",
    };
  } finally {
    clearTimeout(timer);
  }
}

function result(
  id: ProbeId,
  now: Date,
  timed: Timed,
  ok: boolean,
  failure: Signal,
  detail: string | null,
  degraded = false,
): ProbeResult {
  const slow = ok && timed.latencyMs > SLOW_MS;
  return {
    id,
    configured: true,
    signal: !ok ? failure : slow || degraded ? "degraded" : "operational",
    ok,
    slow,
    latencyMs: timed.latencyMs,
    httpStatus: timed.response?.status ?? null,
    error: ok
      ? null
      : (timed.error ??
        (timed.response
          ? `Respondió ${timed.response.status}`
          : "No respondió")),
    detail,
    checkedAt: now.toISOString(),
  };
}

async function simpleHealth(
  id: Exclude<ProbeId, "api" | "queue" | "resolver" | "panel-app">,
  where: Target,
  now: Date,
): Promise<ProbeResult> {
  if (!where) return notConfigured(id, now);
  const timed = await timedFetch(
    where.fetch,
    new URL("/health", where.url).toString(),
    {},
  );
  let ok = timed.response?.status === 200;
  if (ok && timed.response) {
    const body = (await timed.response.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    ok = body?.status === "ok";
  }
  return result(id, now, timed, ok, failSignal[id], null);
}

/** Customer API readiness, plus the publish queue it reports. */
async function apiAndQueue(
  env: ProbeEnv,
  globalFetch: FetchLike,
  now: Date,
): Promise<[ProbeResult, ProbeResult]> {
  if (!env.CUSTOMER_API_URL) {
    return [notConfigured("api", now), notConfigured("queue", now)];
  }
  if (!env.STATUS_PROBE_KEY) {
    // Liveness only: no database, no queue.
    const timed = await timedFetch(
      globalFetch,
      new URL("/health", env.CUSTOMER_API_URL).toString(),
      {},
    );
    return [
      result(
        "api",
        now,
        timed,
        timed.response?.status === 200,
        failSignal.api,
        "Sin STATUS_PROBE_KEY: solo /health",
      ),
      notConfigured("queue", now),
    ];
  }
  const timed = await timedFetch(
    globalFetch,
    new URL("/health/ready", env.CUSTOMER_API_URL).toString(),
    { "x-kardo-status-key": env.STATUS_PROBE_KEY },
  );
  const status = timed.response?.status ?? null;
  const body =
    status === 200 || status === 503
      ? ((await timed.response?.json().catch(() => null)) as HealthReady | null)
      : null;
  const answered = body !== null && typeof body.status === "string";
  const ok = answered && body.status !== "error";
  const detail = body
    ? `Base ${body.database.ok ? `${body.database.latencyMs} ms` : "sin respuesta"} · 5xx ${body.errors.serverErrors}/${body.errors.requests} en ${body.errors.windowSeconds / 60} min`
    : null;
  const api = result(
    "api",
    now,
    timed,
    ok,
    failSignal.api,
    detail,
    body?.status === "degraded",
  );
  if (!ok && timed.response && status !== 503) {
    api.error = `Respondió ${status}`;
  } else if (!ok && body?.status === "error") {
    api.error = "La base de datos no respondió";
  }
  const queue: ProbeResult = body?.publishQueue
    ? {
        id: "queue",
        configured: true,
        signal: queueSignal(body.publishQueue.oldestPendingSeconds),
        ok:
          queueSignal(body.publishQueue.oldestPendingSeconds) === "operational",
        slow: false,
        latencyMs: null,
        httpStatus: null,
        error: null,
        detail: `${body.publishQueue.pendingJobs} en cola · la más vieja lleva ${body.publishQueue.oldestPendingSeconds} s`,
        checkedAt: now.toISOString(),
      }
    : { ...notConfigured("queue", now), configured: true };
  return [api, queue];
}

/** A real test QR when configured; otherwise the Resolver's /health. */
async function resolverProbe(
  env: ProbeEnv,
  globalFetch: FetchLike,
  now: Date,
): Promise<ProbeResult> {
  const where = target(
    env.RESOLVER,
    env.RESOLVER_URL,
    "resolver.internal",
    globalFetch,
  );
  if (!where) return notConfigured("resolver", now);
  const publicId = env.STATUS_PROBE_PUBLIC_ID?.trim();
  if (!publicId) {
    const health = await simpleHealthResolver(where, now);
    return health;
  }
  const timed = await timedFetch(
    where.fetch,
    new URL(`/t/${encodeURIComponent(publicId)}?src=qr`, where.url).toString(),
    { accept: "text/html" },
  );
  let ok = timed.response?.status === 200;
  let detail = "QR de prueba";
  const marker = env.STATUS_PROBE_MARKER?.trim();
  if (ok && marker && timed.response) {
    const html = await timed.response.text().catch(() => "");
    if (!html.includes(marker)) {
      ok = false;
      detail = "QR de prueba sin la marca esperada";
    }
  }
  const probe = result("resolver", now, timed, ok, failSignal.resolver, detail);
  if (!ok && timed.response?.status === 200) probe.error = detail;
  return probe;
}

async function simpleHealthResolver(
  where: NonNullable<Target>,
  now: Date,
): Promise<ProbeResult> {
  const timed = await timedFetch(
    where.fetch,
    new URL("/health", where.url).toString(),
    {},
  );
  return result(
    "resolver",
    now,
    timed,
    timed.response?.status === 200,
    failSignal.resolver,
    "Sin QR de prueba: solo /health",
  );
}

async function panelProbe(
  env: ProbeEnv,
  globalFetch: FetchLike,
  now: Date,
): Promise<ProbeResult> {
  if (!env.CUSTOMER_APP_URL) return notConfigured("panel-app", now);
  const timed = await timedFetch(globalFetch, env.CUSTOMER_APP_URL, {
    accept: "text/html",
  });
  return result(
    "panel-app",
    now,
    timed,
    timed.response?.status === 200,
    failSignal["panel-app"],
    null,
  );
}

export async function runProbes(
  env: ProbeEnv,
  options: { fetchFn?: FetchLike; now?: Date } = {},
): Promise<ProbeResult[]> {
  const globalFetch: FetchLike =
    options.fetchFn ?? ((request) => fetch(request));
  const now = options.now ?? new Date();
  const [apiPair, resolver, publisher, assets, analytics, panel] =
    await Promise.all([
      apiAndQueue(env, globalFetch, now),
      resolverProbe(env, globalFetch, now),
      simpleHealth(
        "publisher",
        target(
          env.PUBLISHER,
          env.PUBLISHER_URL,
          "publisher.internal",
          globalFetch,
        ),
        now,
      ),
      simpleHealth(
        "assets",
        target(
          env.ASSETS_WORKER,
          env.ASSETS_URL,
          "assets.internal",
          globalFetch,
        ),
        now,
      ),
      simpleHealth(
        "analytics",
        target(
          env.ANALYTICS,
          env.ANALYTICS_URL,
          "analytics.internal",
          globalFetch,
        ),
        now,
      ),
      panelProbe(env, globalFetch, now),
    ]);
  return [
    apiPair[0],
    apiPair[1],
    resolver,
    publisher,
    assets,
    analytics,
    panel,
  ];
}
