import type { CanvasSection, PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  estimateHeight,
  estimateLines,
  fitCanvasText,
} from "../src/design-ai/canvas-fit.js";

// ---------------------------------------------------------------------------
// Text that fits on a canvas (2026-10-03): the test bench saw a two-line
// title land on the sentence below it and a button label break in two.
// ---------------------------------------------------------------------------

const style = {
  palette: {
    background: "#ffffff",
    surface: "#ffffff",
    text: "#111111",
    muted: "#555555",
    accent: "#b4471f",
  },
  fonts: { heading: "dm-serif", body: "dm-sans" },
  radius: 12,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "none",
  background: { kind: "solid", color: "#ffffff" },
  maxWidth: 480,
} as PageDesign["style"];

function cover(items: CanvasSection["items"], height = 500): PageDesign {
  return {
    schema: 2,
    style,
    sections: [{ id: "portada", kind: "canvas", height, items }],
  };
}

const canvasOf = (design: PageDesign) => design.sections[0] as CanvasSection;

describe("estimateLines", () => {
  it("wraps at spaces and keeps the text's own line breaks", () => {
    expect(estimateLines("Café Central", 342, 10)).toBe(1);
    expect(estimateLines("Pan para encargar", 120, 10)).toBe(2);
    expect(estimateLines("uno\ndos", 342, 10)).toBe(2);
  });
});

describe("fitCanvasText", () => {
  it("moves the sentence below a title that wraps to two lines", () => {
    const design = cover([
      {
        block: {
          id: "t",
          kind: "heading",
          level: 1,
          text: "Pan para encargar",
          style: { fontSize: 48 },
        },
        x: 24,
        y: 324,
        w: 342,
      },
      {
        block: {
          id: "p",
          kind: "text",
          runs: [{ text: "Pan dulce y bolillo recién horneado" }],
        },
        x: 24,
        y: 384,
        w: 342,
      },
    ]);
    const title = canvasOf(design).items[0]?.block;
    if (title?.kind !== "heading") throw new Error("no title");
    const titleBottom = 324 + estimateHeight(title, 342);
    const next = canvasOf(fitCanvasText(design));
    expect(next.items[1]?.y).toBeGreaterThanOrEqual(titleBottom);
  });

  it("widens a button so its label stays on one line", () => {
    const design = cover([
      {
        block: {
          id: "b",
          kind: "brandButton",
          brand: "whatsapp",
          label: "Escríbenos por WhatsApp",
          href: "https://wa.me/523312345678",
          look: "brand",
        },
        x: 24,
        y: 400,
        w: 200,
      },
    ]);
    const button = canvasOf(fitCanvasText(design)).items[0];
    expect(button?.w).toBeGreaterThan(200);
    expect((button?.x ?? 0) + (button?.w ?? 0)).toBeLessThanOrEqual(390 - 16);
  });

  it("grows the canvas when texts end below it, never for a bleeding image", () => {
    const bleeding = cover([
      {
        block: {
          id: "i",
          kind: "image",
          imageRef: "11111111-1111-4111-8111-111111111111",
          alt: "",
          aspect: "auto",
          fit: "cover",
        },
        x: 200,
        y: 300,
        w: 260,
        h: 320,
      },
    ]);
    expect(fitCanvasText(bleeding)).toBe(bleeding);

    const low = cover(
      [
        {
          block: { id: "t", kind: "heading", level: 2, text: "Al final" },
          x: 24,
          y: 470,
          w: 342,
        },
      ],
      480,
    );
    expect(canvasOf(fitCanvasText(low)).height).toBeGreaterThan(480);
  });

  it("leaves a design that already fits alone", () => {
    const design = cover([
      {
        block: { id: "t", kind: "heading", level: 1, text: "Fonda" },
        x: 24,
        y: 300,
        w: 342,
      },
      {
        block: { id: "p", kind: "text", runs: [{ text: "Casera" }] },
        x: 24,
        y: 360,
        w: 342,
      },
    ]);
    expect(fitCanvasText(design)).toBe(design);
  });
});
