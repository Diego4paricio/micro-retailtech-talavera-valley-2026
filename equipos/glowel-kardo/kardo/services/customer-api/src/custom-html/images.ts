import type { ImageMediaType } from "@kardo/contracts";
import type { AssetRepository, AssetWorkerClient } from "../assets.js";
import type { CustomerIdentity } from "../repositories/context.js";

export type CustomHtmlPromptImage = {
  /** The workspace asset id; the `kardo-asset:<ref>` token in the prompt. */
  ref: string;
  /** Human label (the file name) shown to the AI. */
  label: string;
  mediaType: ImageMediaType;
  base64: string;
};

/** The brief may name up to `CUSTOM_HTML_LIMITS.briefImages` (8) library
 * images; Kardo AI generations look at the first 8 of the logo, those and
 * the cover. Raised from 4 on 2026-10-03: the owner's photos of dishes and
 * products are now matched to the Menú or Catálogo (`itemPhotos`), so the
 * model must see them; a hard ceiling on both the vision payload size and
 * the per-turn cost the daily budget has to price (`custom-html/budget.ts`).
 * The rest still show up as "Imágenes por conectar" placeholders
 * (`buildCustomHtmlPrompt`'s numbered markers). */
export const MAX_CUSTOM_HTML_GENERATION_IMAGES = 8;

/**
 * Reads each brief image through the Assets Worker (a short-lived,
 * server-side signed read of the already-sanitized derivative, never the
 * quarantined original) and returns it ready for a vision input. An image
 * that fails to read (deleted since the brief was written, storage
 * hiccup, ...) is skipped rather than failing the whole request.
 */
export async function collectCustomHtmlPromptImages(input: {
  assetRepository: AssetRepository;
  assetWorker: AssetWorkerClient | null;
  identity: CustomerIdentity;
  workspaceId: string;
  imageRefs: readonly string[];
  fetchFn?: typeof fetch;
}): Promise<CustomHtmlPromptImage[]> {
  const { assetWorker } = input;
  const imageRefs = input.imageRefs.slice(0, MAX_CUSTOM_HTML_GENERATION_IMAGES);
  if (!assetWorker || imageRefs.length === 0) return [];
  const fetchFn = input.fetchFn ?? fetch;

  const results = await Promise.all(
    imageRefs.map(async (ref): Promise<CustomHtmlPromptImage | undefined> => {
      try {
        const image = await input.assetRepository.lookupReadableImage(
          input.identity,
          input.workspaceId,
          ref,
        );
        const url = assetWorker.readUrl({
          assetId: ref,
          derivativeKey: image.derivativeKey,
          expiresAt: new Date(Date.now() + 2 * 60_000),
        });
        const response = await fetchFn(url, {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return undefined;
        const bytes = await response.arrayBuffer();
        return {
          ref,
          label: image.filename,
          mediaType: image.mediaType,
          base64: Buffer.from(bytes).toString("base64"),
        };
      } catch {
        return undefined;
      }
    }),
  );

  return results.filter(
    (image): image is CustomHtmlPromptImage => image !== undefined,
  );
}
