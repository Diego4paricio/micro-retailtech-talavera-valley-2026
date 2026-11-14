import { type Asset, imageMediaTypes } from "@kardo/contracts";
import { assetsApi, maxAssetBytes } from "../../api/assets.js";
import { ApiRequestError } from "../../lib/api.js";
import { rejectionFor } from "./asset-status.js";

/**
 * The one way to upload a file from anywhere in the panel (domain audit
 * 2026-10-13, A2-46): eight screens each checked type and size their own
 * way, and some used a file the Worker had rejected (Primeros pasos then
 * failed with an English «A referenced asset is not a validated file»).
 * This checks before uploading and, after, that Kardo validated the file;
 * every failure is an `ApiRequestError` with a Spanish message.
 */

/** «5 MB», from the one limit in `@kardo/contracts`. */
export const maxAssetSizeLabel = `${Math.round(maxAssetBytes / 1_048_576)} MB`;

const imageTypes: readonly string[] = imageMediaTypes;

/** Why a file cannot be uploaded as an image, or null when it can. */
export function imageFileProblem(file: File): string | null {
  if (!imageTypes.includes(file.type)) return "Usa una imagen PNG, JPG o WebP.";
  if (file.size > maxAssetBytes)
    return `Tu imagen pesa más de ${maxAssetSizeLabel}. Usa una más ligera.`;
  return null;
}

/** Why a file cannot be uploaded at all (images and PDF), or null. */
export function assetFileProblem(file: File): string | null {
  if (!imageTypes.includes(file.type) && file.type !== "application/pdf")
    return "Usa una imagen PNG, JPG o WebP, o un PDF.";
  if (file.size > maxAssetBytes)
    return `El archivo pesa más de ${maxAssetSizeLabel}. Usa uno más ligero.`;
  return null;
}

/**
 * Uploads `file` and resolves only with a validated asset. A file Kardo
 * rejected throws, with what happened and what to do; one still being
 * checked throws too (it cannot be used yet).
 */
export async function uploadAsset(
  workspaceId: string,
  file: File,
  options: {
    imagesOnly?: boolean;
    /** Resolve with a rejected or still-checked file instead of throwing,
     * for the library, which lists it with its reason (A2-46). */
    allowUnvalidated?: boolean;
  } = {},
): Promise<Asset> {
  const problem = options.imagesOnly
    ? imageFileProblem(file)
    : assetFileProblem(file);
  if (problem) throw new ApiRequestError(problem, 0, "UPLOAD_REJECTED");
  const asset = await assetsApi.upload(workspaceId, file);
  if (asset.status === "validated" || options.allowUnvalidated) return asset;
  if (asset.status === "rejected") {
    const { body, fix } = rejectionFor(asset.rejectedReason);
    throw new ApiRequestError(`${body} ${fix}`, 0, "UPLOAD_REJECTED");
  }
  throw new ApiRequestError(
    "Kardo todavía está revisando tu archivo. Espera unos segundos y vuelve a intentarlo.",
    0,
    "UPLOAD_PENDING",
  );
}

/** `uploadAsset` for images only (logos, covers, photos). */
export function uploadImage(workspaceId: string, file: File): Promise<Asset> {
  return uploadAsset(workspaceId, file, { imagesOnly: true });
}
