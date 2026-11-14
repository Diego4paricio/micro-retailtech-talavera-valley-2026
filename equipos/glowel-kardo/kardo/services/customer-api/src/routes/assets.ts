import {
  ApiErrorSchema,
  AssetListSchema,
  AssetReadAuthorizationSchema,
  AssetSchema,
  AssetUploadAuthorizationSchema,
  type AssetUploadRequest,
  AssetUploadRequestSchema,
  AssetUsageSchema,
  type RenameAsset,
  RenameAssetSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AssetRepository, AssetWorkerClient } from "../assets.js";
import { UnavailableError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceAssetParams,
  type WorkspaceParams,
  workspaceAssetParamsSchema,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

export function registerAssetRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.post(
    "/v1/workspaces/:workspaceId/assets/upload-authorizations",
    {
      schema: {
        tags: ["assets"],
        summary: "Create a short-lived, single-object upload authorization",
        params: workspaceParamsSchema,
        body: AssetUploadRequestSchema,
        response: {
          201: AssetUploadAuthorizationSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      if (!deps.assetWorker) {
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset upload service is not configured.",
        );
      }
      const params = request.params as WorkspaceParams;
      const created = await deps.assetRepository.beginUpload(
        identity,
        params.workspaceId,
        request.body as AssetUploadRequest,
      );
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      return reply.code(201).send({
        assetId: created.asset.id,
        uploadUrl: deps.assetWorker.uploadUrl({
          assetId: created.asset.id,
          storageKey: created.storageKey,
          expiresAt,
        }),
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/assets",
    {
      schema: {
        tags: ["assets"],
        summary: "List Assets in a customer workspace",
        params: workspaceParamsSchema,
        response: {
          200: AssetListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.assetRepository.listAssets(identity, params.workspaceId);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/assets/:assetId/finalizations",
    {
      schema: {
        tags: ["assets"],
        summary:
          "Validate a quarantined original and create its private derivative",
        params: workspaceAssetParamsSchema,
        response: {
          200: AssetSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      if (!deps.assetWorker) {
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset validation service is not configured.",
        );
      }
      const params = request.params as WorkspaceAssetParams;
      const asset = await finalizeAsset(
        deps.assetRepository,
        deps.assetWorker,
        identity,
        params.workspaceId,
        params.assetId,
      );
      return reply.code(200).send(asset);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/assets/:assetId/read-authorizations",
    {
      schema: {
        tags: ["assets"],
        summary:
          "Create a short-lived URL to read one validated library image (e.g. the brand logo)",
        params: workspaceAssetParamsSchema,
        response: {
          201: AssetReadAuthorizationSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      if (!deps.assetWorker) {
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset storage is not configured.",
        );
      }
      const params = request.params as WorkspaceAssetParams;
      const image = await deps.assetRepository.lookupReadableImage(
        identity,
        params.workspaceId,
        params.assetId,
      );
      const expiresAt = new Date(Date.now() + 2 * 60_000);
      return reply.code(201).send({
        url: deps.assetWorker.readUrl({
          assetId: params.assetId,
          derivativeKey: image.derivativeKey,
          expiresAt,
        }),
        mediaType: image.mediaType,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/assets/:assetId/usage",
    {
      schema: {
        tags: ["assets"],
        summary:
          "List the Experiences that keep a library file in use (draft or live)",
        params: workspaceAssetParamsSchema,
        response: {
          200: AssetUsageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceAssetParams;
      return deps.assetRepository.assetUsage(
        identity,
        params.workspaceId,
        params.assetId,
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/assets/:assetId",
    {
      schema: {
        tags: ["assets"],
        summary: "Rename a library file (Experiences keep using it)",
        params: workspaceAssetParamsSchema,
        body: RenameAssetSchema,
        response: {
          200: AssetSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceAssetParams;
      const body = request.body as RenameAsset;
      return deps.assetRepository.renameAsset(
        identity,
        params.workspaceId,
        params.assetId,
        body.filename,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/assets/:assetId",
    {
      schema: {
        tags: ["assets"],
        summary:
          "Delete an asset no active Experience uses (removes its stored files)",
        params: workspaceAssetParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      if (!deps.assetWorker) {
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset storage is not configured.",
        );
      }
      const params = request.params as WorkspaceAssetParams;
      await deps.assetRepository.deleteAsset(
        identity,
        params.workspaceId,
        params.assetId,
        deps.assetWorker,
      );
      return reply.code(204).send();
    },
  );
}

async function finalizeAsset(
  repository: AssetRepository,
  worker: AssetWorkerClient,
  identity: Parameters<AssetRepository["lookupQuarantined"]>[0],
  workspaceId: string,
  assetId: string,
) {
  // A concrete repository provides a secure lookup method through an
  // implementation-only capability. Keeping it behind this narrow interface
  // avoids exposing storage keys in browser-facing DTOs.
  const pending = await repository.lookupQuarantined(
    identity,
    workspaceId,
    assetId,
  );
  const result = await worker.validate({
    assetId,
    storageKey: pending.storageKey,
    expectedMediaType: pending.mediaType,
    expectedByteSize: pending.byteSize,
  });
  return repository.finalize(identity, workspaceId, assetId, result);
}
