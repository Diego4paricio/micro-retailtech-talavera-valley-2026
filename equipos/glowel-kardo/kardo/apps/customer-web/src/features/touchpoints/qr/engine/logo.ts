import type { LogoRaster } from "./types.js";

/**
 * Turns a user-picked image into a small, metadata-free PNG `LogoRaster`:
 * only raster formats are accepted (no SVG — it could carry active content),
 * transparent margins are cropped so the aspect ratio matches the visible
 * artwork, and the longest side is capped at 512 px.
 */

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 512;
const ALPHA_THRESHOLD = 8;

type CropBox = { x: number; y: number; width: number; height: number };

/** Bounding box of non-transparent pixels; the full image when nothing is transparent. */
function findVisibleBounds(bitmap: ImageBitmap): CropBox {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const fullBox: CropBox = {
    x: 0,
    y: 0,
    width: bitmap.width,
    height: bitmap.height,
  };
  if (!context) return fullBox;
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);

  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const alpha = data[(y * bitmap.width + x) * 4 + 3] ?? 0;
      if (alpha <= ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return fullBox; // fully transparent: nothing to crop
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function rasterizeLogo(source: Blob): Promise<LogoRaster> {
  if (!ACCEPTED_TYPES.has(source.type)) {
    throw new Error(
      "Usa un logo en PNG, JPG o WebP: no se aceptan archivos SVG ni otros formatos.",
    );
  }
  if (source.size > MAX_BYTES) {
    throw new Error("El logo debe pesar 5 MB o menos.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error("No pudimos leer esa imagen.");
  }

  const box = findVisibleBounds(bitmap);
  const ratio = Math.min(1, MAX_SIDE / Math.max(box.width, box.height));
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El lienzo no está disponible.");
  context.drawImage(
    bitmap,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    width,
    height,
  );
  bitmap.close();

  return { href: canvas.toDataURL("image/png"), width, height };
}
