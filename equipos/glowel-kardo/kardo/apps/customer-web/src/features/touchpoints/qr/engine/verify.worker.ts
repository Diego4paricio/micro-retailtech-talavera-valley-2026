// Owned by the export/QA agent.
import type { RasterImage } from "./raster.js";
import type { LegibilityReport, Scene } from "./types.js";
import { verifySceneWithImages } from "./verify.js";

/**
 * Runs `verifyScene` off the main thread. Logo `image` nodes are data URLs
 * (`data:image/png;base64,...`); the CSP's `connect-src` has no `data:`, so
 * they cannot be `fetch()`-ed — instead we `atob()` the payload into bytes,
 * wrap it in a `Blob` and let `createImageBitmap` + `OffscreenCanvas` decode
 * it. Anything that fails (unsupported API, a corrupt payload) simply leaves
 * that href out of `images`, which makes `verifySceneWithImages` fall back to
 * adversarial noise for that logo — never a thrown error.
 */

type WorkerRequest = { id: number; scene: Scene; expected: string };
type WorkerResponse =
  | { id: number; ok: true; report: LegibilityReport }
  | { id: number; ok: false; error: string };

/**
 * `self` resolves to `Window & typeof globalThis` under this project's `dom`
 * lib (there is no separate worker tsconfig), whose `postMessage` demands a
 * `targetOrigin`. Asserting the narrower shape we actually use sidesteps that
 * without touching the shared tsconfig.
 */
type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};
const scope = self as unknown as WorkerScope;

function parseDataUrl(
  href: string,
): { mediaType: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(href);
  if (!match) return null;
  const mediaType = match[1] || "image/png";
  const payload = match[3] ?? "";
  if (match[2]) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { mediaType, bytes };
  }
  return {
    mediaType,
    bytes: new TextEncoder().encode(decodeURIComponent(payload)),
  };
}

async function decodeDataUrl(href: string): Promise<RasterImage | null> {
  if (
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap !== "function"
  )
    return null;
  const parsed = parseDataUrl(href);
  if (!parsed) return null;
  const blob = new Blob([parsed.bytes], { type: parsed.mediaType });
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

async function decodeImages(
  scene: Scene,
): Promise<ReadonlyMap<string, RasterImage> | undefined> {
  const hrefs = new Set<string>();
  for (const node of scene.nodes)
    if (node.type === "image") hrefs.add(node.href);
  if (hrefs.size === 0) return undefined;

  const images = new Map<string, RasterImage>();
  for (const href of hrefs) {
    const decoded = await decodeDataUrl(href).catch(() => null);
    if (decoded) images.set(href, decoded);
  }
  return images.size > 0 ? images : undefined;
}

scope.onmessage = (event) => {
  const { id, scene, expected } = event.data;
  void decodeImages(scene)
    .catch(() => undefined)
    .then((images) => {
      const report = verifySceneWithImages(scene, expected, images);
      scope.postMessage({ id, ok: true, report });
    })
    .catch((error: unknown) => {
      scope.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
};
