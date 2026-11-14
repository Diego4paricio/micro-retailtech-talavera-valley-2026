import { customHtmlFontFamilies, type DesignFont } from "@kardo/contracts";
import * as csstree from "css-tree";
import type { DefaultTreeAdapterTypes } from "parse5";
import { defaultTreeAdapter, parseFragment, serialize } from "parse5";
import { escapeHtml } from "../escape.js";
import { fontFaceCss } from "../fonts.js";
import { footerCss, renderKardoFooter } from "../footer.js";
import { socialIcon, socialLabel } from "../icons.js";
import type { DesignableContent, RenderContext } from "../types.js";
import { safeHref } from "../url-safety.js";
import { type PreparedCustomHtml, prepareCustomHtml } from "./prepare.js";
import { parseKardoAssetToken, parseKardoLinkToken } from "./tokens.js";

type ChildNode = DefaultTreeAdapterTypes.ChildNode;

// ---------------------------------------------------------------------------
// Renders already-prepared "modo HTML" source (ADR 018, extended
// 2026-09-29): `prepareCustomHtml`'s tokenized output, with every
// `kardo-link:<id>`/`kardo-asset:<ref>` token substituted through `ctx`, and
// every `<kardo-links>`/`<kardo-socials>`/`<kardo-profile>` widget replaced
// with the platform's own markup for the bound content — same tracked
// clicks, same accessible structure as a designed page's bound blocks
// (`../blocks.ts`), just under neutral `k-*` class hooks instead of `kd-*`
// (this mode ships no base stylesheet at all — see `sanitizeAndTokenizeHtml`
// — every visual choice is the customer's own CSS).
// ---------------------------------------------------------------------------

function initials(displayName: string): string {
  const letters = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return (letters || displayName.slice(0, 1)).toUpperCase();
}

function widgetLinksHtml(
  content: DesignableContent,
  ctx: RenderContext,
  classAttr: string,
  extraAttrs: string,
): string {
  if (
    content.type !== "links" &&
    content.type !== "profile" &&
    content.type !== "linkpage"
  )
    return "";
  const links = content.links;
  if (links.length === 0) return "";
  const items = links
    .map((link) => {
      const highlight = "highlight" in link && link.highlight;
      const classes = `k-link${highlight ? " k-link--highlight" : ""}`;
      const href = safeHref(ctx.linkHref(link.id, link.url), "https");
      if (!href)
        return `<li><span class="${classes}">${escapeHtml(link.label)}</span></li>`;
      return `<li><a class="${classes}" href="${escapeHtml(href)}">${escapeHtml(link.label)}</a></li>`;
    })
    .join("");
  return `<ul class="k-links${classAttr}"${extraAttrs}>${items}</ul>`;
}

function widgetSocialsHtml(
  content: DesignableContent,
  ctx: RenderContext,
  classAttr: string,
  extraAttrs: string,
): string {
  if (content.type !== "linkpage" || content.socials.length === 0) return "";
  const items = content.socials
    .map((social) => {
      const label = escapeHtml(socialLabel(social.network));
      const href = safeHref(ctx.linkHref(social.id, social.value), "social");
      const newTab = social.network !== "email" && social.network !== "phone";
      if (!href)
        return `<li><span class="k-social" aria-label="${label}">${socialIcon(social.network)}</span></li>`;
      return `<li><a class="k-social" href="${escapeHtml(href)}" aria-label="${label}"${newTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${socialIcon(social.network)}</a></li>`;
    })
    .join("");
  return `<ul class="k-socials${classAttr}"${extraAttrs} aria-label="Redes sociales">${items}</ul>`;
}

function widgetProfileHtml(
  content: DesignableContent,
  ctx: RenderContext,
  classAttr: string,
  extraAttrs: string,
): string {
  if (content.type !== "profile" && content.type !== "linkpage") return "";
  const displayName = content.displayName;
  const avatarUrl = content.avatarRef
    ? ctx.resolveImage(content.avatarRef)
    : null;
  const avatar = avatarUrl
    ? `<img class="k-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}">`
    : `<div class="k-avatar k-avatar-initials" aria-hidden="true">${escapeHtml(initials(displayName))}</div>`;
  const headline =
    content.type === "profile" && content.headline
      ? `<p class="k-profile-headline">${escapeHtml(content.headline)}</p>`
      : "";
  const bio =
    content.type === "profile"
      ? content.biography
        ? `<p class="k-profile-bio">${escapeHtml(content.biography)}</p>`
        : ""
      : content.bio
        ? `<p class="k-profile-bio">${escapeHtml(content.bio)}</p>`
        : "";
  return `<div class="k-profile${classAttr}"${extraAttrs}>${avatar}<div class="k-profile-text"><h1 class="k-profile-name">${escapeHtml(displayName)}</h1>${headline}${bio}</div></div>`;
}

function renderWidget(
  tagName: string,
  attrs: DefaultTreeAdapterTypes.Element["attrs"],
  content: DesignableContent,
  ctx: RenderContext,
): string {
  const classValue = attrs.find((a) => a.name === "class")?.value;
  const idValue = attrs.find((a) => a.name === "id")?.value;
  const styleValue = attrs.find((a) => a.name === "style")?.value;
  const classAttr = classValue ? ` ${escapeHtml(classValue)}` : "";
  const extraAttrs =
    (idValue ? ` id="${escapeHtml(idValue)}"` : "") +
    (styleValue ? ` style="${escapeHtml(styleValue)}"` : "");
  switch (tagName) {
    case "kardo-links":
      return widgetLinksHtml(content, ctx, classAttr, extraAttrs);
    case "kardo-socials":
      return widgetSocialsHtml(content, ctx, classAttr, extraAttrs);
    case "kardo-profile":
      return widgetProfileHtml(content, ctx, classAttr, extraAttrs);
    default:
      return "";
  }
}

/** Resolves an already-sanitized `href` value (a `kardo-link:<id>` token,
 * `mailto:`/`tel:`, or `#fragment` — the only shapes `sanitizeAndTokenizeHtml`
 * ever leaves in place) to what actually gets served. `safeHref` is applied
 * even though the input already went through `prepareCustomHtml`: this
 * renders a `PreparedCustomHtml` the caller may have built directly (the
 * panel's live preview never calls `parsePublishedCustomHtml`), and
 * `ctx.linkHref` may itself return an unvalidated draft URL in that preview
 * context — see `RenderContext`'s own docs in `../types.ts`. */
function resolveRenderedHref(
  value: string,
  links: readonly { id: string; url: string }[],
  ctx: RenderContext,
): string | null {
  const linkId = parseKardoLinkToken(value);
  if (linkId) {
    const link = links.find((l) => l.id === linkId);
    if (!link) return null;
    return safeHref(ctx.linkHref(linkId, link.url), "https");
  }
  if (value.startsWith("mailto:") || value.startsWith("tel:")) {
    return safeHref(value, "social");
  }
  if (/^#[A-Za-z0-9_-]{1,200}$/.test(value)) return value;
  return null;
}

function substituteTree(
  nodes: ChildNode[],
  content: DesignableContent,
  ctx: RenderContext,
  links: readonly { id: string; url: string }[],
): ChildNode[] {
  const result: ChildNode[] = [];
  for (const node of nodes) {
    if (
      defaultTreeAdapter.isTextNode(node) ||
      defaultTreeAdapter.isCommentNode(node)
    ) {
      result.push(node);
      continue;
    }
    if (!defaultTreeAdapter.isElementNode(node)) continue;
    const tagName = node.tagName.toLowerCase();

    if (
      tagName === "kardo-links" ||
      tagName === "kardo-socials" ||
      tagName === "kardo-profile"
    ) {
      const markup = renderWidget(tagName, node.attrs, content, ctx);
      if (markup) result.push(...parseFragment(markup).childNodes);
      continue;
    }

    if (tagName === "a") {
      const hrefAttr = node.attrs.find((a) => a.name === "href");
      if (hrefAttr) {
        const resolved = resolveRenderedHref(hrefAttr.value, links, ctx);
        node.attrs = node.attrs.filter((a) => a.name !== "href");
        if (resolved) node.attrs.push({ name: "href", value: resolved });
      }
    }

    resolveStyleAttribute(node, ctx.resolveImage);

    if (tagName === "img") {
      const srcAttr = node.attrs.find((a) => a.name === "src");
      const ref = srcAttr ? parseKardoAssetToken(srcAttr.value) : null;
      const resolved = ref ? ctx.resolveImage(ref) : null;
      if (srcAttr && !resolved) continue; // missing → drop the img
      if (srcAttr && resolved) {
        node.attrs = node.attrs.map((a) =>
          a.name === "src" ? { name: "src", value: resolved } : a,
        );
      }
    }

    node.childNodes = substituteTree(node.childNodes, content, ctx, links);
    result.push(node);
  }
  return result;
}

/** Rewrites every `url(kardo-asset:<ref>)` in the sanitized CSS through
 * `ctx.resolveImage`. A declaration whose reference cannot be resolved is
 * dropped entirely (ADR 018 — "missing → drop … the url()"), never left
 * pointing at a dead `kardo-asset:` token. */
function substituteCssAssets(
  css: string,
  resolveImage: (ref: string) => string | null,
): string {
  if (!css) return "";
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(css, { positions: false, onParseError: () => {} });
  } catch {
    return "";
  }
  csstree.walk(ast, {
    visit: "Declaration",
    enter(node, item, list) {
      if (!list) return;
      let unresolved = false;
      csstree.walk(node.value, {
        visit: "Url",
        enter(urlNode) {
          const ref = parseKardoAssetToken(urlNode.value.trim());
          const resolved = ref ? resolveImage(ref) : null;
          if (resolved) urlNode.value = resolved;
          else unresolved = true;
        },
      });
      if (unresolved) list.remove(item);
    },
  });
  return csstree.generate(ast);
}

/** The same rewrite for a `style="..."` attribute, which the sanitizer lets
 * hold `url(kardo-asset:<ref>)` too (AI and pasted code often put a cover
 * there as `background-image`). Until 2026-10-02 only the stylesheet was
 * rewritten, so such a cover pointed at a dead token and drew nothing. */
function substituteStyleAttributeAssets(
  style: string,
  resolveImage: (ref: string) => string | null,
): string {
  const rule = substituteCssAssets(`a{${style}}`, resolveImage);
  return /^a\{([\s\S]*)\}$/.exec(rule)?.[1] ?? "";
}

/** Rewrites an element's `style` attribute through
 * `substituteStyleAttributeAssets` when it names a library image; drops the
 * attribute when nothing is left. */
function resolveStyleAttribute(
  node: { attrs: { name: string; value: string }[] },
  resolveImage: (ref: string) => string | null,
): void {
  const style = node.attrs.find((attr) => attr.name === "style");
  if (!style || !style.value.includes("kardo-asset:")) return;
  const next = substituteStyleAttributeAssets(style.value, resolveImage);
  node.attrs = node.attrs.filter((attr) => attr.name !== "style");
  if (next) node.attrs.push({ name: "style", value: next });
}

/** `@font-face` rules for the contract's webfonts (`customHtmlFontFamilies`)
 * actually named in the customer's CSS — a plain substring check against the
 * six known, fixed family strings, never a CSS parse: a false positive only
 * ever costs an unused `@font-face` rule, never a security concern. Exported
 * so a design's `html` block (`../blocks.ts`) can register the same fonts on
 * the page's own `usedFonts` list — a block's CSS lives in a shadow root,
 * where Chromium ignores `@font-face` entirely, so the rule has to be
 * declared page-wide instead (see `htmlBlockRenderer` below). */
export function usedCustomFonts(css: string): DesignFont[] {
  const used: DesignFont[] = [];
  for (const [key, familyName] of Object.entries(customHtmlFontFamilies)) {
    if (css.includes(familyName)) used.push(key as DesignFont);
  }
  return used;
}

/** `box-sizing: border-box` for everything inside the shadow root, as the
 * designed pages already have (`.kd-page *`, which does not cross into a
 * shadow root): with the browser's `content-box`, a `width:100%` button
 * with padding ran past the right edge of the phone (AI test bench,
 * 2026-10-02, most AI-written CSS assumes border-box). Zero specificity, so
 * any rule the customer writes still wins. */
const shadowBaseCss = ":where(*,*::before,*::after){box-sizing:border-box}";

/** Sensible defaults for the platform widgets (no bullets, spaced buttons,
 * sized icons and avatar). Zero specificity (`:where`), so any rule the
 * customer writes wins, even a bare `ul` or `a` selector. */
const widgetBaseCss =
  ":where(.k-links,.k-socials){list-style:none;margin:0;padding:0}" +
  ":where(.k-links){display:flex;flex-direction:column;gap:10px}" +
  ":where(.k-link){display:block;text-align:center;text-decoration:none;color:inherit}" +
  ":where(.k-socials){display:flex;flex-wrap:wrap;justify-content:center;gap:12px}" +
  ":where(.k-social){display:inline-flex;color:inherit}" +
  ":where(.k-social svg){width:24px;height:24px}" +
  ":where(.k-profile){display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}" +
  ":where(.k-avatar){width:96px;height:96px;border-radius:50%;object-fit:cover}" +
  ":where(.k-avatar-initials){display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.7rem;background:rgba(0,0,0,.06)}" +
  ":where(.k-profile-name,.k-profile-headline,.k-profile-bio){margin:0}";

function buildBodyAndCss(
  content: DesignableContent,
  prepared: Pick<PreparedCustomHtml, "html" | "css" | "links">,
  ctx: RenderContext,
): { bodyHtml: string; css: string; fontCss: string } {
  const fragment = parseFragment(prepared.html);
  fragment.childNodes = substituteTree(
    fragment.childNodes,
    content,
    ctx,
    prepared.links,
  );
  const bodyHtml = serialize(fragment);
  const css =
    shadowBaseCss +
    widgetBaseCss +
    substituteCssAssets(prepared.css, ctx.resolveImage);
  const fontCss = fontFaceCss(usedCustomFonts(prepared.css), ctx.fontBaseUrl);
  return { bodyHtml, css, fontCss };
}

/**
 * The public markup for a `customHtml`-designed page: a declarative shadow
 * root (`<template shadowrootmode="open">`, no script required to attach
 * it), so the customer's CSS is fully isolated from the rest of the page and
 * vice versa. The Kardo footer is deliberately NOT included here — the
 * Resolver's page shell (`services/resolver/src/render.ts`) appends it
 * outside this host, exactly as it already does for a designed page.
 *
 * The webfonts' `@font-face` rules go in the document, before the host:
 * Chromium ignores `@font-face` inside a shadow root, so declared there the
 * page silently fell back to the system fonts. The families are Kardo's
 * fixed six, so declaring them document-wide changes nothing else.
 */
export function renderCustomHtmlBody(
  content: DesignableContent,
  prepared: Pick<PreparedCustomHtml, "html" | "css" | "links">,
  ctx: RenderContext,
): string {
  const { bodyHtml, css, fontCss } = buildBodyAndCss(content, prepared, ctx);
  const fonts = fontCss ? `<style>${fontCss}</style>` : "";
  return `${fonts}<div class="kd-custom-host" style="display:block;width:100%;contain:layout paint;isolation:isolate"><template shadowrootmode="open"><style>${css}</style>${bodyHtml}</template></div>`;
}

/**
 * A full standalone `<!doctype html>` document — used both by the Resolver to
 * serve a modo HTML page and by the panel's sandboxed preview iframe: same
 * body as `renderCustomHtmlBody`, plus the Kardo "chip" footer outside the
 * shadow root (a translucent pill that reads over any background, since a
 * modo HTML page's own background is the customer's own CSS) and no scripts
 * anywhere.
 */
export function renderCustomHtmlDocument(
  content: DesignableContent,
  prepared: Pick<PreparedCustomHtml, "html" | "css" | "links">,
  ctx: RenderContext,
  options: { title: string },
): string {
  const body = renderCustomHtmlBody(content, prepared, ctx);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(options.title)}</title>
<style>html,body{margin:0}body{min-height:100dvh;display:flex;flex-direction:column;background:#f7f5f0}${footerCss}</style>
</head>
<body>
${body}
${renderKardoFooter("chip")}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// `html` block (addendum 3): the same sanitizer, rendered as one block inside
// a designed page rather than as the whole document. Unlike the full modo
// HTML document, a block has no bound content to show — the platform
// widgets (`<kardo-links>` and friends) are simply dropped — and its links
// are never tracked (like a `text` block's own `href`): a tokenized
// `kardo-link:<id>` is resolved straight back to its original https URL.
// ---------------------------------------------------------------------------

function stripWidgetsAndResolveLinks(
  nodes: ChildNode[],
  resolveImage: (ref: string) => string | null,
  links: readonly { id: string; url: string }[],
): ChildNode[] {
  const result: ChildNode[] = [];
  for (const node of nodes) {
    if (
      defaultTreeAdapter.isTextNode(node) ||
      defaultTreeAdapter.isCommentNode(node)
    ) {
      result.push(node);
      continue;
    }
    if (!defaultTreeAdapter.isElementNode(node)) continue;
    const tagName = node.tagName.toLowerCase();

    // No bound content inside a block: platform widgets are dropped rather
    // than left empty, so they never leave a stray wrapper element behind.
    if (
      tagName === "kardo-links" ||
      tagName === "kardo-socials" ||
      tagName === "kardo-profile"
    ) {
      continue;
    }

    if (tagName === "a") {
      const hrefAttr = node.attrs.find((a) => a.name === "href");
      if (hrefAttr) {
        const resolved = resolveBlockHref(hrefAttr.value, links);
        node.attrs = node.attrs.filter((a) => a.name !== "href");
        if (resolved) node.attrs.push({ name: "href", value: resolved });
      }
    }

    resolveStyleAttribute(node, resolveImage);

    if (tagName === "img") {
      const srcAttr = node.attrs.find((a) => a.name === "src");
      const ref = srcAttr ? parseKardoAssetToken(srcAttr.value) : null;
      const resolved = ref ? resolveImage(ref) : null;
      if (srcAttr && !resolved) continue; // missing → drop the img
      if (srcAttr && resolved) {
        node.attrs = node.attrs.map((a) =>
          a.name === "src" ? { name: "src", value: resolved } : a,
        );
      }
    }

    node.childNodes = stripWidgetsAndResolveLinks(
      node.childNodes,
      resolveImage,
      links,
    );
    result.push(node);
  }
  return result;
}

/** A block's links render as-is, untracked — a tokenized `kardo-link:<id>`
 * resolves back to its own original https URL rather than through
 * `ctx.linkHref`/`/go/{id}`; `mailto:`/`tel:`/`#fragment` pass through
 * unchanged, exactly as `prepareCustomHtml` already left them. */
function resolveBlockHref(
  value: string,
  links: readonly { id: string; url: string }[],
): string | null {
  const linkId = parseKardoLinkToken(value);
  if (linkId) {
    const link = links.find((l) => l.id === linkId);
    return link ? safeHref(link.url, "https") : null;
  }
  if (value.startsWith("mailto:") || value.startsWith("tel:")) {
    return safeHref(value, "social");
  }
  if (/^#[A-Za-z0-9_-]{1,200}$/.test(value)) return value;
  return null;
}

/**
 * Builds the renderer an `html` design block uses (`RenderContext.
 * renderHtmlBlock`, wired up by the Resolver and the panel's preview): cleans
 * `html`/`css` with the modo HTML sanitizer (`prepareCustomHtml`) and returns
 * a host with its own declarative shadow root, isolated from the rest of the
 * page — same shape as `renderCustomHtmlBody`, minus the platform widgets and
 * link tracking a whole-page modo HTML document gets. The page's own
 * `@font-face` rules still cover any of Kardo's webfonts the block's CSS
 * names (see `usedCustomFonts` above) — declaring them again inside this
 * shadow root would do nothing, Chromium ignores `@font-face` in one.
 */
export function htmlBlockRenderer(
  resolveImage: (ref: string) => string | null,
): (html: string, css: string) => string {
  return (html, css) => {
    const prepared = prepareCustomHtml({ html, css });
    const fragment = parseFragment(prepared.html);
    fragment.childNodes = stripWidgetsAndResolveLinks(
      fragment.childNodes,
      resolveImage,
      prepared.links,
    );
    const bodyHtml = serialize(fragment);
    const blockCss =
      shadowBaseCss + substituteCssAssets(prepared.css, resolveImage);
    return `<div class="kd-html-host" style="display:block;width:100%;contain:layout paint;isolation:isolate"><template shadowrootmode="open"><style>${blockCss}</style>${bodyHtml}</template></div>`;
  };
}
