import cors from "@fastify/cors";
import {
  type AccessReconciler,
  createAccessReconciler,
  createBillingPauseClient,
  createBillingSync,
  createFacturapiClient,
  createStripeGateway,
  deletionModeOf,
} from "@kardo/billing";
import { loadStaffApiConfig } from "@kardo/config";
import { HealthSchema } from "@kardo/contracts";
import { createRequestId, sensitiveLogKeys } from "@kardo/observability";
import Fastify, { type FastifyInstance } from "fastify";
import {
  type AccessReconcile,
  createAccessReconcile,
  type ReconcileLogger,
} from "./clients/access-reconcile.js";
import {
  type AnalyticsEngineClient,
  createCloudflareAnalyticsEngineClient,
} from "./clients/analytics-engine.js";
import {
  createPublisherKick,
  noopPublisherKick,
  type PublisherKick,
} from "./clients/publisher-kick.js";
import {
  createResolverSuspensionClient,
  type ResolverSuspensionClient,
} from "./clients/resolver-suspension.js";
import {
  createStatusWorkerClient,
  type StatusWorkerClient,
} from "./clients/status-worker.js";
import { createDatabaseClient } from "./db.js";
import type { AppDependencies } from "./http/dependencies.js";
import { staffApiErrorHandler } from "./http/error-handler.js";
import { createStaffRateLimiter } from "./rate-limit.js";
import {
  createPostgresStaffAuditRepository,
  type StaffAuditRepository,
  unavailableStaffAuditRepository,
} from "./repositories/audit.js";
import {
  createPostgresStaffBillingRepository,
  type StaffBillingRepository,
  unavailableStaffBillingRepository,
} from "./repositories/billing.js";
import {
  createPostgresStaffMetricsRepository,
  type StaffMetricsRepository,
  unavailableStaffMetricsRepository,
} from "./repositories/metrics.js";
import {
  createPostgresStaffNotificationRepository,
  type StaffNotificationRepository,
  unavailableStaffNotificationRepository,
} from "./repositories/notifications.js";
import {
  createPostgresStaffPieceRepository,
  type StaffPieceRepository,
  unavailableStaffPieceRepository,
} from "./repositories/pieces.js";
import {
  createPostgresStaffPlanRepository,
  type StaffPlanRepository,
  unavailableStaffPlanRepository,
} from "./repositories/plans.js";
import {
  createPostgresStaffPublicationRepository,
  type StaffPublicationRepository,
  unavailableStaffPublicationRepository,
} from "./repositories/publications.js";
import {
  createPostgresSessionRepository,
  type SessionRepository,
  unavailableSessionRepository,
} from "./repositories/session.js";
import {
  createPostgresStaffMemberRepository,
  type StaffMemberRepository,
  unavailableStaffMemberRepository,
} from "./repositories/staff-members.js";
import {
  createPostgresStaffStatusRepository,
  type StaffStatusRepository,
  unavailableStaffStatusRepository,
} from "./repositories/status.js";
import {
  createPostgresStaffTouchpointRepository,
  type StaffTouchpointRepository,
  unavailableStaffTouchpointRepository,
} from "./repositories/touchpoints.js";
import {
  createPostgresStaffWorkspaceRepository,
  type StaffWorkspaceRepository,
  unavailableStaffWorkspaceRepository,
} from "./repositories/workspaces.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerPieceRoutes } from "./routes/pieces.js";
import { registerPlanRoutes } from "./routes/plans.js";
import { registerPublicationRoutes } from "./routes/publications.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerStaffMemberRoutes } from "./routes/staff-members.js";
import { registerStatusRoutes } from "./routes/status.js";
import { registerTouchpointRoutes } from "./routes/touchpoints.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import {
  createSupabaseStaffSessionVerifier,
  type StaffSessionVerifier,
  unavailableStaffSessionVerifier,
} from "./staff-session.js";

/** Used to build public Touchpoint URLs when `TAP_RESOLVER_URL` is not
 * configured, so the shape of `StaffTouchpointDetail.urls` never changes —
 * only its usefulness does. */
const PLACEHOLDER_RESOLVER_ORIGIN = "https://resolver.kardo.invalid";

export type BuildStaffApiInput = {
  sessionVerifier?: StaffSessionVerifier;
  sessionRepository?: SessionRepository;
  metricsRepository?: StaffMetricsRepository;
  workspaceRepository?: StaffWorkspaceRepository;
  touchpointRepository?: StaffTouchpointRepository;
  publicationRepository?: StaffPublicationRepository;
  auditRepository?: StaffAuditRepository;
  planRepository?: StaffPlanRepository;
  staffMemberRepository?: StaffMemberRepository;
  billingRepository?: StaffBillingRepository;
  resolverSuspension?: ResolverSuspensionClient | null;
  notificationRepository?: StaffNotificationRepository;
  statusRepository?: StaffStatusRepository;
  pieceRepository?: StaffPieceRepository;
  statusWorker?: StatusWorkerClient | null;
  publisherKick?: PublisherKick;
  analyticsEngine?: AnalyticsEngineClient | null;
  /** Pauses/resumes public pages after a billing change; tests inject a
   * fake. Defaults to the real reconciler when a database is configured. */
  accessReconciler?: Pick<AccessReconciler, "reconcileWorkspace"> | null;
};

export function buildStaffApi(input?: BuildStaffApiInput): FastifyInstance {
  const config = loadStaffApiConfig();
  const sql = config.STAFF_DATABASE_URL
    ? createDatabaseClient(config.STAFF_DATABASE_URL)
    : null;

  const sessionVerifier =
    input?.sessionVerifier ??
    (config.SUPABASE_JWT_ISSUER
      ? createSupabaseStaffSessionVerifier(
          config.SUPABASE_JWT_ISSUER,
          config.SUPABASE_JWT_AUDIENCE,
        )
      : unavailableStaffSessionVerifier());

  const sessionRepository =
    input?.sessionRepository ??
    (sql
      ? createPostgresSessionRepository(sql)
      : unavailableSessionRepository());

  const analyticsEngine: AnalyticsEngineClient | null =
    input?.analyticsEngine ??
    (config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_ANALYTICS_API_TOKEN
      ? createCloudflareAnalyticsEngineClient({
          accountId: config.CLOUDFLARE_ACCOUNT_ID,
          apiToken: config.CLOUDFLARE_ANALYTICS_API_TOKEN,
        })
      : null);

  const metricsRepository =
    input?.metricsRepository ??
    (sql
      ? createPostgresStaffMetricsRepository(
          sql,
          analyticsEngine,
          config.TAP_ANALYTICS_DATASET,
          config.TAP_ANALYTICS_ENVIRONMENT,
        )
      : unavailableStaffMetricsRepository());

  // Access reconciliation (ADR 020 §4). The Resolver pause client needs its
  // own key: reusing the suspension or publish key would let one leaked
  // secret lift or set the other's flags, so an equal key is refused.
  const startupWarnings: string[] = [];
  let reconcileLogger: ReconcileLogger | null = null;
  let pause: ReturnType<typeof createBillingPauseClient> | null = null;
  const billingResolverUrl =
    config.BILLING_RESOLVER_URL ?? config.TAP_RESOLVER_URL;
  if (billingResolverUrl && config.BILLING_COMMAND_KEY) {
    if (
      config.BILLING_COMMAND_KEY === config.SUSPENSION_COMMAND_KEY ||
      config.BILLING_COMMAND_KEY === config.PUBLISH_COMMAND_KEY
    ) {
      startupWarnings.push(
        "BILLING_COMMAND_KEY equals SUSPENSION_COMMAND_KEY or PUBLISH_COMMAND_KEY: the billing pause client is disabled. Use a key of its own.",
      );
    } else {
      pause = createBillingPauseClient({
        resolverUrl: billingResolverUrl,
        commandKey: config.BILLING_COMMAND_KEY,
      });
    }
  }
  const deletionMode = deletionModeOf(config.BILLING_DELETE_ENABLED);
  const accessReconciler =
    input?.accessReconciler !== undefined
      ? input.accessReconciler
      : sql
        ? createAccessReconciler({
            sql,
            pause,
            deletionEnabled: deletionMode === "on",
          })
        : null;
  const reconcile: AccessReconcile = createAccessReconcile(
    accessReconciler,
    () => reconcileLogger,
  );

  const workspaceRepository =
    input?.workspaceRepository ??
    (sql
      ? createPostgresStaffWorkspaceRepository(
          sql,
          analyticsEngine,
          config.TAP_ANALYTICS_DATASET,
          config.TAP_ANALYTICS_ENVIRONMENT,
          reconcile,
        )
      : unavailableStaffWorkspaceRepository());

  const resolverOrigin = config.TAP_RESOLVER_URL ?? PLACEHOLDER_RESOLVER_ORIGIN;

  const touchpointRepository =
    input?.touchpointRepository ??
    (sql
      ? createPostgresStaffTouchpointRepository(
          sql,
          analyticsEngine,
          config.TAP_ANALYTICS_DATASET,
          config.TAP_ANALYTICS_ENVIRONMENT,
          resolverOrigin,
        )
      : unavailableStaffTouchpointRepository());

  // Piezas de Kardo (ADR 026): the activation card's QR goes to the site's
  // /activar/, so its origin comes from the config, never written by hand.
  const pieceRepository =
    input?.pieceRepository ??
    (sql
      ? createPostgresStaffPieceRepository(sql, {
          resolverOrigin,
          websiteOrigin: config.WEBSITE_URL
            ? new URL(config.WEBSITE_URL).origin
            : null,
        })
      : unavailableStaffPieceRepository());

  const publicationRepository =
    input?.publicationRepository ??
    (sql
      ? createPostgresStaffPublicationRepository(sql)
      : unavailableStaffPublicationRepository());

  const auditRepository =
    input?.auditRepository ??
    (sql
      ? createPostgresStaffAuditRepository(sql)
      : unavailableStaffAuditRepository());

  const planRepository =
    input?.planRepository ??
    (sql
      ? createPostgresStaffPlanRepository(sql)
      : unavailableStaffPlanRepository());

  const staffMemberRepository =
    input?.staffMemberRepository ??
    (sql
      ? createPostgresStaffMemberRepository(sql)
      : unavailableStaffMemberRepository());

  // Suscripciones (ADR 019): without a key reads still work and every
  // action answers 503 BILLING_UNAVAILABLE.
  const billingGateway = config.STRIPE_SECRET_KEY
    ? createStripeGateway({ secretKey: config.STRIPE_SECRET_KEY })
    : null;
  const billingRepository =
    input?.billingRepository ??
    (sql
      ? createPostgresStaffBillingRepository({
          sql,
          gateway: billingGateway,
          sync: billingGateway ? createBillingSync(sql, billingGateway) : null,
          reconcile,
          deletionMode,
          // ADR 020 §6, phase 2: CFDI with Facturapi (test or live key).
          facturapi: config.FACTURAPI_KEY
            ? createFacturapiClient({ secretKey: config.FACTURAPI_KEY })
            : null,
        })
      : unavailableStaffBillingRepository());

  const resolverSuspension: ResolverSuspensionClient | null =
    input?.resolverSuspension ??
    (config.TAP_RESOLVER_URL && config.SUSPENSION_COMMAND_KEY
      ? createResolverSuspensionClient({
          resolverUrl: config.TAP_RESOLVER_URL,
          commandKey: config.SUSPENSION_COMMAND_KEY,
        })
      : null);

  const publisherKick: PublisherKick =
    input?.publisherKick ??
    (config.PUBLISHER_URL && config.PUBLISH_COMMAND_KEY
      ? createPublisherKick({
          publisherUrl: config.PUBLISHER_URL,
          commandKey: config.PUBLISH_COMMAND_KEY,
        })
      : noopPublisherKick);

  const notificationRepository =
    input?.notificationRepository ??
    (sql
      ? createPostgresStaffNotificationRepository(sql)
      : unavailableStaffNotificationRepository());

  const statusRepository =
    input?.statusRepository ??
    (sql
      ? createPostgresStaffStatusRepository(sql)
      : unavailableStaffStatusRepository());

  const statusWorker: StatusWorkerClient | null =
    input?.statusWorker !== undefined
      ? input.statusWorker
      : config.STATUS_URL && config.STATUS_COMMAND_KEY
        ? createStatusWorkerClient({
            statusUrl: config.STATUS_URL,
            commandKey: config.STATUS_COMMAND_KEY,
          })
        : null;

  const deps: AppDependencies = {
    sessionVerifier,
    sessionRepository,
    metricsRepository,
    workspaceRepository,
    touchpointRepository,
    publicationRepository,
    auditRepository,
    planRepository,
    staffMemberRepository,
    billingRepository,
    resolverSuspension,
    publisherKick,
    notificationRepository,
    statusRepository,
    pieceRepository,
    statusWorker,
  };

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        ...sensitiveLogKeys,
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.set-cookie",
      ],
    },
    genReqId: createRequestId,
    // Same as a numeric hop count: trust the first N proxies from the socket.
    trustProxy: (_address: string, hop: number) =>
      hop < config.TRUST_PROXY_HOPS,
    // Every staff mutation body is small (a suspension reason, a plan
    // definition); this is generous headroom while still blunting abuse.
    bodyLimit: 256 * 1024,
  });

  reconcileLogger = app.log;
  for (const warning of startupWarnings) app.log.warn(warning);

  if (sql) {
    app.addHook("onClose", async () => {
      await sql.end({ timeout: 5 });
    });
  }

  // Every response — success or error — gets the same defensive headers.
  // `cache-control: no-store` keeps workspace/customer data out of
  // shared/browser caches; the other two are standard
  // clickjacking/MIME-sniffing/referrer hardening for a JSON API with no
  // reason to ever be framed.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    return payload;
  });

  // A fixed-window per-IP rate limit before any handler, so a valid or bogus
  // token cannot hammer JWT verification and the database unbounded (security
  // review 2026-10-12). `/health` is exempt so uptime probes never trip it.
  const staffRateLimiter = createStaffRateLimiter();
  app.addHook("onRequest", async (request) => {
    if (request.url === "/health") return;
    staffRateLimiter(request);
  });

  void app.register(cors, {
    credentials: true,
    // @fastify/cors 10+ allows only GET, HEAD and POST by default: without
    // this list the browser blocks Operations' PUT/DELETE calls (assign a
    // plan, save a plan, lift a suspension) at the preflight.
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    origin: config.OPERATIONS_APP_ORIGIN,
  });

  app.get(
    "/health",
    { schema: { tags: ["system"], response: { 200: HealthSchema } } },
    async (request) => ({
      service: "staff-api",
      status: "ok",
      requestId: request.id,
    }),
  );

  registerSessionRoutes(app, deps);
  registerMetricsRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerTouchpointRoutes(app, deps);
  registerPublicationRoutes(app, deps);
  registerAuditRoutes(app, deps);
  registerPlanRoutes(app, deps);
  registerStaffMemberRoutes(app, deps);
  registerBillingRoutes(app, deps);
  registerNotificationRoutes(app, deps);
  registerStatusRoutes(app, deps);
  registerPieceRoutes(app, deps);

  app.setErrorHandler(staffApiErrorHandler);

  return app;
}
