import {
  ApiErrorSchema,
  type NotificationInboxQuery,
  NotificationInboxQuerySchema,
  NotificationInboxSchema,
} from "@kardo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import { requireSession } from "../http/session.js";

const notificationParamsSchema = Type.Object(
  { notificationId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

/** The bell in the panel header (ADR 022). Per person, not per workspace. */
export function registerNotificationRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/notifications",
    {
      schema: {
        tags: ["notifications"],
        summary:
          "Read my notifications (pinned first), unread count and auto-open",
        querystring: NotificationInboxQuerySchema,
        response: {
          200: NotificationInboxSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const query = request.query as NotificationInboxQuery;
      return deps.notificationRepository.listInbox(identity, {
        limit: query.limit ?? 20,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.unread ? { unread: true } : {}),
      });
    },
  );

  app.post(
    "/v1/notifications/:notificationId/read",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark one notification as read",
        params: notificationParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const { notificationId } = request.params as { notificationId: string };
      await deps.notificationRepository.markRead(identity, notificationId);
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/notifications/read-all",
    {
      schema: {
        tags: ["notifications"],
        summary: "Mark every notification I can see as read",
        response: { 204: { type: "null" }, 401: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      await deps.notificationRepository.markAllRead(identity);
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/notifications/opened",
    {
      schema: {
        tags: ["notifications"],
        summary:
          "Remember that I opened the bell (it stops opening on its own)",
        response: { 204: { type: "null" }, 401: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      await deps.notificationRepository.markOpened(identity);
      return reply.code(204).send();
    },
  );
}
