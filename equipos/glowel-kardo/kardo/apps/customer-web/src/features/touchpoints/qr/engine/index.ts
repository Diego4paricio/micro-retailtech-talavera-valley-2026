/**
 * Estudio QR engine — public API. Import from here, never from the modules.
 *
 *   buildQr(input)            → { scene, analysis }  (pure, synchronous)
 *   sceneToSvg / pathData     → SVG string / path data (preview, vector download)
 *   sceneToCanvas / sceneToPng→ raster output (PNG carries its DPI)
 *   sceneToPdf / scenesToSheetPdf → vector PDF for print, one or many codes
 *   verifyScene               → multi-scale/blur/noise decode checks (pure)
 *   verifyLegibility          → same, off the main thread when possible
 *   rasterizeLogo             → metadata-free PNG `LogoRaster` from a file/blob
 *   shapeSwatch               → tiny path previews for the shape pickers
 */
export { buildQr, shapeSwatch } from "./build.js";
export { sceneToCanvas, sceneToPng } from "./canvas.js";
export { rasterizeLogo } from "./logo.js";
export { scenesToSheetPdf, sceneToPdf } from "./pdf.js";
export { pathData, sceneToSvg } from "./svg.js";
export type * from "./types.js";
export { verifyScene } from "./verify.js";
export { verifyLegibility } from "./verify-client.js";
