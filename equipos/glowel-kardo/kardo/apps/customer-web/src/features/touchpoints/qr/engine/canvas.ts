import { addPhysicalPixelDimensions } from "./png-dpi.js";
import { FONT_STACKS, pathData } from "./svg.js";
import type { Scene, SceneNode, ScenePaint } from "./types.js";

/**
 * Canvas/PNG renderer: same `Scene` as `svg.ts`, drawn with `Path2D(pathData(...))`
 * so both outputs share one geometry source.
 */

function resolveFillStyle(
  context: CanvasRenderingContext2D,
  paint: ScenePaint,
): string | CanvasGradient {
  if (paint.kind === "solid") return paint.color;
  if (paint.kind === "linear") {
    const gradient = context.createLinearGradient(
      paint.x1,
      paint.y1,
      paint.x2,
      paint.y2,
    );
    gradient.addColorStop(0, paint.from);
    gradient.addColorStop(1, paint.to);
    return gradient;
  }
  const gradient = context.createRadialGradient(
    paint.cx,
    paint.cy,
    0,
    paint.cx,
    paint.cy,
    paint.r,
  );
  gradient.addColorStop(0, paint.from);
  gradient.addColorStop(1, paint.to);
  return gradient;
}

function drawPathNode(
  context: CanvasRenderingContext2D,
  node: Extract<SceneNode, { type: "path" }>,
) {
  const path = new Path2D(pathData(node.d));
  context.save();
  if (node.opacity !== undefined) context.globalAlpha = node.opacity;
  context.fillStyle = resolveFillStyle(context, node.fill);
  context.fill(path, node.fillRule);
  context.restore();
}

function drawTextNode(
  context: CanvasRenderingContext2D,
  node: Extract<SceneNode, { type: "text" }>,
) {
  context.save();
  context.fillStyle = node.color;
  context.font = `${node.weight} ${node.size}px ${FONT_STACKS[node.font]}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (node.letterSpacing) {
    // Not in every TS DOM lib version yet; harmless no-op where unsupported.
    (
      context as CanvasRenderingContext2D & { letterSpacing?: string }
    ).letterSpacing = `${node.letterSpacing}px`;
  }
  context.fillText(node.text, node.x, node.y, node.maxWidth);
  context.restore();
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(href: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(href);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo decodificar el logo."));
    image.src = href;
  });
  imageCache.set(href, promise);
  return promise;
}

/** Draws `scene` onto a new canvas `widthPx` wide (height keeps the ratio). */
export async function sceneToCanvas(
  scene: Scene,
  widthPx: number,
): Promise<HTMLCanvasElement> {
  const scale = widthPx / scene.width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(scene.width * scale);
  canvas.height = Math.round(scene.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El lienzo no está disponible.");
  context.scale(scale, scale);

  const fonts = new Set<string>();
  for (const node of scene.nodes) {
    if (node.type === "text")
      fonts.add(FONT_STACKS[node.font].split(",")[0] ?? "sans-serif");
  }
  await Promise.all(
    Array.from(fonts).map((family) =>
      document.fonts?.load(`700 32px ${family}`).catch(() => undefined),
    ),
  );

  for (const node of scene.nodes) {
    if (node.type === "path") {
      drawPathNode(context, node);
    } else if (node.type === "image") {
      const image = await loadImage(node.href);
      context.drawImage(image, node.x, node.y, node.width, node.height);
    } else {
      drawTextNode(context, node);
    }
  }
  return canvas;
}

/** PNG with a `pHYs` chunk so print software opens it at the intended DPI. */
export async function sceneToPng(
  scene: Scene,
  options: { widthPx: number; dpi: number },
): Promise<Blob> {
  const canvas = await sceneToCanvas(scene, options.widthPx);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("No se pudo generar el PNG.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const withDpi = addPhysicalPixelDimensions(bytes, options.dpi);
  return new Blob([withDpi.slice().buffer], { type: "image/png" });
}
