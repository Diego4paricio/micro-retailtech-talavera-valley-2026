import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as landing from "@/content/landing";
import media from "@/content/media.json";
import { pieces } from "@/content/pieces";

// The landing's photos and hero video (Docs/PLAN_AJUSTE_SITIO_IMAGENES.md):
// every image a page asks for was produced by landing-images.mjs in all its
// sizes, nothing unused is left in public/media/landing, and the hero stays
// light and labelled as a Kardo sample.

const root = path.resolve(import.meta.dirname, "..");
const landingDir = path.join(root, "public/media/landing");
const entries = media as Record<
  string,
  { width: number; height: number; widths: number[] }
>;

/** Image names the pages use (EditorialImage and PieceImage). */
const used = [
  ...landing.businesses.map((business) => business.image.name),
  "como-funciona",
  "panel-publicar",
  "panel-conectar",
  "panel-medir",
  ...pieces.map((piece) => `pieza-${piece.id}`),
];

const MB = 1024 * 1024;

describe("landing photos", () => {
  it("are all in the manifest", () => {
    for (const name of used) expect(entries[name], name).toBeDefined();
  });

  it("exist in every size the manifest lists", () => {
    for (const [name, entry] of Object.entries(entries)) {
      expect(entry.widths.at(-1)).toBe(entry.width);
      for (const w of entry.widths) {
        const file = path.join(landingDir, `${name}-${w}.webp`);
        expect(fs.existsSync(file), `${name}-${w}.webp`).toBe(true);
      }
    }
  });

  it("are never upscaled past 1800 px", () => {
    for (const entry of Object.values(entries))
      expect(entry.width).toBeLessThanOrEqual(1800);
  });

  it("describe what they show", () => {
    for (const piece of pieces) {
      expect(piece.image.alt.length, piece.id).toBeGreaterThan(20);
      expect(piece.detailAlt.length, piece.id).toBeGreaterThan(20);
    }
  });

  it("leave nothing unused in public/media/landing", () => {
    const expected = new Set<string>([
      "hero-kardo.mp4",
      "hero-kardo.webm",
      "hero-kardo-1440.mp4",
      "hero-kardo-1440.webm",
      "hero-kardo-poster.webp",
      "hero-kardo-poster-960.webp",
      "hero-kardo-poster-2560.webp",
      ...pieces.map((piece) => `arte-${piece.id}.webp`),
      ...Object.entries(entries).flatMap(([name, entry]) =>
        entry.widths.map((w) => `${name}-${w}.webp`),
      ),
    ]);
    const extra = fs
      .readdirSync(landingDir)
      .filter((file) => !file.startsWith(".") && !expected.has(file));
    expect(extra).toEqual([]);
  });
});

describe("hero video", () => {
  it("exists in both formats and both sizes with its poster, 2 MB or less each", () => {
    for (const file of [
      "hero-kardo.mp4",
      "hero-kardo.webm",
      "hero-kardo-1440.mp4",
      "hero-kardo-1440.webm",
      "hero-kardo-poster.webp",
      "hero-kardo-poster-960.webp",
      "hero-kardo-poster-2560.webp",
    ]) {
      const full = path.join(landingDir, file);
      expect(fs.existsSync(full), file).toBe(true);
      expect(fs.statSync(full).size, file).toBeLessThanOrEqual(2 * MB);
    }
  });
});
