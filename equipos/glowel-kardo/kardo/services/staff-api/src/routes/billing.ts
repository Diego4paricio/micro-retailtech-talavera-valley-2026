import {
  ApiErrorSchema,
  cfdiRequestStatuses,
  type StaffAccessFilter,
  StaffAccessWorkspaceListSchema,
  StaffAccountingMonthSchema,
  type StaffBillingCancel,
  StaffBillingCancelSchema,
  StaffBillingCatalogSyncSchema,
  StaffBillingEventListSchema,
  type StaffBillingExtendTrial,
  StaffBillingExtendTrialSchema,
  StaffBillingOverviewSchema,
  type StaffBillingReason,
  StaffBillingReasonSchema,
  type StaffBillingRefundRequest,
  StaffBillingRefundRequestSchema,
  StaffBillingSubscriptionPageSchema,
  StaffCfdiRequestListSchema,
  StaffCfdiRequestSchema,
  type StaffExtendKardoTrial,
  StaffExtendKardoTrialSchema,
  StaffGlobalInvoiceSchema,
  type StaffResolveCfdi,
  StaffResolveCfdiSchema,
  type StaffSetWorkspaceInternal,
  StaffSetWorkspaceInternalSchema,
  StaffWorkspaceBillingSchema,
  staffAccessFilters,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

type SubscriptionParams = { subscriptionId: string };
const subscriptionParamsSchema = {
  type: "object",
  properties: {
    subscriptionId: { type: "string", pattern: "^sub_[A-Za-z0-9]{6,64}$" },
  },
  required: ["subscriptionId"],
  additionalProperties: false,
} as const;

type InvoiceParams = { invoiceId: string };
const invoiceParamsSchema = {
  type: "object",
  properties: {
    invoiceId: { type: "string", pattern: "^in_[A-Za-z0-9]{6,64}$" },
  },
  required: ["invoiceId"],
  additionalProperties: false,
} as const;

type SubscriptionQuery = {
  status?: string;
  plan?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};
const subscriptionQuerySchema = {
  type: "object",
  properties: {
    status: { type: "string", maxLength: 32 },
    plan: { type: "string", pattern: "^[a-z0-9_-]{2,64}$" },
    q: { type: "string", maxLength: 120 },
    cursor: { type: "string", maxLength: 200 },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
  additionalProperties: false,
} as const;

const eventQuerySchema = {
  type: "object",
  properties: { status: { type: "string", enum: ["failed", "all"] } },
  additionalProperties: false,
} as const;

const accessQuerySchema = {
  type: "object",
  properties: { state: { type: "string", enum: [...staffAccessFilters] } },
  required: ["state"],
  additionalProperties: false,
} as const;

const cfdiQuerySchema = {
  type: "object",
  properties: { status: { type: "string", enum: [...cfdiRequestStatuses] } },
  additionalProperties: false,
} as const;

type CfdiParams = { requestId: string };
const cfdiParamsSchema = {
  type: "object",
  properties: { requestId: { type: "string", format: "uuid" } },
  required: ["requestId"],
  additionalProperties: false,
} as const;

const globalInvoiceQuerySchema = {
  type: "object",
  properties: {
    month: { type: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
  },
  additionalProperties: false,
} as const;

const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  503: ApiErrorSchema,
};

export function registerBillingRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/billing/overview",
    {
      schema: {
        tags: ["billing"],
        response: { 200: StaffBillingOverviewSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.billingRepository.overview(identity.subject);
    },
  );

  app.get(
    "/v1/staff/billing/subscriptions",
    {
      schema: {
        tags: ["billing"],
        querystring: subscriptionQuerySchema,
        response: { 200: StaffBillingSubscriptionPageSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as SubscriptionQuery;
      return deps.billingRepository.listSubscriptions(identity.subject, query);
    },
  );

  app.get(
    "/v1/staff/billing/events",
    {
      schema: {
        tags: ["billing"],
        querystring: eventQuerySchema,
        response: { 200: StaffBillingEventListSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as { status?: "failed" | "all" };
      return deps.billingRepository.listEvents(
        identity.subject,
        query.status ?? "failed",
      );
    },
  );

  app.get(
    "/v1/staff/workspaces/:workspaceId/billing",
    {
      schema: {
        tags: ["billing"],
        params: workspaceParamsSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as WorkspaceParams;
      return deps.billingRepository.workspaceBilling(
        identity.subject,
        params.workspaceId,
      );
    },
  );

  app.get(
    "/v1/staff/billing/access",
    {
      schema: {
        tags: ["billing"],
        querystring: accessQuerySchema,
        response: { 200: StaffAccessWorkspaceListSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as { state: StaffAccessFilter };
      return deps.billingRepository.listAccess(identity.subject, query.state);
    },
  );

  app.put(
    "/v1/staff/workspaces/:workspaceId/internal",
    {
      schema: {
        tags: ["billing"],
        params: workspaceParamsSchema,
        body: StaffSetWorkspaceInternalSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as WorkspaceParams;
      const body = request.body as StaffSetWorkspaceInternal;
      return deps.billingRepository.setInternal(
        identity.subject,
        params.workspaceId,
        body.internal,
        body.reason,
      );
    },
  );

  app.post(
    "/v1/staff/workspaces/:workspaceId/kardo-trial/extend",
    {
      schema: {
        tags: ["billing"],
        params: workspaceParamsSchema,
        body: StaffExtendKardoTrialSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as WorkspaceParams;
      const body = request.body as StaffExtendKardoTrial;
      return deps.billingRepository.extendKardoTrial(
        identity.subject,
        params.workspaceId,
        body.days,
        body.reason,
      );
    },
  );

  app.post(
    "/v1/staff/billing/subscriptions/:subscriptionId/cancel",
    {
      schema: {
        tags: ["billing"],
        params: subscriptionParamsSchema,
        body: StaffBillingCancelSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as SubscriptionParams;
      return deps.billingRepository.cancel(
        identity.subject,
        params.subscriptionId,
        request.body as StaffBillingCancel,
      );
    },
  );

  app.post(
    "/v1/staff/billing/subscriptions/:subscriptionId/resume",
    {
      schema: {
        tags: ["billing"],
        params: subscriptionParamsSchema,
        body: StaffBillingReasonSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as SubscriptionParams;
      const body = request.body as StaffBillingReason;
      return deps.billingRepository.resume(
        identity.subject,
        params.subscriptionId,
        body.reason,
      );
    },
  );

  app.post(
    "/v1/staff/billing/subscriptions/:subscriptionId/extend-trial",
    {
      schema: {
        tags: ["billing"],
        params: subscriptionParamsSchema,
        body: StaffBillingExtendTrialSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as SubscriptionParams;
      const body = request.body as StaffBillingExtendTrial;
      return deps.billingRepository.extendTrial(
        identity.subject,
        params.subscriptionId,
        body.days,
        body.reason,
      );
    },
  );

  app.post(
    "/v1/staff/billing/subscriptions/:subscriptionId/resync",
    {
      schema: {
        tags: ["billing"],
        params: subscriptionParamsSchema,
        body: StaffBillingReasonSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as SubscriptionParams;
      const body = request.body as StaffBillingReason;
      return deps.billingRepository.resync(
        identity.subject,
        params.subscriptionId,
        body.reason,
      );
    },
  );

  app.post(
    "/v1/staff/billing/invoices/:invoiceId/refund",
    {
      schema: {
        tags: ["billing"],
        params: invoiceParamsSchema,
        body: StaffBillingRefundRequestSchema,
        response: { 200: StaffWorkspaceBillingSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as InvoiceParams;
      const body = request.body as StaffBillingRefundRequest;
      return deps.billingRepository.refund(identity.subject, params.invoiceId, {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        reason: body.reason,
      });
    },
  );

  app.post(
    "/v1/staff/billing/catalog/sync",
    {
      schema: {
        tags: ["billing"],
        response: { 200: StaffBillingCatalogSyncSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.billingRepository.syncCatalog(identity.subject);
    },
  );

  app.get(
    "/v1/staff/billing/cfdi",
    {
      schema: {
        tags: ["billing"],
        querystring: cfdiQuerySchema,
        response: { 200: StaffCfdiRequestListSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as {
        status?: (typeof cfdiRequestStatuses)[number];
      };
      return deps.billingRepository.listCfdiRequests(
        identity.subject,
        query.status ?? "pending",
      );
    },
  );

  app.post(
    "/v1/staff/billing/cfdi/:requestId/resolve",
    {
      schema: {
        tags: ["billing"],
        params: cfdiParamsSchema,
        body: StaffResolveCfdiSchema,
        response: { 200: StaffCfdiRequestSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as CfdiParams;
      return deps.billingRepository.resolveCfdiRequest(
        identity.subject,
        params.requestId,
        request.body as StaffResolveCfdi,
      );
    },
  );

  // ADR 020 §6, phase 2: issue a pending request with Facturapi.
  app.post(
    "/v1/staff/billing/cfdi/:requestId/facturapi",
    {
      schema: {
        tags: ["billing"],
        params: cfdiParamsSchema,
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            /** c_FormaPago: 04 credit card (default), 28 debit card. */
            paymentForm: { type: "string", enum: ["04", "28"] },
          },
        },
        response: { 200: StaffCfdiRequestSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as CfdiParams;
      const body = (request.body ?? {}) as { paymentForm?: "04" | "28" };
      return deps.billingRepository.issueCfdiWithFacturapi(
        identity.subject,
        params.requestId,
        { paymentForm: body.paymentForm ?? "04" },
      );
    },
  );

  // The PDF or XML of a CFDI issued with Facturapi (fetched on demand).
  app.get(
    "/v1/staff/billing/cfdi/:requestId/:format",
    {
      schema: {
        tags: ["billing"],
        params: {
          type: "object",
          required: ["requestId", "format"],
          additionalProperties: false,
          properties: {
            requestId: { type: "string", format: "uuid" },
            format: { type: "string", enum: ["pdf", "xml"] },
          },
        },
      },
    },
    async (request, reply) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as {
        requestId: string;
        format: "pdf" | "xml";
      };
      const file = await deps.billingRepository.cfdiDocument(
        identity.subject,
        params.requestId,
        params.format,
      );
      return reply
        .header("content-type", file.contentType)
        .header(
          "content-disposition",
          `attachment; filename="cfdi-${params.requestId.slice(0, 8)}.${params.format}"`,
        )
        .header("cache-control", "no-store")
        .send(Buffer.from(file.body));
    },
  );

  app.get(
    "/v1/staff/billing/global-invoice",
    {
      schema: {
        tags: ["billing"],
        querystring: globalInvoiceQuerySchema,
        response: { 200: StaffGlobalInvoiceSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as { month?: string };
      return deps.billingRepository.globalInvoice(
        identity.subject,
        query.month,
      );
    },
  );

  // The month for the accountant: every payment in one path (CFDI
  // individual or global) with its IVA, refunds and the Stripe
  // reconciliation (Docs/fiscal/2026-10-separacion-cfdi.md).
  app.get(
    "/v1/staff/billing/accounting",
    {
      schema: {
        tags: ["billing"],
        querystring: globalInvoiceQuerySchema,
        response: { 200: StaffAccountingMonthSchema, ...errors },
      },
    },
    async (request, reply) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as { month?: string };
      reply.header("cache-control", "no-store");
      return deps.billingRepository.accountingMonth(
        identity.subject,
        query.month,
      );
    },
  );
}
