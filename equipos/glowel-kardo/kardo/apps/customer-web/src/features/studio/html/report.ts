import type { CssRemoval, SanitizeReport } from "@kardo/page-render";
import { countLabel } from "../../../lib/text.js";

/**
 * The sanitizer's report, in words a business owner understands: what was
 * removed from the HTML and CSS before publishing, and why. The panel only
 * depends on `StudioReport`; `normalizeReport` maps the report of
 * `prepareCustomHtml` (@kardo/page-render) into it.
 */

export const reportKinds = [
  "script",
  "event-handler",
  "embed",
  "form",
  "external-image",
  "unsafe-link",
  "css-import",
  "css-font-face",
  "css-external-url",
  "css-position",
  "css-expression",
  "css-scope",
  "css-rejected",
  "element",
  "attribute",
] as const;
export type ReportKind = (typeof reportKinds)[number];

export type ReportItem = {
  kind: ReportKind;
  count: number;
  /** Tag or attribute names, e.g. ["onclick"] or ["marquee"]. */
  examples?: string[];
};

export type StudioReport = { items: ReportItem[] };

export const emptyReport: StudioReport = { items: [] };

export type ReportReason =
  | "javascript"
  | "images"
  | "links"
  | "embeds"
  | "fonts"
  | "position"
  | "css"
  | "allowlist";

const kindReason: Record<ReportKind, ReportReason> = {
  script: "javascript",
  "event-handler": "javascript",
  "css-expression": "javascript",
  embed: "embeds",
  form: "embeds",
  "external-image": "images",
  "css-external-url": "images",
  "unsafe-link": "links",
  "css-import": "fonts",
  "css-font-face": "fonts",
  "css-position": "position",
  "css-scope": "css",
  "css-rejected": "css",
  element: "allowlist",
  attribute: "allowlist",
};

export const reasonCopy: Record<ReportReason, { title: string; why: string }> =
  {
    javascript: {
      title: "Sin JavaScript",
      why: "Las páginas de Kardo nunca ejecutan código: así ningún visitante corre riesgos.",
    },
    images: {
      title: "Solo imágenes de tu biblioteca",
      why: "Usa kardo-asset: con imágenes que subiste a Kardo; las de otros sitios no se cargan.",
    },
    links: {
      title: "Solo enlaces seguros",
      why: "Los enlaces deben empezar con https://, mailto: o tel:.",
    },
    embeds: {
      title: "Sin incrustaciones ni formularios",
      why: "Iframes, video, audio y formularios no se publican en el HTML propio.",
    },
    fonts: {
      title: "Solo las fuentes de Kardo",
      why: "Kardo sirve Geist, DM Sans, Poppins, Playfair Display, Lora y Space Grotesk; nómbralas en font-family.",
    },
    position: {
      title: "Nada fijo en la pantalla",
      why: "position: fixed y sticky se quitan para que tu página no tape el pie de Kardo.",
    },
    css: {
      title: "CSS solo para tu página",
      why: "Tu CSS se aplica solo dentro de tu diseño y no puede salir de él (:host-context). Si trae algo que no se puede revisar, como escapes en nombres de funciones o reglas, Kardo no usa nada de ese CSS: quita eso y vuelve a pegarlo.",
    },
    allowlist: {
      title: "Etiquetas y atributos fuera de la lista",
      why: "Solo se publican las etiquetas y atributos que Kardo permite.",
    },
  };

const plural = countLabel;

/** "3 atributos onclick", "1 imagen externa", "2 scripts"… */
export function describeItem(item: ReportItem): string {
  const { count } = item;
  const names = [...new Set(item.examples ?? [])];
  const named = (one: string, many: string) =>
    names.length === 1
      ? `${plural(count, one, many)} ${names[0]}`
      : names.length > 1
        ? `${plural(count, one, many)} (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""})`
        : plural(count, one, many);
  switch (item.kind) {
    case "script":
      return plural(count, "script", "scripts");
    case "event-handler":
      return names.length
        ? named("atributo", "atributos")
        : plural(count, "atributo de evento", "atributos de evento");
    case "embed":
      return names.length
        ? named("elemento", "elementos")
        : plural(count, "incrustación", "incrustaciones");
    case "form":
      return plural(count, "elemento de formulario", "elementos de formulario");
    case "external-image":
      return plural(count, "imagen externa", "imágenes externas");
    case "unsafe-link":
      return plural(count, "enlace no seguro", "enlaces no seguros");
    case "css-import":
      return plural(count, "@import", "@import");
    case "css-font-face":
      return plural(count, "@font-face", "@font-face");
    case "css-external-url":
      return plural(count, "url() externa en CSS", "url() externas en CSS");
    case "css-position":
      return plural(count, "posición fija", "posiciones fijas");
    case "css-expression":
      return plural(count, "expresión de CSS", "expresiones de CSS");
    case "css-scope":
      return plural(count, "regla :host-context", "reglas :host-context");
    case "css-rejected":
      return "todo tu CSS, porque trae algo que no se puede revisar";
    case "element":
      return names.length
        ? named("etiqueta", "etiquetas")
        : plural(count, "etiqueta no permitida", "etiquetas no permitidas");
    case "attribute":
      return names.length
        ? named("atributo", "atributos")
        : plural(count, "atributo no permitido", "atributos no permitidos");
  }
}

/** "Quitamos lo que no se puede publicar: 2 scripts, 3 atributos onclick…" */
export function reportSummary(report: StudioReport): string | null {
  const items = sortedItems(report);
  if (!items.length) return null;
  const parts = items.map(describeItem);
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
  return `Quitamos lo que no se puede publicar: ${list}.`;
}

function sortedItems(report: StudioReport): ReportItem[] {
  return report.items
    .filter((item) => item.count > 0)
    .sort((a, b) => reportKinds.indexOf(a.kind) - reportKinds.indexOf(b.kind));
}

/** The report grouped by reason, in a stable order, for the detail list. */
export function reportGroups(
  report: StudioReport,
): { reason: ReportReason; items: ReportItem[] }[] {
  const groups = new Map<ReportReason, ReportItem[]>();
  for (const item of sortedItems(report)) {
    const reason = kindReason[item.kind];
    groups.set(reason, [...(groups.get(reason) ?? []), item]);
  }
  return [...groups].map(([reason, items]) => ({ reason, items }));
}

// ---------------------------------------------------------------------------
// From the sanitizer's own report
// ---------------------------------------------------------------------------

const scriptTags = new Set(["script", "noscript"]);
const embedTags = new Set([
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "portal",
  "video",
  "audio",
  "source",
  "track",
  "canvas",
  "noembed",
  "noframes",
]);
const formTags = new Set([
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
]);

function tagKind(tag: string): ReportKind {
  if (scriptTags.has(tag)) return "script";
  if (embedTags.has(tag)) return "embed";
  if (formTags.has(tag)) return "form";
  return "element";
}

const cssKind: Record<CssRemoval, ReportKind> = {
  import: "css-import",
  namespace: "css-import",
  "font-face": "css-font-face",
  "host-context": "css-scope",
  position: "css-position",
  "external-url": "css-external-url",
  expression: "css-expression",
  binding: "css-expression",
  stylesheet: "css-rejected",
};

/**
 * `prepareCustomHtml`'s report → `StudioReport`. A blocked `href`/`src` is
 * counted once, as an unsafe link or external image (the sanitizer also
 * lists it among removed attributes); same-kind entries are merged.
 */
export function normalizeReport(
  report: SanitizeReport | undefined,
): StudioReport {
  if (!report) return emptyReport;
  const merged = new Map<ReportKind, ReportItem>();
  const add = (kind: ReportKind, count: number, example?: string) => {
    if (count <= 0) return;
    const known = merged.get(kind);
    if (!known)
      merged.set(kind, {
        kind,
        count,
        ...(example ? { examples: [example] } : {}),
      });
    else {
      known.count += count;
      if (example) known.examples = [...(known.examples ?? []), example];
    }
  };
  for (const [tag, count] of Object.entries(report.removedTags)) {
    const kind = tagKind(tag);
    add(kind, count, kind === "script" ? undefined : tag);
  }
  for (const [name, count] of Object.entries(report.removedAttributes)) {
    if (name === "href" || name === "src") continue;
    add(/^on[a-z]+$/i.test(name) ? "event-handler" : "attribute", count, name);
  }
  add("unsafe-link", report.blockedLinks);
  add("external-image", report.blockedImages);
  const css = report.removedCss ?? {};
  if (css.stylesheet) add("css-rejected", 1);
  else
    for (const [reason, count] of Object.entries(css) as [CssRemoval, number][])
      add(cssKind[reason], count);
  return { items: [...merged.values()] };
}
