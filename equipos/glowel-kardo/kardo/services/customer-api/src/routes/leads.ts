import {
  ApiErrorSchema,
  LeadPageSchema,
  type LeadRetention,
  LeadRetentionSchema,
  LeadSchema,
  type LeadStatus,
  type UpdateLead,
  UpdateLeadSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { buildCsvDocument } from "../csv.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";

type WorkspaceLeadParams = WorkspaceParams & { leadId: string };
const workspaceLeadParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "leadId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    leadId: { type: "string", format: "uuid" },
  },
} as const;

import { requireSession } from "../http/session.js";

const listQuerystringSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    touchpointId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["new", "contacted", "closed"] },
    cursor: { type: "string", maxLength: 200 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
} as const;

type ListQuerystring = {
  touchpointId?: string;
  status?: LeadStatus;
  cursor?: string;
  limit?: number;
};

const exportQuerystringSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    touchpointId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["new", "contacted", "closed"] },
  },
} as const;

type ExportQuerystring = { touchpointId?: string; status?: LeadStatus };

/** The CSV says what the panel says (domain audit A2-53). */
const leadStatusNames: Record<LeadStatus, string> = {
  new: "Por atender",
  contacted: "Atendida",
  closed: "Cerrada",
};

export function registerLeadRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/leads",
    {
      schema: {
        tags: ["leads"],
        summary: "List leads captured by a workspace's lead forms",
        params: workspaceParamsSchema,
        querystring: listQuerystringSchema,
        response: {
          200: LeadPageSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const query = request.query as ListQuerystring;
      return deps.leadRepository.listLeads(identity, params.workspaceId, {
        ...(query.touchpointId ? { touchpointId: query.touchpointId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit ?? 50,
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/leads/export",
    {
      schema: {
        tags: ["leads"],
        summary: "Export leads as a CSV file",
        params: workspaceParamsSchema,
        querystring: exportQuerystringSchema,
        response: {
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const query = request.query as ExportQuerystring;
      const leads = await deps.leadRepository.exportLeads(
        identity,
        params.workspaceId,
        query.touchpointId,
        query.status,
      );
      const csv = buildCsvDocument(
        [
          "Fecha",
          "QR, etiqueta o link",
          "Nombre",
          "Correo",
          "Teléfono",
          "Mensaje",
          "Estado",
        ],
        leads.map((lead) => [
          lead.createdAt,
          lead.touchpointName ?? "",
          lead.name ?? "",
          lead.email,
          lead.phone ?? "",
          lead.message ?? "",
          lead.status ? leadStatusNames[lead.status] : "",
        ]),
      );
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="kardo-leads.csv"')
        .send(csv);
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/leads/:leadId",
    {
      schema: {
        tags: ["leads"],
        summary: "Change a lead's follow-up status",
        params: workspaceLeadParamsSchema,
        body: UpdateLeadSchema,
        response: {
          200: LeadSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceLeadParams;
      return deps.leadRepository.updateLeadStatus(
        identity,
        params.workspaceId,
        params.leadId,
        (request.body as UpdateLead).status,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/leads/:leadId",
    {
      schema: {
        tags: ["leads"],
        summary: "Erase a lead and its personal data",
        params: workspaceLeadParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceLeadParams;
      await deps.leadRepository.deleteLead(
        identity,
        params.workspaceId,
        params.leadId,
      );
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/lead-retention",
    {
      schema: {
        tags: ["leads"],
        summary: "Read how long this workspace keeps leads",
        params: workspaceParamsSchema,
        response: {
          200: LeadRetentionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.leadRepository.getLeadRetention(identity, params.workspaceId);
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/lead-retention",
    {
      schema: {
        tags: ["leads"],
        summary:
          "Set lead retention; older leads are hidden now and deleted daily",
        params: workspaceParamsSchema,
        body: LeadRetentionSchema,
        response: {
          200: LeadRetentionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.leadRepository.setLeadRetention(
        identity,
        params.workspaceId,
        request.body as LeadRetention,
      );
    },
  );
}
