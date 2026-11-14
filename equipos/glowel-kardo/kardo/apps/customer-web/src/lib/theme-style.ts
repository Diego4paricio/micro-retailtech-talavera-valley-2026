import type { ExperienceTheme } from "@kardo/contracts";
import type { CSSProperties } from "react";
// The WCAG relative-luminance formula Kardo uses everywhere a text/background
// pair needs a light-or-dark decision.
import { relativeLuminance } from "./color.js";

/** Curated presets: the Kardo brand palette, plus a couple of elegant extras. */
export const presetThemes: { name: string; theme: ExperienceTheme }[] = [
  {
    name: "Kardo claro",
    theme: {
      background: { kind: "solid", color: "#f3f0e8" },
      surface: "light",
      accent: "#0d637d",
      buttonStyle: "pill",
      font: "sans",
    },
  },
  {
    name: "Kardo oscuro",
    theme: {
      background: { kind: "solid", color: "#08293d" },
      surface: "dark",
      accent: "#8ce0dc",
      buttonStyle: "pill",
      font: "sans",
    },
  },
  {
    name: "Papel editorial",
    theme: {
      background: { kind: "solid", color: "#fffefa" },
      surface: "light",
      accent: "#08293d",
      buttonStyle: "rounded",
      font: "serif",
    },
  },
  {
    name: "Aqua degradado",
    theme: {
      background: {
        kind: "gradient",
        color: "#0d637d",
        colorTo: "#8ce0dc",
        angle: 135,
      },
      surface: "dark",
      accent: "#fffefa",
      buttonStyle: "pill",
      font: "rounded",
    },
  },
  {
    name: "Tinta profunda",
    theme: {
      background: {
        kind: "gradient",
        color: "#08293d",
        colorTo: "#0d637d",
        angle: 160,
      },
      surface: "dark",
      accent: "#8ce0dc",
      buttonStyle: "outline",
      font: "sans",
    },
  },
  {
    name: "Minimal mono",
    theme: {
      background: { kind: "solid", color: "#fffefa" },
      surface: "light",
      accent: "#08293d",
      buttonStyle: "square",
      font: "mono",
    },
  },
  {
    name: "Terracota",
    theme: {
      background: { kind: "solid", color: "#f3f0e8" },
      surface: "light",
      accent: "#b5533c",
      buttonStyle: "rounded",
      font: "serif",
    },
  },
  {
    name: "Bosque nocturno",
    theme: {
      background: { kind: "solid", color: "#08293d" },
      surface: "dark",
      accent: "#4f9d69",
      buttonStyle: "outline",
      font: "rounded",
    },
  },
];

const buttonRadii: Record<ExperienceTheme["buttonStyle"], string> = {
  pill: "999px",
  rounded: "0.85rem",
  square: "0.2rem",
  outline: "0.85rem",
};

/** Safe system-font stacks approximating each family without a new webfont
 * import; the public Resolver page loads the real webfont for each type. */
const fontStacks: Record<ExperienceTheme["font"], string> = {
  sans: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  rounded: "ui-rounded, 'Varela Round', 'DM Sans', sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
};

/** >=0.5 reads as a light color: dark text/ink sits better on top of it. */
export function isLightColor(hex: string): boolean {
  return relativeLuminance(hex) >= 0.5;
}

/** Ink (#16232e) reads better than white on this color: the text-on-accent
 * rule `@kardo/page-render` and the Resolver use (`onAccentColor`), a real
 * contrast comparison whose crossover sits near luminance 0.21. */
export function prefersInkText(hex: string): boolean {
  const luminance = relativeLuminance(hex);
  return (luminance + 0.05) / (0.0158 + 0.05) > 1.05 / (luminance + 0.05);
}

function backgroundLayers(theme: ExperienceTheme): {
  color: string;
  image: string;
} {
  const { background } = theme;
  if (background.kind === "gradient" && background.colorTo)
    return {
      color: background.color,
      image: `linear-gradient(${background.angle ?? 135}deg, ${background.color}, ${background.colorTo})`,
    };
  if (background.kind === "image") {
    const overlay = (background.overlay ?? 40) / 100;
    // Asset bytes are private and never fetched here (see ExperiencePreview):
    // a soft hatch stands in for the chosen photo, darkened by the overlay.
    return {
      color: background.color,
      image: `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), repeating-linear-gradient(135deg, rgba(255,255,255,.16) 0 14px, rgba(0,0,0,.05) 14px 28px)`,
    };
  }
  return { color: background.color, image: "none" };
}

/** A flat swatch style for preset buttons and small preview chips. */
export function swatchStyle(theme: ExperienceTheme): CSSProperties {
  const { color, image } = backgroundLayers(theme);
  return {
    background: image === "none" ? color : image,
    backgroundColor: color,
  };
}

export type PhoneThemeVars = CSSProperties & {
  "--phone-bg-color"?: string;
  "--phone-bg-image"?: string;
  "--phone-text"?: string;
  "--phone-muted"?: string;
  "--phone-surface"?: string;
  "--phone-surface-line"?: string;
  "--phone-accent"?: string;
  "--phone-button-bg"?: string;
  "--phone-button-border"?: string;
  "--phone-button-color"?: string;
  "--phone-radius"?: string;
  "--phone-font"?: string;
};

/**
 * Inline CSS custom properties for the phone preview. Every value has a CSS
 * fallback (`var(--x, default)`) in experiences.css, so a preview with no
 * custom theme renders exactly as before this feature existed.
 */
export function phoneThemeVars(
  theme: ExperienceTheme | undefined,
): PhoneThemeVars {
  if (!theme) return {};
  const { color, image } = backgroundLayers(theme);
  const dark = theme.surface === "dark";
  const outline = theme.buttonStyle === "outline";
  const accentIsLight = prefersInkText(theme.accent);
  return {
    "--phone-bg-color": color,
    "--phone-bg-image": image,
    "--phone-text": dark ? "#f5f7f5" : "#16232e",
    "--phone-muted": dark ? "rgba(245,247,245,.72)" : "rgba(22,35,46,.64)",
    "--phone-surface": dark ? "rgba(8,10,14,.4)" : "rgba(255,255,255,.76)",
    "--phone-surface-line": dark
      ? "rgba(245,247,245,.18)"
      : "rgba(22,35,46,.12)",
    "--phone-accent": theme.accent,
    "--phone-button-bg": outline ? "transparent" : theme.accent,
    "--phone-button-border": outline ? theme.accent : "transparent",
    "--phone-button-color": outline
      ? theme.accent
      : accentIsLight
        ? "#16232e"
        : "#fffefa",
    "--phone-radius": buttonRadii[theme.buttonStyle],
    "--phone-font": fontStacks[theme.font],
  };
}
