import {
  ApiErrorSchema,
  StaffPublicationPageSchema,
  type StaffPublicationQuery,
  StaffPublicationQuerySchema,
  StaffPublicationRowSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type PublicationParams,
  publicationParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerPublicationRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/publications",
    {
      schema: {
        tags: ["publications"],
        querystring: StaffPublicationQuerySchema,
        response: {
          200: StaffPublicationPageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as StaffPublicationQuery;
      return deps.publicationRepository.listPublications(
        identity.subject,
        query,
      );
    },
  );

  app.post(
    "/v1/staff/publications/:publicationId/retry",
    {
      schema: {
        tags: ["publications"],
        params: publicationParamsSchema,
        response: {
          200: StaffPublicationRowSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as PublicationParams;
      return deps.publicationRepository.retryPublication(
        identity.subject,
        params.publicationId,
        deps.publisherKick,
      );
    },
  );
}
