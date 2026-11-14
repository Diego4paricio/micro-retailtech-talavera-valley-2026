import { timingSafeEqual } from "node:crypto";
import { StatusIncidentSetSchema } from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";
import "./formats.js";
import { type ProbeEnv, runProbes } from "./probes.js";
import { runProviders } from "./providers.js";
import { StatusState } from "./state.js";

export { StatusState };

/**
 * Estado del servicio (ADR 022).
 *
 * - `GET /v1/status`: public, what the panel (and later a public page) shows.
 *   Never anything technical: no addresses, latencies or errors.
 * - `GET /v1/status/history?days=30`: worst level per area per day.
 * - `GET /internal/status`, `PUT /internal/incidents`, `POST /internal/check`:
 *   Staff API only, with `STATUS_COMMAND_KEY`.
 * - Cron every minute: Kardo's checks; providers every 5 minutes.
 */
export type StatusEnv = ProbeEnv & {
  STATUS_STATE: DurableObjectNamespace<StatusState>;
  KARDO_ENV?: string;
  STATUS_COMMAND_KEY?: string;
  /** `"false"` skips the providers' pages (tests). */
  PROVIDERS_ENABLED?: string;
};

const MAX_INCIDENTS_BODY = 256 * 1024;

function stub(env: StatusEnv) {
  return env.STATUS_STATE.get(env.STATUS_STATE.idFromName("global"));
}

function isAuthorized(request: Request, key: string | undefined): boolean {
  if (!key) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${key}`);
  const supplied = Buffer.from(header);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

const publicHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-max-age": "86400",
  "cache-control": "public, max-age=30",
  "x-content-type-options": "nosniff",
};

const privateHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export async function runCheck(
  env: StatusEnv,
  options: { countMinute: boolean; nowMs?: number },
) {
  const nowMs = options.nowMs ?? Date.now();
  const state = stub(env);
  const providersDue =
    env.PROVIDERS_ENABLED !== "false" && (await state.providersDue(nowMs));
  const [probes, providers] = await Promise.all([
    runProbes(env, { now: new Date(nowMs) }),
    providersDue
      ? runProviders({ now: new Date(nowMs) })
      : Promise.resolve(null),
  ]);
  const status = await state.record({
    probes,
    providers,
    nowMs,
    countMinute: options.countMinute,
  });
  console.log(
    JSON.stringify({
      event: "status.check",
      overall: status.overall,
      components: Object.fromEntries(
        status.components.map((component) => [component.id, component.level]),
      ),
      providers: providers !== null,
    }),
  );
  return status;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/v1/status")) {
      return new Response(null, {
        status: 204,
        headers: {
          ...publicHeaders,
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { service: "status", status: "ok" },
        { headers: privateHeaders },
      );
    }

    if (request.method === "GET" && url.pathname === "/v1/status") {
      const status = await stub(env).publicStatus(Date.now());
      return Response.json(status, { headers: publicHeaders });
    }

    if (request.method === "GET" && url.pathname === "/v1/status/history") {
      const requested = Number(url.searchParams.get("days") ?? "30");
      const days = Number.isInteger(requested)
        ? Math.min(Math.max(requested, 1), 90)
        : 30;
      return Response.json(await stub(env).history(days), {
        headers: { ...publicHeaders, "cache-control": "public, max-age=300" },
      });
    }

    if (url.pathname.startsWith("/internal/")) {
      if (!isAuthorized(request, env.STATUS_COMMAND_KEY)) {
        return new Response("Unauthorized", {
          status: 401,
          headers: privateHeaders,
        });
      }
      if (request.method === "GET" && url.pathname === "/internal/status") {
        return Response.json(await stub(env).detail(Date.now()), {
          headers: privateHeaders,
        });
      }
      if (request.method === "PUT" && url.pathname === "/internal/incidents") {
        const length = Number(request.headers.get("content-length") ?? "0");
        if (length > MAX_INCIDENTS_BODY) {
          return new Response("Too large", {
            status: 413,
            headers: privateHeaders,
          });
        }
        const text = await request.text();
        if (text.length > MAX_INCIDENTS_BODY) {
          return new Response("Too large", {
            status: 413,
            headers: privateHeaders,
          });
        }
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return new Response("Invalid JSON", {
            status: 400,
            headers: privateHeaders,
          });
        }
        if (!Value.Check(StatusIncidentSetSchema, body)) {
          return new Response("Invalid incident set", {
            status: 400,
            headers: privateHeaders,
          });
        }
        const outcome = await stub(env).setIncidents(body);
        return Response.json(outcome, { headers: privateHeaders });
      }
      if (request.method === "POST" && url.pathname === "/internal/check") {
        await runCheck(env, { countMinute: false });
        return new Response(null, { status: 204, headers: privateHeaders });
      }
    }

    return new Response("Not found", { status: 404, headers: privateHeaders });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runCheck(env, { countMinute: true }));
  },
} satisfies ExportedHandler<StatusEnv>;
