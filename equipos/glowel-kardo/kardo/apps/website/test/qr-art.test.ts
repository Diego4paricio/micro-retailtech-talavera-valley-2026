import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { type QrScene, qrScene } from "@/lib/qr-art";

// The Website shows a real code, so it must scan like an Estudio QR export:
// rasterize the scene the page draws and decode it without inversion.
const colors = {
  dark: [22, 35, 46],
  accent: [10, 108, 120],
  light: [255, 253, 248],
} as const;

function rasterize(
  scene: QrScene,
  px: number,
  plate: "light" | "worst",
  text: string,
) {
  const side = scene.size * px;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  const paint = (x: number, y: number, rgb: readonly number[]) => {
    const i = (y * side + x) * 4;
    data[i] = rgb[0] ?? 0;
    data[i + 1] = rgb[1] ?? 0;
    data[i + 2] = rgb[2] ?? 0;
  };
  for (let y = 0; y < side; y += 1)
    for (let x = 0; x < side; x += 1) paint(x, y, colors.light);

  for (const shape of scene.shapes) {
    const [x0, y0, x1, y1] =
      shape.kind === "rect"
        ? [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h]
        : [
            shape.cx - shape.r,
            shape.cy - shape.r,
            shape.cx + shape.r,
            shape.cy + shape.r,
          ];
    for (let py = Math.floor(y0 * px); py < Math.ceil(y1 * px); py += 1) {
      for (let pxl = Math.floor(x0 * px); pxl < Math.ceil(x1 * px); pxl += 1) {
        const mx = (pxl + 0.5) / px;
        const my = (py + 0.5) / px;
        let inside: boolean;
        if (shape.kind === "circle") {
          inside = (mx - shape.cx) ** 2 + (my - shape.cy) ** 2 <= shape.r ** 2;
        } else {
          const dx = Math.max(
            shape.x + shape.r - mx,
            0,
            mx - (shape.x + shape.w - shape.r),
          );
          const dy = Math.max(
            shape.y + shape.r - my,
            0,
            my - (shape.y + shape.h - shape.r),
          );
          inside =
            mx >= shape.x &&
            mx <= shape.x + shape.w &&
            my >= shape.y &&
            my <= shape.y + shape.h
              ? dx * dx + dy * dy <= shape.r * shape.r
              : false;
        }
        if (inside) paint(pxl, py, colors[shape.tone]);
      }
    }
  }

  // The logo plate. "worst" paints every covered module with the opposite
  // of its true value: the most damage the logo could ever do.
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const quiet = (scene.size - n) / 2;
  for (let my = scene.plate.y; my < scene.plate.y + scene.plate.size; my += 1) {
    for (
      let mx = scene.plate.x;
      mx < scene.plate.x + scene.plate.size;
      mx += 1
    ) {
      const dark = qr.modules.data[(my - quiet) * n + (mx - quiet)] === 1;
      const rgb = plate === "worst" && !dark ? colors.dark : colors.light;
      for (let py = my * px; py < (my + 1) * px; py += 1) {
        for (let pxl = mx * px; pxl < (mx + 1) * px; pxl += 1)
          paint(pxl, py, rgb);
      }
    }
  }
  return { data, side };
}

const texts = [
  "http://localhost:5177/estudio-qr/",
  "https://kardo.example.com/estudio-qr/",
  "https://www.kardo-ejemplo.com.mx/estudio-qr/",
];

describe("qrScene", () => {
  it.each(texts)("decodes %s at reference and small print sizes", (text) => {
    const scene = qrScene(text);
    for (const px of [8, 5, 4]) {
      const { data, side } = rasterize(scene, px, "light", text);
      const result = jsQR(data, side, side, {
        inversionAttempts: "dontInvert",
      });
      expect(result?.data, `${px} px por módulo`).toBe(text);
    }
  });

  it.each(texts)(
    "still decodes %s if the logo ruined every covered module",
    (text) => {
      const scene = qrScene(text);
      const { data, side } = rasterize(scene, 8, "worst", text);
      expect(
        jsQR(data, side, side, { inversionAttempts: "dontInvert" })?.data,
      ).toBe(text);
    },
  );

  it("never places the logo plate over a function pattern", () => {
    for (const text of texts) {
      const scene = qrScene(text);
      const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
      const n = qr.modules.size;
      const quiet = (scene.size - n) / 2;
      expect(scene.plate.size).toBeGreaterThanOrEqual(5);
      for (
        let y = scene.plate.y;
        y < scene.plate.y + scene.plate.size;
        y += 1
      ) {
        for (
          let x = scene.plate.x;
          x < scene.plate.x + scene.plate.size;
          x += 1
        ) {
          expect(qr.modules.reservedBit[(y - quiet) * n + (x - quiet)]).toBe(0);
        }
      }
    }
  });
});
