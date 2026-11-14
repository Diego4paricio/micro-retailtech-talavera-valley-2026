import {
  ApiErrorSchema,
  BusinessSlugAvailabilitySchema,
  BusinessSlugSuggestionSchema,
  type SetBusinessSlug,
  SetBusinessSlugSchema,
} from "@kardo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

/** What the recommendation and the check read: the business as the owner
 * is writing it (Primeros pasos may not have saved it yet). */
const contextQuery = {
  name: Type.String({ minLength: 1, maxLength: 120 }),
  city: Type.Optional(Type.String({ maxLength: 120 })),
  industry: Type.Optional(Type.String({ maxLength: 40 })),
};

type ContextQuery = { name: string; city?: string; industry?: string };

/** The business's public address, kardo.com.mx/<slug> (Links redesign,
 * owner, 2026-10-04). */
export function registerBusinessSlugRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/slug/suggestion",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Recommend a free business address (never with numbers)",
        params: workspaceParamsSchema,
        querystring: Type.Object(contextQuery, { additionalProperties: false }),
        response: {
          200: BusinessSlugSuggestionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const query = request.query as ContextQuery;
      const slug = await deps.businessSlugRepository.suggest(
        identity,
        params.workspaceId,
        query,
      );
      return { slug };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/slug/availability",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Whether a business address is free, with a free alternative",
        params: workspaceParamsSchema,
        querystring: Type.Object(
          {
            slug: Type.String({ minLength: 1, maxLength: 60 }),
            ...contextQuery,
          },
          { additionalProperties: false },
        ),
        response: {
          200: BusinessSlugAvailabilitySchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const { slug, ...context } = request.query as ContextQuery & {
        slug: string;
      };
      return deps.businessSlugRepository.check(
        identity,
        params.workspaceId,
        slug,
        context,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/slug",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Choose or change the business address (once every 7 days)",
        params: workspaceParamsSchema,
        body: SetBusinessSlugSchema,
        response: {
          200: Type.Object({ slug: Type.String() }),
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const body = request.body as SetBusinessSlug;
      const slug = await deps.businessSlugRepository.set(
        identity,
        params.workspaceId,
        body.slug,
      );
      return { slug };
    },
  );
}
