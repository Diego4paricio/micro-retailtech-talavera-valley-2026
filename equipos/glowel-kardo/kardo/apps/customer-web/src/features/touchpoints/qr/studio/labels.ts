import type {
  QrErrorCorrectionLevel,
  QrEyeBallShape,
  QrEyeFrameShape,
  QrFrameFont,
  QrFrameIcon,
  QrFrameStyle,
  QrLogoPlate,
  QrModuleShape,
} from "@kardo/contracts";
import type { IconName } from "../../../../components/Icon.js";
import type { QrWarningCode } from "../engine/index.js";

/** Spanish names for every closed choice of the design model. */
export const moduleShapeLabels: Record<QrModuleShape, string> = {
  square: "Cuadrados",
  rounded: "Redondeados",
  dots: "Puntos",
  diamond: "Rombos",
  fluid: "Fluidos",
  classy: "Elegantes",
  vertical: "Barras verticales",
  horizontal: "Barras horizontales",
};

export const eyeFrameShapeLabels: Record<QrEyeFrameShape, string> = {
  square: "Cuadrado",
  rounded: "Redondeado",
  "extra-rounded": "Muy redondeado",
  circle: "Círculo",
  leaf: "Hoja",
  cushion: "Almohadilla",
};

export const eyeBallShapeLabels: Record<QrEyeBallShape, string> = {
  square: "Cuadrado",
  rounded: "Redondeado",
  circle: "Círculo",
  leaf: "Hoja",
  cushion: "Almohadilla",
};

export const frameStyleLabels: Record<QrFrameStyle, string> = {
  none: "Sin marco",
  caption: "Texto al pie",
  "panel-bottom": "Panel inferior",
  "panel-top": "Panel superior",
  badge: "Insignia",
  bubble: "Globo",
  ticket: "Boleto",
  brackets: "Esquinas",
  phone: "Teléfono",
};

export const frameFontLabels: Record<QrFrameFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
};

export const frameIcons: Record<
  QrFrameIcon,
  { label: string; icon: IconName }
> = {
  none: { label: "Sin ícono", icon: "ban" },
  scan: { label: "Escanear", icon: "scan" },
  menu: { label: "Menú", icon: "utensils" },
  star: { label: "Estrella", icon: "star" },
  phone: { label: "Celular", icon: "phone" },
  wifi: { label: "Wi-Fi", icon: "wifi" },
  gift: { label: "Regalo", icon: "gift" },
  calendar: { label: "Calendario", icon: "calendar" },
  cart: { label: "Carrito", icon: "cart" },
  heart: { label: "Corazón", icon: "heart" },
  pointer: { label: "Puntero", icon: "pointer" },
  info: { label: "Información", icon: "info" },
};

export const logoPlateLabels: Record<QrLogoPlate, string> = {
  none: "Ninguna",
  square: "Cuadrada",
  rounded: "Suave",
  circle: "Círculo",
};

export const errorCorrectionInfo: Record<
  QrErrorCorrectionLevel,
  { label: string; recovers: string }
> = {
  L: { label: "Baja", recovers: "7 %" },
  M: { label: "Media", recovers: "15 %" },
  Q: { label: "Alta", recovers: "25 %" },
  H: { label: "Máxima", recovers: "30 %" },
};

// ---------------------------------------------------------------------------
// Panel sections, in the order the research recommends: from a finished
// starting point to fine detail.
// ---------------------------------------------------------------------------

export const studioSectionIds = [
  "templates",
  "modules",
  "eyes",
  "colors",
  "logo",
  "frame",
  "advanced",
] as const;
export type StudioSectionId = (typeof studioSectionIds)[number];

export const studioSections: Record<
  StudioSectionId,
  { label: string; title: string; description: string; icon: IconName }
> = {
  templates: {
    label: "Plantillas",
    title: "Plantillas",
    description:
      "Usa un diseño de la biblioteca de tu organización o copia una plantilla como punto de partida.",
    icon: "template",
  },
  modules: {
    label: "Módulos",
    title: "Forma de los módulos",
    description: "Los pequeños cuadros que guardan la dirección del código.",
    icon: "modules",
  },
  eyes: {
    label: "Ojos",
    title: "Ojos",
    description:
      "Los tres cuadros de las esquinas: le dicen a la cámara dónde está el código.",
    icon: "eye",
  },
  colors: {
    label: "Colores",
    title: "Colores",
    description:
      "Módulos oscuros sobre fondo claro: así lo leen todas las cámaras.",
    icon: "palette",
  },
  logo: {
    label: "Logo",
    title: "Logo",
    description:
      "Kardo despeja el centro sin tocar los patrones que el lector necesita.",
    icon: "asset",
  },
  frame: {
    label: "Marco",
    title: "Marco y texto",
    description:
      "Una llamada a la acción dice qué va a encontrar la persona al escanear.",
    icon: "frame",
  },
  advanced: {
    label: "Avanzado",
    title: "Avanzado",
    description:
      "Corrección de errores, versión y margen. Los valores automáticos funcionan para casi todo.",
    icon: "sliders",
  },
};

/** Where to fix each engine warning. */
export const warningSections: Record<QrWarningCode, StudioSectionId> = {
  "contrast-inverted": "colors",
  "contrast-low": "colors",
  "contrast-fair": "colors",
  "eye-contrast": "colors",
  "frame-text-contrast": "frame",
  "transparent-background": "colors",
  "logo-over-budget": "logo",
  "logo-version-bumped": "logo",
  "logo-missing": "logo",
  "dense-code": "advanced",
  "version-too-small": "advanced",
};

/**
 * Narrows a stored value to one of the model's closed choices (the schema
 * types some of them as plain strings); unknown values fall back to the
 * first option instead of breaking a picker.
 */
export function asChoice<T extends string>(
  options: readonly T[],
  value: string,
): T {
  return (options as readonly string[]).includes(value)
    ? (value as T)
    : (options[0] as T);
}
