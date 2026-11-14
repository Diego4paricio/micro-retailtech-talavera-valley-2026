/**
 * Logo decoding for the PDF export. The engine only ever hands the writer a
 * data URL (`SceneImageNode.href`), so it must be rasterized to raw RGBA
 * before it can become a PDF Image XObject + SMask. The browser does this
 * with `createImageBitmap`/canvas; tests inject a synchronous stand-in
 * instead, since neither API exists under Node.
 */

export type DecodedImage = {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major, top row first. */
  data: Uint8Array<ArrayBuffer>;
};

export type DecodeImage = (href: string) => Promise<DecodedImage | null>;

type CanvasLike2D = {
  drawImage(image: unknown, dx: number, dy: number): void;
  getImageData(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): { data: ArrayLike<number> };
};

/**
 * Decodes the PNG data URL by hand: the production CSP has no `data:` in
 * `connect-src`, so `fetch(href)` would fail there and silently drop the logo.
 */
function pngDataUrlToBlob(href: string): Blob | null {
  const prefix = "data:image/png;base64,";
  if (!href.startsWith(prefix)) return null;
  const binary = atob(href.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/png" });
}

/** Default decoder: browser-only, using OffscreenCanvas when it exists. */
export const decodeImageInBrowser: DecodeImage = async (href) => {
  try {
    if (typeof createImageBitmap !== "function") return null;
    const blob = pngDataUrlToBlob(href);
    if (!blob) return null;
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;
    if (width <= 0 || height <= 0) return null;

    let context: CanvasLike2D | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      context = canvas.getContext("2d") as CanvasLike2D | null;
    } else if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext("2d") as CanvasLike2D | null;
    }
    if (!context) return null;

    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, width, height);
    return { width, height, data: Uint8Array.from(imageData.data) };
  } catch {
    return null;
  }
};

/** Splits interleaved RGBA into a DeviceRGB stream and a DeviceGray alpha mask. */
export function splitRgba(
  data: Uint8Array<ArrayBuffer>,
  width: number,
  height: number,
): { rgb: Uint8Array<ArrayBuffer>; alpha: Uint8Array<ArrayBuffer> } {
  const pixelCount = width * height;
  const rgb = new Uint8Array(pixelCount * 3);
  const alpha = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const src = i * 4;
    rgb[i * 3] = data[src] ?? 0;
    rgb[i * 3 + 1] = data[src + 1] ?? 0;
    rgb[i * 3 + 2] = data[src + 2] ?? 0;
    alpha[i] = data[src + 3] ?? 0;
  }
  return { rgb, alpha };
}
