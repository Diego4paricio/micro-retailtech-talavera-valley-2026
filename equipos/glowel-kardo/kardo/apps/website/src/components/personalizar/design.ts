import type { PieceId } from "@/content/pieces";

/*
  The design a visitor makes in /personalizar/: one brand (name, logo,
  colors, type) shared by the four pieces, and the texts and layout of each
  piece. Nothing leaves the browser: the design lives in localStorage and,
  without the logo, in the link that goes in the WhatsApp message.
*/

export type FontId = "geist" | "lora" | "playfair" | "poppins" | "space";

export interface FontChoice {
  id: FontId;
  name: string;
  /** CSS variable set by src/app/fonts.ts. */
  variable: string;
  /** Files in public/media/personalizar/fonts, embedded in the download. */
  files: { weight: 400 | 600; file: string }[];
}

export const fonts: FontChoice[] = [
  {
    id: "geist",
    name: "Moderna",
    variable: "--font-geist",
    files: [
      { weight: 400, file: "geist.woff2" },
      { weight: 600, file: "geist.woff2" },
    ],
  },
  {
    id: "lora",
    name: "Clásica",
    variable: "--font-lora",
    files: [
      { weight: 400, file: "lora-400.woff2" },
      { weight: 600, file: "lora-600.woff2" },
    ],
  },
  {
    id: "playfair",
    name: "Elegante",
    variable: "--font-playfair",
    files: [
      { weight: 400, file: "playfair-400.woff2" },
      { weight: 600, file: "playfair-600.woff2" },
    ],
  },
  {
    id: "poppins",
    name: "Redonda",
    variable: "--font-poppins",
    files: [
      { weight: 400, file: "poppins-400.woff2" },
      { weight: 600, file: "poppins-600.woff2" },
    ],
  },
  {
    id: "space",
    name: "Geométrica",
    variable: "--font-space-grotesk",
    files: [
      { weight: 400, file: "space-400.woff2" },
      { weight: 600, file: "space-600.woff2" },
    ],
  },
];

/** The small texts (labels, the call to tap) always use DM Sans. */
export const uiFont = {
  variable: "--font-dm-sans",
  file: "dm-sans.woff2",
} as const;

export function fontById(id: FontId): FontChoice {
  return fonts.find((font) => font.id === id) ?? (fonts[0] as FontChoice);
}

export interface Palette {
  id: string;
  name: string;
  background: string;
  accent: string;
}

/** Starting points; any color can be picked after. */
export const palettes: Palette[] = [
  { id: "noche", name: "Noche", background: "#16232E", accent: "#4EC3CE" },
  { id: "bosque", name: "Bosque", background: "#1F3A2E", accent: "#9DD3A8" },
  { id: "marino", name: "Marino", background: "#1B2A4A", accent: "#F2C14E" },
  { id: "vino", name: "Vino", background: "#5A1E2C", accent: "#F0B8B8" },
  { id: "barro", name: "Barro", background: "#9C4A2C", accent: "#F6D7B0" },
  { id: "carbon", name: "Carbón", background: "#1C1C1C", accent: "#D9B26B" },
  { id: "crema", name: "Crema", background: "#F3EEE4", accent: "#0A6C78" },
  { id: "blanco", name: "Blanco", background: "#FFFFFF", accent: "#16232E" },
];

export type TextTone = "auto" | "light" | "dark";

export interface Brand {
  name: string;
  upper: boolean;
  font: FontId;
  background: string;
  accent: string;
  textTone: TextTone;
  /** A PNG data URL made by logo.ts (trimmed, at most 1200 px), or null. */
  logo: string | null;
  /** Width over height of the logo, to place it without measuring again. */
  logoRatio: number;
  /** 0.6 to 1.4. */
  logoScale: number;
  /** A light plate behind the logo, for dark logos on dark colors. */
  logoPlate: boolean;
}

export type StandLayout = "tiles" | "pill";
export type CardLayout = "left" | "center";
export type MagnetLayout = "split" | "full";
export type StickerLayout = "ring" | "logo";

export interface PieceTexts {
  stand: { layout: StandLayout; tagline: string; call: string };
  card: { layout: CardLayout; person: string; role: string; call: string };
  magnet: { layout: MagnetLayout; line: string; contact: string; call: string };
  sticker: { layout: StickerLayout; ring: string; call: string };
}

export interface Design {
  piece: PieceId;
  brand: Brand;
  texts: PieceTexts;
}

export const defaultDesign: Design = {
  piece: "stand",
  brand: {
    name: "Tu negocio",
    upper: false,
    font: "geist",
    background: "#16232E",
    accent: "#4EC3CE",
    textTone: "auto",
    logo: null,
    logoRatio: 1,
    logoScale: 1,
    logoPlate: false,
  },
  texts: {
    stand: {
      layout: "tiles",
      tagline: "Conéctate con nosotros",
      call: "Acerca tu celular o escanea",
    },
    card: {
      layout: "left",
      person: "Tu nombre",
      role: "Lo que haces",
      call: "Acerca tu celular o escanea",
    },
    magnet: {
      layout: "split",
      line: "Estamos para ayudarte",
      contact: "",
      call: "Acerca tu celular o escanea",
    },
    sticker: {
      layout: "ring",
      ring: "Mesa 12",
      call: "Acerca tu celular o escanea",
    },
  },
};

/** Longest text each field takes; the drawing also shrinks to fit. */
export const limits = {
  name: 40,
  tagline: 48,
  call: 48,
  person: 36,
  role: 40,
  line: 44,
  contact: 20,
  ring: 28,
} as const;

// Colors ------------------------------------------------------------------

const hexPattern = /^#[0-9a-f]{6}$/i;

export function isHex(value: string): boolean {
  return hexPattern.test(value);
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const value = isHex(hex) ? hex : "#000000";
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

export const ink = { dark: "#16232E", light: "#F7F5F0" } as const;

/** Text color on a background: the brand's choice, or the readable one. */
export function textOn(background: string, tone: TextTone = "auto"): string {
  if (tone === "light") return ink.light;
  if (tone === "dark") return ink.dark;
  return contrast(background, ink.dark) >= contrast(background, ink.light)
    ? ink.dark
    : ink.light;
}

/**
 * The light square behind the QR. It stays light so any phone reads the
 * code; on an almost white piece it turns white and gets a thin border.
 */
export function tileColors(background: string) {
  const nearWhite = luminance(background) > 0.82;
  return {
    fill: nearWhite ? "#FFFFFF" : "#F5F2EA",
    stroke: nearWhite ? "#16232E26" : "none",
    /** Modules of the QR and ring of the symbol. */
    ink: luminance(background) < 0.12 ? background : ink.dark,
  };
}

/**
 * The accent where it sits on the light tile. A pale accent would vanish
 * there, so the piece's own color takes its place (or the ink).
 */
export function accentOnTile(
  accent: string,
  background: string,
  tileInk: string,
): string {
  if (contrast(accent, "#F5F2EA") >= 1.5) return accent;
  return contrast(background, "#F5F2EA") >= 2.4 ? background : tileInk;
}

// Link that reopens a design (no logo) ---------------------------------------

type Packed = [
  PieceId,
  string,
  0 | 1,
  FontId,
  string,
  string,
  TextTone,
  number,
  0 | 1,
  [StandLayout, string, string],
  [CardLayout, string, string, string],
  [MagnetLayout, string, string, string],
  [StickerLayout, string, string],
];

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** A short code for the design, without the logo (it does not fit a link). */
export function encodeDesign(design: Design): string {
  const { brand, texts } = design;
  const packed: Packed = [
    design.piece,
    brand.name,
    brand.upper ? 1 : 0,
    brand.font,
    brand.background,
    brand.accent,
    brand.textTone,
    Math.round(brand.logoScale * 100),
    brand.logoPlate ? 1 : 0,
    [texts.stand.layout, texts.stand.tagline, texts.stand.call],
    [texts.card.layout, texts.card.person, texts.card.role, texts.card.call],
    [
      texts.magnet.layout,
      texts.magnet.line,
      texts.magnet.contact,
      texts.magnet.call,
    ],
    [texts.sticker.layout, texts.sticker.ring, texts.sticker.call],
  ];
  return toBase64Url(JSON.stringify(packed));
}

const pieceIds: PieceId[] = ["stand", "card", "magnet", "sticker"];

function text(value: unknown, max: number, fallback: string): string {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function oneOf<T extends string>(value: unknown, options: T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && isHex(value) ? value : fallback;
}

/** Reads a code from encodeDesign; anything odd falls back to the default. */
export function decodeDesign(code: string): Design | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length !== 13) return null;
  const d = defaultDesign;
  const [piece, name, upper, font, bg, accent, tone, scale, plate, s, c, m, k] =
    raw as unknown[];
  const arr = (value: unknown) => (Array.isArray(value) ? value : []);
  const [sLayout, sTagline, sCall] = arr(s);
  const [cLayout, cPerson, cRole, cCall] = arr(c);
  const [mLayout, mLine, mContact, mCall] = arr(m);
  const [kLayout, kRing, kCall] = arr(k);
  return {
    piece: oneOf(piece, pieceIds, d.piece),
    brand: {
      ...d.brand,
      name: text(name, limits.name, d.brand.name),
      upper: upper === 1,
      font: oneOf(
        font,
        fonts.map((f) => f.id),
        d.brand.font,
      ),
      background: color(bg, d.brand.background),
      accent: color(accent, d.brand.accent),
      textTone: oneOf<TextTone>(tone, ["auto", "light", "dark"], "auto"),
      logoScale:
        typeof scale === "number"
          ? Math.min(1.4, Math.max(0.6, scale / 100))
          : 1,
      logoPlate: plate === 1,
    },
    texts: {
      stand: {
        layout: oneOf<StandLayout>(sLayout, ["tiles", "pill"], "tiles"),
        tagline: text(sTagline, limits.tagline, d.texts.stand.tagline),
        call: text(sCall, limits.call, d.texts.stand.call),
      },
      card: {
        layout: oneOf<CardLayout>(cLayout, ["left", "center"], "left"),
        person: text(cPerson, limits.person, d.texts.card.person),
        role: text(cRole, limits.role, d.texts.card.role),
        call: text(cCall, limits.call, d.texts.card.call),
      },
      magnet: {
        layout: oneOf<MagnetLayout>(mLayout, ["split", "full"], "split"),
        line: text(mLine, limits.line, d.texts.magnet.line),
        contact: text(mContact, limits.contact, d.texts.magnet.contact),
        call: text(mCall, limits.call, d.texts.magnet.call),
      },
      sticker: {
        layout: oneOf<StickerLayout>(kLayout, ["ring", "logo"], "ring"),
        ring: text(kRing, limits.ring, d.texts.sticker.ring),
        call: text(kCall, limits.call, d.texts.sticker.call),
      },
    },
  };
}
