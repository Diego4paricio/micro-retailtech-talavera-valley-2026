import {
  type ConceptBrief,
  CUSTOM_HTML_LIMITS,
  type CustomHtml,
  customHtmlFontFamilies,
  type DesignableExperienceType,
  type DesignFont,
  type ExperienceContent,
  supportsCustomHtml,
} from "@kardo/contracts";
import { stableKey } from "../../../lib/history.js";

/**
 * Modo HTML del Estudio: the customer's own HTML and CSS (`content.customHtml`).
 * Pure helpers shared by the Estudio, its pages and the tests: creating the
 * source on first use, the active switch, dirty checks, what may be saved
 * and the checks before saving. The source is kept as written; it is always
 * sanitized (by `@kardo/page-render`) before it is previewed or published.
 */

export type StudioMode = "blocks" | "html";

/** The source the first time HTML mode opens: empty and not shown yet. */
export function emptyCustomHtml(): CustomHtml {
  return { schema: 1, active: false, html: "", css: "" };
}

export function contentCustomHtml(
  content: ExperienceContent,
): CustomHtml | null {
  return (content as { customHtml?: CustomHtml }).customHtml ?? null;
}

/** Sets or removes `customHtml` without ever writing an explicit `undefined`. */
export function withCustomHtml(
  content: ExperienceContent,
  customHtml: CustomHtml | null,
): ExperienceContent {
  const { customHtml: _previous, ...rest } = content as ExperienceContent & {
    customHtml?: CustomHtml;
  };
  return (customHtml ? { ...rest, customHtml } : rest) as ExperienceContent;
}

/** A brief nobody filled in (nothing worth keeping). */
export function isBriefEmpty(brief: ConceptBrief | undefined): boolean {
  if (!brief) return true;
  return (
    !brief.description.trim() &&
    !brief.tone?.trim() &&
    brief.colors.length === 0 &&
    brief.imageRefs.length === 0 &&
    brief.fonts.length === 0
  );
}

/** Untouched source (empty, inactive, no concept) is the same as none. */
export function isCustomHtmlBlank(value: CustomHtml | null): boolean {
  return (
    value === null ||
    (!value.active &&
      !value.html.trim() &&
      !value.css.trim() &&
      isBriefEmpty(value.brief))
  );
}

/** What a dirty check compares: blank source counts as no source. */
function comparable(value: CustomHtml | null): unknown {
  if (isCustomHtmlBlank(value) || value === null) return null;
  const { brief, ...rest } = value;
  return isBriefEmpty(brief) ? rest : value;
}

export function customHtmlChanged(
  saved: CustomHtml | null,
  current: CustomHtml | null,
): boolean {
  return stableKey(comparable(saved)) !== stableKey(comparable(current));
}

/** The mode the Estudio opens in. */
export function initialStudioMode(
  saved: CustomHtml | null,
  hasSavedDesign: boolean,
): StudioMode {
  if (!saved || isCustomHtmlBlank(saved)) return "blocks";
  // Active HTML is what the page shows; saved but inactive HTML on a page
  // without a blocks design is where the person was working.
  return saved.active || !hasSavedDesign ? "html" : "blocks";
}

/** Turns the page's HTML on or off; the source is always kept. */
export function setCustomHtmlActive(
  value: CustomHtml,
  active: boolean,
): CustomHtml {
  return { ...value, active };
}

/**
 * Editors may design with blocks but never change the HTML (the API
 * refuses it); owners and admins may. Mirrors the server rule.
 */
export function canSaveCustomHtml(
  canEditCustomHtml: boolean,
  saved: CustomHtml | null,
  current: CustomHtml | null,
): boolean {
  return canEditCustomHtml || !customHtmlChanged(saved, current);
}

/** A brief exactly as it is sent: trimmed, lowercase colors, no repeats.
 * Shared by `prepareCustomHtml` (modo HTML) and the AI-in-blocks requests
 * (a full design or one `html` block), which send a bare `ConceptBrief`. */
export function prepareBrief(brief: ConceptBrief): ConceptBrief {
  const tone = brief.tone?.trim();
  return {
    description: brief.description.trim(),
    ...(tone ? { tone } : {}),
    colors: brief.colors.map((color) => color.toLowerCase()),
    imageRefs: [...new Set(brief.imageRefs)],
    fonts: [...new Set(brief.fonts)],
  };
}

/** The source exactly as it is sent: trimmed brief, no empty optionals. */
export function prepareCustomHtml(value: CustomHtml): CustomHtml {
  const { brief, ...rest } = value;
  if (!brief || isBriefEmpty(brief)) return rest;
  return { ...rest, brief: prepareBrief(brief) };
}

export type CustomHtmlIssue = {
  message: string;
  /** Where to send the person to fix it. */
  area: "code" | "concept";
};

/** Checks before saving (the contract's limits and the brief's rules). */
export function validateCustomHtml(value: CustomHtml): CustomHtmlIssue[] {
  const issues: CustomHtmlIssue[] = [];
  if (value.html.length > CUSTOM_HTML_LIMITS.html)
    issues.push({
      area: "code",
      message: `Tu HTML pasa del límite de ${formatCount(CUSTOM_HTML_LIMITS.html)} caracteres. Quita secciones o texto repetido.`,
    });
  if (value.css.length > CUSTOM_HTML_LIMITS.css)
    issues.push({
      area: "code",
      message: `Tu CSS pasa del límite de ${formatCount(CUSTOM_HTML_LIMITS.css)} caracteres. Quita reglas que no uses.`,
    });
  if (value.active && !value.html.trim())
    issues.push({
      area: "code",
      message:
        "Tu HTML está vacío. Escribe o pega tu código antes de activarlo en la página.",
    });
  const brief = value.brief;
  if (brief && !isBriefEmpty(brief)) {
    if (!brief.description.trim())
      issues.push({
        area: "concept",
        message:
          "En Tu concepto, describe cómo quieres tu página (o borra los colores, imágenes y tipografías que elegiste).",
      });
    if (brief.description.length > CUSTOM_HTML_LIMITS.briefDescription)
      issues.push({
        area: "concept",
        message: `La descripción de Tu concepto pasa de ${formatCount(CUSTOM_HTML_LIMITS.briefDescription)} caracteres.`,
      });
    if ((brief.tone?.length ?? 0) > 200)
      issues.push({
        area: "concept",
        message: "El tono de Tu concepto pasa de 200 caracteres.",
      });
    if (brief.colors.length > CUSTOM_HTML_LIMITS.briefColors)
      issues.push({
        area: "concept",
        message: `Tu concepto admite hasta ${CUSTOM_HTML_LIMITS.briefColors} colores.`,
      });
    if (brief.imageRefs.length > CUSTOM_HTML_LIMITS.briefImages)
      issues.push({
        area: "concept",
        message: `Tu concepto admite hasta ${CUSTOM_HTML_LIMITS.briefImages} imágenes.`,
      });
    if (brief.fonts.length > 2)
      issues.push({
        area: "concept",
        message: "Tu concepto admite hasta 2 tipografías.",
      });
  }
  return issues;
}

/** A brief being written (the description may still be empty). */
export function emptyBrief(): ConceptBrief {
  return { description: "", colors: [], imageRefs: [], fonts: [] };
}

/** Whether Kardo's AI (and the prompt) can work from this brief. */
export function briefReady(brief: ConceptBrief | undefined): boolean {
  return Boolean(brief?.description.trim());
}

/** The webfonts a custom page may name (served by Kardo). */
export const customHtmlFonts = Object.keys(
  customHtmlFontFamilies,
) as DesignFont[];

export function formatCount(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}

/** The insertable Kardo widgets for a page type. */
export function widgetsFor(
  type: DesignableExperienceType,
): ("kardo-links" | "kardo-socials" | "kardo-profile")[] {
  // The other types use `html` blocks, which have no widgets.
  if (!supportsCustomHtml(type)) return [];
  return type === "linkpage"
    ? ["kardo-profile", "kardo-links", "kardo-socials"]
    : ["kardo-links"];
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * "Empezar con una base": the smallest page that publishes as is. The page's
 * widgets (links, and on a Link page the profile and the socials) and a
 * short CSS to build on.
 */
export function starterCode(
  type: DesignableExperienceType,
  title: string,
): { html: string; css: string } {
  const heading =
    type === "linkpage"
      ? ""
      : `  <h1>${escapeText(title.trim() || "Mi negocio")}</h1>\n`;
  const widgets = widgetsFor(type)
    .map((tag) => `  <${tag}></${tag}>\n`)
    .join("");
  return {
    html: `<main class="pagina">\n${heading}${widgets}</main>\n`,
    css: [
      ".pagina {",
      "  display: grid;",
      "  gap: 24px;",
      "  max-width: 480px;",
      "  margin: 0 auto;",
      "  padding: 48px 20px;",
      '  font-family: "Geist", sans-serif;',
      "  text-align: center;",
      "}",
      "",
      ...(heading
        ? ["h1 {", "  margin: 0;", "  font-size: 28px;", "}", ""]
        : []),
    ].join("\n"),
  };
}

/** The token that places a library image in the HTML or the CSS. */
export function imageSnippet(
  assetId: string,
  target: "html" | "css",
  /** Starts the alt text (the image's readable file name); edit it after. */
  alt = "",
): string {
  const escapedAlt = alt
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  return target === "html"
    ? `<img src="kardo-asset:${assetId}" alt="${escapedAlt}">`
    : `url(kardo-asset:${assetId})`;
}
