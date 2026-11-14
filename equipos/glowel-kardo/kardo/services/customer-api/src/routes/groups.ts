import {
  ApiErrorSchema,
  type CreateTouchpointGroup,
  CreateTouchpointGroupSchema,
  type MoveTouchpoints,
  MoveTouchpointsResultSchema,
  MoveTouchpointsSchema,
  type SetGroupTouchpoints,
  SetGroupTouchpointsSchema,
  TouchpointGroupListSchema,
  TouchpointGroupSchema,
  type UpdateTouchpointGroup,
  UpdateTouchpointGroupSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

const workspaceGroupParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "groupId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    groupId: { type: "string", format: "uuid" },
  },
} as const;

type WorkspaceGroupParams = { workspaceId: string; groupId: string };

export function registerTouchpointGroupRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/touchpoint-groups",
    {
      schema: {
        tags: ["touchpoint-groups"],
        summary: "List a workspace's Touchpoint Groups",
        params: workspaceParamsSchema,
        response: {
          200: TouchpointGroupListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.groupRepository.listGroups(identity, params.workspaceId);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/touchpoint-groups",
    {
      schema: {
        tags: ["touchpoint-groups"],
        summary: "Create a Touchpoint Group",
        params: workspaceParamsSchema,
        body: CreateTouchpointGroupSchema,
        response: {
          201: TouchpointGroupSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const group = await deps.groupRepository.createGroup(
        identity,
        params.workspaceId,
        request.body as CreateTouchpointGroup,
      );
      return reply.code(201).send(group);
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/touchpoint-groups/:groupId",
    {
      schema: {
        tags: ["touchpoint-groups"],
        summary: "Rename a Touchpoint Group",
        params: workspaceGroupParamsSchema,
        body: UpdateTouchpointGroupSchema,
        response: {
          200: TouchpointGroupSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceGroupParams;
      return deps.groupRepository.updateGroup(
        identity,
        params.workspaceId,
        params.groupId,
        request.body as UpdateTouchpointGroup,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/touchpoint-groups/:groupId/touchpoints",
    {
      schema: {
        tags: ["touchpoint-groups"],
        summary: "Replace a Touchpoint Group's membership",
        params: workspaceGroupParamsSchema,
        body: SetGroupTouchpointsSchema,
        response: {
          200: TouchpointGroupSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceGroupParams;
      const body = request.body as SetGroupTouchpoints;
      const group = await deps.groupRepository.setGroupTouchpoints(
        identity,
        params.workspaceId,
        params.groupId,
        body.touchpointIds,
      );
      // Newly added members may have received the group Experience.
      deps.publisherKick();
      return group;
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/touchpoint-groups/:groupId",
    {
      schema: {
        tags: ["touchpoint-groups"],
        summary: "Delete a Touchpoint Group (its Touchpoints stay, ungrouped)",
        params: workspaceGroupParamsSchema,
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
      const params = request.params as WorkspaceGroupParams;
      await deps.groupRepository.deleteGroup(
        identity,
        params.workspaceId,
        params.groupId,
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/touchpoints/move",
    {
      schema: {
        tags: ["touchpoint-groups"],
        summary: "Move Touchpoints into a group, or out of their group",
        params: workspaceParamsSchema,
        body: MoveTouchpointsSchema,
        response: {
          200: MoveTouchpointsResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const body = request.body as MoveTouchpoints;
      const result = await deps.groupRepository.moveTouchpoints(
        identity,
        params.workspaceId,
        body,
      );
      if (result.propagatedPublications > 0) deps.publisherKick();
      return result;
    },
  );
}
