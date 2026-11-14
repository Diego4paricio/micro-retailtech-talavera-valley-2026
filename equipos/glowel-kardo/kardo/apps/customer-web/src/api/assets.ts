import {
  ASSET_MAX_BYTES,
  type Asset,
  type AssetReadAuthorization,
  type AssetUploadAuthorization,
  type AssetUsage,
  assetMediaTypes,
} from "@kardo/contracts";
import { ApiRequestError, apiRequest } from "../lib/api.js";
import { isDemoMode } from "../lib/demo.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/assets`;

export const maxAssetBytes = ASSET_MAX_BYTES;
export const acceptedAssetTypes = assetMediaTypes;

export const assetsApi = {
  list: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<Asset[]>(base(workspaceId), { signal }),
  /**
   * Three steps: a single-object upload authorization, a direct PUT to the
   * quarantine bucket, then server-side validation of the stored bytes.
   */
  async upload(workspaceId: string, file: File): Promise<Asset> {
    const authorization = await apiRequest<AssetUploadAuthorization>(
      `${base(workspaceId)}/upload-authorizations`,
      {
        method: "POST",
        body: {
          filename: file.name.slice(0, 255),
          mediaType: file.type,
          byteSize: file.size,
        },
      },
    );
    if (!isDemoMode) {
      const uploadUrl = new URL(authorization.uploadUrl);
      if (uploadUrl.protocol !== "https:" && uploadUrl.hostname !== "localhost")
        throw new ApiRequestError(
          "La autorización de carga no es segura.",
          0,
          "UPLOAD_INSECURE",
        );
      const stored = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }).catch(() => null);
      if (!stored?.ok)
        throw new ApiRequestError(
          "No pudimos subir el archivo. Intenta de nuevo.",
          stored?.status ?? 0,
          "UPLOAD_FAILED",
        );
    }
    return apiRequest<Asset>(
      `${base(workspaceId)}/${authorization.assetId}/finalizations`,
      { method: "POST" },
    );
  },
  /** The Experiences that keep the file in use (draft or live). */
  usage: (workspaceId: string, assetId: string, signal?: AbortSignal) =>
    apiRequest<AssetUsage>(`${base(workspaceId)}/${assetId}/usage`, {
      signal,
    }),
  /** Renames the file; Experiences keep using it. */
  rename: (workspaceId: string, assetId: string, filename: string) =>
    apiRequest<Asset>(`${base(workspaceId)}/${assetId}`, {
      method: "PATCH",
      body: { filename },
    }),
  /** 409 `ASSET_IN_USE` when an Experience still references the asset. */
  remove: (workspaceId: string, assetId: string) =>
    apiRequest<void>(`${base(workspaceId)}/${assetId}`, { method: "DELETE" }),
};

/**
 * Short-lived signed URL to read a validated library image (e.g. the brand
 * logo). Fetch it with `credentials: "omit"`; 503 `ASSET_STORAGE_UNAVAILABLE`
 * when the asset Worker is not configured.
 */
export const assetReadApi = {
  authorize: (workspaceId: string, assetId: string) =>
    apiRequest<AssetReadAuthorization>(
      `/v1/workspaces/${workspaceId}/assets/${assetId}/read-authorizations`,
      { method: "POST" },
    ),
};
