import { describe, expect, it } from "vitest";
import {
  isLightColor,
  phoneThemeVars,
  presetThemes,
  swatchStyle,
} from "../src/lib/theme-style.js";

const hexPattern = /^#[0-9a-fA-F]{6}$/;
const backgroundKinds = new Set(["solid", "gradient", "image"]);
const surfaces = new Set(["light", "dark"]);
const buttonStyles = new Set(["pill", "rounded", "square", "outline"]);
const fonts = new Set(["sans", "serif", "rounded", "mono"]);

describe("theme presets", () => {
  it("ships at least six presets with unique names", () => {
    expect(presetThemes.length).toBeGreaterThanOrEqual(6);
    expect(new Set(presetThemes.map((preset) => preset.name)).size).toBe(
      presetThemes.length,
    );
  });

  // Mirrors ExperienceThemeSchema's shape (packages/contracts) without
  // importing @sinclair/typebox, which isn't a direct dependency here.
  it("every preset matches the ExperienceTheme contract's shape", () => {
    for (const preset of presetThemes) {
      const { theme } = preset;
      expect(backgroundKinds.has(theme.background.kind), preset.name).toBe(
        true,
      );
      expect(hexPattern.test(theme.background.color), preset.name).toBe(true);
      expect(hexPattern.test(theme.accent), preset.name).toBe(true);
      expect(surfaces.has(theme.surface), preset.name).toBe(true);
      expect(buttonStyles.has(theme.buttonStyle), preset.name).toBe(true);
      expect(fonts.has(theme.font), preset.name).toBe(true);
    }
  });

  it("every gradient preset carries a second color", () => {
    for (const preset of presetThemes) {
      if (preset.theme.background.kind === "gradient")
        expect(preset.theme.background.colorTo, preset.name).toBeTruthy();
    }
  });
});

describe("swatchStyle", () => {
  it("uses a flat color for a solid background", () => {
    const style = swatchStyle({
      background: { kind: "solid", color: "#f3f0e8" },
      surface: "light",
      accent: "#0d637d",
      buttonStyle: "pill",
      font: "sans",
    });
    expect(style.backgroundColor).toBe("#f3f0e8");
  });

  it("uses a linear-gradient image for a gradient background", () => {
    const style = swatchStyle({
      background: {
        kind: "gradient",
        color: "#08293d",
        colorTo: "#8ce0dc",
        angle: 135,
      },
      surface: "dark",
      accent: "#8ce0dc",
      buttonStyle: "pill",
      font: "sans",
    });
    expect(String(style.background)).toContain("linear-gradient");
  });
});

describe("phoneThemeVars", () => {
  it("returns no overrides when there is no custom theme", () => {
    expect(phoneThemeVars(undefined)).toEqual({});
  });

  it("sets every CSS custom property for a custom theme", () => {
    const vars = phoneThemeVars({
      background: { kind: "solid", color: "#08293d" },
      surface: "dark",
      accent: "#8ce0dc",
      buttonStyle: "outline",
      font: "mono",
    });
    expect(vars["--phone-bg-color"]).toBe("#08293d");
    expect(vars["--phone-accent"]).toBe("#8ce0dc");
    expect(vars["--phone-button-bg"]).toBe("transparent");
    expect(vars["--phone-button-border"]).toBe("#8ce0dc");
    expect(vars["--phone-radius"]).toBeTruthy();
    expect(vars["--phone-font"]).toContain("monospace");
  });

  it("picks readable button text for a light vs dark accent", () => {
    const onLight = phoneThemeVars({
      background: { kind: "solid", color: "#fffefa" },
      surface: "light",
      accent: "#8ce0dc",
      buttonStyle: "pill",
      font: "sans",
    });
    const onDark = phoneThemeVars({
      background: { kind: "solid", color: "#fffefa" },
      surface: "light",
      accent: "#08293d",
      buttonStyle: "pill",
      font: "sans",
    });
    expect(onLight["--phone-button-color"]).toBe("#16232e");
    expect(onDark["--phone-button-color"]).toBe("#fffefa");
  });
});

describe("isLightColor", () => {
  it("treats white as light and ink as dark", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#08293d")).toBe(false);
  });
});
