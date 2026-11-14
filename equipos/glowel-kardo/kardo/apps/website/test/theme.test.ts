import { describe, expect, it } from "vitest";
import {
  onAccentColor,
  presetThemes,
  themeAttributes,
} from "@/components/kardo-page/theme";

// Same rule as the Resolver (services/resolver/src/render.ts onAccentColor)
// and the panel preview: button text is ink on a light accent.
describe("onAccentColor", () => {
  it.each([
    ["#fffefa", "#16232e"],
    ["#8ce0dc", "#16232e"],
    ["#0a6c78", "#fff"],
    ["#b5533c", "#fff"],
  ])("puts readable text on %s", (accent, text) => {
    expect(onAccentColor(accent)).toBe(text);
  });

  it("reaches the page through the theme attributes", () => {
    const { style } = themeAttributes(presetThemes["Aqua degradado"]);
    expect(style).toMatchObject({ "--t-on-accent": "#16232e" });
  });
});
