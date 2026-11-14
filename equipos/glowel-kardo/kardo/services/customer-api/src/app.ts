import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import {
  createAccessReconciler,
  createBillingPauseClient,
  createBillingSync,
  createFacturapiClient,
  createNoticeSender,
  createResendEmailer,
  createResolverRetireClient,
  createStripeGateway,
  type DeletionCleanupClients,
  deletionModeOf,
  type FacturapiClient,
  KARDO_CHECKOUT_BRANDING,
} from "@kardo/billing";
import { loadCustomerApiConfig } from "@kardo/config";
import {
  DASHBOARD_COLUMNS,
  HealthReadySchema,
  HealthSchema,
} from "@kardo/contracts";
import { createRequestId, sensitiveLogKeys } from "@kardo/observability";
import Fastify, { type FastifyInstance } from "fastify";
import type { AnalyticsEngineClient } from "./analytics-engine.js";
import {
  createCloudflareAnalyticsEngineClient,
  type FirstVisitFinder,
  fetchFirstVisit,
} from "./analytics-engine.js";
import { createLocalDemoAnalyticsEngineClient } from "./local-demo-analytics.js";
import {
  type AssetRepository,
  type AssetWorkerClient,
  createAssetWorkerClient,
  createPostgresAssetRepository,
  unavailableAssetRepository,
} from "./assets.js";
import {
  createPostgresFiscalRepository,
  type FiscalRepository,
  unavailableFiscalRepository,
} from "./billing/fiscal.js";
import {
  createPostgresPlanSelectionRepository,
  type PlanSelectionRepository,
  unavailablePlanSelectionRepository,
} from "./billing/plan-selection.js";
import { createPlanVisits } from "./billing/plan-visits.js";
import {
  type BillingService,
  createBillingService,
  unavailableBillingService,
} from "./billing/service.js";
import {
  type CustomHtmlBudget,
  createInMemoryCustomHtmlBudget,
  createPostgresCustomHtmlBudget,
} from "./custom-html/budget.js";
import {
  type CustomHtmlLimiter,
  createCustomHtmlLimiter,
  createPostgresCustomHtmlLimiter,
} from "./custom-html/limiter.js";
import type { CustomHtmlModel } from "./custom-html/model.js";
import { selectCustomHtmlModel } from "./custom-html/select-model.js";
import {
  type CustomHtmlUserLimits,
  createCustomHtmlUserLimits,
} from "./custom-html/user-limits.js";
import {
  type CustomerSessionVerifier,
  createSupabaseCustomerSessionVerifier,
  type SessionStateLookup,
  unavailableCustomerSessionVerifier,
} from "./customer-session.js";
import { createDatabaseClient } from "./db.js";
import {
  createPostgresReadinessProbe,
  type ReadinessProbe,
  readinessStatus,
  statusKeyMatches,
  unavailableReadinessProbe,
} from "./health-ready.js";
import {
  createAnthropicHelpAssistant,
  disabledHelpAssistant,
  type HelpAssistant,
} from "./help/assistant.js";
import type { AppDependencies } from "./http/dependencies.js";
import { customerApiErrorHandler } from "./http/error-handler.js";
import { createErrorWindow } from "./http/error-window.js";
import {
  createResendInvitationMailer,
  disabledInvitationMailer,
  type InvitationMailer,
} from "./invitation-mailer.js";
import {
  createPublisherKick,
  noopPublisherKick,
  type PublisherKick,
} from "./publisher-kick.js";
import {
  createRateLimiters,
  defaultRateLimitConfig,
  type RateLimitConfig,
} from "./rate-limit.js";
import {
  type AccountRepository,
  createPostgresAccountRepository,
  unavailableAccountRepository,
} from "./repositories/account.js";
import {
  type AnalyticsRepository,
  createPostgresAnalyticsRepository,
  unavailableAnalyticsRepository,
} from "./repositories/analytics.js";
import {
  type BusinessSlugRepository,
  createPostgresBusinessSlugRepository,
  unavailableBusinessSlugRepository,
} from "./repositories/business-slug.js";
import {
  type CustomHtmlAssistantRepository,
  createPostgresCustomHtmlAssistantRepository,
  unavailableCustomHtmlAssistantRepository,
} from "./repositories/custom-html.js";
import {
  createPostgresDashboardRepository,
  type DashboardRepository,
  unavailableDashboardRepository,
} from "./repositories/dashboard.js";
import {
  createPostgresExperienceRepository,
  type ExperienceRepository,
  unavailableExperienceRepository,
} from "./repositories/experiences.js";
import {
  createPostgresTouchpointGroupRepository,
  type TouchpointGroupRepository,
  unavailableTouchpointGroupRepository,
} from "./repositories/groups.js";
import {
  createPostgresItemAvailabilityRepository,
  type ItemAvailabilityRepository,
  unavailableItemAvailabilityRepository,
} from "./repositories/item-availability.js";
import {
  createPostgresKardoPieceRepository,
  type KardoPieceRepository,
  unavailableKardoPieceRepository,
} from "./repositories/kardo-pieces.js";
import {
  createPostgresLeadDeliveryRepository,
  type LeadDeliveryRepository,
  unavailableLeadDeliveryRepository,
} from "./repositories/lead-delivery.js";
import {
  createPostgresLeadRepository,
  type LeadRepository,
  unavailableLeadRepository,
} from "./repositories/leads.js";
import {
  createPostgresLinkRepository,
  type LinkRepository,
  unavailableLinkRepository,
} from "./repositories/links.js";
import {
  createPostgresMemberRepository,
  type MemberRepository,
  unavailableMemberRepository,
} from "./repositories/members.js";
import {
  createPostgresNotificationRepository,
  type NotificationRepository,
  unavailableNotificationRepository,
} from "./repositories/notifications.js";
import {
  createPostgresProfileRepository,
  type ProfileRepository,
} from "./repositories/profile.js";
import {
  createPostgresQrDesignRepository,
  type QrDesignRepository,
  unavailableQrDesignRepository,
} from "./repositories/qr-designs.js";
import {
  createPostgresTouchpointRepository,
  type TouchpointRepository,
  unavailableTouchpointRepository,
} from "./repositories/touchpoints.js";
import {
  createPostgresWorkspaceProfileRepository,
  unavailableWorkspaceProfileRepository,
  type WorkspaceProfileRepository,
} from "./repositories/workspace-profile.js";
import {
  type CustomerWorkspaceRepository,
  createPostgresCustomerWorkspaceRepository,
  unavailableCustomerWorkspaceRepository,
} from "./repositories/workspaces.js";
import { createResolverBusinessClient } from "./resolver-clients/business-routes.js";
import {
  createResolverItemAvailabilityClient,
  type ItemAvailabilityClient,
} from "./resolver-clients/item-availability.js";
import {
  createResolverAvailabilityClient,
  type TouchpointAvailabilityClient,
} from "./resolver-clients/touchpoint-availability.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerAvailabilityRoutes } from "./routes/availability.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerBusinessSlugRoutes } from "./routes/business-slug.js";
import { registerCustomHtmlRoutes } from "./routes/custom-html.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerDesignAiRoutes } from "./routes/design-ai.js";
import { registerExperienceRoutes } from "./routes/experiences.js";
import { registerTouchpointGroupRoutes } from "./routes/groups.js";
import { registerHelpRoutes } from "./routes/help.js";
import { registerKardoPieceRoutes } from "./routes/kardo-pieces.js";
import { registerLeadDeliveryRoutes } from "./routes/lead-delivery.js";
import { registerLeadRoutes } from "./routes/leads.js";
import { registerLinkRoutes } from "./routes/links.js";
import { registerMemberRoutes } from "./routes/members.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerQrDesignRoutes } from "./routes/qr-designs.js";
import { registerTouchpointRoutes } from "./routes/touchpoints.js";
import { registerWorkspaceRoutes } from "./routes/workspaces.js";
import {
  createPostgresSessionStateLookup,
  unavailableSessionStateLookup,
} from "./session-state.js";
import {
  createPostgresWorkspaceExporter,
  unavailableWorkspaceExporter,
  type WorkspaceExporter,
} from "./workspace-export.js";

export type BuildCustomerApiInput = {
  sessionVerifier?: CustomerSessionVerifier;
  sessionStates?: SessionStateLookup;
  profileRepository?: ProfileRepository;
  workspaceRepository?: CustomerWorkspaceRepository;
  workspaceProfileRepository?: WorkspaceProfileRepository;
  workspaceExporter?: WorkspaceExporter;
  businessSlugRepository?: BusinessSlugRepository;
  linkRepository?: LinkRepository;
  qrDesignRepository?: QrDesignRepository;
  memberRepository?: MemberRepository;
  touchpointRepository?: TouchpointRepository;
  /** «Producto de Kardo»: activating pieces with their code (ADR 026). */
  kardoPieceRepository?: KardoPieceRepository;
  /** «Pruébalo»; `null` turns it off in tests. */
  touchpointObjectProbe?: FirstVisitFinder | null;
  groupRepository?: TouchpointGroupRepository;
  experienceRepository?: ExperienceRepository;
  assetRepository?: AssetRepository;
  assetWorker?: AssetWorkerClient;
  touchpointAvailability?: TouchpointAvailabilityClient;
  publisherKick?: PublisherKick;
  invitationMailer?: InvitationMailer;
  helpAssistant?: HelpAssistant;
  customHtmlModel?: CustomHtmlModel | null;
  customHtmlAssistantRepository?: CustomHtmlAssistantRepository;
  customHtmlLimiter?: CustomHtmlLimiter;
  customHtmlBudget?: CustomHtmlBudget;
  customHtmlUserLimits?: CustomHtmlUserLimits;
  leadRepository?: LeadRepository;
  leadDeliveryRepository?: LeadDeliveryRepository;
  analyticsRepository?: AnalyticsRepository;
  analyticsEngine?: AnalyticsEngineClient;
  dashboardRepository?: DashboardRepository;
  notificationRepository?: NotificationRepository;
  accountRepository?: AccountRepository;
  readinessProbe?: ReadinessProbe;
  itemAvailabilityRepository?: ItemAvailabilityRepository;
  itemAvailability?: ItemAvailabilityClient;
  billing?: BillingService;
  fiscal?: FiscalRepository;
  planSelection?: PlanSelectionRepository;
  facturapi?: FacturapiClient | null;
  /** Test-only override: shrinks the rate-limit windows/thresholds so a test
   * can trip a 429 without waiting a real minute. */
  rateLimit?: {
    general?: Partial<RateLimitConfig["general"]>;
    sensitive?: Partial<RateLimitConfig["sensitive"]>;
  };
};

export function buildCustomerApi(
  input?: BuildCustomerApiInput,
): FastifyInstance {
  const config = loadCustomerApiConfig();
  const sql = config.SUPABASE_DATABASE_URL
    ? createDatabaseClient(config.SUPABASE_DATABASE_URL)
    : null;

  // Shared with the account routes, which forget a session they close.
  const sessionStates =
    input?.sessionStates ??
    (sql
      ? createPostgresSessionStateLookup(sql)
      : unavailableSessionStateLookup());
  const sessionVerifier =
    input?.sessionVerifier ??
    (config.SUPABASE_JWT_ISSUER
      ? createSupabaseCustomerSessionVerifier(
          config.SUPABASE_JWT_ISSUER,
          config.SUPABASE_JWT_AUDIENCE,
          sessionStates,
        )
      : unavailableCustomerSessionVerifier());

  const profileRepository =
    input?.profileRepository ??
    (sql
      ? createPostgresProfileRepository(sql)
      : ({
          getProfile: () =>
            Promise.reject(
              new Error("Customer profile storage is not configured."),
            ),
          updateProfile: () =>
            Promise.reject(
              new Error("Customer profile storage is not configured."),
            ),
          acceptLegalTerms: () =>
            Promise.reject(
              new Error("Customer profile storage is not configured."),
            ),
        } satisfies ProfileRepository));

  const workspaceRepository =
    input?.workspaceRepository ??
    (sql
      ? createPostgresCustomerWorkspaceRepository(sql, {
          trial:
            config.BILLING_TRIAL_DAYS > 0
              ? {
                  days: config.BILLING_TRIAL_DAYS,
                  defaultPlan: config.BILLING_TRIAL_PLAN,
                }
              : null,
        })
      : unavailableCustomerWorkspaceRepository());

  const qrDesignRepository =
    input?.qrDesignRepository ??
    (sql
      ? createPostgresQrDesignRepository(sql)
      : unavailableQrDesignRepository());

  const workspaceProfileRepository =
    input?.workspaceProfileRepository ??
    (sql
      ? createPostgresWorkspaceProfileRepository(sql)
      : unavailableWorkspaceProfileRepository());

  const workspaceExporter =
    input?.workspaceExporter ??
    (sql
      ? createPostgresWorkspaceExporter(sql)
      : unavailableWorkspaceExporter());

  // Links, phase 3b: every change to a business's addresses reaches the
  // Resolver that serves kardo.com.mx/<negocio>/<link>.
  const businessRoutes =
    config.TAP_RESOLVER_URL && config.PUBLISH_COMMAND_KEY
      ? createResolverBusinessClient({
          resolverUrl: config.TAP_RESOLVER_URL,
          commandKey: config.PUBLISH_COMMAND_KEY,
        })
      : null;

  const businessSlugRepository =
    input?.businessSlugRepository ??
    (sql
      ? createPostgresBusinessSlugRepository(sql, { resolver: businessRoutes })
      : unavailableBusinessSlugRepository());

  const linkRepository =
    input?.linkRepository ??
    (sql
      ? createPostgresLinkRepository(sql, { resolver: businessRoutes })
      : unavailableLinkRepository());

  const memberRepository =
    input?.memberRepository ??
    (sql ? createPostgresMemberRepository(sql) : unavailableMemberRepository());

  const touchpointRepository =
    input?.touchpointRepository ??
    (sql
      ? createPostgresTouchpointRepository(sql)
      : unavailableTouchpointRepository());

  const experienceRepository =
    input?.experienceRepository ??
    (sql
      ? createPostgresExperienceRepository(sql)
      : unavailableExperienceRepository());

  const groupRepository =
    input?.groupRepository ??
    (sql
      ? createPostgresTouchpointGroupRepository(sql)
      : unavailableTouchpointGroupRepository());

  const assetRepository =
    input?.assetRepository ??
    (sql ? createPostgresAssetRepository(sql) : unavailableAssetRepository());

  const leadRepository =
    input?.leadRepository ??
    (sql ? createPostgresLeadRepository(sql) : unavailableLeadRepository());

  const leadDeliveryRepository =
    input?.leadDeliveryRepository ??
    (sql
      ? createPostgresLeadDeliveryRepository(sql, {
          webhookKey: config.LEAD_WEBHOOK_KEY ?? null,
          emailAvailable: config.LEAD_EMAIL_AVAILABLE,
        })
      : unavailableLeadDeliveryRepository());

  const touchpointAvailability: TouchpointAvailabilityClient | null =
    input?.touchpointAvailability ??
    (config.TAP_RESOLVER_URL && config.PUBLISH_COMMAND_KEY
      ? createResolverAvailabilityClient({
          resolverUrl: config.TAP_RESOLVER_URL,
          commandKey: config.PUBLISH_COMMAND_KEY,
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

  const invitationMailer: InvitationMailer =
    input?.invitationMailer ??
    (config.RESEND_API_KEY && config.INVITATION_EMAIL_FROM
      ? createResendInvitationMailer({
          apiKey: config.RESEND_API_KEY,
          from: config.INVITATION_EMAIL_FROM,
        })
      : disabledInvitationMailer);

  const helpAssistant: HelpAssistant =
    input?.helpAssistant ??
    (config.ANTHROPIC_API_KEY
      ? createAnthropicHelpAssistant({
          apiKey: config.ANTHROPIC_API_KEY,
          model: config.HELP_ASSISTANT_MODEL,
          // Counted in the same global daily AI budget as the Estudio
          // (declared below; only called once requests arrive).
          onSpend: (cost) => customHtmlBudget.recordSpend(cost),
          linksBase: config.LINKS_BASE_URL ?? config.TAP_RESOLVER_URL,
        })
      : disabledHelpAssistant);

  // Estudio de Experiences, modo HTML: "Pídele a la IA de Kardo" (ADR 018,
  // extended 2026-09-29). The model id is read directly from the
  // environment here rather than through `@kardo/config` (which is out of
  // this change's original file scope) — a current Sonnet-class model is
  // the sensible default for HTML/CSS design work; see the `claude-api`
  // skill for current model ids. `selectCustomHtmlModel` (fully unit-tested
  // there, since this file is additive-only shared wiring) picks the
  // provider and, for `dev-bridge`, refuses to build outside development.
  const customHtmlModelId =
    process.env.CUSTOM_HTML_AI_MODEL?.trim() || "claude-sonnet-5";
  const customHtmlModel: CustomHtmlModel | null =
    input?.customHtmlModel !== undefined
      ? input.customHtmlModel
      : selectCustomHtmlModel({ config, modelId: customHtmlModelId });

  const customHtmlAssistantRepository: CustomHtmlAssistantRepository =
    input?.customHtmlAssistantRepository ??
    (sql
      ? createPostgresCustomHtmlAssistantRepository(sql)
      : unavailableCustomHtmlAssistantRepository());

  const customHtmlLimiter: CustomHtmlLimiter =
    input?.customHtmlLimiter ??
    (sql ? createPostgresCustomHtmlLimiter(sql) : createCustomHtmlLimiter());

  const customHtmlBudget: CustomHtmlBudget =
    input?.customHtmlBudget ??
    (sql
      ? createPostgresCustomHtmlBudget(sql, {
          dailyBudgetUsd: config.CUSTOM_HTML_AI_DAILY_BUDGET_USD,
        })
      : createInMemoryCustomHtmlBudget({
          dailyBudgetUsd: config.CUSTOM_HTML_AI_DAILY_BUDGET_USD,
        }));

  const customHtmlUserLimits: CustomHtmlUserLimits =
    input?.customHtmlUserLimits ?? createCustomHtmlUserLimits();

  const assetWorker: AssetWorkerClient | null =
    input?.assetWorker ??
    (config.ASSET_WORKER_URL && config.ASSET_UPLOAD_SIGNING_KEY
      ? createAssetWorkerClient({
          workerUrl: config.ASSET_WORKER_URL,
          signingKey: config.ASSET_UPLOAD_SIGNING_KEY,
        })
      : null);

  const analyticsEngine: AnalyticsEngineClient | null =
    input?.analyticsEngine ??
    (config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_ANALYTICS_API_TOKEN
      ? createCloudflareAnalyticsEngineClient({
          accountId: config.CLOUDFLARE_ACCOUNT_ID,
          apiToken: config.CLOUDFLARE_ANALYTICS_API_TOKEN,
        })
      : config.KARDO_ENV === "local"
        ? createLocalDemoAnalyticsEngineClient()
        : null);

  const analyticsRepository =
    input?.analyticsRepository ??
    (sql
      ? createPostgresAnalyticsRepository(
          sql,
          analyticsEngine,
          config.TAP_ANALYTICS_DATASET,
          config.TAP_ANALYTICS_ENVIRONMENT,
        )
      : unavailableAnalyticsRepository());

  const dashboardRepository =
    input?.dashboardRepository ??
    (sql
      ? createPostgresDashboardRepository(sql, DASHBOARD_COLUMNS)
      : unavailableDashboardRepository());

  const accountRepository =
    input?.accountRepository ??
    (sql
      ? createPostgresAccountRepository(sql)
      : unavailableAccountRepository());

  const notificationRepository =
    input?.notificationRepository ??
    (sql
      ? createPostgresNotificationRepository(sql)
      : unavailableNotificationRepository());

  const readinessProbe =
    input?.readinessProbe ??
    (sql ? createPostgresReadinessProbe(sql) : unavailableReadinessProbe());
  const errorWindow = createErrorWindow();

  const itemAvailability: ItemAvailabilityClient | null =
    input?.itemAvailability ??
    (config.TAP_RESOLVER_URL && config.PUBLISH_COMMAND_KEY
      ? createResolverItemAvailabilityClient({
          resolverUrl: config.TAP_RESOLVER_URL,
          commandKey: config.PUBLISH_COMMAND_KEY,
        })
      : null);
  const itemAvailabilityRepository =
    input?.itemAvailabilityRepository ??
    (sql
      ? createPostgresItemAvailabilityRepository(sql, itemAvailability)
      : unavailableItemAvailabilityRepository());

  // Suscripciones con Stripe (ADR 019). Without a key every billing
  // endpoint answers 503 BILLING_UNAVAILABLE; nothing else changes.
  const billingGateway = config.STRIPE_SECRET_KEY
    ? createStripeGateway({
        secretKey: config.STRIPE_SECRET_KEY,
        ...(config.STRIPE_WEBHOOK_SECRET
          ? { webhookSecret: config.STRIPE_WEBHOOK_SECRET }
          : {}),
      })
    : null;
  const billingNoticeFrom = config.RESEND_API_KEY
    ? (config.BILLING_EMAIL_FROM ?? config.INVITATION_EMAIL_FROM ?? null)
    : null;
  // ADR 020 §4: pausing public pages needs the Resolver and a key of its
  // own; never the publish key or the staff suspension key.
  const billingPauseKey =
    config.BILLING_COMMAND_KEY &&
    config.BILLING_COMMAND_KEY !== config.PUBLISH_COMMAND_KEY
      ? config.BILLING_COMMAND_KEY
      : null;
  const billingResolverUrl =
    config.BILLING_RESOLVER_URL ?? config.TAP_RESOLVER_URL;
  const billingPause =
    billingResolverUrl && billingPauseKey
      ? createBillingPauseClient({
          resolverUrl: billingResolverUrl,
          commandKey: billingPauseKey,
        })
      : null;
  // ADR 020, addendum of 2026-10-01: "true" deletes 90 days after the end,
  // "dry-run" only counts what would go. Off in every deployment for now.
  const billingDeletionMode = deletionModeOf(config.BILLING_DELETE_ENABLED);
  const billingDeletionEnabled = billingDeletionMode === "on";
  // Cleanup after each deletion: the Resolver retires the Touchpoint (410)
  // with the publish key, as when a customer retires one; the assets Worker
  // deletes the uploads.
  const billingDeletionCleanup: DeletionCleanupClients = {
    retireTouchpoint:
      billingResolverUrl && config.PUBLISH_COMMAND_KEY
        ? createResolverRetireClient({
            resolverUrl: billingResolverUrl,
            commandKey: config.PUBLISH_COMMAND_KEY,
          })
        : null,
    deleteAsset: assetWorker
      ? (target) => assetWorker.deleteObjects(target)
      : null,
  };
  // «Pruébalo» (relevo 36): the first visit through the object's channel.
  const touchpointObjectProbe: FirstVisitFinder | null =
    input?.touchpointObjectProbe !== undefined
      ? input.touchpointObjectProbe
      : analyticsEngine
        ? (args) =>
            fetchFirstVisit({
              client: analyticsEngine,
              dataset: config.TAP_ANALYTICS_DATASET,
              environment: config.TAP_ANALYTICS_ENVIRONMENT,
              ...args,
            })
        : null;
  const planVisits = createPlanVisits({
    client: analyticsEngine,
    dataset: config.TAP_ANALYTICS_DATASET,
    environment: config.TAP_ANALYTICS_ENVIRONMENT,
  });
  const appRef: { current: FastifyInstance | null } = { current: null };
  // Account deletion (ADR 023) cleans what it removed right away, whatever
  // BILLING_DELETE_ENABLED says: a deleted account leaves no page online.
  const canClean = Boolean(
    billingDeletionCleanup.retireTouchpoint ||
      billingDeletionCleanup.deleteAsset,
  );
  const deletionCleanup =
    sql && canClean
      ? () =>
          createAccessReconciler({
            sql,
            pause: null,
            deletionEnabled: false,
            cleanup: billingDeletionCleanup,
          }).runDeletionCleanup()
      : null;
  const billing: BillingService =
    input?.billing ??
    (sql
      ? createBillingService({
          sql,
          gateway: billingGateway,
          sync: billingGateway ? createBillingSync(sql, billingGateway) : null,
          customerAppOrigin: config.CUSTOMER_APP_ORIGIN,
          taxRateId: config.STRIPE_TAX_RATE_ID ?? null,
          trialRequiresCard: config.STRIPE_TRIAL_REQUIRES_CARD === "true",
          requireTermsConsent: config.STRIPE_REQUIRE_TERMS_CONSENT === "true",
          termsUrl: config.BILLING_TERMS_URL ?? null,
          access: createAccessReconciler({
            sql,
            pause: billingPause,
            deletionEnabled: billingDeletionEnabled,
            deletionDryRun: billingDeletionMode === "dry-run",
            cleanup: billingDeletionEnabled ? billingDeletionCleanup : null,
            // The app (and its logger) is built below; the tick runs later.
            onError: (workspaceId, error) =>
              appRef.current?.log.warn(
                { err: error, workspaceId },
                "Billing access step failed; the next tick retries it.",
              ),
          }),
          deletionEnabled: billingDeletionEnabled,
          pendingCleanup: deletionCleanup,
          planOverage: {
            pause: billingPause,
            visits: planVisits,
            onError: (workspaceId, error) =>
              appRef.current?.log.warn(
                { err: error, workspaceId },
                "Plan overage step failed; the next tick retries it.",
              ),
          },
          checkoutBranding: {
            ...KARDO_CHECKOUT_BRANDING,
            logoFileId: config.STRIPE_BRAND_LOGO_FILE_ID ?? null,
            iconFileId: config.STRIPE_BRAND_ICON_FILE_ID ?? null,
          },
          notices: billingNoticeFrom
            ? createNoticeSender({
                sql,
                emailer: createResendEmailer({
                  apiKey: config.RESEND_API_KEY ?? "",
                  from: billingNoticeFrom,
                }),
                links: {
                  appOrigin: config.CUSTOMER_APP_ORIGIN,
                  termsUrl: config.BILLING_TERMS_URL ?? null,
                },
              })
            : null,
        })
      : unavailableBillingService());

  const planSelection: PlanSelectionRepository =
    input?.planSelection ??
    (sql
      ? createPostgresPlanSelectionRepository(sql, {
          visits: planVisits,
          pause: billingPause,
          onError: (error) =>
            appRef.current?.log.warn(
              { err: error },
              "Plan selection pauses stay queued for the hourly task.",
            ),
        })
      : unavailablePlanSelectionRepository());

  // Activating a kit can give the account its 30 days back: its paused
  // pages resume right away (the hourly tick does it otherwise).
  const pieceAccess =
    sql && billingPause
      ? createAccessReconciler({
          sql,
          pause: billingPause,
          deletionEnabled: false,
        })
      : null;
  const kardoPieceRepository: KardoPieceRepository =
    input?.kardoPieceRepository ??
    (sql
      ? createPostgresKardoPieceRepository(sql, {
          resolver: touchpointAvailability,
          ...(pieceAccess
            ? {
                reconcile: async (workspaceId: string) => {
                  await pieceAccess.reconcileWorkspace(workspaceId);
                },
              }
            : {}),
        })
      : unavailableKardoPieceRepository());

  const fiscal: FiscalRepository =
    input?.fiscal ??
    (sql ? createPostgresFiscalRepository(sql) : unavailableFiscalRepository());

  const rateLimiters = createRateLimiters({
    general: {
      ...defaultRateLimitConfig.general,
      ...input?.rateLimit?.general,
    },
    sensitive: {
      ...defaultRateLimitConfig.sensitive,
      ...input?.rateLimit?.sensitive,
    },
  });

  const deps: AppDependencies = {
    sessionVerifier,
    profileRepository,
    workspaceRepository,
    workspaceProfileRepository,
    workspaceExporter,
    businessSlugRepository,
    linkRepository,
    qrDesignRepository,
    memberRepository,
    touchpointRepository,
    kardoPieceRepository,
    groupRepository,
    experienceRepository,
    assetRepository,
    assetWorker,
    touchpointAvailability,
    touchpointObjectProbe,
    leadRepository,
    leadDeliveryRepository,
    analyticsRepository,
    dashboardRepository,
    notificationRepository,
    accountRepository,
    deletionCleanup,
    sessionStates,
    itemAvailabilityRepository,
    rateLimiters,
    publisherKick,
    invitationMailer,
    helpAssistant,
    customHtmlModel,
    customHtmlAssistantRepository,
    customHtmlLimiter,
    customHtmlBudget,
    customHtmlUserLimits,
    billing,
    fiscal,
    planSelection,
    facturapi:
      input?.facturapi !== undefined
        ? input.facturapi
        : config.FACTURAPI_KEY
          ? createFacturapiClient({ secretKey: config.FACTURAPI_KEY })
          : null,
    customerAppOrigin: config.CUSTOMER_APP_ORIGIN,
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
    // Without a trusted hop every client behind Cloud Run's front end would
    // share the proxy's address, and one rate-limit bucket.
    // Same as a numeric hop count: trust the first N proxies from the socket.
    trustProxy: (_address: string, hop: number) =>
      hop < config.TRUST_PROXY_HOPS,
    // 256 KiB: generous for any Experience content or metadata payload this
    // API accepts, tight enough to blunt a body-size abuse attempt. Asset
    // bytes themselves never transit this service — uploads go straight to
    // the Asset Worker via a signed URL.
    bodyLimit: 256 * 1024,
  });
  appRef.current = app;

  if (sql) {
    app.addHook("onClose", async () => {
      await sql.end({ timeout: 5 });
    });
  }

  // Every response — success or error — gets the same defensive headers.
  // `cache-control: no-store` keeps workspace data out of shared/browser
  // caches; the other two are standard clickjacking/MIME-sniffing/referrer
  // hardening for a JSON API with no reason to ever be framed.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    return payload;
  });

  // A fixed-window rate limit, keyed by IP (the token is not verified yet),
  // applies to every request before it reaches a handler. Handlers
  // for a short list of sensitive mutations (invitations, asset uploads,
  // publication intents) additionally call `rateLimiters.checkSensitive`.
  app.addHook("onRequest", async (request) => {
    rateLimiters.checkGeneral(request);
  });

  // 5xx share for GET /health/ready (ADR 022); the probes themselves don't count.
  app.addHook("onResponse", async (request, reply) => {
    if (!request.url.startsWith("/health"))
      errorWindow.record(reply.statusCode);
  });

  void app.register(cors, {
    // The Customer App authenticates with a Supabase-issued Bearer token,
    // never cookies, so the API has no reason to participate in the
    // credentialed-CORS handshake — and every reason not to.
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    origin: config.CUSTOMER_APP_ORIGIN,
  });
  void app.register(swagger, {
    openapi: {
      info: {
        title: "Kardo Customer API",
        version: "0.1.0",
        description:
          "Customer control-plane API. Staff endpoints are intentionally excluded.",
      },
    },
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        response: { 200: HealthSchema },
      },
    },
    async (request) => ({
      service: "customer-api",
      status: "ok",
      requestId: request.id,
    }),
  );

  // ADR 022: what the status Worker probes. Without STATUS_PROBE_KEY, or
  // with a wrong key, it does not exist (404), like the billing tick.
  const statusProbeKey = config.STATUS_PROBE_KEY;
  if (statusProbeKey) {
    app.get(
      "/health/ready",
      {
        schema: {
          hide: true,
          response: { 200: HealthReadySchema, 503: HealthReadySchema },
        },
      },
      async (request, reply) => {
        if (
          !statusKeyMatches(
            statusProbeKey,
            request.headers["x-kardo-status-key"],
          )
        ) {
          return reply.callNotFound();
        }
        const database = await readinessProbe.check();
        const errors = errorWindow.snapshot();
        const status = readinessStatus(database, errors);
        return reply.code(status === "error" ? 503 : 200).send({
          service: "customer-api",
          status,
          database: { ok: database.ok, latencyMs: database.latencyMs },
          publishQueue: database.queue,
          errors,
        });
      },
    );
  }

  // The OpenAPI document describes every internal route shape; it stays
  // available in local/dev/test for tooling, but is not exposed in
  // production.
  if (config.KARDO_ENV !== "production") {
    app.get("/openapi.json", { schema: { hide: true } }, async () =>
      app.swagger(),
    );
  }

  registerProfileRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerWorkspaceRoutes(app, deps);
  registerBusinessSlugRoutes(app, deps);
  registerLinkRoutes(app, deps);
  registerHelpRoutes(app, deps);
  registerMemberRoutes(app, deps);
  registerTouchpointRoutes(app, deps);
  registerKardoPieceRoutes(app, deps);
  registerQrDesignRoutes(app, deps);
  registerTouchpointGroupRoutes(app, deps);
  registerExperienceRoutes(app, deps);
  registerCustomHtmlRoutes(app, deps);
  registerDesignAiRoutes(app, deps);
  registerAssetRoutes(app, deps);
  registerAnalyticsRoutes(app, deps);
  registerDashboardRoutes(app, deps);
  registerNotificationRoutes(app, deps);
  registerAvailabilityRoutes(app, deps);
  registerLeadRoutes(app, deps);
  registerLeadDeliveryRoutes(app, deps);
  registerBillingRoutes(app, deps, {
    cronKey: config.BILLING_CRON_KEY ?? null,
  });

  app.setErrorHandler(customerApiErrorHandler);

  return app;
}
