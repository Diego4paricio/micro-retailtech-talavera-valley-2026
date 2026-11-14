import {
  ApiErrorSchema,
  type CreateLink,
  CreateLinkSchema,
  LinkSlugAvailabilitySchema,
  LinkSlugSuggestionSchema,
  type SetLinkSlug,
  SetLinkSlugSchema,
  type SetMainLink,
  SetMainLinkSchema,
  TouchpointSchema,
} from "@kardo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

const linkParamsSchema = Type.Object(
  {
    workspaceId: Type.String({ format: "uuid" }),
    linkId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);
type LinkParams = { workspaceId: string; linkId: string };

const errors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  429: ApiErrorSchema,
};

/** Links with their own address, kardo.com.mx/<negocio>/<link> (Links
 * redesign, phase 2, 2026-10-04). */
export function registerLinkRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/links/slug-suggestion",
    {
      schema: {
        tags: ["links"],
        summary: "Recommend a free link address inside the business",
        params: workspaceParamsSchema,
        querystring: Type.Object(
          {
            name: Type.String({ minLength: 1, maxLength: 120 }),
            type: Type.Optional(Type.String({ maxLength: 32 })),
          },
          { additionalProperties: false },
        ),
        response: { 200: LinkSlugSuggestionSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const query = request.query as { name: string; type?: string };
      const slug = await deps.linkRepository.suggestSlug(
        identity,
        params.workspaceId,
        query,
      );
      return { slug };
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/links/slug-availability",
    {
      schema: {
        tags: ["links"],
        summary: "Whether a link address is free inside the business",
        params: workspaceParamsSchema,
        querystring: Type.Object(
          {
            slug: Type.String({ minLength: 1, maxLength: 60 }),
            name: Type.Optional(Type.String({ maxLength: 120 })),
            type: Type.Optional(Type.String({ maxLength: 32 })),
            touchpointId: Type.Optional(Type.String({ format: "uuid" })),
          },
          { additionalProperties: false },
        ),
        response: { 200: LinkSlugAvailabilitySchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const { slug, ...context } = request.query as {
        slug: string;
        name?: string;
        type?: string;
        touchpointId?: string;
      };
      return deps.linkRepository.checkSlug(
        identity,
        params.workspaceId,
        slug,
        context,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/links",
    {
      schema: {
        tags: ["links"],
        summary: "Create a Link that shows an Experience, with its address",
        params: workspaceParamsSchema,
        body: CreateLinkSchema,
        response: { 201: TouchpointSchema, ...errors },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const link = await deps.linkRepository.createLink(
        identity,
        params.workspaceId,
        request.body as CreateLink,
      );
      return reply.code(201).send(link);
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/links/:linkId/slug",
    {
      schema: {
        tags: ["links"],
        summary: "Choose or change a link address (once every 7 days)",
        params: linkParamsSchema,
        body: SetLinkSlugSchema,
        response: { 200: TouchpointSchema, ...errors },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as LinkParams;
      return deps.linkRepository.setSlug(
        identity,
        params.workspaceId,
        params.linkId,
        (request.body as SetLinkSlug).slug,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/main-link",
    {
      schema: {
        tags: ["links"],
        summary:
          "Choose the Link that the business address (<links>/<negocio>) opens",
        params: workspaceParamsSchema,
        body: SetMainLinkSchema,
        response: { 204: Type.Null(), ...errors },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      await deps.linkRepository.setMainLink(
        identity,
        params.workspaceId,
        (request.body as SetMainLink).touchpointId,
      );
      return reply.code(204).send();
    },
  );
}
