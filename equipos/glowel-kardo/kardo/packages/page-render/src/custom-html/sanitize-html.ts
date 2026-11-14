import {
  customHtmlAllowedTags,
  customHtmlGlobalAttributes,
  customHtmlTagAttributes,
} from "@kardo/contracts";
import type { DefaultTreeAdapterTypes, Token } from "parse5";
import {
  defaultTreeAdapter,
  html as parse5Html,
  parseFragment,
  serialize,
} from "parse5";
import { bump, emptyReport, type SanitizeReport } from "./report.js";
import { sanitizeDeclarationList } from "./sanitize-css.js";
import {
  kardoAssetToken,
  kardoLinkToken,
  parseKardoAssetToken,
  parseKardoLinkToken,
} from "./tokens.js";

type Attribute = Token.Attribute;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;

const NS = parse5Html.NS;

// ---------------------------------------------------------------------------
// Tag classification. `ALLOWED_TAGS` is exactly `customHtmlAllowedTags` (the
// contract the AI prompt is told, too). Tags parsed into the SVG namespace
// only count as allowed when they are genuinely inside an `<svg>` — a bare
// `<title>`/`<path>` typed outside any `<svg>` parses into the HTML
// namespace instead, and is treated like any other unknown tag (unwrapped).
// `DROP_ENTIRELY_TAGS` are never unwrapped — the tag AND its content
// (including any raw/RCDATA text parse5 captured for script/style/template)
// are removed outright, per the spec's explicit callout for these.
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set<string>(customHtmlAllowedTags);
const SVG_ONLY_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "title",
]);
const DROP_ENTIRELY_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "link",
  "meta",
  "base",
  "template",
  "noscript",
  "noframes",
  "noembed",
  "xmp",
  "plaintext",
  // SVG vectors explicitly called out (ADR 018): none of these are in
  // ALLOWED_TAGS either, but they must be dropped whole, never unwrapped —
  // `<use>`/`<image>` can load external content, `<animate*>`/`<set>` are
  // SMIL, all outside this package's control once in the DOM.
  "foreignobject",
  "use",
  "image",
  "animate",
  "animatetransform",
  "animatemotion",
  "animatecolor",
  "set",
]);

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const tokenPattern = /^[A-Za-z0-9_-]+$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally rejecting control characters (mirrors services/customer-api/src/assets.ts and apps/customer-web's qr-design.ts).
const controlCharPattern = /[\u0000-\u001f\u007f]/;

function sanitizeGenericText(value: string, maxLength: number): string | null {
  if (value.length === 0 || value.length > maxLength) return null;
  if (controlCharPattern.test(value)) return null;
  return value;
}

function sanitizeSingleToken(value: string): string | null {
  return tokenPattern.test(value) ? value : null;
}

function sanitizeTokenList(value: string): string | null {
  const tokens = value
    .split(/\s+/)
    .filter((t) => t.length > 0 && tokenPattern.test(t));
  return tokens.length > 0 ? tokens.join(" ") : null;
}

/** Reserve `id`s already used by a `kardo-link:<id>` token in the raw source
 * (a second `prepareCustomHtml` pass over already-tokenized output, or a
 * customer who typed one verbatim) so newly assigned ids never collide with
 * one this same pass leaves untouched. */
function reservedLinkIds(source: string): Set<string> {
  const ids = new Set<string>();
  const pattern = /kardo-link:(h[1-9][0-9]*)/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    const id = match[1];
    if (id) ids.add(id);
    match = pattern.exec(source);
  }
  return ids;
}

export type HtmlSanitizeResult = {
  html: string;
  links: { id: string; url: string }[];
  imageRefs: string[];
  report: SanitizeReport;
};

/**
 * Sanitizes raw customer HTML against exactly `@kardo/contracts`'s
 * `customHtmlAllowedTags`/`customHtmlGlobalAttributes`/
 * `customHtmlTagAttributes`, and tokenizes every allowed `<a href="https://…">`
 * into `href="kardo-link:<id>"` (same URL → same id; mailto:/tel:/#fragment
 * stay literal) and every `<img src="kardo-asset:<ref>">` src is validated
 * (kept as-is — the Publisher rewrites the ref to a content hash later).
 *
 * Uses parse5 (a real, spec-compliant HTML5 tokenizer/tree builder) rather
 * than regexes over raw text: `<script>`/`<style>`/`<template>` content is
 * parsed as opaque raw text per the HTML spec (so a `</style><script>`
 * breakout attempt never re-enters element parsing), SVG foreign-content
 * rules correctly namespace `<title>`/`<path>`/… only inside a real `<svg>`,
 * and malformed/unclosed markup is recovered the same way a browser would,
 * rather than however a hand-rolled regex happens to guess.
 */
export function sanitizeAndTokenizeHtml(source: string): HtmlSanitizeResult {
  const report = emptyReport();
  const linkIdByUrl = new Map<string, string>();
  const links: { id: string; url: string }[] = [];
  const imageRefs = new Set<string>();
  const reserved = reservedLinkIds(source);
  let counter = 1;

  function nextLinkId(): string {
    let id = `h${counter}`;
    while (reserved.has(id)) {
      counter += 1;
      id = `h${counter}`;
    }
    reserved.add(id);
    counter += 1;
    return id;
  }

  /** `null` return means "drop the attribute"; every branch that rejects
   * bumps `report.blockedLinks` so the panel can tell the customer a link
   * was removed rather than just silently vanishing. */
  function resolveHref(rawValue: string): string | null {
    const value = rawValue.trim();
    if (value.length === 0 || value.length > 2048) {
      report.blockedLinks += 1;
      return null;
    }
    if (parseKardoLinkToken(value)) return value; // already tokenized: pass through
    if (/^#[A-Za-z0-9_-]{1,200}$/.test(value)) return value;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      report.blockedLinks += 1;
      return null;
    }
    if (parsed.username || parsed.password) {
      report.blockedLinks += 1;
      return null;
    }
    if (parsed.protocol === "mailto:" || parsed.protocol === "tel:")
      return value;
    if (parsed.protocol !== "https:") {
      report.blockedLinks += 1;
      return null;
    }
    let id = linkIdByUrl.get(value);
    if (!id) {
      id = nextLinkId();
      linkIdByUrl.set(value, id);
      links.push({ id, url: value });
    }
    return kardoLinkToken(id);
  }

  function resolveSrc(rawValue: string): string | null {
    const ref = parseKardoAssetToken(rawValue.trim());
    if (!ref) {
      report.blockedImages += 1;
      return null;
    }
    imageRefs.add(ref);
    return kardoAssetToken(ref);
  }

  function sanitizeAttributeValue(
    tagName: string,
    name: string,
    value: string,
  ): string | null {
    switch (name) {
      case "id":
        return sanitizeSingleToken(value);
      case "class":
        return sanitizeTokenList(value);
      case "style":
        return sanitizeDeclarationList(value, report.removedCss);
      case "width":
      case "height":
        if (tagName === "img") return /^[0-9]{1,4}$/.test(value) ? value : null;
        return /^[0-9]+(\.[0-9]+)?%?$/.test(value) ? value : null;
      case "colspan":
      case "rowspan":
        return /^[0-9]{1,3}$/.test(value) ? value : null;
      case "scope":
        return value === "row" ||
          value === "col" ||
          value === "rowgroup" ||
          value === "colgroup"
          ? value
          : null;
      case "loading":
        return value === "lazy" || value === "eager" ? value : null;
      case "decoding":
        return value === "sync" || value === "async" || value === "auto"
          ? value
          : null;
      case "datetime":
        return sanitizeGenericText(value, 64);
      case "alt":
        // alt="" is valid and meaningful: a decorative image.
        return value === "" ? "" : sanitizeGenericText(value, 300);
      case "open":
        return "";
      case "xmlns":
        return value === "http://www.w3.org/2000/svg" ? value : null;
      case "focusable":
      case "aria-hidden":
        return value === "true" || value === "false" ? value : null;
      case "viewBox":
      case "points":
      case "d":
        // Path/point data and viewBox are numeric-ish grammars; never allow
        // `url(` or any other character that could carry a scheme.
        return /^[0-9a-zA-Z\s,.-]+$/.test(value) && value.length <= 4000
          ? value
          : null;
      case "fill":
      case "stroke":
      case "transform":
      case "stroke-width":
      case "stroke-linecap":
      case "stroke-linejoin":
      case "fill-rule":
      case "clip-rule":
      case "opacity":
      case "cx":
      case "cy":
      case "r":
      case "rx":
      case "ry":
      case "x":
      case "y":
      case "x1":
      case "y1":
      case "x2":
      case "y2":
        // SVG presentation attributes: never allow `url(...)` (ADR 018 —
        // "SVG presentation attrs cannot contain url()"), otherwise a bounded
        // safe-charset check (never `<`, `>`, quotes or whitespace-only).
        if (value.length > 200) return null;
        if (/url\(/i.test(value)) return null;
        return /^[0-9a-zA-Z\s,.#%()-]*$/.test(value) ? value : null;
      default:
        if (name.startsWith("aria-") || name.startsWith("data-"))
          return sanitizeGenericText(value, 400);
        return sanitizeGenericText(value, 300);
    }
  }

  function sanitizeAttributes(
    tagName: string,
    attrs: Attribute[],
  ): Attribute[] {
    const allowedExtra = customHtmlTagAttributes[tagName] ?? [];
    const allowedSet = new Set<string>([
      ...customHtmlGlobalAttributes,
      ...allowedExtra,
    ]);
    const out: Attribute[] = [];
    let targetBlank = false;
    for (const attr of attrs) {
      const name = attr.name;
      if (name === "href" && tagName === "a") {
        const resolved = resolveHref(attr.value);
        if (resolved !== null) out.push({ name, value: resolved });
        else bump(report.removedAttributes, name);
        continue;
      }
      if (name === "src" && tagName === "img") {
        const resolved = resolveSrc(attr.value);
        if (resolved !== null) out.push({ name, value: resolved });
        else bump(report.removedAttributes, name);
        continue;
      }
      if (name === "target" && tagName === "a") {
        if (attr.value === "_blank") {
          targetBlank = true;
          out.push(attr);
        } else {
          bump(report.removedAttributes, name);
        }
        continue;
      }
      const isAria = name.startsWith("aria-");
      const isData = name.startsWith("data-");
      if (!allowedSet.has(name) && !isAria && !isData) {
        bump(report.removedAttributes, name);
        continue;
      }
      const sanitized = sanitizeAttributeValue(tagName, name, attr.value);
      if (sanitized === null) {
        bump(report.removedAttributes, name);
        continue;
      }
      out.push({ name, value: sanitized });
    }
    if (targetBlank)
      out.push({ name: "rel", value: "noopener noreferrer nofollow ugc" });
    return out;
  }

  function sanitizeChildren(nodes: ChildNode[]): ChildNode[] {
    const result: ChildNode[] = [];
    for (const node of nodes) {
      if (defaultTreeAdapter.isTextNode(node)) {
        result.push(node);
        continue;
      }
      if (defaultTreeAdapter.isCommentNode(node)) continue;
      if (!defaultTreeAdapter.isElementNode(node)) continue; // doctype, etc.

      const tagName = node.tagName.toLowerCase();

      if (DROP_ENTIRELY_TAGS.has(tagName)) {
        bump(report.removedTags, tagName);
        continue;
      }

      const svgOnly = SVG_ONLY_TAGS.has(tagName);
      const inSvgNamespace = node.namespaceURI === NS.SVG;
      const isAllowed =
        ALLOWED_TAGS.has(tagName) && (!svgOnly || inSvgNamespace);

      if (!isAllowed) {
        bump(report.removedTags, tagName);
        result.push(...sanitizeChildren(node.childNodes));
        continue;
      }

      const hadSrc = node.attrs.some((attr) => attr.name === "src");
      node.attrs = sanitizeAttributes(tagName, node.attrs);
      // An image with no library source would only show as a broken icon:
      // drop it (a blocked src is already counted in blockedImages).
      if (tagName === "img" && !node.attrs.some((a) => a.name === "src")) {
        if (!hadSrc) bump(report.removedTags, tagName);
        continue;
      }
      if (!VOID_ELEMENTS.has(tagName)) {
        node.childNodes = sanitizeChildren(node.childNodes);
      }
      result.push(node);
    }
    return result;
  }

  const fragment = parseFragment(source);
  fragment.childNodes = sanitizeChildren(fragment.childNodes);
  const html = serialize(fragment);
  return { html, links, imageRefs: [...imageRefs], report };
}
