import type { PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureReadablePalette,
  readableOn,
} from "../src/design-ai/readable-palette.js";

function design(palette: PageDesign["style"]["palette"]): PageDesign {
  return {
    schema: 1,
    style: {
      palette,
      fonts: { heading: "geist", body: "dm-sans" },
      radius: 16,
      buttonStyle: "solid",
      buttonShape: "pill",
      shadow: "soft",
      background: { kind: "none" },
      maxWidth: 480,
    },
    sections: [],
  } as PageDesign;
}

describe("readableOn", () => {
  it("keeps a color that already reads", () => {
    expect(readableOn("#1f2a27", ["#ffffff"], 4.5)).toBe("#1f2a27");
  });

  it("darkens a light gray on white until it reaches 4.5:1", () => {
    const fixed = readableOn("#b0b0b0", ["#ffffff", "#f7f5f0"], 4.5);
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixed, "#f7f5f0")).toBeGreaterThanOrEqual(4.5);
  });

  it("lightens text on a dark page instead", () => {
    const fixed = readableOn("#444444", ["#111111"], 4.5);
    expect(contrastRatio(fixed, "#111111")).toBeGreaterThanOrEqual(4.5);
    expect(fixed > "#444444").toBe(true);
  });
});

describe("ensureReadablePalette", () => {
  it("fixes a weak muted and a pastel accent, and says what changed", () => {
    const { design: next, fixes } = ensureReadablePalette(
      design({
        background: "#f7f5f0",
        surface: "#ffffff",
        text: "#1f2a27",
        muted: "#9aa5a1",
        accent: "#e7b7c8",
      }),
    );
    const palette = next.style.palette;
    expect(fixes.map((fix) => fix.token)).toEqual(["muted", "accent"]);
    expect(
      contrastRatio(palette.muted, palette.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(palette.accent, palette.surface),
    ).toBeGreaterThanOrEqual(3);
    expect(palette.text).toBe("#1f2a27");
  });

  it("returns the very same design when everything reads", () => {
    const readable = design({
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#555555",
      accent: "#2f5d50",
    });
    const result = ensureReadablePalette(readable);
    expect(result.design).toBe(readable);
    expect(result.fixes).toEqual([]);
  });
});

describe("accent that writes text (relevo 37, IA3)", () => {
  const pink = {
    background: "#ffffff",
    surface: "#ffffff",
    text: "#1f2a27",
    muted: "#55606a",
    // ~4.1:1 on white: enough for a solid button, not for text.
    accent: "#d94f7c",
  };

  it("leaves a 4.1:1 accent alone when it only paints solid buttons", () => {
    const { fixes } = ensureReadablePalette(design(pink));
    expect(fixes).toEqual([]);
  });

  it("darkens it to 4.5:1 when prices are in the accent", () => {
    const page = design(pink);
    page.sections = [
      {
        id: "s",
        layout: "1",
        columns: [
          [{ id: "m", kind: "menu", layout: "list", priceStyle: "accent" }],
        ],
      },
    ] as unknown as PageDesign["sections"];
    const { design: next, fixes } = ensureReadablePalette(page);
    expect(fixes.map((fix) => fix.token)).toEqual(["accent"]);
    expect(
      contrastRatio(next.style.palette.accent, "#ffffff"),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("also with soft buttons", () => {
    const page = design(pink);
    page.style.buttonStyle = "soft";
    expect(ensureReadablePalette(page).fixes.map((fix) => fix.token)).toEqual([
      "accent",
    ]);
  });
});
