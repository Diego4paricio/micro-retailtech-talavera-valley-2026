import {
  ApiErrorSchema,
  type StaffCreatePieceBatch,
  StaffCreatePieceBatchSchema,
  StaffKitListSchema,
  StaffPieceBatchListSchema,
  StaffPieceBatchSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type PieceBatchParams,
  pieceBatchParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

/** Piezas de Kardo (ADR 026): kits, orders and the workshop's file. */
export function registerPieceRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/kits",
    {
      schema: {
        tags: ["pieces"],
        response: {
          200: StaffKitListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return { items: await deps.pieceRepository.listKits(identity.subject) };
    },
  );

  app.get(
    "/v1/staff/piece-batches",
    {
      schema: {
        tags: ["pieces"],
        response: {
          200: StaffPieceBatchListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.pieceRepository.listBatches(identity.subject);
    },
  );

  app.post(
    "/v1/staff/piece-batches",
    {
      schema: {
        tags: ["pieces"],
        body: StaffCreatePieceBatchSchema,
        response: {
          201: StaffPieceBatchSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireStaffIdentity(request, deps);
      const batch = await deps.pieceRepository.createBatch(
        identity.subject,
        request.body as StaffCreatePieceBatch,
      );
      return reply.code(201).send(batch);
    },
  );

  app.get(
    "/v1/staff/piece-batches/:batchId",
    {
      schema: {
        tags: ["pieces"],
        params: pieceBatchParamsSchema,
        response: {
          200: StaffPieceBatchSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as PieceBatchParams;
      return deps.pieceRepository.getBatch(identity.subject, params.batchId);
    },
  );
}
