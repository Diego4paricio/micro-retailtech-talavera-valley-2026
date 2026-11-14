import type { QrDesign } from "@kardo/contracts";
import { defaultQrDesign } from "./qr-design.js";

/*
 * The Estudio QR engine for printing outside the panel (ADR 026): Kardo
 * Operations builds the workshop's file for a Kardo piece order with the
 * same engine and the same PDF with crop marks, exported through
 * `@kardo/customer-web/qr-print`. Only what printing needs; the panel keeps
 * importing `./engine/index.js`.
 */
export { buildQr } from "./engine/build.js";
export { scenesToSheetPdf, sceneToPdf } from "./engine/pdf.js";
export { sceneToSvg } from "./engine/svg.js";
export type { PrintPaper, QrBuild, Scene } from "./engine/types.js";
export { defaultQrDesign } from "./qr-design.js";

/** The piece's QR as the workshop prints it under the customer's brand:
 * square modules in black on white, no frame, the usual quiet zone. */
export function workshopQrDesign(): QrDesign {
  return {
    ...defaultQrDesign,
    errorCorrection: "M",
    modules: { shape: "square", fill: { kind: "solid", color: "#000000" } },
    eyes: {
      ...defaultQrDesign.eyes,
      frameShape: "square",
      ballShape: "square",
    },
    background: { color: "#ffffff", transparent: false },
    logo: null,
    frame: { ...defaultQrDesign.frame, style: "none", text: "" },
  };
}

/** The activation card that goes in the kit: a QR to the site's /activar/
 * with the code written under it, in Kardo's ink. */
export function activationCardDesign(code: string): QrDesign {
  return {
    ...defaultQrDesign,
    errorCorrection: "M",
    frame: {
      ...defaultQrDesign.frame,
      style: "panel-bottom",
      text: code.slice(0, 40),
      uppercase: true,
      icon: "none",
    },
  };
}
