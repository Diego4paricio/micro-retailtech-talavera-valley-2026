import { timingSafeEqual } from "node:crypto";
import {
  ApiErrorSchema,
  BillingChangeResultSchema,
  BillingCheckoutSchema,
  BillingCheckoutStatusSchema,
  BillingMyAccountSchema,
  BillingPlanListSchema,
  BillingRedirectSchema,
  CfdiRequestResultSchema,
  type ChangeBillingExtras,
  ChangeBillingExtrasSchema,
  type ChangeBillingPlan,
  ChangeBillingPlanSchema,
  type CreateBillingCheckout,
  CreateBillingCheckoutSchema,
  type CreateBillingPortal,
  CreateBillingPortalSchema,
  PlanSelectionSchema,
  SavedPlanSelectionSchema,
  type SavePlanSelection,
  SavePlanSelectionSchema,
  type UpsertFiscalProfile,
  UpsertFiscalProfileSchema,
  WorkspaceAccessSchema,
  WorkspaceBillingSchema,
  WorkspaceFiscalSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

/** Stripe events are small; 1 MiB leaves room for large invoices. */
const WEBHOOK_BODY_LIMIT = 1024 * 1024;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerBillingRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
  options: { cronKey: string | null } = { cronKey: null },
): void {
  // Hourly scheduler (Cloud Scheduler in production): trial-ending notices
  // 7 days before, and retries of pending notices. Hidden and 404 without a
  // configured key, so it never exists by accident.
  app.post(
    "/internal/billing/tick",
    { schema: { hide: true } },
    async (request) => {
      const header = request.headers.authorization ?? "";
      const given = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!options.cronKey) {
        throw new ApiError("NOT_FOUND", 404, "Not found.");
      }
      if (!sameSecret(given, options.cronKey)) {
        throw new ApiError(
          "AUTH_REQUIRED",
          401,
          "A valid scheduler key is required.",
        );
      }
      return deps.billing.runScheduledTasks();
    },
  );

  app.get(
    "/v1/billing/plans",
    {
      schema: {
        tags: ["billing"],
        summary: "Plans on sale, with prices and limits",
        response: { 200: BillingPlanListSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return deps.billing.listPlans(identity);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/billing",
    {
      schema: {
        tags: ["billing"],
        summary: "Current plan, usage, subscription and invoices",
        params: workspaceParamsSchema,
        response: {
          200: WorkspaceBillingSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.billing.getWorkspaceBilling(identity, params.workspaceId);
    },
  );

  // Downgrade option B (ADR 023): what is over the plan and the choice of
  // what stays active (Owner or Admin).
  app.get(
    "/v1/workspaces/:workspaceId/plan-selection",
    {
      schema: {
        tags: ["billing"],
        summary: "Touchpoints and Links against the plan, and what is out",
        params: workspaceParamsSchema,
        response: {
          200: PlanSelectionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.planSelection.read(identity, params.workspaceId);
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/plan-selection",
    {
      schema: {
        tags: ["billing"],
        summary: "Choose which Touchpoints and Links stay active",
        params: workspaceParamsSchema,
        body: SavePlanSelectionSchema,
        response: {
          200: SavedPlanSelectionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const body = request.body as SavePlanSelection;
      return deps.planSelection.save(identity, params.workspaceId, body.keep);
    },
  );

  // ADR 020 §4: the banner every member sees (trial days left, limited,
  // paused) and whether they may choose a plan.
  app.get(
    "/v1/workspaces/:workspaceId/access",
    {
      schema: {
        tags: ["billing"],
        summary: "Access state: trial, active, limited or paused",
        params: workspaceParamsSchema,
        response: {
          200: WorkspaceAccessSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.billing.getWorkspaceAccess(identity, params.workspaceId);
    },
  );

  // ADR 020 §6: fiscal data (optional, Owner and Admin) and CFDI requests
  // for payments of the current month. Open in every access state.
  const fiscalResponses = {
    200: WorkspaceFiscalSchema,
    400: ApiErrorSchema,
    401: ApiErrorSchema,
    403: ApiErrorSchema,
  };
  app.get(
    "/v1/workspaces/:workspaceId/billing/fiscal",
    {
      schema: {
        tags: ["billing"],
        summary: "Fiscal data and CFDI requests",
        params: workspaceParamsSchema,
        response: fiscalResponses,
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.fiscal.get(identity, params.workspaceId);
    },
  );
  app.put(
    "/v1/workspaces/:workspaceId/billing/fiscal",
    {
      schema: {
        tags: ["billing"],
        summary: "Save the fiscal data used for CFDI",
        params: workspaceParamsSchema,
        body: UpsertFiscalProfileSchema,
        response: fiscalResponses,
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      return deps.fiscal.save(
        identity,
        params.workspaceId,
        request.body as UpsertFiscalProfile,
      );
    },
  );
  app.delete(
    "/v1/workspaces/:workspaceId/billing/fiscal",
    {
      schema: {
        tags: ["billing"],
        summary: "Delete the fiscal data",
        params: workspaceParamsSchema,
        response: fiscalResponses,
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      return deps.fiscal.remove(identity, params.workspaceId);
    },
  );
  // ADR 020 §6, fase 2: el PDF o el XML de un CFDI emitido con Facturapi
  // (Owner y Admin). Kardo no los guarda: los pide a Facturapi al momento.
  app.get(
    "/v1/workspaces/:workspaceId/billing/cfdi/:requestId/:format",
    {
      schema: {
        tags: ["billing"],
        summary: "Download the PDF or XML of an issued CFDI",
        params: {
          type: "object",
          required: ["workspaceId", "requestId", "format"],
          additionalProperties: false,
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            requestId: { type: "string", format: "uuid" },
            format: { type: "string", enum: ["pdf", "xml"] },
          },
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as {
        workspaceId: string;
        requestId: string;
        format: "pdf" | "xml";
      };
      if (!deps.facturapi) {
        throw new ApiError(
          "BILLING_UNAVAILABLE",
          503,
          "Invoices are not configured in this environment.",
        );
      }
      const document = await deps.fiscal.cfdiDocument(
        identity,
        params.workspaceId,
        params.requestId,
      );
      if (!document) {
        throw new ApiError("NOT_FOUND", 404, "The CFDI was not found.");
      }
      const file = await deps.facturapi
        .download(document.providerInvoiceId, params.format)
        .catch(() => {
          throw new ApiError(
            "BILLING_UNAVAILABLE",
            503,
            "The invoice provider did not answer.",
          );
        });
      const name = `factura-kardo${document.test ? "-prueba" : ""}-${params.requestId.slice(0, 8)}.${params.format}`;
      return reply
        .header("content-type", file.contentType)
        .header("content-disposition", `attachment; filename="${name}"`)
        .header("cache-control", "no-store")
        .send(Buffer.from(file.body));
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/billing/invoices/:invoiceId/cfdi",
    {
      schema: {
        tags: ["billing"],
        summary: "Request the CFDI of a payment of the current month",
        params: {
          type: "object",
          required: ["workspaceId", "invoiceId"],
          additionalProperties: false,
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            invoiceId: { type: "string", pattern: "^in_[A-Za-z0-9]{6,64}$" },
          },
        },
        response: {
          200: CfdiRequestResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as {
        workspaceId: string;
        invoiceId: string;
      };
      const created = await deps.fiscal.requestCfdi(
        identity,
        params.workspaceId,
        params.invoiceId,
      );
      return { request: created };
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/billing/checkout",
    {
      schema: {
        tags: ["billing"],
        summary: "Start a Stripe Checkout for a plan price",
        params: workspaceParamsSchema,
        body: CreateBillingCheckoutSchema,
        response: {
          200: BillingCheckoutSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const body = request.body as CreateBillingCheckout;
      return deps.billing.createCheckout(
        identity,
        params.workspaceId,
        body.priceId,
        body.mode ?? "hosted",
      );
    },
  );

  // Return page of the embedded Checkout: was it paid? A completed session
  // also mirrors its subscription right away, so access comes back without
  // waiting for the webhook.
  app.get(
    "/v1/workspaces/:workspaceId/billing/checkout/:sessionId",
    {
      schema: {
        tags: ["billing"],
        summary: "Read the state of a Checkout started by this workspace",
        params: {
          type: "object",
          required: ["workspaceId", "sessionId"],
          additionalProperties: false,
          properties: {
            workspaceId: { type: "string", format: "uuid" },
            sessionId: {
              type: "string",
              pattern: "^cs_(test|live)_[A-Za-z0-9]{10,200}$",
            },
          },
        },
        response: {
          200: BillingCheckoutStatusSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as {
        workspaceId: string;
        sessionId: string;
      };
      return deps.billing.getCheckoutStatus(
        identity,
        params.workspaceId,
        params.sessionId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/billing/portal",
    {
      schema: {
        tags: ["billing"],
        summary: "Open the Stripe Customer Portal",
        params: workspaceParamsSchema,
        body: CreateBillingPortalSchema,
        response: {
          200: BillingRedirectSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const body = (request.body ?? {}) as CreateBillingPortal;
      const url = await deps.billing.createPortal(
        identity,
        params.workspaceId,
        body.flow ?? "default",
        body.priceId ?? null,
      );
      return { url };
    },
  );

  // ADR 024: the caller's own account, wherever they are in the panel.
  app.get(
    "/v1/billing/account",
    {
      schema: {
        tags: ["billing"],
        summary:
          "The caller's own billing account (plan, organizations, extras)",
        response: {
          200: BillingMyAccountSchema,
          401: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return deps.billing.getMyAccount(identity);
    },
  );

  // ADR 024: extras (organization, QR y etiquetas, links) as lines of the
  // person's subscription. `confirm: false` only says what it costs today.
  app.put(
    "/v1/workspaces/:workspaceId/billing/extras",
    {
      schema: {
        tags: ["billing"],
        summary: "Add or remove extras of the plan (preview or apply)",
        params: workspaceParamsSchema,
        body: ChangeBillingExtrasSchema,
        response: {
          200: BillingChangeResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      return deps.billing.changeExtras(
        identity,
        params.workspaceId,
        request.body as ChangeBillingExtras,
      );
    },
  );

  // ADR 024: changing plan with extras happens in Kardo (the Stripe portal
  // only changes single-line subscriptions), with the amount shown first.
  app.post(
    "/v1/workspaces/:workspaceId/billing/plan-change",
    {
      schema: {
        tags: ["billing"],
        summary:
          "Change the plan of the person's subscription (preview or apply)",
        params: workspaceParamsSchema,
        body: ChangeBillingPlanSchema,
        response: {
          200: BillingChangeResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const body = request.body as ChangeBillingPlan;
      return deps.billing.changePlan(
        identity,
        params.workspaceId,
        body.priceId,
        body.confirm,
      );
    },
  );

  // Stripe → Kardo. No session: the Stripe signature over the exact bytes
  // is the authentication, so this scope keeps the body as a raw Buffer.
  void app.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer", bodyLimit: WEBHOOK_BODY_LIMIT },
      (_request, body, done) => done(null, body),
    );
    scope.post(
      "/v1/billing/stripe/webhook",
      { schema: { hide: true }, bodyLimit: WEBHOOK_BODY_LIMIT },
      async (request) => {
        const signature = request.headers["stripe-signature"];
        const result = await deps.billing.handleWebhook(
          request.body as Buffer,
          typeof signature === "string" ? signature : undefined,
        );
        return { received: true, result };
      },
    );
  });
}
