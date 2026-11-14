import {
  ApiErrorSchema,
  type CreateTouchpoint,
  type CreateTouchpointBatch,
  CreateTouchpointBatchSchema,
  CreateTouchpointSchema,
  TouchpointBatchResultSchema,
  TouchpointListSchema,
  type TouchpointObjectProbeRequest,
  TouchpointObjectProbeRequestSchema,
  TouchpointObjectProbeSchema,
  TouchpointSchema,
  type UpdateTouchpoint,
  type UpdateTouchpointObject,
  UpdateTouchpointObjectSchema,
  UpdateTouchpointSchema,
  type UpdateTouchpointStatus,
  UpdateTouchpointStatusSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { UnavailableError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  type WorkspaceTouchpointParams,
  workspaceParamsSchema,
  workspaceTouchpointParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

export function registerTouchpointRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/touchpoints",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "List Touchpoints in a customer workspace",
        params: workspaceParamsSchema,
        response: {
          200: TouchpointListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.touchpointRepository.listTouchpoints(
        identity,
        params.workspaceId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/touchpoints",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Create a Touchpoint with a permanent public ID",
        params: workspaceParamsSchema,
        body: CreateTouchpointSchema,
        response: {
          201: TouchpointSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const touchpoint = await deps.touchpointRepository.createTouchpoint(
        identity,
        params.workspaceId,
        request.body as CreateTouchpoint,
        deps.touchpointAvailability,
      );
      if (touchpoint.publishing) deps.publisherKick();
      return reply.code(201).send(touchpoint);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/touchpoints/batch",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Create up to 100 numbered Touchpoints (e.g. tables), optionally in a group",
        params: workspaceParamsSchema,
        body: CreateTouchpointBatchSchema,
        response: {
          201: TouchpointBatchResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const result = await deps.touchpointRepository.createTouchpointBatch(
        identity,
        params.workspaceId,
        request.body as CreateTouchpointBatch,
      );
      if (result.propagatedPublications > 0) deps.publisherKick();
      return reply.code(201).send(result);
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Rename a Touchpoint or change its physical type",
        params: workspaceTouchpointParamsSchema,
        body: UpdateTouchpointSchema,
        response: {
          200: TouchpointSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceTouchpointParams;
      const touchpoint = await deps.touchpointRepository.updateTouchpoint(
        identity,
        params.workspaceId,
        params.touchpointId,
        request.body as UpdateTouchpoint,
        deps.touchpointAvailability,
      );
      if (touchpoint.publishing) deps.publisherKick();
      return touchpoint;
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId/retire",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Permanently retire a Touchpoint (its public ID never serves again)",
        params: workspaceTouchpointParamsSchema,
        response: {
          200: TouchpointSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      if (!deps.touchpointAvailability) {
        throw new UnavailableError(
          "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
          "Touchpoint availability is not configured.",
        );
      }
      const params = request.params as WorkspaceTouchpointParams;
      return deps.touchpointRepository.retireTouchpoint(
        identity,
        params.workspaceId,
        params.touchpointId,
        deps.touchpointAvailability,
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId/status",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Pause or resume an active Touchpoint",
        params: workspaceTouchpointParamsSchema,
        body: UpdateTouchpointStatusSchema,
        response: {
          200: TouchpointSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      if (!deps.touchpointAvailability) {
        throw new UnavailableError(
          "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
          "Touchpoint availability is not configured.",
        );
      }
      const params = request.params as WorkspaceTouchpointParams;
      const touchpoint = await deps.touchpointRepository.updateTouchpointStatus(
        identity,
        params.workspaceId,
        params.touchpointId,
        request.body as UpdateTouchpointStatus,
        deps.touchpointAvailability,
      );
      return reply.code(200).send(touchpoint);
    },
  );

  // «Conecta el objeto» (relevo 36): every step is saved, so a reload or
  // leaving halfway goes back to the same step.
  app.post(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId/object",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Mark or undo a step of the physical object, or replace its chip",
        params: workspaceTouchpointParamsSchema,
        body: UpdateTouchpointObjectSchema,
        response: {
          200: TouchpointSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceTouchpointParams;
      return deps.touchpointRepository.updateTouchpointObject(
        identity,
        params.workspaceId,
        params.touchpointId,
        request.body as UpdateTouchpointObject,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId/object/probe",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Mark the object tested when its first visit has arrived",
        params: workspaceTouchpointParamsSchema,
        body: TouchpointObjectProbeRequestSchema,
        response: {
          200: TouchpointObjectProbeSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceTouchpointParams;
      const body = (request.body ?? {}) as TouchpointObjectProbeRequest;
      return deps.touchpointRepository.probeTouchpointObject(
        identity,
        params.workspaceId,
        params.touchpointId,
        deps.touchpointObjectProbe ?? null,
        body.since ? new Date(body.since) : undefined,
      );
    },
  );
}
