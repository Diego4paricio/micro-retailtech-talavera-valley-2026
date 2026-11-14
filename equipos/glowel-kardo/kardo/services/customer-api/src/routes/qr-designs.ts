import {
  ApiErrorSchema,
  type ApplyQrTemplate,
  ApplyQrTemplateResultSchema,
  ApplyQrTemplateSchema,
  type CreateQrTemplate,
  CreateQrTemplateSchema,
  QrDesignOverviewSchema,
  QrTemplateDetailSchema,
  QrTemplateListSchema,
  QrTemplateSchema,
  type RecordQrExports,
  RecordQrExportsSchema,
  type SaveTouchpointQrDesign,
  SaveTouchpointQrDesignSchema,
  type SetGroupQrTemplate,
  SetGroupQrTemplateSchema,
  TouchpointQrDesignSchema,
  type UpdateQrTemplate,
  UpdateQrTemplateSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import { stripNestedSchemaIds } from "../http/schema-utils.js";
import {
  type WorkspaceGroupParams,
  type WorkspaceParams,
  type WorkspaceQrTemplateParams,
  type WorkspaceTouchpointParams,
  workspaceGroupParamsSchema,
  workspaceParamsSchema,
  workspaceQrTemplateParamsSchema,
  workspaceTouchpointParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

// See `stripNestedSchemaIds`: every wrapper embeds `QrDesignSchema` ($id).
const Safe = {
  touchpointDesign: stripNestedSchemaIds(TouchpointQrDesignSchema),
  saveTouchpointDesign: stripNestedSchemaIds(SaveTouchpointQrDesignSchema),
  overview: stripNestedSchemaIds(QrDesignOverviewSchema),
  template: stripNestedSchemaIds(QrTemplateSchema),
  templateList: stripNestedSchemaIds(QrTemplateListSchema),
  templateDetail: stripNestedSchemaIds(QrTemplateDetailSchema),
  createTemplate: stripNestedSchemaIds(CreateQrTemplateSchema),
  updateTemplate: stripNestedSchemaIds(UpdateQrTemplateSchema),
};

const noContent = { type: "null" } as const;

/**
 * Estudio QR: the design library, where each Touchpoint's design comes from,
 * group defaults and print tracking. A design is visual only: every QR
 * encodes its Touchpoint's permanent address, so no change here ever
 * invalidates a printed code.
 */
export function registerQrDesignRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/qr-designs",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Where the design of every active QR Touchpoint comes from",
        params: workspaceParamsSchema,
        response: {
          200: Safe.overview,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.qrDesignRepository.overview(identity, params.workspaceId);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId/qr-design",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Read the QR design in effect for a Touchpoint and its source",
        params: workspaceTouchpointParamsSchema,
        response: {
          200: Safe.touchpointDesign,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceTouchpointParams;
      return deps.qrDesignRepository.getTouchpointDesign(
        identity,
        params.workspaceId,
        params.touchpointId,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/touchpoints/:touchpointId/qr-design",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Customize a QR Touchpoint, apply a library design or follow its group",
        params: workspaceTouchpointParamsSchema,
        body: Safe.saveTouchpointDesign,
        response: {
          200: Safe.touchpointDesign,
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
      return deps.qrDesignRepository.saveTouchpointDesign(
        identity,
        params.workspaceId,
        params.touchpointId,
        request.body as SaveTouchpointQrDesign,
      );
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/qr-templates",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "List the organization's QR design library",
        params: workspaceParamsSchema,
        response: {
          200: Safe.templateList,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.qrDesignRepository.listTemplates(
        identity,
        params.workspaceId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/qr-templates",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Add a design to the organization's library",
        params: workspaceParamsSchema,
        body: Safe.createTemplate,
        response: {
          201: Safe.template,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const template = await deps.qrDesignRepository.createTemplate(
        identity,
        params.workspaceId,
        request.body as CreateQrTemplate,
      );
      return reply.code(201).send(template);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/qr-templates/:templateId",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "A library design and the Touchpoints and groups using it",
        params: workspaceQrTemplateParamsSchema,
        response: {
          200: Safe.templateDetail,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceQrTemplateParams;
      return deps.qrDesignRepository.getTemplate(
        identity,
        params.workspaceId,
        params.templateId,
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/qr-templates/:templateId",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Edit a library design (updates every Touchpoint and group using it)",
        params: workspaceQrTemplateParamsSchema,
        body: Safe.updateTemplate,
        response: {
          200: Safe.template,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceQrTemplateParams;
      return deps.qrDesignRepository.updateTemplate(
        identity,
        params.workspaceId,
        params.templateId,
        request.body as UpdateQrTemplate,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/qr-templates/:templateId",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Delete a library design no Touchpoint or group uses",
        params: workspaceQrTemplateParamsSchema,
        response: {
          204: noContent,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceQrTemplateParams;
      await deps.qrDesignRepository.deleteTemplate(
        identity,
        params.workspaceId,
        params.templateId,
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/qr-templates/:templateId/applications",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Apply a library design to Touchpoints and as the default of groups",
        params: workspaceQrTemplateParamsSchema,
        body: ApplyQrTemplateSchema,
        response: {
          200: ApplyQrTemplateResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceQrTemplateParams;
      return deps.qrDesignRepository.applyTemplate(
        identity,
        params.workspaceId,
        params.templateId,
        request.body as ApplyQrTemplate,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/touchpoint-groups/:groupId/qr-design",
    {
      schema: {
        tags: ["touchpoints"],
        summary:
          "Set the library design a group gives its Touchpoints (current and future)",
        params: workspaceGroupParamsSchema,
        body: SetGroupQrTemplateSchema,
        response: {
          204: noContent,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceGroupParams;
      await deps.qrDesignRepository.setGroupTemplate(
        identity,
        params.workspaceId,
        params.groupId,
        (request.body as SetGroupQrTemplate).templateId,
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/qr-exports",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Record which design each exported QR was printed with",
        params: workspaceParamsSchema,
        body: RecordQrExportsSchema,
        response: {
          204: noContent,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      await deps.qrDesignRepository.recordExports(
        identity,
        params.workspaceId,
        request.body as RecordQrExports,
      );
      return reply.code(204).send();
    },
  );
}
