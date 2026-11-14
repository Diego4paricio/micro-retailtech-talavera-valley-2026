import type { CSSProperties } from "react";

/**
 * The `theme` of an Experience (packages/contracts ExperienceThemeSchema),
 * without the image background: the landing has no customer photos.
 */
export interface PageTheme {
  background:
    | { kind: "solid"; color: string }
    | { kind: "gradient"; color: string; colorTo: string; angle?: number };
  surface: "light" | "dark";
  accent: string;
  buttonStyle: "pill" | "rounded" | "square" | "outline";
  font: "sans" | "serif" | "rounded" | "mono";
}

/** The presets the panel offers (apps/customer-web theme-style.ts). */
export const presetThemes = {
  "Kardo claro": {
    background: { kind: "solid", color: "#f3f0e8" },
    surface: "light",
    accent: "#0d637d",
    buttonStyle: "pill",
    font: "sans",
  },
  "Kardo oscuro": {
    background: { kind: "solid", color: "#08293d" },
    surface: "dark",
    accent: "#8ce0dc",
    buttonStyle: "pill",
    font: "sans",
  },
  "Papel editorial": {
    background: { kind: "solid", color: "#fffefa" },
    surface: "light",
    accent: "#08293d",
    buttonStyle: "rounded",
    font: "serif",
  },
  "Aqua degradado": {
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
  "Tinta profunda": {
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
  "Minimal mono": {
    background: { kind: "solid", color: "#fffefa" },
    surface: "light",
    accent: "#08293d",
    buttonStyle: "square",
    font: "mono",
  },
  Terracota: {
    background: { kind: "solid", color: "#f3f0e8" },
    surface: "light",
    accent: "#b5533c",
    buttonStyle: "rounded",
    font: "serif",
  },
  "Bosque nocturno": {
    background: { kind: "solid", color: "#08293d" },
    surface: "dark",
    accent: "#4f9d69",
    buttonStyle: "outline",
    font: "rounded",
  },
} satisfies Record<string, PageTheme>;

export type PresetName = keyof typeof presetThemes;

/** Same mapping as the Resolver's `themeAttributes()`. */
export function themeAttributes(theme?: PageTheme): {
  className: string;
  style: CSSProperties;
} {
  if (!theme) return { className: "", style: {} };
  const background =
    theme.background.kind === "gradient"
      ? `linear-gradient(${theme.background.angle ?? 180}deg, ${theme.background.color}, ${theme.background.colorTo})`
      : theme.background.color;
  return {
    className: `theme-${theme.surface} btn-${theme.buttonStyle} font-${theme.font}`,
    style: {
      "--t-accent": theme.accent,
      "--t-on-accent": onAccentColor(theme.accent),
      "--t-bg": background,
    } as CSSProperties,
  };
}

/** Text on the accent: ink on a light accent, white on a dark one, like the
 * Resolver's onAccentColor() and the panel preview. */
export function onAccentColor(accent: string): string {
  return luminance(accent) >= 0.5 ? "#16232e" : "#fff";
}

/** Whether the page behind the phone's status bar is dark. */
export function isDarkBackground(theme?: PageTheme): boolean {
  if (!theme) return false;
  return luminance(theme.background.color) < 0.4;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
