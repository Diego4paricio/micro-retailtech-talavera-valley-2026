import type { QrDesign } from "@kardo/contracts";
import { buildQr } from "./engine/build.js";
import { sceneToCanvas } from "./engine/canvas.js";
import { sceneToSvg } from "./engine/svg.js";
import type { LogoRaster } from "./engine/types.js";

/**
 * Compatibility layer over the Estudio QR engine for the two existing
 * call sites that only ever need a quick, un-editable preview
 * (`TouchpointDetailPage`, `LinkDetailPage`): same signatures as before,
 * now backed by a schema-2 `QrDesign` and an optional logo raster.
 */

export function renderQrSvg(
  url: string,
  design: QrDesign,
  logo: LogoRaster | null = null,
): string {
  const { scene } = buildQr({ url, design, logo });
  return sceneToSvg(scene, { title: "Código QR · Kardo" });
}

export async function renderQrCanvas(
  url: string,
  design: QrDesign,
  targetWidth: number,
  logo: LogoRaster | null = null,
): Promise<HTMLCanvasElement> {
  const { scene } = buildQr({ url, design, logo });
  return sceneToCanvas(scene, targetWidth);
}
