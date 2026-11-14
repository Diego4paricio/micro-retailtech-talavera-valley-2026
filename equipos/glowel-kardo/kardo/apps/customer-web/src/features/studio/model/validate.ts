import {
  CanvasItemSchema,
  CanvasSectionSchema,
  checkDesign,
  DESIGN_LIMITS,
  type DesignableExperienceType,
  type DesignBlock,
  DesignBlockSchema,
  DesignSectionSchema,
  DesignStyleSchema,
  isCanvasSection,
  type PageDesign,
  PageDesignSchema,
  sectionBlocks,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import { FormatRegistry, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { blockKindLabel } from "./blocks.js";
import { brandName } from "./brands.js";
import { isWhatsAppButton } from "./business-contact.js";

/**
 * Validation before saving: the contract's TypeBox schema and its
 * `checkDesign` rules, turned into short Spanish messages that point at the
 * block, section or page setting to fix.
 */

// The contract marks URLs with `format: "uri"`; TypeBox needs to be told
// what that means (the API does the same through its own validator).
if (!FormatRegistry.Has("uri"))
  FormatRegistry.Set("uri", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  });

export type StudioIssue = {
  message: string;
  area: "page" | "section" | "block";
  sectionId?: string;
  blockId?: string;
  /** The block or section field at fault (e.g. `href`), for inline errors. */
  field?: string;
};

const httpsMessage =
  "Usa un enlace completo que empiece con https:// (sin usuario ni contraseña).";

type SchemaWithKind = TSchema & {
  properties?: { kind?: { const?: string } };
};

const blockVariants = (
  DesignBlockSchema as unknown as { anyOf: SchemaWithKind[] }
).anyOf;

function variantOf(block: DesignBlock): TSchema | null {
  return (
    blockVariants.find(
      (variant) => variant.properties?.kind?.const === block.kind,
    ) ?? null
  );
}

function firstSegment(path: string): string {
  return path.split("/").filter(Boolean)[0] ?? "";
}

function blockMessage(block: DesignBlock, path: string, schemaMessage: string) {
  const field = firstSegment(path);
  if (field === "style") return "Un ajuste de Avanzado está fuera de rango.";
  switch (block.kind) {
    case "heading":
      if (field === "text")
        return block.text.trim()
          ? "El título admite hasta 160 caracteres."
          : "Escribe el texto del título.";
      break;
    case "text":
      if (path.endsWith("/href")) return httpsMessage;
      if (field === "runs") return "El texto no puede quedar vacío.";
      break;
    case "image":
      if (field === "imageRef") return "Elige una imagen de tu biblioteca.";
      if (field === "alt") return "La descripción admite hasta 200 caracteres.";
      if (field === "href") return httpsMessage;
      break;
    case "button":
      if (field === "label")
        return block.label.trim()
          ? "El texto del botón admite hasta 60 caracteres."
          : "Escribe el texto del botón.";
      if (field === "href")
        return block.href.trim()
          ? httpsMessage
          : isWhatsAppButton(block)
            ? `Falta tu número de WhatsApp en el botón «${block.label.trim() || "WhatsApp"}».`
            : "Escribe a dónde lleva el botón.";
      break;
    case "brandButton": {
      const brand = brandName(block.brand);
      if (field === "label")
        return block.label.trim()
          ? "El texto del botón admite hasta 60 caracteres."
          : `Escribe el texto del botón de ${brand}.`;
      if (field === "href")
        return block.href.trim()
          ? httpsMessage
          : block.brand === "whatsapp"
            ? `Falta tu número de WhatsApp en el botón «${block.label.trim() || "WhatsApp"}».`
            : `Falta el enlace del botón de ${brand}.`;
      break;
    }
    case "spacer":
      if (field === "height") return "La altura va de 4 a 160 px.";
      break;
    case "features":
      if (field === "items")
        return "Agrega de 1 a 8 datos clave, cada uno con su ícono y su título.";
      if (field === "columns") return "Elige 2 o 3 columnas.";
      break;
    case "gallery":
      if (field === "images") return "Agrega de 2 a 12 fotos a la galería.";
      if (field === "columns") return "Elige 2 o 3 columnas.";
      break;
    case "featuredItems":
      if (field === "itemIds")
        return "Elige al menos un platillo o producto para destacar.";
      if (field === "label") return "La etiqueta admite hasta 32 caracteres.";
      break;
    case "shape":
      if (field === "strokeWidth")
        return "El grosor del contorno va de 0 a 24 px.";
      if (field === "angle") return "El ángulo del degradado va de 0° a 360°.";
      break;
    case "menu":
      if (field === "sectionIds")
        return "Elige de 1 a 10 secciones para este bloque.";
      if (field === "columns") return "Elige 1 o 2 columnas.";
      break;
    case "catalog":
      if (field === "columns") return "Elige de 1 a 3 columnas.";
      if (field === "buttonLabel")
        return "El texto del botón admite hasta 24 caracteres.";
      break;
    case "documentPages":
      if (field === "gap") return "El espacio entre páginas va de 0 a 48 px.";
      break;
    case "html":
      if (field === "html")
        return `El HTML admite hasta ${DESIGN_LIMITS.htmlBlockHtml.toLocaleString("es-MX")} caracteres.`;
      if (field === "css")
        return `El CSS admite hasta ${DESIGN_LIMITS.htmlBlockCss.toLocaleString("es-MX")} caracteres.`;
      if (field === "label") return "El nombre admite hasta 60 caracteres.";
      break;
    default:
      break;
  }
  return `Revisa este bloque (${schemaMessage.toLowerCase()}).`;
}

function hrefIssue(href: string | undefined): boolean {
  return Boolean(href?.trim()) && !normalizePublicHttpsUrl(href?.trim() ?? "");
}

function translateRule(
  message: string,
  type: DesignableExperienceType,
): string {
  const kind = /^(\w+) (?:is not available|can appear only once)/.exec(
    message,
  )?.[1];
  const label = kind
    ? blockKindLabel(kind as DesignBlock["kind"], type)
    : "Un bloque";
  if (message.includes("is not available"))
    return `«${label}» no está disponible en este tipo de página.`;
  if (message.includes("can appear only once"))
    return `«${label}» solo puede aparecer una vez.`;
  const required = /must keep (\w+)/.exec(message)?.[1];
  if (required)
    return `Tu página necesita «${blockKindLabel(required as DesignBlock["kind"], type)}».`;
  if (message.startsWith("Layout"))
    return "Esta sección no tiene las columnas que pide su distribución.";
  if (message === "Repeated id.")
    return "Hay un identificador repetido. Duplica el bloque otra vez.";
  if (message === "Text is too long.")
    return "El texto supera los 1,500 caracteres.";
  if (message === "Too many blocks.")
    return `Hay más de ${DESIGN_LIMITS.blocks} bloques.`;
  if (message === "Too many buttons.")
    return `Hay más de ${DESIGN_LIMITS.buttons} botones.`;
  if (message === "Too many images.")
    return `Hay más de ${DESIGN_LIMITS.images} imágenes.`;
  if (message === "Too many HTML blocks.")
    return `Hay más de ${DESIGN_LIMITS.htmlBlocks} bloques HTML.`;
  if (message === "Too many menu blocks.")
    return `Hay más de ${DESIGN_LIMITS.menuBlocks} bloques de menú.`;
  if (message === "Too many featuredItems blocks.")
    return `Hay más de ${DESIGN_LIMITS.featuredBlocks} bloques de destacados.`;
  if (message === "A featured item is listed twice.")
    return "Elige cada platillo o producto una sola vez.";
  if (
    message ===
    "The featuredItems block names an item the content does not have."
  )
    return "Este bloque destaca un platillo o producto que ya no existe. Vuelve a elegirlos.";
  const offCanvas = /^(\w+) cannot be placed on a canvas/.exec(message)?.[1];
  if (offCanvas)
    return `«${blockKindLabel(offCanvas as DesignBlock["kind"], type)}» no puede ir en un espacio libre.`;
  if (message === "Outside the canvas.")
    return "Este bloque quedó fuera del espacio libre. Muévelo hacia adentro.";
  if (message === "Shapes can only be placed on a canvas.")
    return "Las figuras solo van en una sección de espacio libre.";
  if (message === "A menu section is listed twice.")
    return "Elige cada sección del menú una sola vez.";
  if (message === "The menu block names a section the menu does not have.")
    return "Este bloque muestra una sección que tu menú ya no tiene. Vuelve a elegir las secciones.";
  if (message === "Too many canvas sections.")
    return `Hay más de ${DESIGN_LIMITS.canvasSections} secciones de espacio libre.`;
  if (message === "Canvas sections need design schema 2.")
    return "Guarda de nuevo: el diseño necesita actualizarse para usar espacios libres.";
  if (message === "Invalid block.")
    return "Revisa este bloque: tiene un valor que no es válido.";
  if (message === "The design is too large.")
    return "El diseño es demasiado grande. Quita algunos bloques.";
  return "El diseño tiene un valor que no es válido.";
}

/** Maps `sections[1].columns[0][2]` or `sections[1].items[3]` to the ids
 * it points at. */
function locate(
  design: PageDesign,
  path: string,
): { sectionId?: string; blockId?: string } {
  const match =
    /^sections\[(\d+)\](?:\.columns\[(\d+)\]\[(\d+)\]|\.items\[(\d+)\])?/.exec(
      path,
    );
  if (!match) return {};
  const section = design.sections[Number(match[1])];
  if (!section) return {};
  const block = isCanvasSection(section)
    ? match[4] === undefined
      ? undefined
      : section.items[Number(match[4])]?.block
    : match[2] === undefined
      ? undefined
      : section.columns[Number(match[2])]?.[Number(match[3])];
  return block
    ? { sectionId: section.id, blockId: block.id }
    : { sectionId: section.id };
}

export function validateDesign(
  type: DesignableExperienceType,
  design: PageDesign,
  contentIds: readonly string[],
  /** A Menú's own section ids (see `contentMenuSectionIds`), so a `menu`
   * block naming a section the menu no longer has gets a precise message.
   * Optional and only meaningful for `type: "menu"`; every other type
   * ignores it. */
  menuSectionIds?: readonly string[],
  /** A Menú's dishes or a Catálogo's products (see
   * `contentFeaturableItemIds`), so a `featuredItems` block naming an item
   * the content no longer has gets a precise message. Optional and only
   * meaningful for `type: "menu"` and `type: "catalog"`. */
  featurableItemIds?: readonly string[],
): StudioIssue[] {
  const issues: StudioIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: StudioIssue) => {
    const key = `${issue.area}:${issue.sectionId ?? ""}:${issue.blockId ?? ""}:${issue.field ?? issue.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  };

  // An image background without `imageRef` is a photo space (the AI leaves
  // one when the business has no photos yet): it saves and publishes with its
  // fallback color, and the Estudio marks «Falta tu foto» (photo-spaces.ts).
  for (const error of Value.Errors(DesignStyleSchema, design.style))
    add({
      area: "page",
      field: firstSegment(error.path),
      message: error.path.startsWith("/background/imageRef")
        ? "La imagen de fondo de la página no es válida. Elige otra."
        : "Un ajuste de Estilo o Fondo no es válido.",
    });

  for (const section of design.sections) {
    // The section's own settings; its blocks are checked one by one below.
    const errors = isCanvasSection(section)
      ? Value.Errors(CanvasSectionSchema, { ...section, items: [] })
      : Value.Errors(DesignSectionSchema, {
          ...section,
          columns: section.columns.map(() => []),
        });
    for (const error of errors)
      add({
        area: "section",
        sectionId: section.id,
        field: firstSegment(error.path),
        message: error.path.startsWith("/background/imageRef")
          ? "La imagen de fondo de esta sección no es válida. Elige otra."
          : "Un ajuste de esta sección no es válido.",
      });

    // Where each canvas block sits (the block itself is checked below).
    if (isCanvasSection(section))
      for (const item of section.items) {
        const placement = { ...item, block: { id: "b", kind: "divider" } };
        if (!Value.Check(CanvasItemSchema, placement))
          add({
            area: "block",
            sectionId: section.id,
            blockId: item.block.id,
            field: "placement",
            message:
              "La posición o el tamaño de este bloque están fuera de rango.",
          });
      }

    for (const block of sectionBlocks(section)) {
      const variant = variantOf(block);
      if (!variant) {
        add({
          area: "block",
          sectionId: section.id,
          blockId: block.id,
          message: "Este tipo de bloque no existe.",
        });
        continue;
      }
      for (const error of Value.Errors(variant, block))
        add({
          area: "block",
          sectionId: section.id,
          blockId: block.id,
          field: firstSegment(error.path),
          message: blockMessage(block, error.path, error.message),
        });
      // The API also refuses URLs with credentials or blanks.
      const hrefs =
        block.kind === "text"
          ? block.runs.map((run) => run.href)
          : block.kind === "button" ||
              block.kind === "brandButton" ||
              block.kind === "image"
            ? [block.href]
            : [];
      if (hrefs.some(hrefIssue))
        add({
          area: "block",
          sectionId: section.id,
          blockId: block.id,
          field: block.kind === "text" ? "runs" : "href",
          message: httpsMessage,
        });
    }
  }

  for (const rule of checkDesign(type, design, contentIds, {
    ...(menuSectionIds ? { menuSectionIds } : {}),
    ...(featurableItemIds ? { featurableItemIds } : {}),
  })) {
    const at = locate(design, rule.path);
    // A canvas block that fails its schema already has a precise message
    // from the checks above (for example a missing picture).
    if (
      rule.message === "Invalid block." &&
      issues.some((issue) => issue.blockId === at.blockId)
    )
      continue;
    add({
      area: at.blockId ? "block" : at.sectionId ? "section" : "page",
      ...at,
      message: translateRule(rule.message, type),
    });
  }

  if (!issues.length && !Value.Check(PageDesignSchema, design))
    add({
      area: "page",
      message: "El diseño tiene un valor que no es válido.",
    });
  return issues;
}

/** Issues about one block (or section), for inline messages. */
export function issuesFor(
  issues: readonly StudioIssue[],
  target: { blockId?: string; sectionId?: string },
): StudioIssue[] {
  return issues.filter((issue) =>
    target.blockId
      ? issue.blockId === target.blockId
      : issue.sectionId === target.sectionId && !issue.blockId,
  );
}
