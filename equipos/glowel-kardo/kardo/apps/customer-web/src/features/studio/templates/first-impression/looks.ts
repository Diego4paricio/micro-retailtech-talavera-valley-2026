import type { DesignBackground } from "@kardo/contracts";
import { inkOn, mix, readable } from "./color.js";
import type { CoverKit, Face, Theme } from "./kit.js";

/**
 * The twenty first-impression looks (owner, 2026-10-04: «conceptos
 * modernos, al menos 20 plantillas»). Each is a whole visual system built
 * from one accent color: palette, type pair, corners and buttons, a cover
 * composed on a canvas, how its facts, content and closing look, and what
 * goes behind a profile photo. None needs a photo: a new owner has none.
 */

export type LookContent = {
  /** Menú and Catálogo on a card. */
  card: boolean;
  menuSections: "line" | "plain" | "pill" | "card";
  menuLayout: "list" | "compact";
  price: "plain" | "accent" | "pill";
  facts: { layout: "list" | "grid"; icons: "plain" | "circle" | "square" };
  document: "shadow" | "border" | "flat";
  form: "boxed" | "card" | "underline";
  closing: "card" | "band" | "plain";
  button: "brand" | "outline" | "neutral";
};

export type Look = {
  id: string;
  name: string;
  defaultAccent: string;
  theme: (accent: string) => Theme;
  /** Draws the cover; returns its height. */
  cover: (kit: CoverKit) => number;
  /** What sits behind a 96 px profile photo centered at (195, 96), on a
   * cover `height` tall. */
  avatarDecor: (kit: CoverKit, height: number) => void;
  content: LookContent;
};

// --- themes -----------------------------------------------------------------

type ThemeOptions = {
  title: Face;
  phrase: Face;
  heading?: Face["font"];
  body?: Face["font"];
  radius: number;
  buttonShape: "pill" | "rounded" | "square";
  buttonStyle?: "solid" | "soft" | "outline";
  shadow: "none" | "soft" | "strong";
  /** The page background: a base mixed with this much accent. */
  base?: string;
  amount?: number;
  /** The text's base before a little accent goes in. */
  ink?: string;
  coverBackground?: (accent: string) => DesignBackground;
  /** Text over the cover goes on the accent itself. */
  coverOnAccent?: boolean;
};

function light(accentIn: string, o: ThemeOptions): Theme {
  const background = mix(o.base ?? "#ffffff", accentIn, o.amount ?? 0.05);
  const text = readable(mix(o.ink ?? "#17120f", accentIn, 0.14), background, 7);
  const muted = readable(mix(text, "#ffffff", 0.42), background, 4.5);
  const accent = readable(accentIn, "#ffffff", 4.5);
  const onAccent = inkOn(accentIn);
  return {
    tint: mix("#ffffff", accentIn, 0.16),
    deep: mix(accentIn, "#000000", 0.22),
    coverText: o.coverOnAccent ? onAccent : text,
    coverMuted: o.coverOnAccent ? mix(onAccent, accentIn, 0.16) : muted,
    ...(o.coverBackground
      ? { coverBackground: o.coverBackground(accentIn) }
      : {}),
    title: o.title,
    phrase: o.phrase,
    style: {
      palette: { background, surface: "#ffffff", text, muted, accent },
      fonts: {
        heading: o.heading ?? o.title.font,
        body: o.body ?? o.phrase.font,
      },
      radius: o.radius,
      buttonStyle: o.buttonStyle ?? "solid",
      buttonShape: o.buttonShape,
      shadow: o.shadow,
      background: { kind: "solid", color: background },
      maxWidth: 600,
      pagePadding: 24,
      ambient: { kind: "none" },
    },
  };
}

function dark(
  accentIn: string,
  o: ThemeOptions & { surfaceBase?: string; surfaceAmount?: number },
): Theme {
  const background = mix(o.base ?? "#100d0c", accentIn, o.amount ?? 0.06);
  const surface = mix(
    o.surfaceBase ?? "#1c1816",
    accentIn,
    o.surfaceAmount ?? 0.08,
  );
  const text = "#f6f1ea";
  const muted = readable(mix(text, background, 0.32), surface, 4.5);
  const accent = readable(accentIn, surface, 4.5);
  return {
    tint: accent,
    deep: mix(accentIn, "#000000", 0.4),
    coverText: text,
    coverMuted: readable(mix(text, background, 0.3), background, 4.5),
    ...(o.coverBackground
      ? { coverBackground: o.coverBackground(accentIn) }
      : {}),
    title: o.title,
    phrase: o.phrase,
    style: {
      palette: { background, surface, text, muted, accent },
      fonts: {
        heading: o.heading ?? o.title.font,
        body: o.body ?? o.phrase.font,
      },
      radius: o.radius,
      buttonStyle: o.buttonStyle ?? "solid",
      buttonShape: o.buttonShape,
      shadow: o.shadow,
      background: { kind: "solid", color: background },
      maxWidth: 600,
      pagePadding: 24,
      ambient: { kind: "none" },
    },
  };
}

const face = (
  font: Face["font"],
  weight: Face["weight"],
  spacing?: number,
): Face => (spacing ? { font, weight, spacing } : { font, weight });

const ring = (kit: CoverKit) => kit.theme.style.palette.accent;
const accentOf = (kit: CoverKit) => kit.theme.style.palette.accent;

// --- the twenty looks -----------------------------------------------------

const halo: Look = {
  id: "halo",
  name: "Halo",
  defaultAccent: "#8e3b4e",
  theme: (a) =>
    light(a, {
      title: face("cormorant", 600, -1),
      phrase: face("outfit", 400),
      radius: 24,
      buttonShape: "pill",
      shadow: "soft",
      amount: 0.06,
    }),
  cover: (k) => {
    const c = k.compact;
    k.shape(
      "ellipse",
      k.theme.tint,
      c ? 85 : 45,
      c ? -150 : -120,
      c ? 220 : 300,
      c ? 220 : 300,
    );
    const markSize = c ? 72 : 96;
    const markY = c ? 34 : 116;
    k.mark(195 - markSize / 2, markY, markSize, {
      fill: "#ffffff",
      ink: accentOf(k),
      ring: ring(k),
    });
    const t = k.measureTitle(c ? [40, 34, 30] : [46, 40, 34], 330);
    const titleY = markY + markSize + (c ? 20 : 32);
    k.title(t, 195, titleY, "center");
    const phraseY = titleY + t.h + 10;
    k.phrase(16, 45, phraseY, 300, "center");
    return phraseY + k.measurePhrase(16, 300) + 28;
  },
  avatarDecor: (k) => k.shape("ellipse", k.theme.tint, 75, -40, 240, 240),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const marco: Look = {
  id: "marco",
  name: "Marco",
  defaultAccent: "#d4a853",
  theme: (a) =>
    dark(a, {
      title: face("cormorant", 600, -1),
      phrase: face("manrope", 400),
      radius: 4,
      buttonShape: "square",
      buttonStyle: "outline",
      shadow: "none",
    }),
  cover: (k) => {
    const c = k.compact;
    const withMark = !c || k.hasLogo;
    const t = k.measureTitle(c ? [44, 38, 34] : [52, 44, 38], 278);
    const titleY = withMark ? 140 : 72;
    const ruleY = titleY + t.h + 18;
    const phraseY = ruleY + 22;
    const frameBottom = phraseY + k.measurePhrase(15, 262) + 40;
    k.shape("rect", "background", 24, 32, 342, frameBottom - 32, {
      stroke: "accent",
      strokeWidth: 1,
    });
    if (withMark) k.mark(167, 64, 56, { fill: "surface", ink: accentOf(k) });
    k.title(t, 195, titleY, "center");
    // Two hairlines (an outlined bar: shapes are at least 8 px tall).
    k.shape(
      "rect",
      "background",
      171,
      ruleY - 3,
      48,
      8,
      { stroke: "accent", strokeWidth: 1 },
      2,
    );
    k.phrase(15, 64, phraseY, 262, "center");
    return frameBottom + 12;
  },
  avatarDecor: (k, h) =>
    k.shape("rect", "background", 24, 24, 342, h - 40, {
      stroke: "accent",
      strokeWidth: 1,
    }),
  content: {
    card: false,
    menuSections: "line",
    menuLayout: "list",
    price: "plain",
    facts: { layout: "list", icons: "plain" },
    document: "border",
    form: "underline",
    closing: "card",
    button: "outline",
  },
};

const bloque: Look = {
  id: "bloque",
  name: "Bloque de color",
  defaultAccent: "#b42318",
  theme: (a) =>
    light(a, {
      title: face("bricolage", 700, -2),
      phrase: face("dm-sans", 400),
      radius: 16,
      buttonShape: "pill",
      shadow: "soft",
      amount: 0.04,
      coverOnAccent: true,
      coverBackground: (accent) => ({ kind: "solid", color: accent }),
    }),
  cover: (k) => {
    const c = k.compact;
    const onAccent = k.theme.coverText;
    k.shape(
      "ellipse",
      mix(
        k.theme.style.palette.accent,
        onAccent === "#ffffff" ? "#000000" : "#ffffff",
        0.16,
      ),
      190,
      -110,
      310,
      310,
    );
    const withMark = !c || k.hasLogo;
    if (withMark)
      k.mark(24, 32, 60, {
        fill: onAccent,
        ink: (k.theme.coverBackground?.color as string) ?? "#000000",
      });
    const t = k.measureTitle(c ? [48, 42, 36] : [58, 50, 42], 342, 10);
    const ph = k.measurePhrase(17, 310);
    const minHeight = c ? 280 : 400;
    const phraseY = minHeight - 40 - ph;
    const titleY = Math.max(withMark ? 116 : 48, phraseY - 14 - t.h);
    k.title(t, 24, titleY, "start", 10);
    k.phrase(17, 24, titleY + t.h + 14, 310, "start");
    return Math.max(minHeight, titleY + t.h + 14 + ph + 40);
  },
  avatarDecor: (k) => {
    k.shape(
      "rect",
      (k.theme.coverBackground?.color as string) ?? "accent",
      0,
      0,
      390,
      112,
    );
  },
  content: {
    card: true,
    menuSections: "pill",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "boxed",
    closing: "card",
    button: "brand",
  },
};

const revista: Look = {
  id: "revista",
  name: "Revista",
  defaultAccent: "#2346a0",
  theme: (a) =>
    light(a, {
      title: face("dm-serif", 400, -1),
      phrase: face("manrope", 400),
      radius: 2,
      buttonShape: "square",
      shadow: "none",
      base: "#fbfaf8",
      amount: 0.02,
      ink: "#141414",
    }),
  cover: (k) => {
    const c = k.compact;
    k.shape(
      "ellipse",
      readable(
        k.theme.style.palette.accent,
        k.theme.style.palette.background,
        3,
      ),
      322,
      c ? 16 : 28,
      132,
      132,
    );
    const top = c ? 40 : 60;
    const markSize = 56;
    if (k.hasLogo)
      k.mark(24, top - 8, markSize, { fill: "#ffffff", ink: accentOf(k) });
    else k.shape("rect", "text", 24, top, 48, 8, {}, 1);
    const t = k.measureTitle(c ? [48, 42, 36] : [60, 52, 44], 290, 10);
    const titleY = k.hasLogo ? top - 8 + markSize + 20 : c ? 64 : 92;
    k.title(t, 24, titleY, "start", 10);
    const phraseY = titleY + t.h + 18;
    k.phrase(17, 24, phraseY, 290, "start");
    return phraseY + k.measurePhrase(17, 290) + 36;
  },
  avatarDecor: (k) => k.shape("rect", "text", 171, 16, 48, 8),
  content: {
    card: false,
    menuSections: "plain",
    menuLayout: "list",
    price: "plain",
    facts: { layout: "list", icons: "plain" },
    document: "border",
    form: "underline",
    closing: "plain",
    button: "brand",
  },
};

const burbuja: Look = {
  id: "burbuja",
  name: "Burbuja",
  defaultAccent: "#2f7a5b",
  theme: (a) =>
    light(a, {
      title: face("outfit", 600, -1),
      phrase: face("manrope", 400),
      radius: 22,
      buttonShape: "pill",
      shadow: "soft",
      amount: 0.05,
    }),
  cover: (k) => {
    const c = k.compact;
    k.shape(
      "blob",
      k.theme.tint,
      12,
      c ? 12 : 20,
      c ? 132 : 176,
      c ? 120 : 160,
    );
    k.shape("ellipse", k.theme.tint, 318, 44, 40, 40);
    const markSize = c ? 64 : 88;
    k.mark(c ? 46 : 56, c ? 40 : 56, markSize, {
      fill: "#ffffff",
      ink: accentOf(k),
    });
    const t = k.measureTitle(c ? [42, 36, 32] : [48, 42, 36], 342);
    const titleY = c ? 156 : 204;
    k.title(t, 24, titleY, "start");
    const phraseY = titleY + t.h + 10;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 28;
  },
  avatarDecor: (k) => {
    k.shape("blob", k.theme.tint, 95, 8, 200, 180);
    k.shape("ellipse", k.theme.tint, 300, 40, 36, 36);
  },
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const dosTonos: Look = {
  id: "dos-tonos",
  name: "Dos tonos",
  defaultAccent: "#1d5c9e",
  theme: (a) =>
    light(a, {
      title: face("space-grotesk", 700, -3),
      phrase: face("geist", 400),
      radius: 14,
      buttonShape: "rounded",
      shadow: "soft",
      amount: 0.03,
    }),
  cover: (k) => {
    const c = k.compact;
    const band = c ? 120 : 176;
    const accent = k.theme.style.palette.accent;
    k.shape("rect", accent, 0, 0, 390, band);
    k.shape("ellipse", mix(accent, "#ffffff", 0.18), 292, -36, 132, 132);
    const markSize = c ? 72 : 88;
    k.mark(24, band - markSize / 2, markSize, {
      fill: "#ffffff",
      ink: accent,
      ring: "background",
    });
    const t = k.measureTitle(c ? [38, 34, 30] : [44, 38, 32], 342);
    const titleY = band + markSize / 2 + 20;
    k.title(t, 24, titleY, "start");
    const phraseY = titleY + t.h + 10;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 28;
  },
  avatarDecor: (k) =>
    k.shape("rect", k.theme.style.palette.accent, 0, 0, 390, 96),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "grid", icons: "square" },
    document: "shadow",
    form: "boxed",
    closing: "card",
    button: "brand",
  },
};

const letraGrande: Look = {
  id: "letra-grande",
  name: "Letra grande",
  defaultAccent: "#d93a1e",
  theme: (a) =>
    light(a, {
      title: face("bebas", 400),
      phrase: face("montserrat", 400),
      radius: 6,
      buttonShape: "square",
      shadow: "none",
      amount: 0.035,
      ink: "#141414",
    }),
  cover: (k) => {
    const c = k.compact;
    const color = readable(
      k.theme.style.palette.accent,
      k.theme.style.palette.background,
      3,
    );
    const markSize = 56;
    if (k.hasLogo) {
      k.mark(24, 24, markSize, { fill: "#ffffff", ink: color });
      k.shape("rect", "text", 24 + markSize + 16, 48, 342 - markSize - 16, 8);
    } else k.shape("rect", "text", 24, 28, 342, 8);
    const t = k.measureTitle(
      c ? [64, 56, 48] : [72, 64, 56],
      342,
      10,
      c ? 2 : 3,
    );
    const titleY = k.hasLogo ? 24 + markSize + 16 : c ? 44 : 52;
    k.title(t, 24, titleY, "start", 10, color);
    const phraseY = titleY + t.h + 12;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 32;
  },
  avatarDecor: (k) => k.shape("rect", "text", 24, 20, 342, 8),
  content: {
    card: false,
    menuSections: "plain",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "plain" },
    document: "flat",
    form: "boxed",
    closing: "band",
    button: "neutral",
  },
};

const sello: Look = {
  id: "sello",
  name: "Sello",
  defaultAccent: "#2f6b3a",
  theme: (a) =>
    light(a, {
      title: face("bricolage", 700, -2),
      phrase: face("dm-sans", 400),
      radius: 18,
      buttonShape: "pill",
      shadow: "soft",
      base: "#fffaf3",
      amount: 0.04,
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    // A square turned 45° reaches 0.21 of its side past each edge.
    const size = c ? 96 : 128;
    const reach = Math.round(size * 0.21);
    const x = 366 - size - reach;
    const y = (c ? 16 : 24) + reach;
    // Two squares, one turned 45°, make an eight-pointed seal.
    k.shape("rect", accent, x, y, size, size, {}, 1, 8);
    k.shape("rect", accent, x, y, size, size, {}, 1, 53);
    const inner = Math.round(size * 0.74);
    const off = (size - inner) / 2;
    k.shape(
      "ellipse",
      accent,
      x + off,
      y + off,
      inner,
      inner,
      { stroke: inkOn(accent), strokeWidth: 1 },
      2,
    );
    k.mark(
      x + (size - inner * 0.8) / 2,
      y + (size - inner * 0.8) / 2,
      inner * 0.8,
      { fill: accent, ink: inkOn(accent) },
    );
    const t = k.measureTitle(c ? [44, 38, 34] : [52, 46, 40], 342, 10);
    const titleY = y + size + reach + (c ? 16 : 24);
    k.title(t, 24, titleY, "start", 10);
    const phraseY = titleY + t.h + 14;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 32;
  },
  avatarDecor: (k) => {
    const accent = k.theme.tint;
    k.shape("rect", accent, 131, 32, 128, 128, {}, 0, 8);
    k.shape("rect", accent, 131, 32, 128, 128, {}, 0, 53);
  },
  content: {
    card: true,
    menuSections: "pill",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const ticket: Look = {
  id: "ticket",
  name: "Ticket",
  defaultAccent: "#c2410c",
  theme: (a) =>
    light(a, {
      title: face("space-grotesk", 700, -3),
      phrase: face("space-grotesk", 400),
      radius: 16,
      buttonShape: "rounded",
      shadow: "soft",
      amount: 0.12,
    }),
  cover: (k) => {
    const c = k.compact;
    const top = 28;
    const t = k.measureTitle(c ? [36, 32, 28] : [40, 34, 30], 294);
    const markSize = 56;
    const withMark = !c || k.hasLogo;
    const titleY = withMark ? top + 24 + markSize + 20 : top + 32;
    const notchY = titleY + t.h + 28;
    const phraseY = notchY + 24;
    const bottom = phraseY + k.measurePhrase(15, 294) + 28;
    k.shape("rect", "surface", 24, top, 342, bottom - top, { radius: 20 });
    // The ticket's notches and its dashed tear line.
    k.shape("ellipse", "background", 10, notchY - 14, 28, 28, {}, 1);
    k.shape("ellipse", "background", 352, notchY - 14, 28, 28, {}, 1);
    for (let x = 52; x + 8 <= 338; x += 16)
      k.shape("ellipse", "background", x, notchY - 4, 8, 8, {}, 1);
    if (withMark)
      k.mark(195 - markSize / 2, top + 24, markSize, {
        fill: k.theme.style.palette.accent,
        ink: inkOn(k.theme.style.palette.accent),
      });
    k.title(t, 195, titleY, "center");
    k.phrase(15, 48, phraseY, 294, "center");
    return bottom + 20;
  },
  avatarDecor: (k, h) =>
    k.shape("rect", "surface", 24, 16, 342, h - 28, { radius: 20 }),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const cuadros: Look = {
  id: "cuadros",
  name: "Cuadros",
  defaultAccent: "#2563eb",
  theme: (a) =>
    light(a, {
      title: face("manrope", 700, -3),
      phrase: face("dm-sans", 400),
      radius: 20,
      buttonShape: "rounded",
      shadow: "soft",
      base: "#f6f6f4",
      amount: 0.03,
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const onAccent = inkOn(accent);
    const t = k.measureTitle(c ? [38, 34, 30] : [44, 38, 32], 302);
    const markInBlock = c && k.hasLogo;
    const big = Math.max(
      c ? 120 : 176,
      t.h + (c ? 56 : 88),
      markInBlock ? t.h + 116 : 0,
    );
    k.shape("rect", accent, 24, 24, 342, big, { radius: 24 });
    if (markInBlock) k.mark(44, 44, 56, { fill: "#ffffff", ink: accent });
    k.title(t, 44, 24 + big - (c ? 24 : 28) - t.h, "start", 11, onAccent);
    if (c) return 24 + big + 20;
    const ph = k.measurePhrase(15, 133);
    const small = Math.max(120, ph + 40);
    const row = 24 + big + 12;
    k.shape("rect", k.theme.tint, 24, row, 165, small, { radius: 24 });
    k.mark(24 + (165 - 64) / 2, row + (small - 64) / 2, 64, {
      fill: "#ffffff",
      ink: accent,
    });
    k.shape("rect", "surface", 201, row, 165, small, { radius: 24 });
    k.phrase(15, 217, row + (small - ph) / 2, 133, "start");
    return row + small + 20;
  },
  avatarDecor: (k) =>
    k.shape("rect", k.theme.tint, 24, 16, 342, 160, { radius: 24 }),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "grid", icons: "square" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const aurora: Look = {
  id: "aurora",
  name: "Aurora",
  defaultAccent: "#0e7490",
  theme: (a) =>
    light(a, {
      title: face("poppins", 600, -2),
      phrase: face("dm-sans", 400),
      radius: 28,
      buttonShape: "pill",
      shadow: "soft",
      amount: 0.05,
      coverBackground: (accent) => ({
        kind: "gradient",
        color: mix("#ffffff", accent, 0.24),
        colorTo: mix("#ffffff", accent, 0.05),
        angle: 165,
      }),
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    k.shape("ellipse", mix("#ffffff", accent, 0.42), -90, -70, 300, 300, {
      fillTo: mix("#ffffff", accent, 0.12),
      angle: 200,
      opacity: 70,
    });
    k.shape(
      "ellipse",
      mix("#ffffff", mix(accent, "#f5c26b", 0.4), 0.45),
      210,
      c ? -40 : 30,
      240,
      240,
      { fillTo: mix("#ffffff", accent, 0.1), angle: 140, opacity: 60 },
    );
    const markSize = c ? 64 : 84;
    const markY = c ? 32 : 64;
    k.shape(
      "ellipse",
      "#ffffff",
      195 - markSize / 2 - 6,
      markY - 6,
      markSize + 12,
      markSize + 12,
      { opacity: 50 },
      2,
    );
    k.mark(195 - markSize / 2, markY, markSize, {
      fill: "#ffffff",
      ink: accent,
    });
    const t = k.measureTitle(c ? [38, 34, 30] : [44, 38, 32], 330);
    const titleY = markY + markSize + (c ? 20 : 28);
    k.title(t, 195, titleY, "center");
    const phraseY = titleY + t.h + 10;
    k.phrase(16, 45, phraseY, 300, "center");
    return phraseY + k.measurePhrase(16, 300) + 40;
  },
  avatarDecor: (k) => {
    const accent = k.theme.style.palette.accent;
    k.shape("ellipse", mix("#ffffff", accent, 0.4), -60, -80, 260, 260, {
      fillTo: mix("#ffffff", accent, 0.1),
      angle: 200,
      opacity: 70,
    });
    k.shape(
      "ellipse",
      mix("#ffffff", mix(accent, "#f5c26b", 0.4), 0.45),
      220,
      -20,
      220,
      220,
      { fillTo: mix("#ffffff", accent, 0.08), angle: 140, opacity: 60 },
    );
  },
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const ventana: Look = {
  id: "ventana",
  name: "Ventana",
  defaultAccent: "#9f1239",
  theme: (a) =>
    light(a, {
      title: face("playfair", 700, -1),
      phrase: face("dm-sans", 400),
      radius: 20,
      buttonShape: "pill",
      shadow: "soft",
      amount: 0.05,
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const onAccent = inkOn(accent);
    const top = c ? 20 : 32;
    const markY = top + 64;
    const t = k.measureTitle(c ? [34, 30, 26] : [40, 34, 30], 236);
    const withMark = !c || k.hasLogo;
    const titleY = withMark ? markY + 64 + 20 : top + 72;
    const phraseY = titleY + t.h + 10;
    const bottom = phraseY + k.measurePhrase(15, 220) + 36;
    k.shape("arch", accent, 55, top, 280, bottom - top);
    if (withMark) k.mark(163, markY, 64, { fill: "#ffffff", ink: accent });
    k.title(t, 195, titleY, "center", 11, onAccent);
    k.phrase(15, 85, phraseY, 220, "center", mix(onAccent, accent, 0.18));
    return bottom + 24;
  },
  avatarDecor: (k) => k.shape("arch", k.theme.tint, 115, 16, 160, 200),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const retro: Look = {
  id: "retro",
  name: "Retro",
  defaultAccent: "#e2611b",
  theme: (a) =>
    light(a, {
      title: face("poppins", 700, -3),
      phrase: face("dm-sans", 400),
      radius: 24,
      buttonShape: "pill",
      shadow: "soft",
      base: "#fbf4e8",
      amount: 0.05,
      ink: "#1f160d",
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const sun = c ? 88 : 132;
    const sunX = 366 - sun;
    const sunY = c ? 20 : 32;
    k.shape("ellipse", accent, sunX, sunY, sun, sun);
    if (k.hasLogo) {
      const markSize = c ? 64 : 80;
      k.mark(24, sunY + (sun - markSize) / 2, markSize, {
        fill: "#ffffff",
        ink: accent,
      });
    }
    // A sunset: bands of the page's color cut across the sun's lower half.
    for (const index of [0, 1, 2])
      k.shape(
        "rect",
        "background",
        sunX - 4,
        Math.round(sunY + sun * (0.56 + index * 0.14)),
        sun + 8,
        8 + index * 3,
        {},
        1,
      );
    const t = k.measureTitle(c ? [42, 36, 32] : [48, 42, 36], 342, 10);
    const titleY = sunY + sun + (c ? 20 : 28);
    k.title(t, 24, titleY, "start", 10);
    const phraseY = titleY + t.h + 14;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 32;
  },
  avatarDecor: (k) => {
    const accent = k.theme.style.palette.accent;
    for (const [index, amount] of [0.3, 0.55, 0.78].entries())
      k.shape(
        "pill",
        mix(accent, "#ffffff", amount),
        -40,
        60 + index * 30,
        470,
        18,
        {},
        0,
        -6,
      );
  },
  content: {
    card: true,
    menuSections: "pill",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const diagonal: Look = {
  id: "diagonal",
  name: "Diagonal",
  defaultAccent: "#dc2626",
  theme: (a) =>
    light(a, {
      title: face("oswald", 600),
      phrase: face("montserrat", 400),
      radius: 8,
      buttonShape: "square",
      shadow: "soft",
      amount: 0.03,
      ink: "#141414",
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const bandY = c ? 24 : 56;
    k.shape("rect", accent, -40, bandY, 470, c ? 84 : 116, {}, 0, -7);
    k.shape(
      "rect",
      k.theme.tint,
      -40,
      bandY + (c ? 84 : 112),
      470,
      28,
      {},
      0,
      -7,
    );
    if (!c || k.hasLogo)
      k.mark(24, bandY - 16, c ? 64 : 72, { fill: "#ffffff", ink: accent });
    const t = k.measureTitle(c ? [48, 42, 36] : [58, 50, 42], 342, 10);
    const titleY = bandY + (c ? 132 : 180);
    k.title(t, 24, titleY, "start", 10);
    const phraseY = titleY + t.h + 14;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 32;
  },
  avatarDecor: (k) => {
    k.shape("rect", k.theme.style.palette.accent, -40, 50, 470, 70, {}, 0, -7);
  },
  content: {
    card: false,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "plain" },
    document: "shadow",
    form: "boxed",
    closing: "band",
    button: "neutral",
  },
};

const esquina: Look = {
  id: "esquina",
  name: "Esquina",
  defaultAccent: "#1f3a68",
  theme: (a) =>
    light(a, {
      title: face("manrope", 700, -3),
      phrase: face("dm-sans", 400),
      radius: 12,
      buttonShape: "rounded",
      shadow: "soft",
      base: "#f5f7fa",
      amount: 0.02,
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const size = c ? 300 : 368;
    k.shape(
      "ellipse",
      "background",
      390 - size * 0.62 - 26,
      -size / 2 - 26,
      size + 52,
      size + 52,
      { stroke: k.theme.tint, strokeWidth: 1 },
    );
    k.shape("ellipse", accent, 390 - size * 0.62, -size / 2, size, size, {}, 1);
    if (!c || k.hasLogo) k.mark(286, 32, 72, { fill: "#ffffff", ink: accent });
    const t = k.measureTitle(c ? [38, 34, 30] : [44, 38, 32], 300);
    const titleY = c ? 172 : 212;
    k.title(t, 24, titleY, "start");
    const phraseY = titleY + t.h + 10;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 28;
  },
  avatarDecor: (k) => k.shape("ellipse", k.theme.tint, 250, -120, 240, 240),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "square" },
    document: "shadow",
    form: "boxed",
    closing: "card",
    button: "brand",
  },
};

const minimal: Look = {
  id: "minimal",
  name: "Minimal",
  defaultAccent: "#18181b",
  theme: (a) =>
    light(a, {
      title: face("geist", 600, -3),
      phrase: face("geist", 400),
      radius: 10,
      buttonShape: "rounded",
      shadow: "none",
      base: "#fafaf9",
      amount: 0.015,
      ink: "#111111",
    }),
  cover: (k) => {
    const c = k.compact;
    const top = c ? 32 : 48;
    if (k.hasLogo)
      k.mark(24, top, 48, {
        fill: "#ffffff",
        ink: accentOf(k),
        ring: mix(k.theme.style.palette.text, "#ffffff", 0.85),
      });
    else k.shape("rect", "accent", 24, top, 12, 12, { radius: 3 });
    const t = k.measureTitle(c ? [40, 36, 32] : [48, 42, 36], 342);
    const titleY = k.hasLogo ? top + 48 + 20 : c ? 60 : 84;
    k.title(t, 24, titleY, "start");
    const phraseY = titleY + t.h + 14;
    k.phrase(17, 24, phraseY, 320, "start");
    const ruleY = phraseY + k.measurePhrase(17, 320) + 32;
    k.divider(24, ruleY, 342);
    return ruleY + 8;
  },
  avatarDecor: (k) => k.shape("rect", "accent", 189, 12, 12, 12, { radius: 3 }),
  content: {
    card: false,
    menuSections: "line",
    menuLayout: "list",
    price: "plain",
    facts: { layout: "list", icons: "plain" },
    document: "border",
    form: "boxed",
    closing: "plain",
    button: "brand",
  },
};

const circulos: Look = {
  id: "circulos",
  name: "Círculos",
  defaultAccent: "#e4572e",
  theme: (a) =>
    light(a, {
      title: face("poppins", 600, -2),
      phrase: face("dm-sans", 400),
      radius: 24,
      buttonShape: "pill",
      shadow: "soft",
      amount: 0.04,
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const size = c ? 120 : 168;
    const top = c ? 24 : 32;
    k.shape("ellipse", k.theme.tint, 195 - size + 24, top, size, size);
    k.shape("ellipse", accent, 195 - 24, top, size, size, {}, 1);
    k.mark(
      195 - 24 + size / 2 - size * 0.25,
      top + size / 2 - size * 0.25,
      size * 0.5,
      { fill: accent, ink: inkOn(accent) },
    );
    const t = k.measureTitle(c ? [38, 34, 30] : [44, 38, 32], 330);
    const titleY = top + size + 24;
    k.title(t, 195, titleY, "center");
    const phraseY = titleY + t.h + 10;
    k.phrase(16, 45, phraseY, 300, "center");
    return phraseY + k.measurePhrase(16, 300) + 28;
  },
  avatarDecor: (k) => {
    k.shape("ellipse", k.theme.tint, 60, 40, 120, 120);
    k.shape(
      "ellipse",
      mix(k.theme.style.palette.accent, "#ffffff", 0.55),
      214,
      30,
      110,
      110,
    );
  },
  content: {
    card: true,
    menuSections: "pill",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const patron: Look = {
  id: "patron",
  name: "Patrón",
  defaultAccent: "#0f766e",
  theme: (a) =>
    light(a, {
      title: face("outfit", 700, -2),
      phrase: face("manrope", 400),
      radius: 16,
      buttonShape: "rounded",
      shadow: "soft",
      amount: 0.03,
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const tint = k.theme.tint;
    const deep = k.theme.deep;
    const kinds = [
      "diamond",
      "ellipse",
      "rect",
      "triangle",
      "ellipse",
      "diamond",
    ] as const;
    const fills = [accent, tint, deep, tint, accent, tint];
    const rows = c && !k.hasLogo ? 1 : 2;
    if (k.hasLogo) k.mark(24, 28, 110, { fill: "#ffffff", ink: accent });
    for (let row = 0; row < rows; row++)
      kinds.forEach((kind, index) => {
        if (k.hasLogo && index < 2) return;
        const turn = (index + row * 3) % 6;
        k.shape(
          kinds[turn] ?? kind,
          fills[(turn + row) % 6] ?? accent,
          24 + index * 58,
          28 + row * 58,
          52,
          52,
          kinds[turn] === "rect" ? { radius: 12 } : {},
        );
      });
    const t = k.measureTitle(c ? [42, 36, 32] : [48, 42, 36], 342);
    const titleY = 28 + rows * 58 + (c ? 20 : 28);
    k.title(t, 24, titleY, "start");
    const phraseY = titleY + t.h + 10;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 28;
  },
  avatarDecor: (k) => {
    const accent = k.theme.style.palette.accent;
    const kinds = [
      "diamond",
      "ellipse",
      "triangle",
      "ellipse",
      "diamond",
      "ellipse",
    ] as const;
    for (const [index, kind] of kinds.entries())
      k.shape(
        kind,
        index % 2 ? k.theme.tint : accent,
        index < 3 ? 24 + index * 34 : 262 + (index - 3) * 34,
        84,
        28,
        28,
      );
  },
  content: {
    card: true,
    menuSections: "pill",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "shadow",
    form: "card",
    closing: "card",
    button: "brand",
  },
};

const firma: Look = {
  id: "firma",
  name: "Firma",
  defaultAccent: "#7a4a24",
  theme: (a) =>
    light(a, {
      title: face("lora", 700, -1),
      phrase: face("caveat", 600),
      body: "dm-sans",
      radius: 12,
      buttonShape: "rounded",
      shadow: "soft",
      base: "#f7f3ec",
      amount: 0.03,
      ink: "#2a2119",
    }),
  cover: (k) => {
    const c = k.compact;
    const accent = k.theme.style.palette.accent;
    const top = 28;
    const markY = top + 32;
    const t = k.measureTitle(c ? [36, 32, 28] : [42, 36, 32], 290);
    const withMark = !c || k.hasLogo;
    const titleY = withMark ? markY + 64 + 20 : top + 40;
    const phraseY = titleY + t.h + 6;
    const bottom = phraseY + k.measurePhrase(26, 290) + 32;
    k.shape("rect", "surface", 24, top, 342, bottom - top, {
      radius: 6,
      stroke: mix(k.theme.style.palette.text, "#ffffff", 0.82),
      strokeWidth: 1,
    });
    k.shape(
      "rect",
      "surface",
      32,
      top + 8,
      326,
      bottom - top - 16,
      { radius: 3, stroke: k.theme.tint, strokeWidth: 1 },
      1,
    );
    if (withMark) k.mark(163, markY, 64, { fill: k.theme.tint, ink: accent });
    k.title(t, 195, titleY, "center");
    k.phrase(26, 50, phraseY, 290, "center", accent);
    return bottom + 20;
  },
  avatarDecor: (k, h) =>
    k.shape("rect", "surface", 24, 16, 342, h - 28, {
      radius: 6,
      stroke: k.theme.tint,
      strokeWidth: 1,
    }),
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "circle" },
    document: "border",
    form: "boxed",
    closing: "card",
    button: "brand",
  },
};

const profundo: Look = {
  id: "profundo",
  name: "Profundo",
  defaultAccent: "#1e3a8a",
  theme: (a) =>
    dark(a, {
      title: face("montserrat", 700, -3),
      phrase: face("montserrat", 400),
      radius: 18,
      buttonShape: "pill",
      shadow: "none",
      base: "#0a0a0a",
      amount: 0.38,
      surfaceBase: "#141414",
      surfaceAmount: 0.42,
    }),
  cover: (k) => {
    const c = k.compact;
    const line = mix(
      k.theme.style.palette.text,
      k.theme.style.palette.background,
      0.8,
    );
    k.shape("ellipse", "background", 150, c ? -110 : -60, 300, 300, {
      stroke: line,
      strokeWidth: 1,
    });
    k.shape(
      "ellipse",
      "background",
      196,
      c ? -64 : -14,
      208,
      208,
      { stroke: line, strokeWidth: 1 },
      1,
    );
    const accent = k.theme.style.palette.accent;
    const withMark = !c || k.hasLogo;
    if (withMark) k.mark(24, 40, 64, { fill: accent, ink: inkOn(accent) });
    const t = k.measureTitle(c ? [42, 36, 32] : [48, 42, 36], 330, 10);
    const titleY = c ? (withMark ? 124 : 92) : 196;
    k.title(t, 24, titleY, "start", 10);
    const phraseY = titleY + t.h + 14;
    k.phrase(17, 24, phraseY, 320, "start");
    return phraseY + k.measurePhrase(17, 320) + 32;
  },
  avatarDecor: (k) => {
    const line = mix(
      k.theme.style.palette.text,
      k.theme.style.palette.background,
      0.8,
    );
    k.shape("ellipse", "background", 117, 18, 156, 156, {
      stroke: line,
      strokeWidth: 1,
    });
  },
  content: {
    card: true,
    menuSections: "line",
    menuLayout: "list",
    price: "accent",
    facts: { layout: "list", icons: "plain" },
    document: "border",
    form: "boxed",
    closing: "card",
    button: "brand",
  },
};

export const looks: Look[] = [
  halo,
  marco,
  bloque,
  revista,
  burbuja,
  dosTonos,
  letraGrande,
  sello,
  ticket,
  cuadros,
  aurora,
  ventana,
  retro,
  diagonal,
  esquina,
  minimal,
  circulos,
  patron,
  firma,
  profundo,
];

export type LookId = (typeof looks)[number]["id"];

export function lookById(id: string): Look {
  return looks.find((look) => look.id === id) ?? halo;
}
