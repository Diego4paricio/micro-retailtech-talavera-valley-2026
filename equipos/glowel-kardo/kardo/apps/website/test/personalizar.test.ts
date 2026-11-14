import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import {
  contrast,
  decodeDesign,
  defaultDesign,
  encodeDesign,
  ink,
  palettes,
  textOn,
  tileColors,
} from "@/components/personalizar/design";
import { fileName } from "@/components/personalizar/export";
import { fitText, qrPath } from "@/components/personalizar/fit";
import {
  detailRows,
  piecesFor,
  whatsappMessage,
} from "@/components/personalizar/message";
import { loadKits } from "@/lib/kits";

// /personalizar/ has no server: the design travels in a link and a
// WhatsApp message, and the piece must stay readable whatever colors the
// visitor picks.

const kits = loadKits().kits;
const mostrador = kits.find((kit) => kit.code === "mostrador");

describe("design link", () => {
  it("survives the round trip, without the logo", () => {
    const design = {
      ...defaultDesign,
      piece: "sticker" as const,
      brand: {
        ...defaultDesign.brand,
        name: "Florería Lila ñ",
        font: "playfair" as const,
        background: "#4B3560",
        logo: "data:image/png;base64,AAAA",
      },
    };
    const back = decodeDesign(encodeDesign(design));
    expect(back?.piece).toBe("sticker");
    expect(back?.brand.name).toBe("Florería Lila ñ");
    expect(back?.brand.font).toBe("playfair");
    expect(back?.brand.logo).toBeNull();
    expect(back?.texts).toEqual(design.texts);
  });

  it("refuses garbage and cleans odd values", () => {
    expect(decodeDesign("no-es-un-diseno")).toBeNull();
    const odd = btoa(
      JSON.stringify([
        "mesa",
        "x".repeat(200),
        1,
        "comic",
        "red",
        "#00FF00",
        "neon",
        999,
        0,
        ["pill", 4, "ok"],
        [],
        null,
        ["logo", "Mesa 1", "Acerca tu celular"],
      ]),
    );
    const design = decodeDesign(odd);
    expect(design?.piece).toBe("stand");
    expect(design?.brand.name.length).toBe(40);
    expect(design?.brand.font).toBe("geist");
    expect(design?.brand.background).toBe(defaultDesign.brand.background);
    expect(design?.brand.accent).toBe("#00FF00");
    expect(design?.brand.textTone).toBe("auto");
    expect(design?.brand.logoScale).toBe(1.4);
    expect(design?.texts.stand.tagline).toBe(defaultDesign.texts.stand.tagline);
    expect(design?.texts.sticker.layout).toBe("logo");
  });
});

describe("readable pieces", () => {
  it("writes the name in the color that reads best", () => {
    for (const palette of palettes) {
      const text = textOn(palette.background);
      expect(
        contrast(text, palette.background),
        palette.name,
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(textOn("#FFFFFF")).toBe(ink.dark);
    expect(textOn("#16232E")).toBe(ink.light);
  });

  it("keeps the QR dark on a light square", () => {
    for (const palette of palettes) {
      const tile = tileColors(palette.background);
      expect(contrast(tile.ink, tile.fill), palette.name).toBeGreaterThan(7);
    }
  });

  it("draws a QR that a phone reads", () => {
    const text = "https://kardo.example/piezas/#stand";
    const { d, modules } = qrPath(text);
    const px = 6;
    const quiet = 4;
    const side = (modules + quiet * 2) * px;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (const run of d.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      const [x, y, w] = [Number(run[1]), Number(run[2]), Number(run[3])];
      for (let py = 0; py < px; py += 1) {
        for (let pxl = 0; pxl < w * px; pxl += 1) {
          const i =
            ((y + quiet) * px + py) * side * 4 + ((x + quiet) * px + pxl) * 4;
          data[i] = 22;
          data[i + 1] = 35;
          data[i + 2] = 46;
        }
      }
    }
    expect(jsQR(data, side, side)?.data).toBe(text);
  });

  it("shrinks and breaks a long name instead of overflowing", () => {
    const fitted = fitText({
      text: "Taller mecánico y refaccionaria de los hermanos Rodríguez",
      family: "var(--font-geist)",
      weight: 600,
      size: 8,
      minSize: 4,
      maxWidth: 80,
      maxLines: 2,
    });
    expect(fitted.lines.length).toBeLessThanOrEqual(2);
    expect(fitted.size).toBeLessThan(8);
    expect(fitted.size).toBeGreaterThanOrEqual(4);
  });
});

describe("what Kardo receives", () => {
  it("opens WhatsApp with the design written out", () => {
    const message = whatsappMessage(
      { ...defaultDesign, brand: { ...defaultDesign.brand, name: "Café Sol" } },
      mostrador ?? null,
      "https://sitio/personalizar/#d=abc",
    );
    expect(message).toMatch(/^Hola, /);
    expect(message).toContain("Negocio: Café Sol");
    expect(message).toContain("Kit Mostrador (1 Stand, 2 Stickers)");
    expect(message).toContain("Sticker: «Mesa 12»");
    expect(message).toContain("https://sitio/personalizar/#d=abc");
    // No price in the message: the kit's price is agreed in the chat.
    expect(message).not.toMatch(/\$\s?\d/);
  });

  it("covers the kit's pieces, or the one being designed", () => {
    expect(piecesFor(defaultDesign, mostrador ?? null)).toEqual([
      "stand",
      "sticker",
    ]);
    expect(piecesFor({ ...defaultDesign, piece: "card" }, null)).toEqual([
      "card",
    ]);
    const rows = detailRows({ ...defaultDesign, piece: "card" }, null);
    expect(rows.map(([label]) => label)).toEqual([
      "Negocio",
      "Pieza",
      "Colores",
      "Letra",
      "Card",
      "Logo",
    ]);
  });

  it("names the file after the business", () => {
    expect(fileName("Café Central")).toBe("kardo-cafe-central.png");
    expect(fileName("¡¡!!")).toBe("kardo-diseno.png");
  });
});
