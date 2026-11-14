import { cachedAssetImage, loadAssetImage } from "../../lib/asset-images.js";

/**
 * Item photos: a thin alias over the shared library-image loader
 * (`src/lib/asset-images.ts`) fixed at the "thumb" size, so a menu with many
 * photos stays light on phones. Kept as its own module so `ItemThumb.tsx`
 * doesn't need to know about asset sizes.
 */

export function cachedThumbnail(assetId: string): string | null {
  return cachedAssetImage(assetId, "thumb");
}

export function loadThumbnail(
  workspaceId: string,
  assetId: string,
): Promise<string> {
  return loadAssetImage(workspaceId, assetId, "thumb");
}
