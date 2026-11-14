import {
  ApiErrorSchema,
  LeadDeliverySettingsResultSchema,
  LeadDeliverySettingsSchema,
  RotateWebhookSecretSchema,
  type UpdateLeadDeliverySettings,
  UpdateLeadDeliverySettingsSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

const testResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["delivered", "status"],
  properties: {
    delivered: { type: "boolean" },
    status: { type: ["integer", "null"] },
  },
} as const;

export function registerLeadDeliveryRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/lead-delivery",
    {
      schema: {
        tags: ["lead-delivery"],
        summary: "Read a workspace's lead-delivery settings",
        params: workspaceParamsSchema,
        response: {
          200: LeadDeliverySettingsSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.leadDeliveryRepository.getSettings(
        identity,
        params.workspaceId,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/lead-delivery",
    {
      schema: {
        tags: ["lead-delivery"],
        summary: "Update a workspace's lead-delivery settings",
        params: workspaceParamsSchema,
        body: UpdateLeadDeliverySettingsSchema,
        response: {
          200: LeadDeliverySettingsResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.leadDeliveryRepository.updateSettings(
        identity,
        params.workspaceId,
        request.body as UpdateLeadDeliverySettings,
      );
    },
  );

  // Domain audit A2-50: a new signing secret alone; the rest of the
  // settings stays as stored (the form's unsaved fields are not saved).
  app.post(
    "/v1/workspaces/:workspaceId/lead-delivery/webhook-secret",
    {
      schema: {
        tags: ["lead-delivery"],
        summary: "Rotate only the webhook signing secret (returned once)",
        params: workspaceParamsSchema,
        body: RotateWebhookSecretSchema,
        response: {
          200: LeadDeliverySettingsResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      return deps.leadDeliveryRepository.rotateWebhookSecret(
        identity,
        params.workspaceId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/lead-delivery/test",
    {
      schema: {
        tags: ["lead-delivery"],
        summary: "Send a signed sample event to the configured webhook",
        params: workspaceParamsSchema,
        response: {
          200: testResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      return deps.leadDeliveryRepository.testWebhook(
        identity,
        params.workspaceId,
      );
    },
  );
}
