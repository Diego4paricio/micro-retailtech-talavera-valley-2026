import {
  type QrDesign,
  type QrEyeColors,
  type QrLogo,
  type QrPaint,
  qrErrorCorrectionLevels,
  qrEyeBallShapes,
  qrEyeFrameShapes,
  qrFrameFonts,
  qrFrameIcons,
  qrFrameStyles,
  qrFrameTextMaxLength,
  qrLogoPaddingRange,
  qrLogoPlates,
  qrLogoSizeRange,
  qrModuleShapes,
  qrQuietZoneRange,
  qrVersionRange,
} from "@kardo/contracts";
import { contrastRatio, relativeLuminance } from "../../../lib/color.js";
import { paintColorStops, paintRepresentativeColor } from "./engine/paint.js";
import type { QrWarning, Scene } from "./engine/types.js";

/**
 * Estudio QR design model helpers: the professional default, tolerant
 * normalization (never throws — every bad field falls back to the default),
 * the legacy (schema v1, `localStorage`) migration, the starter gallery, and
 * the shared color-contrast math used both here and by the render engine.
 */

// --- Default design ----------------------------------------------------------

export const defaultQrDesign: QrDesign = {
  schema: 2,
  errorCorrection: "M",
  minVersion: null,
  quietZone: 4,
  modules: {
    shape: "rounded",
    fill: { kind: "solid", color: "#16232e" },
  },
  eyes: {
    frameShape: "rounded",
    ballShape: "rounded",
    topLeft: { frame: null, ball: null },
    topRight: { frame: null, ball: null },
    bottomLeft: { frame: null, ball: null },
  },
  background: { color: "#ffffff", transparent: false },
  logo: null,
  frame: {
    style: "panel-bottom",
    color: "#16232e",
    textColor: "#ffffff",
    text: "Escanea aquí",
    font: "sans",
    uppercase: false,
    icon: "none",
  },
};

// --- Normalization ------------------------------------------------------------

const hexPattern = /^#[0-9a-f]{6}$/i;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && hexPattern.test(value);
}

function pickHex(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

function pickHexOrNull(value: unknown): string | null {
  return isHexColor(value) ? value.toLowerCase() : null;
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function clampNumber(
  value: unknown,
  range: { min: number; max: number },
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, value))
    : fallback;
}

function clampInt(
  value: unknown,
  range: { min: number; max: number },
  fallback: number,
): number {
  return Math.round(clampNumber(value, range, fallback));
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Strips control characters and `<`/`>` (matches `QrFrameSchema.text`'s pattern) and caps length. */
function pickText(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== "string") return fallback;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: sanitizing untrusted input on purpose.
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, maxLength);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePaint(value: unknown, fallback: QrPaint): QrPaint {
  const record = asRecord(value);
  if (record.kind === "linear") {
    return {
      kind: "linear",
      from: pickHex(record.from, "#16232e"),
      to: pickHex(record.to, "#0a6c78"),
      angle: clampInt(record.angle, { min: 0, max: 359 }, 90),
    };
  }
  if (record.kind === "radial") {
    return {
      kind: "radial",
      from: pickHex(record.from, "#16232e"),
      to: pickHex(record.to, "#0a6c78"),
    };
  }
  if (record.kind === "solid") {
    return {
      kind: "solid",
      color: pickHex(
        record.color,
        fallback.kind === "solid" ? fallback.color : "#16232e",
      ),
    };
  }
  return fallback;
}

function normalizeEyeColors(value: unknown): QrEyeColors {
  const record = asRecord(value);
  return {
    frame: pickHexOrNull(record.frame),
    ball: pickHexOrNull(record.ball),
  };
}

function normalizeLogo(value: unknown): QrLogo | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const size = clampNumber(record.size, qrLogoSizeRange, 0.18);
  const padding = clampNumber(record.padding, qrLogoPaddingRange, 1);
  const plate = pickEnum(record.plate, qrLogoPlates, "rounded");
  const plateColor = pickHexOrNull(record.plateColor);
  if (
    record.source === "asset" &&
    typeof record.assetId === "string" &&
    record.assetId.length > 0
  ) {
    return {
      source: "asset",
      assetId: record.assetId,
      size,
      plate,
      padding,
      plateColor,
    };
  }
  if (record.source === "brand") {
    return { source: "brand", size, plate, padding, plateColor };
  }
  return null;
}

function normalizeMinVersion(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clampInt(value, qrVersionRange, qrVersionRange.min);
}

/** Validates every field with a fallback to `defaultQrDesign`; never throws. */
export function normalizeQrDesign(value: unknown): QrDesign {
  const root = asRecord(value);
  const modulesRaw = asRecord(root.modules);
  const eyesRaw = asRecord(root.eyes);
  const backgroundRaw = asRecord(root.background);
  const frameRaw = asRecord(root.frame);

  return {
    schema: 2,
    errorCorrection: pickEnum(
      root.errorCorrection,
      qrErrorCorrectionLevels,
      defaultQrDesign.errorCorrection,
    ),
    minVersion: normalizeMinVersion(root.minVersion),
    quietZone: clampInt(
      root.quietZone,
      qrQuietZoneRange,
      defaultQrDesign.quietZone,
    ),
    modules: {
      shape: pickEnum(
        modulesRaw.shape,
        qrModuleShapes,
        defaultQrDesign.modules.shape,
      ),
      fill: normalizePaint(modulesRaw.fill, defaultQrDesign.modules.fill),
    },
    eyes: {
      frameShape: pickEnum(
        eyesRaw.frameShape,
        qrEyeFrameShapes,
        defaultQrDesign.eyes.frameShape,
      ),
      ballShape: pickEnum(
        eyesRaw.ballShape,
        qrEyeBallShapes,
        defaultQrDesign.eyes.ballShape,
      ),
      topLeft: normalizeEyeColors(eyesRaw.topLeft),
      topRight: normalizeEyeColors(eyesRaw.topRight),
      bottomLeft: normalizeEyeColors(eyesRaw.bottomLeft),
    },
    background: {
      color: pickHex(backgroundRaw.color, defaultQrDesign.background.color),
      transparent: pickBoolean(
        backgroundRaw.transparent,
        defaultQrDesign.background.transparent,
      ),
    },
    logo: normalizeLogo(root.logo),
    frame: {
      style: pickEnum(
        frameRaw.style,
        qrFrameStyles,
        defaultQrDesign.frame.style,
      ),
      color: pickHex(frameRaw.color, defaultQrDesign.frame.color),
      textColor: pickHex(frameRaw.textColor, defaultQrDesign.frame.textColor),
      text: pickText(
        frameRaw.text,
        qrFrameTextMaxLength,
        defaultQrDesign.frame.text,
      ),
      font: pickEnum(frameRaw.font, qrFrameFonts, defaultQrDesign.frame.font),
      uppercase: pickBoolean(
        frameRaw.uppercase,
        defaultQrDesign.frame.uppercase,
      ),
      icon: pickEnum(frameRaw.icon, qrFrameIcons, defaultQrDesign.frame.icon),
    },
  };
}

// --- Legacy (schema v1) migration --------------------------------------------

/**
 * Migrates the old `kardo.qr-design.<id>` localStorage shape
 * (`{foreground, background, frame: "none"|"simple", label, logo, logoScale}`)
 * into a schema-2 `QrDesign`. The legacy logo was a raw data URL, which the
 * new model cannot store (logos are now library assets); it comes back
 * separately as `legacyLogo` so the caller can offer to re-upload it.
 * Returns `null` when `value` does not look like the legacy shape at all
 * (including when it is already schema 2).
 */
export function migrateLegacyQrDesign(
  value: unknown,
): { design: QrDesign; legacyLogo: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if ("schema" in record) return null;
  const looksLegacy =
    typeof record.foreground === "string" ||
    typeof record.background === "string" ||
    typeof record.frame === "string" ||
    typeof record.label === "string";
  if (!looksLegacy) return null;

  const foreground = pickHex(record.foreground, "#16232e");
  const background = pickHex(
    record.background,
    defaultQrDesign.background.color,
  );
  const isFramed = record.frame === "simple";
  const text = pickText(
    record.label,
    qrFrameTextMaxLength,
    isFramed ? "Escanea aquí" : "",
  );
  const legacyLogo =
    typeof record.logo === "string" &&
    record.logo.startsWith("data:image/png;base64,")
      ? record.logo
      : null;

  const design: QrDesign = {
    ...defaultQrDesign,
    modules: { shape: "square", fill: { kind: "solid", color: foreground } },
    eyes: {
      frameShape: "square",
      ballShape: "square",
      topLeft: { frame: null, ball: null },
      topRight: { frame: null, ball: null },
      bottomLeft: { frame: null, ball: null },
    },
    background: { color: background, transparent: false },
    logo: null,
    frame: {
      style: isFramed ? "panel-bottom" : "none",
      color: foreground,
      textColor: background,
      text,
      font: "sans",
      uppercase: false,
      icon: "none",
    },
  };
  return { design, legacyLogo };
}

// --- Gallery ------------------------------------------------------------------

export type QrGalleryCategory =
  | "Esenciales"
  | "Marca Kardo"
  | "Restaurantes y cafés"
  | "Elegantes"
  | "Vibrantes";

export type QrGalleryPreset = {
  id: string;
  name: string;
  description: string;
  category: QrGalleryCategory;
  design: QrDesign;
};

const noEyeAccent: QrDesign["eyes"]["topLeft"] = { frame: null, ball: null };

export const qrGallery: readonly QrGalleryPreset[] = [
  {
    id: "tinta-clasica",
    name: "Tinta clásica",
    description: "Máximo contraste, sobria y segura para cualquier impresión.",
    category: "Esenciales",
    design: {
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#16232e" } },
      eyes: {
        frameShape: "square",
        ballShape: "square",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "panel-bottom",
        color: "#16232e",
        textColor: "#ffffff",
        text: "Escanea aquí",
      },
    },
  },
  {
    id: "minimalista",
    name: "Minimalista",
    description:
      "Solo el código, sin marco ni texto, para tus propios diseños.",
    category: "Esenciales",
    design: {
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#000000" } },
      eyes: {
        frameShape: "square",
        ballShape: "square",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "none",
        color: "#000000",
        textColor: "#ffffff",
        text: "",
      },
    },
  },
  {
    id: "redondeado-papel",
    name: "Redondeado sobre papel",
    description:
      "Módulos suaves y un fondo cálido para impresiones en papel kraft o crema.",
    category: "Esenciales",
    design: {
      ...defaultQrDesign,
      modules: { shape: "rounded", fill: { kind: "solid", color: "#16232e" } },
      eyes: {
        frameShape: "rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#f7f5f0", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "caption",
        color: "#16232e",
        textColor: "#16232e",
        text: "Escanea aquí",
      },
    },
  },
  {
    id: "teal-de-marca",
    name: "Teal de marca",
    description:
      "El teal de Kardo como tinta principal, ideal para menús y catálogos.",
    category: "Marca Kardo",
    design: {
      ...defaultQrDesign,
      modules: { shape: "rounded", fill: { kind: "solid", color: "#0a6c78" } },
      eyes: {
        frameShape: "rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "panel-bottom",
        color: "#0a6c78",
        textColor: "#ffffff",
        text: "Ver menú",
        icon: "menu",
      },
    },
  },
  {
    id: "teal-profundo-niebla",
    name: "Teal profundo sobre niebla",
    description:
      "Un teal más oscuro sobre un fondo frío y suave, con marco insignia.",
    category: "Marca Kardo",
    design: {
      ...defaultQrDesign,
      modules: { shape: "dots", fill: { kind: "solid", color: "#064d56" } },
      eyes: {
        frameShape: "circle",
        ballShape: "circle",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#dceced", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "badge",
        color: "#064d56",
        textColor: "#ffffff",
        text: "Síguenos",
        icon: "pointer",
      },
    },
  },
  {
    id: "degradado-teal",
    name: "Degradado teal",
    description: "Un degradado de marca oscuro y perfectamente legible.",
    category: "Marca Kardo",
    design: {
      ...defaultQrDesign,
      modules: {
        shape: "rounded",
        fill: { kind: "linear", from: "#0a6c78", to: "#064d56", angle: 135 },
      },
      eyes: {
        frameShape: "rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "panel-bottom",
        color: "#0a6c78",
        textColor: "#ffffff",
        text: "Escanea aquí",
      },
    },
  },
  {
    id: "menu-clasico",
    name: "Menú clásico",
    description: "Elegante y editorial, pensado para menús de restaurante.",
    category: "Restaurantes y cafés",
    design: {
      ...defaultQrDesign,
      modules: { shape: "classy", fill: { kind: "solid", color: "#16232e" } },
      eyes: {
        frameShape: "leaf",
        ballShape: "leaf",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#fffdf8", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "panel-bottom",
        color: "#16232e",
        textColor: "#fffdf8",
        text: "Escanea para ver el menú",
        font: "serif",
        icon: "menu",
      },
    },
  },
  {
    id: "cafe-acogedor",
    name: "Café acogedor",
    description: "Un boleto cálido con línea punteada, ideal para cafeterías.",
    category: "Restaurantes y cafés",
    design: {
      ...defaultQrDesign,
      modules: { shape: "dots", fill: { kind: "solid", color: "#16232e" } },
      eyes: {
        frameShape: "circle",
        ballShape: "circle",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#f7f5f0", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "ticket",
        color: "#16232e",
        textColor: "#f7f5f0",
        text: "Escanea y pide tu café",
        font: "serif",
      },
    },
  },
  {
    id: "reserva-tu-mesa",
    name: "Reserva tu mesa",
    description: "Un globo cercano con llamada a la acción para reservas.",
    category: "Restaurantes y cafés",
    design: {
      ...defaultQrDesign,
      modules: { shape: "vertical", fill: { kind: "solid", color: "#0a6c78" } },
      eyes: {
        frameShape: "rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "bubble",
        color: "#0a6c78",
        textColor: "#ffffff",
        text: "Reserva tu mesa",
        icon: "calendar",
      },
    },
  },
  {
    id: "negro-editorial",
    name: "Negro editorial",
    description:
      "Tipografía serif y mayúsculas para un acabado impreso y refinado.",
    category: "Elegantes",
    design: {
      ...defaultQrDesign,
      modules: { shape: "square", fill: { kind: "solid", color: "#000000" } },
      eyes: {
        frameShape: "square",
        ballShape: "square",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#fffdf8", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "caption",
        color: "#000000",
        textColor: "#000000",
        text: "Escanea aquí",
        font: "serif",
        uppercase: true,
      },
    },
  },
  {
    id: "marco-perla",
    name: "Marco perla",
    description: "Un marco superior sutil sobre un fondo color perla.",
    category: "Elegantes",
    design: {
      ...defaultQrDesign,
      modules: { shape: "fluid", fill: { kind: "solid", color: "#16232e" } },
      eyes: {
        frameShape: "extra-rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#f7f5f0", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "panel-top",
        color: "#16232e",
        textColor: "#f7f5f0",
        text: "Conóceme",
        font: "serif",
      },
    },
  },
  {
    id: "aqua-sutil",
    name: "Aqua sutil",
    description:
      "Marco de esquinas en aqua, el acento de marca, sobre tinta oscura.",
    category: "Elegantes",
    design: {
      ...defaultQrDesign,
      modules: { shape: "diamond", fill: { kind: "solid", color: "#16232e" } },
      eyes: {
        frameShape: "circle",
        ballShape: "circle",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "brackets",
        color: "#4ec3ce",
        textColor: "#16232e",
        text: "Ver catálogo",
      },
    },
  },
  {
    id: "aqua-vivo",
    name: "Aqua vivo",
    description: "Una insignia en aqua vibrante para promociones y descuentos.",
    category: "Vibrantes",
    design: {
      ...defaultQrDesign,
      modules: { shape: "rounded", fill: { kind: "solid", color: "#0a6c78" } },
      eyes: {
        frameShape: "rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "badge",
        color: "#4ec3ce",
        textColor: "#16232e",
        text: "Escanea y obtén tu descuento",
        font: "sans",
        uppercase: true,
        icon: "gift",
      },
    },
  },
  {
    id: "degradado-oscuro-wifi",
    name: "Degradado oscuro Wi-Fi",
    description:
      "Un degradado de marca oscuro pensado para el Wi-Fi del local.",
    category: "Vibrantes",
    design: {
      ...defaultQrDesign,
      modules: {
        shape: "rounded",
        fill: { kind: "linear", from: "#16232e", to: "#0a6c78", angle: 45 },
      },
      eyes: {
        frameShape: "rounded",
        ballShape: "rounded",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      background: { color: "#fffdf8", transparent: false },
      frame: {
        ...defaultQrDesign.frame,
        style: "panel-bottom",
        color: "#16232e",
        textColor: "#fffdf8",
        text: "Conéctate al wifi",
        icon: "wifi",
      },
    },
  },
  {
    id: "radial-teal",
    name: "Radial teal",
    description: "Un degradado radial de marca con una silueta de teléfono.",
    category: "Vibrantes",
    design: {
      ...defaultQrDesign,
      modules: {
        shape: "dots",
        fill: { kind: "radial", from: "#0a6c78", to: "#064d56" },
      },
      eyes: {
        frameShape: "circle",
        ballShape: "circle",
        topLeft: noEyeAccent,
        topRight: noEyeAccent,
        bottomLeft: noEyeAccent,
      },
      frame: {
        ...defaultQrDesign.frame,
        style: "phone",
        color: "#064d56",
        textColor: "#ffffff",
        text: "Escanea aquí",
        icon: "scan",
      },
    },
  },
];

// --- Frame text, brand swatches, print sizes ---------------------------------

/** CTA suggestions in Spanish, curated by experience type (≤ 40 characters). */
export const qrFrameTextPresets: readonly string[] = [
  "Escanea aquí",
  "Escanea para ver el menú",
  "Escanea y pide tu café",
  "Escanea y déjanos tu reseña",
  "Escanea para conectarte al wifi",
  "Escanea para ver los servicios",
  "Escanea para pedir a tu habitación",
  "Escanea y descubre la colección",
  "Escanea y obtén tu descuento",
  "Escanea y síguenos",
  "Escanea y cuéntanos tu opinión",
  "Escanea para ver el programa",
  "Escanea para guardar mi contacto",
  "Escanea y acumula puntos",
  "Escanea para pagar la cuenta",
];

export type QrBrandSwatch = {
  name: string;
  color: string;
  kind: "ink" | "background";
};

/** Only colors dark enough for modules and light enough for backgrounds — kept separate. */
export const qrBrandSwatches: readonly QrBrandSwatch[] = [
  { name: "Tinta Kardo", color: "#16232e", kind: "ink" },
  { name: "Teal Kardo", color: "#0a6c78", kind: "ink" },
  { name: "Teal profundo", color: "#064d56", kind: "ink" },
  { name: "Negro", color: "#000000", kind: "ink" },
  { name: "Papel", color: "#f7f5f0", kind: "background" },
  { name: "Superficie", color: "#fffdf8", kind: "background" },
  { name: "Niebla", color: "#dceced", kind: "background" },
  { name: "Blanco", color: "#ffffff", kind: "background" },
];

export type QrPrintSize = {
  id: string;
  label: string;
  hint: string;
  cm: number;
};

export const qrPrintSizes: readonly QrPrintSize[] = [
  {
    id: "2cm",
    label: "2 × 2 cm",
    hint: "Etiqueta diminuta (empaques, joyería)",
    cm: 2,
  },
  { id: "3cm", label: "3 × 3 cm", hint: "Etiqueta pequeña", cm: 3 },
  { id: "4cm", label: "4 × 4 cm", hint: "Tarjeta de presentación", cm: 4 },
  { id: "5cm", label: "5 × 5 cm", hint: "Mesa o mostrador", cm: 5 },
  { id: "7cm", label: "7 × 7 cm", hint: "Volante o folleto", cm: 7 },
  { id: "10cm", label: "10 × 10 cm", hint: "Cartel o vitrina", cm: 10 },
  { id: "15cm", label: "15 × 15 cm", hint: "Póster o ventana", cm: 15 },
  { id: "20cm", label: "20 × 20 cm", hint: "Exhibidor o pared", cm: 20 },
];

export const qrDpiOptions = [150, 300, 600] as const;

/** Pixels needed to print `cm` centimeters at `dpi` (1 in = 2.54 cm). */
export function pixelsForPhysicalSize(cm: number, dpi: number): number {
  return Math.round((cm / 2.54) * dpi);
}

/** Millimeters per module when the whole scene (frame included) prints `widthCm` wide. */
export function moduleSizeMm(scene: Scene, widthCm: number): number {
  return (widthCm * 10) / scene.width;
}

// --- Contrast -------------------------------------------------------------

export { contrastRatio, relativeLuminance };

const eyeLabels: Record<"topLeft" | "topRight" | "bottomLeft", string> = {
  topLeft: "superior izquierdo",
  topRight: "superior derecho",
  bottomLeft: "inferior izquierdo",
};

/**
 * Color-related design warnings (contrast, transparency): reused by the
 * render engine, which adds its own version/logo-specific ones on top.
 */
export function assessDesign(design: QrDesign): QrWarning[] {
  const warnings: QrWarning[] = [];
  const background = design.background.color;

  const moduleColors = paintColorStops(design.modules.fill);
  let inverted = false;
  let worstRatio = Number.POSITIVE_INFINITY;
  for (const color of moduleColors) {
    if (relativeLuminance(color) >= relativeLuminance(background))
      inverted = true;
    worstRatio = Math.min(worstRatio, contrastRatio(color, background));
  }
  if (inverted) {
    warnings.push({
      code: "contrast-inverted",
      level: "error",
      message:
        "El color de los módulos debe ser más oscuro que el fondo: muchos lectores no decodifican códigos invertidos.",
    });
  } else if (worstRatio < 3) {
    warnings.push({
      code: "contrast-low",
      level: "error",
      message: `El contraste entre el código y el fondo es demasiado bajo (${worstRatio.toFixed(1)}:1) para leerse con fiabilidad.`,
    });
  } else if (worstRatio < 4.5) {
    warnings.push({
      code: "contrast-fair",
      level: "warning",
      message: `El contraste es apenas suficiente (${worstRatio.toFixed(1)}:1): con poca luz o impresión mate puede fallar.`,
    });
  }

  for (const key of ["topLeft", "topRight", "bottomLeft"] as const) {
    const colors = design.eyes[key];
    const parts: readonly ["marco" | "centro", string | null][] = [
      ["marco", colors.frame],
      ["centro", colors.ball],
    ];
    for (const [part, hex] of parts) {
      const color = hex ?? paintRepresentativeColor(design.modules.fill);
      const ratio = contrastRatio(color, background);
      if (ratio < 4.5) {
        warnings.push({
          code: "eye-contrast",
          level: "warning",
          message: `El ${part} del ojo ${eyeLabels[key]} tiene un contraste justo (${ratio.toFixed(1)}:1) contra el fondo.`,
        });
      }
    }
  }

  // Only card styles put the text on the frame colour; on the paper the
  // engine picks a readable ink by itself.
  const textOnCard = [
    "panel-bottom",
    "panel-top",
    "badge",
    "bubble",
    "ticket",
  ].includes(design.frame.style);
  const frameRatio = contrastRatio(design.frame.textColor, design.frame.color);
  if (textOnCard && design.frame.text.trim() && frameRatio < 3) {
    warnings.push({
      code: "frame-text-contrast",
      level: "warning",
      message: `El texto del marco tiene poco contraste (${frameRatio.toFixed(1)}:1) contra el color del marco.`,
    });
  }

  if (design.background.transparent) {
    warnings.push({
      code: "transparent-background",
      level: "info",
      message:
        "El fondo es transparente: el contraste se verificó contra el color de fondo definido. Confirma que la superficie donde imprimas sea igual de clara.",
    });
  }

  return warnings;
}

// --- Print tracking ------------------------------------------------------

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * SHA-256 (hex) of the design's canonical JSON: the same design always gives
 * the same fingerprint, whatever the key order. Stored with each export so
 * the studio can tell when a code printed earlier looks different from the
 * current design (it still scans: the encoded address never changes).
 */
export async function designFingerprint(design: QrDesign): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(design));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
