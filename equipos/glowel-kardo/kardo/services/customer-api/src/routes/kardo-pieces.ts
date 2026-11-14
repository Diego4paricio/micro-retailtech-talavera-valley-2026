import {
  ApiErrorSchema,
  type ClaimKardoPieces,
  ClaimKardoPiecesSchema,
  KardoPieceClaimPreviewSchema,
  KardoPieceClaimResultSchema,
  type KardoPieceCodeRequest,
  KardoPieceCodeRequestSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

/**
 * «Producto de Kardo» (ADR 026): the owner writes the code that came with
 * the piece or the kit. Preview first (which pieces, the kit's days, whether
 * they fit the plan), then activate them all or none.
 */
export function registerKardoPieceRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.post(
    "/v1/workspaces/:workspaceId/kardo-pieces/preview",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "What a Kardo piece code activates, before activating it",
        params: workspaceParamsSchema,
        body: KardoPieceCodeRequestSchema,
        response: {
          200: KardoPieceClaimPreviewSchema,
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
      // Per person, before the database's own count of failed codes.
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const body = request.body as KardoPieceCodeRequest;
      return deps.kardoPieceRepository.previewClaim(
        identity,
        params.workspaceId,
        body.code,
        request.ip,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/kardo-pieces/claim",
    {
      schema: {
        tags: ["touchpoints"],
        summary: "Activate Kardo pieces with their code (all or none)",
        params: workspaceParamsSchema,
        body: ClaimKardoPiecesSchema,
        response: {
          201: KardoPieceClaimResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const { propagatedPublications, ...result } =
        await deps.kardoPieceRepository.claim(
          identity,
          params.workspaceId,
          request.body as ClaimKardoPieces,
          request.ip,
        );
      if (propagatedPublications > 0) deps.publisherKick();
      return reply.code(201).send(result);
    },
  );
}
