import {
  boundBlockKinds,
  boundBlocksByType,
  type DesignableExperienceType,
  type DesignBlock,
  type DesignBlockKind,
  type DesignBrand,
  repeatableBoundBlocks,
  requiredBlockByType,
} from "@kardo/contracts";
import type { IconName } from "../../../components/Icon.js";
import { suggestedBrandLabel } from "./brand-links.js";
import type { NewId } from "./ids.js";

/**
 * The block catalog of the Estudio: Spanish names, icons, where each kind
 * sits in "Agregar bloque" and the starting values of a new block.
 */

export const freeBlockKinds = [
  "heading",
  "text",
  "image",
  "features",
  "gallery",
  "button",
  "brandButton",
  "shape",
  "divider",
  "spacer",
  "html",
] as const satisfies readonly DesignBlockKind[];
export type FreeBlockKind = (typeof freeBlockKinds)[number];

// The kinds bound to the content come from the contract (`boundBlockKinds`
// and `repeatableBoundBlocks`), the one list for the panel and the API.
export function isBoundKind(kind: DesignBlockKind): boolean {
  return boundBlockKinds.includes(kind);
}

/** Bound blocks that may appear more than once: a Menú's `menu` block
 * ("Partir el menú") and a Menú/Catálogo's `featuredItems` block (several
 * highlights, e.g. "Lo más pedido" and "Del día", up to
 * `DESIGN_LIMITS.featuredBlocks`). */
export function isRepeatableBoundKind(kind: DesignBlockKind): boolean {
  return repeatableBoundBlocks.includes(kind);
}

type KindInfo = { label: string; description: string; icon: IconName };

const kindInfo: Record<DesignBlockKind, KindInfo> = {
  heading: {
    label: "Título",
    description: "Un encabezado grande o un subtítulo.",
    icon: "heading",
  },
  text: {
    label: "Texto",
    description: "Párrafos con negritas, cursivas y enlaces.",
    icon: "text-block",
  },
  image: {
    label: "Imagen",
    description: "Una foto de tu biblioteca, con enlace opcional.",
    icon: "asset",
  },
  features: {
    label: "Datos clave",
    description:
      "Horario, entrega, pagos y otras señales de confianza, con íconos.",
    icon: "checklist",
  },
  gallery: {
    label: "Galería",
    description:
      "Varias fotos de tu negocio, en cuadrícula, mosaico o carrusel.",
    icon: "wallpaper",
  },
  button: {
    label: "Botón",
    description: "Una llamada a la acción que lleva a un enlace.",
    icon: "button-block",
  },
  brandButton: {
    label: "Botón de red o app",
    description: "WhatsApp, Instagram y más, con su logo y color oficial.",
    icon: "share",
  },
  shape: {
    label: "Figura",
    description:
      "Un rectángulo, un círculo, una estrella y más, a color o en degradado.",
    icon: "blend",
  },
  divider: {
    label: "Separador",
    description: "Una línea fina entre bloques.",
    icon: "divider",
  },
  spacer: {
    label: "Espacio",
    description: "Aire vertical entre bloques.",
    icon: "spacer",
  },
  html: {
    label: "HTML",
    description: "Tu propio código. Se revisa antes de mostrarse o publicarse.",
    icon: "code",
  },
  contentTitle: {
    label: "Título de la página",
    description: "El título y la descripción de tu contenido.",
    icon: "case-upper",
  },
  profileHeader: {
    label: "Encabezado del perfil",
    description: "Foto, nombre y presentación.",
    icon: "profile",
  },
  contentLinks: {
    label: "Enlaces",
    description: "Los enlaces de tu contenido, con clics medidos.",
    icon: "link-list",
  },
  contentSocials: {
    label: "Redes sociales",
    description: "Los íconos de tus redes.",
    icon: "share",
  },
  menu: {
    label: "Menú",
    description: "Las secciones y platillos de tu menú, con fotos y precios.",
    icon: "menu-block",
  },
  catalog: {
    label: "Catálogo",
    description: "La cuadrícula o lista de tus productos.",
    icon: "board",
  },
  featuredItems: {
    label: "Destacados",
    description: "Una selección de tus platillos o productos más pedidos.",
    icon: "star",
  },
  leadForm: {
    label: "Formulario",
    description: "Los campos de contacto y el aviso de privacidad.",
    icon: "form-block",
  },
  documentPages: {
    label: "Páginas del PDF",
    description: "Las páginas de tu documento, como en un visor.",
    icon: "document",
  },
  imageMain: {
    label: "Imagen principal",
    description: "La foto de tu página, a pantalla completa.",
    icon: "asset",
  },
};

export function blockKindLabel(
  kind: DesignBlockKind,
  type?: DesignableExperienceType,
): string {
  if (kind === "contentLinks" && type === "linkpage") return "Botones";
  return kindInfo[kind].label;
}

export function blockKindDescription(kind: DesignBlockKind): string {
  return kindInfo[kind].description;
}

export function blockKindIcon(kind: DesignBlockKind): IconName {
  return kindInfo[kind].icon;
}

/** Bound blocks this type can place (each at most once, except a Menú's
 * `menu` block: see `isRepeatableBoundKind`). */
export function boundKindsFor(
  type: DesignableExperienceType,
): readonly DesignBlockKind[] {
  return boundBlocksByType[type];
}

/** Bound blocks the Estudio never adds on its own when a template or a
 * design lacks them (2026-10-03): "Destacados" needs the dishes or
 * products the owner picks, so it starts only from "Agregar" or the AI. */
export const optionalBoundKinds: readonly DesignBlockKind[] = ["featuredItems"];

export function isRequiredKind(
  type: DesignableExperienceType,
  kind: DesignBlockKind,
): boolean {
  return requiredBlockByType[type] === kind;
}

/** A new block with friendly starting values, already looking finished.
 * `whatsappUrl`: a fresh `brandButton` (its default brand, S7) starts with
 * the business's own WhatsApp when the profile already has one, instead of
 * nacer vacío and sending the owner hunting for "Usar el WhatsApp de tu
 * negocio" further down the inspector (relevo 37, S7). */
export function createBlock(
  kind: DesignBlockKind,
  newId: NewId,
  whatsappUrl?: string,
): DesignBlock {
  const id = newId("b");
  switch (kind) {
    case "heading":
      return { id, kind, text: "Tu título", level: 2 };
    case "text":
      return {
        id,
        kind,
        runs: [
          {
            text: "Cuenta en pocas palabras qué hace especial a tu negocio.",
          },
        ],
      };
    case "image":
      // Starts without a picture: the inspector asks for one before saving.
      return { id, kind, imageRef: "", alt: "", aspect: "4:3", fit: "cover" };
    case "features":
      return {
        id,
        kind,
        layout: "list",
        items: [{ icon: "star", title: "Dato clave" }],
      };
    case "gallery":
      // Starts with no photos: the inspector asks for at least two before
      // saving, same as "image" starting without a picture.
      return { id, kind, layout: "grid", aspect: "1:1", images: [] };
    case "button":
      return { id, kind, label: "Mi botón", href: "", variant: "primary" };
    case "brandButton":
      return {
        id,
        kind,
        brand: "whatsapp",
        label: "Escríbenos por WhatsApp",
        href: whatsappUrl ?? "",
        look: "brand",
      };
    case "shape":
      return { id, kind, shape: "rect", fill: "accent" };
    case "divider":
      return { id, kind };
    case "spacer":
      return { id, kind, height: 32 };
    case "html":
      return { id, kind, html: "", css: "", label: "Bloque HTML" };
    case "contentTitle":
      return { id, kind };
    case "profileHeader":
      return { id, kind, layout: "stacked", avatarShape: "circle" };
    case "contentLinks":
      return { id, kind, layout: "list" };
    case "contentSocials":
      return { id, kind, size: "medium" };
    case "menu":
      return {
        id,
        kind,
        layout: "cards",
        photos: "small",
        photoShape: "rounded",
        descriptions: true,
        sectionStyle: "line",
        priceStyle: "accent",
        columns: 1,
      };
    case "catalog":
      return {
        id,
        kind,
        layout: "grid",
        columns: 2,
        imageAspect: "1:1",
        descriptions: true,
        priceStyle: "accent",
      };
    case "leadForm":
      return { id, kind, look: "boxed", buttonWidth: "full" };
    case "documentPages":
      return { id, kind, pageStyle: "shadow", gap: 24 };
    case "imageMain":
      return { id, kind, fit: "cover", frame: "none", aspect: "auto" };
    case "featuredItems":
      // Starts with no items: the inspector asks for at least one before
      // saving, same as "image" starting without a picture.
      return { id, kind, layout: "cards", itemIds: [] };
  }
}

/** "Redes en círculo" (addendum: forma): four ready `brandButton` blocks —
 * WhatsApp, Instagram, TikTok and Facebook — already in círculo look, meant
 * to be inserted together so they read as a row from the start. WhatsApp
 * takes the business's own number when its profile has a phone; otherwise
 * it starts empty like the others, left for the owner to fill in before
 * saving (never an example number: 2026-10-03 study, finding 5). */
export function createBrandCircleRow(
  newId: NewId,
  whatsappUrl?: string,
): DesignBlock[] {
  const entries: { brand: DesignBrand; href: string }[] = [
    { brand: "whatsapp", href: whatsappUrl ?? "" },
    { brand: "instagram", href: "" },
    { brand: "tiktok", href: "" },
    { brand: "facebook", href: "" },
  ];
  return entries.map(
    ({ brand, href }): DesignBlock => ({
      id: newId("b"),
      kind: "brandButton",
      brand,
      label: suggestedBrandLabel[brand],
      href,
      look: "circle",
    }),
  );
}

/** One line that tells blocks of the same kind apart in Capas. */
export function blockSummary(block: DesignBlock): string {
  switch (block.kind) {
    case "heading":
      return block.text;
    case "text":
      return block.runs.map((run) => run.text).join("");
    case "image":
      return block.imageRef
        ? block.alt || "Imagen de tu biblioteca"
        : "Sin imagen";
    case "features": {
      const count = block.items.length;
      return `${count} ${count === 1 ? "dato clave" : "datos clave"}`;
    }
    case "gallery": {
      const count = block.images.length;
      return `${count} ${count === 1 ? "foto" : "fotos"}`;
    }
    case "featuredItems": {
      const count = block.itemIds.length;
      const items = `${count} ${count === 1 ? "elemento" : "elementos"}`;
      return block.label ? `${block.label} · ${items}` : items;
    }
    case "button":
    case "brandButton":
      return block.label;
    case "shape": {
      const shapeLabels: Record<string, string> = {
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
      return shapeLabels[block.shape] ?? "Figura";
    }
    case "html":
      return block.label || "Bloque HTML";
    case "spacer":
      return `${block.height} px`;
    case "contentLinks":
      return block.layout === "grid" ? "En cuadrícula" : "En lista";
    case "contentSocials":
      return { small: "Chicas", medium: "Medianas", large: "Grandes" }[
        block.size
      ];
    case "profileHeader":
      return block.layout === "inline" ? "En línea" : "Apilado";
    case "menu": {
      const count = block.sectionIds?.length;
      const layouts = {
        list: "Lista",
        cards: "Tarjetas",
        grid: "Cuadrícula",
        compact: "Compacto",
      } satisfies Record<typeof block.layout, string>;
      return count
        ? `${layouts[block.layout]} · ${count} ${count === 1 ? "sección" : "secciones"}`
        : layouts[block.layout];
    }
    case "catalog": {
      const layouts = {
        grid: "Cuadrícula",
        list: "Lista",
        cards: "Tarjetas",
      } satisfies Record<typeof block.layout, string>;
      return layouts[block.layout];
    }
    case "leadForm":
      return {
        boxed: "Con recuadro",
        card: "En tarjeta",
        underline: "Con línea",
      }[block.look];
    case "documentPages":
      return { shadow: "Con sombra", border: "Con borde", flat: "Plano" }[
        block.pageStyle
      ];
    case "imageMain":
      return block.frame === "none" ? "Sin marco" : "Con marco";
    default:
      return "";
  }
}
