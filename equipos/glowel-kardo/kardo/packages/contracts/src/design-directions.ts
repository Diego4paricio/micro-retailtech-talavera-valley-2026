import { type Static, Type } from "@sinclair/typebox";
import { type DesignFont, designFonts } from "./design.js";

// ---------------------------------------------------------------------------
// Direcciones de arte (2026-10-03). The owner found the AI's pages generic:
// one safe palette, one font pair, the same stack of blocks for every
// business. A direction is a named, concrete visual system (palette recipe,
// font pair, shapes, cover and composition) the way a designer would brief
// a page, so the model starts from a point of view instead of an average.
//
// Used by:
// - the design guide (`design-guide.ts`), which lists every direction in
//   the cacheable system prompt of Kardo's AI;
// - the "3 ideas, then 1 design" flow: the AI proposes three
//   `DesignConcept`s, each anchored to a direction, and the chosen one
//   travels with the design request;
// - the panel, which draws each idea's card (palette, fonts, cover).
//
// Pure data, no customer text. House style: no em dash or en dash.
// ---------------------------------------------------------------------------

export const designDirectionIds = [
  "mercado",
  "nocturno",
  "editorial",
  "fresco",
  "boutique",
  "audaz",
  "sobrio",
  "artesanal",
  "lujo",
  "alegre",
] as const;
export type DesignDirectionId = (typeof designDirectionIds)[number];

/** How the first screen is built. */
export const designCoverKinds = ["photo", "split", "type"] as const;
export type DesignCoverKind = (typeof designCoverKinds)[number];

export type DesignDirection = {
  id: DesignDirectionId;
  /** Name shown to the customer. */
  name: string;
  /** Businesses it fits best, in plain words. */
  fits: string;
  /** Starting palette (the brand's own color replaces the accent when the
   * business has one and it reads well). */
  palette: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
  };
  fonts: { heading: DesignFont; body: DesignFont };
  radius: number;
  buttonShape: "pill" | "rounded" | "square";
  buttonStyle: "solid" | "soft" | "outline";
  shadow: "none" | "soft" | "strong";
  cover: DesignCoverKind;
  /** The direction in the guide's words: palette, type, shapes, cover,
   * sections and what to avoid. */
  brief: string;
};

export const designDirections: Record<DesignDirectionId, DesignDirection> = {
  mercado: {
    id: "mercado",
    name: "Mercado",
    fits: "fondas, taquerías, cocina casera, panaderías, mercados",
    palette: {
      background: "#fffdf9",
      surface: "#ffffff",
      text: "#231a12",
      muted: "#665446",
      accent: "#b42318",
    },
    fonts: { heading: "bricolage", body: "dm-sans" },
    radius: 16,
    buttonShape: "pill",
    buttonStyle: "solid",
    shadow: "soft",
    cover: "photo",
    brief:
      "Cálido y con apetito. Fondo blanco cálido (o un tinte muy claro del acento), texto café muy oscuro, acento de la marca o del platillo estrella (rojo chile, verde nopal, amarillo maíz, azul talavera), no un terracota de cajón. Títulos en Bricolage Grotesque 700, cuerpo en DM Sans. Portada con la foto del platillo o del lugar a sangre, overlay de 45 a 55 y el nombre grande abajo a la izquierda en blanco. Debajo, una franja de datos clave (horario, entrega, pago); luego los destacados y el menú en tarjetas con fotos grandes. Cierre con una tarjeta para pedir por WhatsApp. Evita papel picado, sombreros, calaveras y otros clichés.",
  },
  nocturno: {
    id: "nocturno",
    name: "Nocturno",
    fits: "bares, cantinas, mezcalerías, coctelerías, cenas",
    palette: {
      background: "#15110e",
      surface: "#211b17",
      text: "#f4ede4",
      muted: "#b9ab9b",
      accent: "#d4a853",
    },
    fonts: { heading: "cormorant", body: "manrope" },
    radius: 4,
    buttonShape: "square",
    buttonStyle: "outline",
    shadow: "none",
    cover: "photo",
    brief:
      "De noche y con calma. Fondo casi negro cálido, superficie un poco más clara, texto marfil, acento dorado o el de la marca si contrasta en oscuro. Títulos en Cormorant Garamond 600 grandes (40 a 56), cuerpo en Manrope. Esquinas casi rectas, botones de contorno, sin sombras, líneas finas como separador. Portada con foto oscura (overlay de 55 a 65) y el título centrado, o portada tipográfica con mucho aire. Menú en lista con precios sencillos; galería en carrusel 3:4 del ambiente. Evita neones y degradados morados.",
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    fits: "restaurantes de autor, café de especialidad, estudios, tiendas de diseño",
    palette: {
      background: "#faf8f4",
      surface: "#ffffff",
      text: "#141414",
      muted: "#5e5a55",
      accent: "#d2452b",
    },
    fonts: { heading: "dm-serif", body: "manrope" },
    radius: 2,
    buttonShape: "square",
    buttonStyle: "solid",
    shadow: "none",
    cover: "split",
    brief:
      "Como una revista. Blanco roto, negro y un solo acento saturado (rojo tomate, azul cobalto o el de la marca). Títulos en DM Serif Display muy grandes (44 a 56, interlineado 11), cuerpo en Manrope. Esquinas rectas, sin sombras, mucho aire (secciones con 48 a 64 de relleno arriba y abajo). Portada asimétrica en lienzo: título enorme a la izquierda y una foto 3:4 a la derecha que se sale del borde. Separa las secciones con líneas finas y mucho aire, no con etiquetas sobre cada título. Evita tarjetas con sombra y más de un color fuerte.",
  },
  fresco: {
    id: "fresco",
    name: "Fresco",
    fits: "cafeterías de día, juguerías, comida saludable, cosmética natural",
    palette: {
      background: "#f5faf6",
      surface: "#ffffff",
      text: "#17302a",
      muted: "#4f6660",
      accent: "#2f7a5b",
    },
    fonts: { heading: "outfit", body: "manrope" },
    radius: 22,
    buttonShape: "pill",
    buttonStyle: "solid",
    shadow: "soft",
    cover: "split",
    brief:
      "Ligero y limpio. Fondo casi blanco con un toque verde o del color de la marca, superficie blanca, acento salvia o el de la marca, y franjas con un tinte pastel del acento. Títulos en Outfit 600, cuerpo en Manrope. Esquinas muy redondas, botones de píldora, sombras suaves. Portada con la foto en máscara de burbuja o arco sobre un fondo pastel y el título al lado o debajo. Datos clave en cuadrícula con íconos en círculo; catálogo en cuadrícula 1:1. Evita verdes neón y llenar todo de íconos.",
  },
  boutique: {
    id: "boutique",
    name: "Boutique",
    fits: "florerías, salones de belleza, uñas, ropa, joyería, novias",
    palette: {
      background: "#fbf3f1",
      surface: "#ffffff",
      text: "#2e2326",
      muted: "#6f5f63",
      accent: "#8e3b4e",
    },
    fonts: { heading: "cormorant", body: "outfit" },
    radius: 24,
    buttonShape: "pill",
    buttonStyle: "solid",
    shadow: "soft",
    cover: "split",
    brief:
      "Delicado y cuidado. Fondo rosa empolvado o arena muy claro, texto casi negro cálido, acento profundo (vino, salvia oscuro o el de la marca). Títulos en Cormorant Garamond 600, cuerpo en Outfit. Esquinas redondas, botón principal sólido y los demás de contorno. Portada con la foto en máscara de arco centrada, el nombre debajo en serif grande y una forma suave (círculo o arco) detrás, rellena con un tinte muy claro del acento (un color de relleno claro, no una opacidad baja). Galería en mosaico 3:4 de trabajos reales. Evita dorados brillantes y cursivas en párrafos.",
  },
  audaz: {
    id: "audaz",
    name: "Audaz",
    fits: "tacos, hamburguesas, pizzas, food trucks, bares deportivos, eventos, gimnasios",
    palette: {
      background: "#f2c230",
      surface: "#fff8e6",
      text: "#141414",
      muted: "#4a4030",
      accent: "#c42a1b",
    },
    fonts: { heading: "bebas", body: "montserrat" },
    radius: 6,
    buttonShape: "square",
    buttonStyle: "solid",
    shadow: "strong",
    cover: "type",
    brief:
      "Ruidoso y con hambre. Fondo del color fuerte de la marca (o mostaza), superficie crema o negra, texto negro o blanco según contraste, un segundo color fuerte como acento. Títulos en Bebas Neue u Oswald muy grandes (48 a 72; Bebas ya es de mayúsculas, úsala solo en títulos cortos), cuerpo en Montserrat. Esquinas casi rectas, botones sólidos de alto contraste. Portada con el nombre enorme a todo el ancho y una foto recortada en píldora o rectángulo ligeramente girado (r de -4 a 4). Destacados en carrusel con la etiqueta Del día. Evita más de dos colores fuertes y texto chico sobre color saturado.",
  },
  sobrio: {
    id: "sobrio",
    name: "Sobrio",
    fits: "consultorios, despachos, contadores, abogados, inmobiliarias, talleres",
    palette: {
      background: "#f5f7fa",
      surface: "#ffffff",
      text: "#0f1b2d",
      muted: "#4a5568",
      accent: "#1f3a68",
    },
    fonts: { heading: "manrope", body: "dm-sans" },
    radius: 12,
    buttonShape: "rounded",
    buttonStyle: "solid",
    shadow: "soft",
    cover: "split",
    brief:
      "Confiable y directo. Fondo blanco o gris azulado muy claro, texto azul casi negro, acento azul marino, verde petróleo o el de la marca. Títulos en Manrope 700, cuerpo en DM Sans. Esquinas medias, botones redondeados sólidos, sombras suaves. Portada partida: la foto del profesional o del lugar en máscara redondeada o circular a un lado, el nombre, la especialidad en una línea y el botón de agendar. Datos clave en lista con íconos (horario, ubicación, teléfono, citas). Evita fotos de banco genéricas y colores chillones.",
  },
  artesanal: {
    id: "artesanal",
    name: "Artesanal",
    fits: "panaderías y cafés de barrio, chocolaterías, productos hechos a mano",
    palette: {
      background: "#f7f3ec",
      surface: "#ffffff",
      text: "#2f2a1f",
      muted: "#655c4c",
      accent: "#56662a",
    },
    fonts: { heading: "lora", body: "dm-sans" },
    radius: 12,
    buttonShape: "rounded",
    buttonStyle: "solid",
    shadow: "soft",
    cover: "photo",
    brief:
      "Hecho a mano, sin disfraz. Fondo hueso claro, superficie blanca, texto café oscuro, acento olivo, tostado o el de la marca. Títulos en Lora 700, cuerpo en DM Sans; Caveat solo en una frase corta como firma (nunca en párrafos ni botones). Esquinas medias, sombras suaves. Portada con una foto de luz natural dentro de una tarjeta con borde fino y la frase en Caveat. Destacados en tarjetas con el producto del día. Evita texturas falsas y abusar de la letra manuscrita.",
  },
  lujo: {
    id: "lujo",
    name: "Lujo discreto",
    fits: "hoteles boutique, salones de eventos, vinos, spas, joyería fina",
    palette: {
      background: "#f7f3ec",
      surface: "#ffffff",
      text: "#1c1a17",
      muted: "#6b655c",
      accent: "#8a6d3b",
    },
    fonts: { heading: "cormorant", body: "montserrat" },
    radius: 0,
    buttonShape: "square",
    buttonStyle: "outline",
    shadow: "none",
    cover: "photo",
    brief:
      "Mucho aire y pocas cosas. Marfil (o negro), texto casi negro, acento dorado apagado o el de la marca. Títulos en Cormorant Garamond 600 (44 a 60), cuerpo en Montserrat 400; si usas una etiqueta, en Montserrat 13 con letterSpacing de 2 a 4 y solo una o dos en la página. Esquinas rectas, botones de contorno, sin sombras, líneas finas. Portada con una foto muy grande (overlay de 30 a 40) y el título centrado; galería en carrusel 16:9. Evita dorados brillantes, degradados y más de un acento.",
  },
  alegre: {
    id: "alegre",
    name: "Alegre",
    fits: "escuelas, guarderías, heladerías, pastelerías, fiestas infantiles, veterinarias",
    palette: {
      background: "#fffbf2",
      surface: "#ffffff",
      text: "#1f2a44",
      muted: "#52607a",
      accent: "#2563eb",
    },
    fonts: { heading: "poppins", body: "dm-sans" },
    radius: 24,
    buttonShape: "pill",
    buttonStyle: "solid",
    shadow: "soft",
    cover: "split",
    brief:
      "Amable y con color, sin gritar. Fondo claro cálido, texto azul muy oscuro, un acento brillante pero legible (azul, coral o el de la marca) y un pastel secundario en franjas. Títulos en Poppins 700, cuerpo en DM Sans. Esquinas muy redondas, botones de píldora. Portada con el título grande y formas suaves (burbuja, círculo) en pastel detrás de una foto con máscara circular o de burbuja. Datos clave en cuadrícula con íconos en círculo. Evita arcoíris, más de tres colores y emojis.",
  },
};

/** One direction, in the guide's words. */
export function designDirectionLine(direction: DesignDirection): string {
  return `${direction.id} (${direction.name}; para ${direction.fits}): ${direction.brief}`;
}

// ---------------------------------------------------------------------------
// Ideas ("3 conceptos y luego 1 diseño")
// ---------------------------------------------------------------------------

const HexColor = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const DesignFontLiteral = Type.Union(designFonts.map((f) => Type.Literal(f)));

/** One idea the AI proposes before designing: a direction made specific to
 * the business (its own palette, fonts and cover). */
export const DesignConceptSchema = Type.Object(
  {
    /** Short name, e.g. "Fonda de barrio". */
    name: Type.String({ minLength: 1, maxLength: 40 }),
    direction: Type.Union(designDirectionIds.map((id) => Type.Literal(id))),
    /** One or two sentences for the customer. */
    pitch: Type.String({ minLength: 1, maxLength: 220 }),
    palette: Type.Object(
      {
        background: HexColor,
        surface: HexColor,
        text: HexColor,
        muted: HexColor,
        accent: HexColor,
      },
      { additionalProperties: false },
    ),
    fonts: Type.Object(
      { heading: DesignFontLiteral, body: DesignFontLiteral },
      { additionalProperties: false },
    ),
    radius: Type.Integer({ minimum: 0, maximum: 32 }),
    buttonShape: Type.Union([
      Type.Literal("pill"),
      Type.Literal("rounded"),
      Type.Literal("square"),
    ]),
    cover: Type.Union(designCoverKinds.map((kind) => Type.Literal(kind))),
    /** What the page will have, 2 to 4 short lines. */
    highlights: Type.Array(Type.String({ minLength: 1, maxLength: 90 }), {
      minItems: 2,
      maxItems: 4,
    }),
  },
  { additionalProperties: false },
);
export type DesignConcept = Static<typeof DesignConceptSchema>;

/** How many ideas the AI proposes. */
export const DESIGN_CONCEPTS_COUNT = 3;

/**
 * A cover the way the guide asks for it ("foto a sangre"), written as one
 * exact canvas section of the contract, so the model copies a structure
 * that validates instead of improvising one. `REF_PORTADA` and `REF_LOGO`
 * stand for real image identifiers from the prompt's list.
 */
export const coverSectionExample = {
  id: "portada",
  kind: "canvas",
  height: 500,
  background: {
    kind: "image",
    imageRef: "REF_PORTADA",
    overlay: 50,
    position: "center",
  },
  items: [
    {
      block: {
        id: "logo-disco",
        kind: "shape",
        shape: "ellipse",
        fill: "#ffffff",
      },
      x: 24,
      y: 28,
      w: 72,
      h: 72,
    },
    {
      block: {
        id: "logo",
        kind: "image",
        imageRef: "REF_LOGO",
        alt: "Logo del negocio",
        aspect: "1:1",
        fit: "contain",
      },
      x: 32,
      y: 36,
      w: 56,
      h: 56,
      z: 1,
    },
    {
      block: {
        id: "portada-etiqueta",
        kind: "text",
        runs: [{ text: "Cocina casera en la Narvarte" }],
        style: {
          color: "#ffffff",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 2,
        },
      },
      x: 24,
      y: 300,
      w: 342,
    },
    {
      block: {
        id: "portada-titulo",
        kind: "heading",
        level: 1,
        text: "Fonda Doña Mary",
        style: { color: "#ffffff", fontSize: 48, lineHeight: 11 },
      },
      x: 24,
      y: 324,
      w: 342,
    },
    {
      block: {
        id: "portada-pedir",
        kind: "brandButton",
        brand: "whatsapp",
        label: "Pedir por WhatsApp",
        href: "https://wa.me/525523456789",
        look: "brand",
      },
      x: 24,
      y: 424,
      w: 240,
    },
  ],
} as const;
