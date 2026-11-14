import type {
  DesignAmbient,
  DesignBlock,
  DesignFont,
  DesignShape,
  DesignStyle,
  FeatureIcon,
  ImageMask,
  SectionLayout,
} from "@kardo/contracts";
import type { IconName } from "../../components/Icon.js";
import type { RailSection } from "./StudioContext.js";

/** Spanish names for the rail and every closed choice of the design model. */

export const railSections: Record<
  RailSection,
  { label: string; title: string; description: string; icon: IconName }
> = {
  content: {
    label: "Contenido",
    title: "Contenido",
    description:
      "El texto y las fotos de tu página. Se guarda junto con el diseño.",
    icon: "text-block",
  },
  templates: {
    label: "Plantillas",
    title: "Plantillas",
    description:
      "Empieza desde un diseño de Kardo para tu giro. Tu contenido se conserva.",
    icon: "template",
  },
  add: {
    label: "Agregar",
    title: "Agregar bloque",
    description:
      "Arrastra un bloque a la vista previa o tócalo para ponerlo después de lo que tienes seleccionado.",
    icon: "plus",
  },
  layers: {
    label: "Capas",
    title: "Capas",
    description:
      "Secciones, columnas y bloques en orden. Arrastra para reordenar.",
    icon: "layers",
  },
  style: {
    label: "Estilo",
    title: "Estilo de la página",
    description: "Colores, tipografías, botones y márgenes de toda la página.",
    icon: "palette",
  },
  background: {
    label: "Fondo",
    title: "Fondo de la página",
    description:
      "Un color, un degradado o una foto con velo, y el fondo difuminado.",
    icon: "wallpaper",
  },
  ai: {
    label: "IA",
    title: "Diseñar con IA",
    description: "Describe lo que quieres y la IA de Kardo arma un diseño.",
    icon: "sparkles",
  },
};

export const fontLabels: Record<DesignFont, string> = {
  system: "Sistema",
  serif: "Serif clásica",
  rounded: "Redondeada",
  mono: "Monoespaciada",
  geist: "Geist",
  "dm-sans": "DM Sans",
  poppins: "Poppins",
  playfair: "Playfair Display",
  lora: "Lora",
  "space-grotesk": "Space Grotesk",
  cormorant: "Cormorant Garamond",
  "dm-serif": "DM Serif Display",
  outfit: "Outfit",
  manrope: "Manrope",
  montserrat: "Montserrat",
  bricolage: "Bricolage Grotesque",
  bebas: "Bebas Neue",
  oswald: "Oswald",
  caveat: "Caveat",
};

/** CSS stacks for the samples (system fonts need no download). */
export const fontSampleStacks: Record<DesignFont, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  geist: '"Geist", system-ui, sans-serif',
  "dm-sans": '"DM Sans", system-ui, sans-serif',
  poppins: "system-ui, sans-serif",
  playfair: "Georgia, serif",
  lora: "Georgia, serif",
  "space-grotesk": "system-ui, sans-serif",
  cormorant: "Georgia, serif",
  "dm-serif": "Georgia, serif",
  outfit: "system-ui, sans-serif",
  manrope: "system-ui, sans-serif",
  montserrat: "system-ui, sans-serif",
  bricolage: "system-ui, sans-serif",
  bebas: "Impact, sans-serif",
  oswald: "Impact, sans-serif",
  caveat: "cursive",
};

export const layoutLabels: Record<SectionLayout, string> = {
  "1": "Una columna",
  "1-1": "Dos columnas iguales",
  "1-2": "Angosta y ancha",
  "2-1": "Ancha y angosta",
  "1-1-1": "Tres columnas",
};

/** Relative widths, to draw the layout glyphs. */
export const layoutFractions: Record<SectionLayout, number[]> = {
  "1": [1],
  "1-1": [1, 1],
  "1-2": [1, 2],
  "2-1": [2, 1],
  "1-1-1": [1, 1, 1],
};

export const buttonStyleLabels: Record<DesignStyle["buttonStyle"], string> = {
  solid: "Sólido",
  soft: "Suave",
  outline: "Contorno",
};

export const buttonShapeLabels: Record<DesignStyle["buttonShape"], string> = {
  pill: "Píldora",
  rounded: "Redondeado",
  square: "Recto",
};

export const shadowLabels: Record<DesignStyle["shadow"], string> = {
  none: "Sin sombra",
  soft: "Suave",
  strong: "Marcada",
};

export const paletteLabels: Record<
  keyof DesignStyle["palette"],
  { label: string; hint: string }
> = {
  background: { label: "Fondo", hint: "Detrás de toda la página." },
  surface: { label: "Superficie", hint: "Tarjetas y botones secundarios." },
  text: { label: "Texto", hint: "Títulos y párrafos." },
  muted: { label: "Texto suave", hint: "Descripciones y detalles." },
  accent: { label: "Acento", hint: "Botones, íconos y enlaces." },
};

/** Palette colors a block can point at (they follow the page palette). */
export const colorTokens = [
  "text",
  "muted",
  "accent",
  "surface",
  "background",
] as const;
export type ColorToken = (typeof colorTokens)[number];

export function isColorToken(value: string | undefined): value is ColorToken {
  return (colorTokens as readonly string[]).includes(value ?? "");
}

export const colorTokenLabels: Record<ColorToken, string> = {
  text: "Texto",
  muted: "Suave",
  accent: "Acento",
  surface: "Superficie",
  background: "Fondo",
};

// ---------------------------------------------------------------------------
// Addendum 3: shapes, masks, and the new bound blocks' closed choices.
// ---------------------------------------------------------------------------

export const shapeLabels: Record<DesignShape, string> = {
  rect: "Rectángulo",
  ellipse: "Círculo",
  pill: "Píldora",
  triangle: "Triángulo",
  diamond: "Diamante",
  hexagon: "Hexágono",
  star: "Estrella",
  arch: "Arco",
  blob: "Mancha",
};

/** Same 9 shapes, plus "Sin recorte" for `imageMasks`'s `"none"`. */
export const imageMaskLabels: Record<ImageMask, string> = {
  none: "Sin recorte",
  circle: "Círculo",
  rounded: "Redondeada",
  arch: "Arco",
  blob: "Mancha",
  diamond: "Diamante",
  hexagon: "Hexágono",
  star: "Estrella",
};

export const menuLayoutLabels: Record<
  "list" | "cards" | "grid" | "compact",
  string
> = {
  list: "Lista",
  cards: "Tarjetas",
  grid: "Cuadrícula",
  compact: "Compacto",
};

export const menuPhotoLabels: Record<"none" | "small" | "large", string> = {
  none: "Sin fotos",
  small: "Chicas",
  large: "Grandes",
};

export const photoShapeLabels: Record<"rounded" | "circle" | "square", string> =
  {
    rounded: "Redondeada",
    circle: "Círculo",
    square: "Cuadrada",
  };

export const sectionStyleLabels: Record<
  "line" | "plain" | "pill" | "card",
  string
> = {
  line: "Línea",
  plain: "Simple",
  pill: "Píldora",
  card: "Tarjeta",
};

export const priceStyleLabels: Record<"plain" | "accent" | "pill", string> = {
  plain: "Simple",
  accent: "Con acento",
  pill: "Píldora",
};

export const catalogLayoutLabels: Record<"grid" | "list" | "cards", string> = {
  grid: "Cuadrícula",
  list: "Lista",
  cards: "Tarjetas",
};

export const leadFormLookLabels: Record<
  "boxed" | "card" | "underline",
  string
> = {
  boxed: "Con recuadro",
  card: "En tarjeta",
  underline: "Con línea",
};

export const documentPageStyleLabels: Record<
  "shadow" | "border" | "flat",
  string
> = {
  shadow: "Con sombra",
  border: "Con borde",
  flat: "Plano",
};

export const imageFrameLabels: Record<"none" | "card" | "shadow", string> = {
  none: "Sin marco",
  card: "Tarjeta",
  shadow: "Con sombra",
};

export const ambientKindLabels: Record<DesignAmbient["kind"], string> = {
  auto: "Automático",
  custom: "Mis colores",
  none: "Apagado",
};

// ---------------------------------------------------------------------------
// "Motor de 3 bloques" (2026-10-03): `features`, `gallery` and
// `featuredItems`'s own closed choices and icon names.
// ---------------------------------------------------------------------------

type FeaturesBlock = Extract<DesignBlock, { kind: "features" }>;
type GalleryBlock = Extract<DesignBlock, { kind: "gallery" }>;
type FeaturedItemsBlock = Extract<DesignBlock, { kind: "featuredItems" }>;

export const featureLayoutLabels: Record<FeaturesBlock["layout"], string> = {
  grid: "Cuadrícula",
  list: "Lista",
  row: "Franja",
  chips: "Píldoras",
};

export const featureIconStyleLabels: Record<
  NonNullable<FeaturesBlock["iconStyle"]>,
  string
> = {
  plain: "Sin fondo",
  circle: "Círculo",
  square: "Cuadro",
};

export const galleryLayoutLabels: Record<GalleryBlock["layout"], string> = {
  grid: "Cuadrícula",
  carousel: "Carrusel",
  mosaic: "Mosaico",
};

export const featuredItemsLayoutLabels: Record<
  FeaturedItemsBlock["layout"],
  string
> = {
  hero: "Grande",
  cards: "Tarjetas",
  carousel: "Carrusel",
};

/** Accessible, Spanish name of each of the 48 closed icons a `features`
 * block may use (the icon picker's radio labels and the trigger's own
 * label). Order follows `featureIcons` (@kardo/contracts). */
export const featureIconLabels: Record<FeatureIcon, string> = {
  clock: "Horario",
  "map-pin": "Ubicación",
  phone: "Teléfono",
  calendar: "Calendario",
  truck: "Entrega",
  bag: "Para llevar",
  card: "Tarjeta",
  cash: "Efectivo",
  wifi: "Wifi",
  car: "Estacionamiento",
  paw: "Mascotas",
  leaf: "Vegetariano",
  flame: "Picante",
  star: "Estrella",
  heart: "Favorito",
  gift: "Regalo",
  coffee: "Café",
  utensils: "Cubiertos",
  wine: "Vino",
  beer: "Cerveza",
  cake: "Pastel",
  "ice-cream": "Helado",
  bed: "Cama",
  pool: "Alberca",
  scissors: "Tijeras",
  flower: "Flor",
  book: "Libro",
  graduation: "Graduación",
  stethoscope: "Consulta",
  shield: "Seguridad",
  check: "Listo",
  award: "Premio",
  users: "Personas",
  home: "Casa",
  key: "Llave",
  music: "Música",
  baby: "Bebés",
  accessible: "Accesible",
  globe: "Idiomas",
  chat: "Chat",
  mail: "Correo",
  camera: "Foto",
  tag: "Precio",
  percent: "Descuento",
  package: "Paquete",
  sun: "Sol",
  snowflake: "Aire acondicionado",
  dumbbell: "Gimnasio",
};
