import {
  type CustomHtml,
  type ExperienceContent,
  type ExperienceType,
  supportsCustomHtml,
} from "@kardo/contracts";
import { contentDesign, isDesignableType } from "../studio/model/content.js";

/**
 * Which preview a page gets (domain audit A2-26): the one decision for
 * Diseño, Historial and the rest, in the order customers see it. The modo
 * HTML first when it is active, then the Estudio design, then the design
 * built from the content ("usar el aspecto de hoy"), and the plain theme
 * preview only for the types that have no Estudio (Redirección).
 */
export type PagePreviewKind = "html" | "design" | "from-content" | "theme";

export function activeCustomHtml(
  type: ExperienceType,
  content: ExperienceContent,
): CustomHtml | null {
  if (!supportsCustomHtml(type)) return null;
  const html = (content as { customHtml?: CustomHtml }).customHtml;
  return html?.active && html.html.trim() ? html : null;
}

export function pagePreviewKind(
  type: ExperienceType,
  content: ExperienceContent,
): PagePreviewKind {
  if (activeCustomHtml(type, content)) return "html";
  if (!isDesignableType(type)) return "theme";
  return contentDesign(content) ? "design" : "from-content";
}
