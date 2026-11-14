import type { AssetMediaType } from "@kardo/contracts";

/** File type names for Archivos (moved from `lib/format.ts`, A2-72). */
export const assetMediaTypeLabels: Record<AssetMediaType, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
};
