import { timingSafeEqual } from "node:crypto";
import { type DeliveryEnv, deliverLead } from "./delivery.js";
import {
  type AnalyticsRepository,
  createPostgresAnalyticsRepository,
  type LeadCreated,
  LeadTargetUnavailableError,
  parseLeadSubmission,
} from "./index.js";

type AnalyticsWorkerEnv = Env & {
  // Deliberately absent from wrangler.jsonc, like the Publisher/Resolver's
  // command keys: the shared secret of the Resolver's LEAD_INTAKE service
  // binding, the only expected caller. The route is public (workers_dev), so
  // it fails closed: without this secret every lead is rejected, because an
  // open route would skip the Resolver's Turnstile, honeypot, rate limit and
  // pause/suspension gate (security review 2026-10).
  LEAD_INTAKE_KEY?: string;
  // Optional lead delivery configuration, all absent from wrangler.jsonc
  // (secrets). LEAD_WEBHOOK_KEY decrypts a workspace's stored webhook
  // secret; RESEND_API_KEY + LEAD_EMAIL_FROM together enable the optional
  // email copy. Any of these being unset simply disables that channel.
  LEAD_WEBHOOK_KEY?: string;
  RESEND_API_KEY?: string;
  LEAD_EMAIL_FROM?: string;
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health")
      return Response.json({ service: "analytics", status: "ok" });
    if (request.method === "POST" && url.pathname === "/v1/public/leads")
      return submitLead(request, env, ctx);
    return new Response("Not found", {
      status: 404,
      headers: securityHeaders(),
    });
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(purge(env));
  },
} satisfies ExportedHandler<AnalyticsWorkerEnv>;

function hasLeadIntakeAuthorization(
  request: Request,
  env: AnalyticsWorkerEnv,
): boolean {
  const expected = env.LEAD_INTAKE_KEY;
  if (!expected) return false;
  const supplied = request.headers.get("x-kardo-lead-intake");
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function submitLead(
  request: Request,
  env: AnalyticsWorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!hasLeadIntakeAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: securityHeaders(),
    });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length < 1 || length > 4096)
    return new Response("Invalid lead submission", {
      status: 400,
      headers: securityHeaders(),
    });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid lead submission", {
      status: 400,
      headers: securityHeaders(),
    });
  }
  const input = parseLeadSubmission(body);
  if (!input)
    return new Response("Invalid lead submission", {
      status: 400,
      headers: securityHeaders(),
    });

  const repository = createPostgresAnalyticsRepository(
    env.HYPERDRIVE.connectionString,
  );
  const emailCapable = Boolean(env.RESEND_API_KEY && env.LEAD_EMAIL_FROM);

  let created: Awaited<ReturnType<typeof repository.createLead>>;
  try {
    created = await repository.createLead(input, { emailCapable });
  } catch (error) {
    await repository.close();
    const status = error instanceof LeadTargetUnavailableError ? 404 : 503;
    console.error(
      JSON.stringify({
        event: "lead.persistence_failed",
        status,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return new Response(
      status === 404
        ? "This Kardo Touchpoint is unavailable."
        : "Lead submission is temporarily unavailable. Please try again.",
      { status, headers: securityHeaders() },
    );
  }

  // The lead is already durably saved at this point. scheduleLeadDelivery
  // either hands off to ctx.waitUntil (deliveries pending) or closes the
  // repository itself (nothing to deliver) — either way, this line never
  // waits for a third party, so the visitor's response is not delayed by it.
  await scheduleLeadDelivery(created, env, repository, ctx, deliverLead);

  return Response.json(
    { id: created.id, status: "accepted" },
    { status: 201, headers: securityHeaders() },
  );
}

/**
 * Wires up deferred delivery for a just-created lead. When there is nothing
 * to deliver, the repository is closed immediately (awaited here — cheap and
 * synchronous from the caller's perspective). When there is, delivery is
 * scheduled on `ctx.waitUntil` and this function returns immediately without
 * waiting for it: the repository (and its DB connection) is only closed once
 * that deferred work finishes, never before.
 */
export async function scheduleLeadDelivery(
  created: LeadCreated,
  env: DeliveryEnv,
  repository: Pick<
    AnalyticsRepository & { close(): Promise<void> },
    "recordDeliveryResult" | "close"
  >,
  ctx: ExecutionContext,
  deliverFn: typeof deliverLead,
): Promise<void> {
  if (created.deliveries.length === 0) {
    await repository.close();
    return;
  }
  ctx.waitUntil(
    deliverFn(created, env, (outcome) =>
      repository.recordDeliveryResult(outcome),
    )
      .catch((error) => {
        console.error(
          JSON.stringify({
            event: "lead.delivery_failed",
            leadId: created.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      })
      .finally(() => repository.close()),
  );
}

async function purge(env: Env): Promise<void> {
  const repository = createPostgresAnalyticsRepository(
    env.HYPERDRIVE.connectionString,
  );
  try {
    await repository.purge();
    console.log(JSON.stringify({ event: "analytics.retention_completed" }));
  } finally {
    await repository.close();
  }
}
function securityHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
}
