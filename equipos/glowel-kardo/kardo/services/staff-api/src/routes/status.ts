import {
  type AddStatusUpdate,
  AddStatusUpdateSchema,
  ApiErrorSchema,
  type CreateStatusIncident,
  CreateStatusIncidentSchema,
  StaffServiceStatusSchema,
  StaffStatusIncidentListSchema,
  StaffStatusIncidentSchema,
  staffPermissions,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { StatusWorkerClient } from "../clients/status-worker.js";
import type { AppDependencies } from "../http/dependencies.js";
import { StaffDependencyError } from "../http/errors.js";
import {
  type StatusIncidentParams,
  statusIncidentParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  503: ApiErrorSchema,
};

function requireWorker(deps: AppDependencies): StatusWorkerClient {
  if (!deps.statusWorker) {
    throw new StaffDependencyError("The status service is not configured.");
  }
  return deps.statusWorker;
}

/** Estado del servicio (ADR 022): technical detail, incidents, maintenance. */
export function registerStatusRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/status",
    {
      schema: {
        tags: ["status"],
        response: { 200: StaffServiceStatusSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      await deps.statusRepository.requirePermission(
        identity.subject,
        staffPermissions.statusRead,
      );
      const worker = requireWorker(deps);
      try {
        return await worker.getDetail();
      } catch {
        throw new StaffDependencyError("The status service did not answer.");
      }
    },
  );

  app.post(
    "/v1/staff/status/check",
    {
      schema: {
        tags: ["status"],
        response: { 200: StaffServiceStatusSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      await deps.statusRepository.requirePermission(
        identity.subject,
        staffPermissions.statusWrite,
      );
      const worker = requireWorker(deps);
      try {
        await worker.runChecks();
        return await worker.getDetail();
      } catch {
        throw new StaffDependencyError("The status service did not answer.");
      }
    },
  );

  app.get(
    "/v1/staff/status/incidents",
    {
      schema: {
        tags: ["status"],
        response: { 200: StaffStatusIncidentListSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.statusRepository.listIncidents(identity.subject);
    },
  );

  app.post(
    "/v1/staff/status/incidents",
    {
      schema: {
        tags: ["status"],
        body: CreateStatusIncidentSchema,
        response: { 201: StaffStatusIncidentSchema, ...errors },
      },
    },
    async (request, reply) => {
      const identity = await requireStaffIdentity(request, deps);
      await deps.statusRepository.requirePermission(
        identity.subject,
        staffPermissions.statusWrite,
      );
      const incident = await deps.statusRepository.createIncident(
        identity.subject,
        request.body as CreateStatusIncident,
        requireWorker(deps),
      );
      return reply.code(201).send(incident);
    },
  );

  app.post(
    "/v1/staff/status/incidents/:incidentId/updates",
    {
      schema: {
        tags: ["status"],
        params: statusIncidentParamsSchema,
        body: AddStatusUpdateSchema,
        response: { 200: StaffStatusIncidentSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      await deps.statusRepository.requirePermission(
        identity.subject,
        staffPermissions.statusWrite,
      );
      const params = request.params as StatusIncidentParams;
      return deps.statusRepository.addUpdate(
        identity.subject,
        params.incidentId,
        request.body as AddStatusUpdate,
        requireWorker(deps),
      );
    },
  );

  app.post(
    "/v1/staff/status/sync",
    {
      schema: {
        tags: ["status"],
        response: {
          200: {
            type: "object",
            properties: { incidents: { type: "integer", minimum: 0 } },
            required: ["incidents"],
            additionalProperties: false,
          },
          ...errors,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const incidents = await deps.statusRepository.resync(
        identity.subject,
        requireWorker(deps),
      );
      return { incidents };
    },
  );
}
