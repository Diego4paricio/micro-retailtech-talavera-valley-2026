import {
  ApiErrorSchema,
  type CreateStaffNotification,
  CreateStaffNotificationSchema,
  type NotificationAudience,
  NotificationAudienceEstimateSchema,
  NotificationAudienceSchema,
  StaffNotificationPageSchema,
  type StaffNotificationQuery,
  StaffNotificationQuerySchema,
  StaffNotificationSchema,
  StaffProfileLookupSchema,
  type UpdateStaffNotification,
  UpdateStaffNotificationSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type NotificationParams,
  notificationParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
};

/** Notificaciones (ADR 022): what Kardo publishes to the panel's bell. */
export function registerNotificationRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/notifications",
    {
      schema: {
        tags: ["notifications"],
        querystring: StaffNotificationQuerySchema,
        response: { 200: StaffNotificationPageSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.notificationRepository.list(
        identity.subject,
        request.query as StaffNotificationQuery,
      );
    },
  );

  app.get(
    "/v1/staff/notifications/:notificationId",
    {
      schema: {
        tags: ["notifications"],
        params: notificationParamsSchema,
        response: { 200: StaffNotificationSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as NotificationParams;
      return deps.notificationRepository.get(
        identity.subject,
        params.notificationId,
      );
    },
  );

  app.post(
    "/v1/staff/notifications",
    {
      bodyLimit: 32 * 1024,
      schema: {
        tags: ["notifications"],
        body: CreateStaffNotificationSchema,
        response: { 201: StaffNotificationSchema, ...errors },
      },
    },
    async (request, reply) => {
      const identity = await requireStaffIdentity(request, deps);
      const created = await deps.notificationRepository.create(
        identity.subject,
        request.body as CreateStaffNotification,
      );
      return reply.code(201).send(created);
    },
  );

  app.patch(
    "/v1/staff/notifications/:notificationId",
    {
      bodyLimit: 32 * 1024,
      schema: {
        tags: ["notifications"],
        params: notificationParamsSchema,
        body: UpdateStaffNotificationSchema,
        response: { 200: StaffNotificationSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as NotificationParams;
      return deps.notificationRepository.update(
        identity.subject,
        params.notificationId,
        request.body as UpdateStaffNotification,
      );
    },
  );

  app.post(
    "/v1/staff/notifications/:notificationId/retire",
    {
      schema: {
        tags: ["notifications"],
        params: notificationParamsSchema,
        response: { 200: StaffNotificationSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as NotificationParams;
      return deps.notificationRepository.retire(
        identity.subject,
        params.notificationId,
      );
    },
  );

  app.post(
    "/v1/staff/notifications/estimate",
    {
      schema: {
        tags: ["notifications"],
        body: NotificationAudienceSchema,
        response: { 200: NotificationAudienceEstimateSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.notificationRepository.estimate(
        identity.subject,
        request.body as NotificationAudience,
      );
    },
  );

  app.get(
    "/v1/staff/notification-recipients",
    {
      schema: {
        tags: ["notifications"],
        querystring: {
          type: "object",
          properties: {
            email: { type: "string", minLength: 1, maxLength: 320 },
          },
          required: ["email"],
          additionalProperties: false,
        },
        response: { 200: StaffProfileLookupSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const { email } = request.query as { email: string };
      return deps.notificationRepository.lookupProfiles(
        identity.subject,
        email,
      );
    },
  );
}
