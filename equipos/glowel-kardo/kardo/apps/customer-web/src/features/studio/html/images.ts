import { customHtmlImagePlaceholderPattern } from "@kardo/contracts";

/**
 * Imágenes del modo HTML. The page only shows library images, written as
 * `kardo-asset:<uuid>` (the preview resolves them, the Publisher swaps the
 * uuid for the file's hash). Everything else in an `<img src>` or a CSS
 * `url()` (the AI's numbered placeholders, `logo.png`, `https://…`, `data:`)
 * is removed by the sanitizer, so the Estudio lists it as "por conectar"
 * and swaps it for a library image in one step. Pure string work over the
 * source as written (before it is sanitized), shared with the tests.
 */

export type ImageSource = { html: string; css: string };

/** What an image that is not connected yet points to. */
export type ImageSlotKind =
  | "placeholder"
  | "file"
  | "external"
  | "embedded"
  | "broken"
  | "empty";

export type ImageSlot = {
  /** The value exactly as written (trimmed). */
  value: string;
  kind: ImageSlotKind;
  /** Times it appears in the HTML and the CSS. */
  count: number;
  /** The first non-empty `alt` of an `<img>` that uses it. */
  alt: string | null;
};

type Occurrence = {
  where: "html" | "css";
  /** Offsets of the raw value (inside its quotes) in its source. */
  start: number;
  end: number;
  value: string;
  alt: string | null;
};

const assetTokenPattern =
  /^kardo-asset:(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-f0-9]{64})$/;

/** A reference the sanitizer keeps: exactly `kardo-asset:<uuid or sha256>`. */
export function isKardoAssetValue(value: string): boolean {
  return assetTokenPattern.test(value.trim());
}

export function kardoAssetValue(assetId: string): string {
  return `kardo-asset:${assetId}`;
}

// A start tag, with quoted values that may hold ">".
const tagPattern = /<([a-z][a-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
// name, then optionally `=` and a double-quoted, single-quoted or bare value.
const attributePattern =
  /([^\s"'<>/=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
// url( "…" | '…' | bare ), any case.
const urlPattern = /url\(\s*("[^"]*"|'[^']*'|[^)\s"']*)\s*\)/gi;

function unquoted(raw: string): { text: string; offset: number } {
  const quote = raw[0];
  return (quote === '"' || quote === "'") && raw.endsWith(quote)
    ? { text: raw.slice(1, -1), offset: 1 }
    : { text: raw, offset: 0 };
}

/**
 * A url() that holds an image: not a font (`@font-face` src, .woff…), not
 * an `@import`, not an SVG reference (`url(#clip)`).
 */
function holdsImage(text: string, at: number, value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return false;
  if (/\.(?:woff2?|ttf|otf|eot)(?:[?#].*)?$/i.test(trimmed)) return false;
  const before = text.slice(Math.max(0, at - 400), at);
  const statement = before.slice(
    Math.max(
      before.lastIndexOf(";"),
      before.lastIndexOf("{"),
      before.lastIndexOf("}"),
    ) + 1,
  );
  return !/@import|@namespace|^\s*src\s*:/i.test(statement);
}

function urlOccurrences(
  text: string,
  base: number,
  where: "html" | "css",
): Occurrence[] {
  const found: Occurrence[] = [];
  for (const match of text.matchAll(urlPattern)) {
    const raw = match[1] ?? "";
    const opening = /^url\(\s*/i.exec(match[0])?.[0].length ?? 4;
    const inner = unquoted(raw);
    if (!holdsImage(text, match.index ?? 0, inner.text)) continue;
    const start = base + (match.index ?? 0) + opening + inner.offset;
    found.push({
      where,
      start,
      end: start + inner.text.length,
      value: inner.text,
      alt: null,
    });
  }
  return found;
}

function htmlOccurrences(html: string): Occurrence[] {
  const found: Occurrence[] = [];
  for (const tag of html.matchAll(tagPattern)) {
    const name = (tag[1] ?? "").toLowerCase();
    const body = tag[2] ?? "";
    const bodyStart = (tag.index ?? 0) + 1 + (tag[1]?.length ?? 0);
    let src: Omit<Occurrence, "alt"> | null = null;
    let alt: string | null = null;
    for (const attribute of body.matchAll(attributePattern)) {
      const rawValue = attribute[3];
      if (rawValue === undefined) continue;
      const attributeName = (attribute[1] ?? "").toLowerCase();
      const inner = unquoted(rawValue);
      const start =
        bodyStart +
        (attribute.index ?? 0) +
        (attribute[1]?.length ?? 0) +
        (attribute[2]?.length ?? 0) +
        inner.offset;
      if (attributeName === "style")
        found.push(...urlOccurrences(inner.text, start, "html"));
      else if (name === "img" && attributeName === "src" && !src)
        src = {
          where: "html",
          start,
          end: start + inner.text.length,
          value: inner.text,
        };
      else if (name === "img" && attributeName === "alt" && alt === null)
        alt = inner.text.trim() || null;
    }
    if (src) found.push({ ...src, alt });
  }
  return found;
}

/** Every image reference in the source that is not a valid library image. */
function unconnected(source: ImageSource): Occurrence[] {
  return [
    ...htmlOccurrences(source.html),
    ...urlOccurrences(source.css, 0, "css"),
  ].filter((item) => !isKardoAssetValue(item.value));
}

export function imageSlotKind(value: string): ImageSlotKind {
  if (!value) return "empty";
  if (customHtmlImagePlaceholderPattern.test(value)) return "placeholder";
  if (/^data:/i.test(value)) return "embedded";
  if (/^(?:https?:)?\/\//i.test(value)) return "external";
  if (/^kardo-asset:/i.test(value)) return "broken";
  return "file";
}

function placeholderNumber(value: string): number {
  return Number(/\d+/.exec(value)?.[0] ?? 0);
}

/**
 * "Imágenes por conectar": each distinct value once, with how many times it
 * appears and the `alt` that describes it. The AI's placeholders come
 * first, in their order (imagen-1, imagen-2 … imagen-10); the rest in the
 * order they appear.
 */
export function findImageSlots(source: ImageSource): ImageSlot[] {
  const slots = new Map<string, ImageSlot>();
  for (const item of unconnected(source)) {
    const value = item.value.trim();
    const known = slots.get(value);
    if (known) {
      known.count += 1;
      known.alt ??= item.alt;
    } else
      slots.set(value, {
        value,
        kind: imageSlotKind(value),
        count: 1,
        alt: item.alt,
      });
  }
  const list = [...slots.values()];
  const placeholders = list
    .filter((slot) => slot.kind === "placeholder")
    .sort((a, b) => placeholderNumber(a.value) - placeholderNumber(b.value));
  return [
    ...placeholders,
    ...list.filter((slot) => slot.kind !== "placeholder"),
  ];
}

function replaceAt(
  text: string,
  spans: readonly Occurrence[],
  replacement: string,
): string {
  let result = text;
  for (const span of [...spans].sort((a, b) => b.start - a.start))
    result = result.slice(0, span.start) + replacement + result.slice(span.end);
  return result;
}

/**
 * Connects a slot: every exact appearance of `value` in an `<img src>`, a
 * `style` url() or a CSS url() becomes `kardo-asset:<assetId>`, keeping its
 * quotes. Other text and valid library images are never touched.
 */
export function connectImageSlot(
  source: ImageSource,
  value: string,
  assetId: string,
): ImageSource {
  const target = value.trim();
  const matches = unconnected(source).filter(
    (item) => item.value.trim() === target,
  );
  const token = kardoAssetValue(assetId);
  return {
    html: replaceAt(
      source.html,
      matches.filter((item) => item.where === "html"),
      token,
    ),
    css: replaceAt(
      source.css,
      matches.filter((item) => item.where === "css"),
      token,
    ),
  };
}

/** A short, readable name for a slot (a `data:` image is never spelled out). */
export function imageSlotLabel(
  slot: Pick<ImageSlot, "value" | "kind">,
): string {
  switch (slot.kind) {
    case "embedded":
      return "Imagen incrustada";
    case "empty":
      return "Imagen sin archivo";
    case "external": {
      const match =
        /^(?:https?:)?\/\/([^/?#]+)[^?#]*?([^/?#]*)(?:[?#].*)?$/i.exec(
          slot.value,
        );
      const host = match?.[1] ?? "";
      const file = match?.[2] ?? "";
      return file ? `${host}/…/${file}` : host || slot.value;
    }
    default:
      return slot.value.length > 60
        ? `${slot.value.slice(0, 57)}…`
        : slot.value;
  }
}

/** Labels for a list of slots: several `data:` images are numbered. */
export function imageSlotLabels(
  slots: readonly ImageSlot[],
): Map<string, string> {
  const embedded = slots.filter((slot) => slot.kind === "embedded");
  return new Map(
    slots.map((slot) => [
      slot.value,
      slot.kind === "embedded" && embedded.length > 1
        ? `Imagen incrustada ${embedded.indexOf(slot) + 1}`
        : imageSlotLabel(slot),
    ]),
  );
}

/** What each kind means, in plain words. */
export const imageSlotKindCopy: Record<ImageSlotKind, string> = {
  placeholder: "Marcador de la IA",
  file: "Archivo que no está en Kardo",
  external: "Imagen de otro sitio",
  embedded: "Imagen dentro del código",
  broken: "Referencia a Archivos no válida",
  empty: "Sin archivo",
};
