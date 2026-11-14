import type {
  BlockStyle,
  DesignBlock,
  DesignBrand,
  DesignFont,
} from "@kardo/contracts";
import { blockStyleAttr, blockStyleDecls, styleAttr } from "./block-style.js";
import { renderBoundBlock } from "./bound.js";
import {
  type BrandInfo,
  brandLabelColor,
  designBrandInfo,
  neutralGlyphFill,
  socialBrandNetworks,
} from "./brands.js";
import { clampInt, pick } from "./css.js";
import { usedCustomFonts } from "./custom-html/render.js";
import { escapeHtml } from "./escape.js";
import { renderFeaturesBlock, renderGalleryBlock } from "./feature-gallery.js";
import { socialIcon, socialLabel } from "./icons.js";
import { placeholderClass, placeholderInnerHtml } from "./placeholder.js";
import {
  imageMaskClass,
  shapeFillDecl,
  shapeGeometryDecls,
  shapeStrokeDecl,
} from "./shapes.js";
import {
  type DesignableContent,
  plainPx,
  type RenderContext,
  type SocialNetwork,
} from "./types.js";
import { safeHref } from "./url-safety.js";

/** Tracks which webfonts a render actually used, so the caller only ever
 * pays for `@font-face` rules the page needs. */
export type FontUsage = { add: (font: DesignFont | undefined) => void };

function dataId(id: string): string {
  return ` data-block-id="${escapeHtml(id)}"`;
}

// ---------------------------------------------------------------------------
// Free blocks
// ---------------------------------------------------------------------------

function renderHeading(
  block: Extract<DesignBlock, { kind: "heading" }>,
  ctx: RenderContext,
): string {
  const level = block.level === 1 || block.level === 3 ? block.level : 2;
  const tag = `h${level}`;
  return `<${tag}${dataId(block.id)} class="kd-heading"${blockStyleAttr(block.style, ctx.px)}>${escapeHtml(block.text)}</${tag}>`;
}

function renderText(
  block: Extract<DesignBlock, { kind: "text" }>,
  ctx: RenderContext,
): string {
  const inner = block.runs
    .map((run) => {
      let text = escapeHtml(run.text);
      if (run.bold) text = `<strong>${text}</strong>`;
      if (run.italic) text = `<em>${text}</em>`;
      const href = run.href ? safeHref(run.href, "https") : null;
      if (href) {
        text = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${text}</a>`;
      }
      return text;
    })
    .join("");
  return `<p${dataId(block.id)} class="kd-text"${blockStyleAttr(block.style, ctx.px)}>${inner}</p>`;
}

const aspectRatios = {
  auto: "auto",
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "3:4": "3 / 4",
  "16:9": "16 / 9",
} as const;
const objectFits = { cover: "cover", contain: "contain" } as const;

function renderImage(
  block: Extract<DesignBlock, { kind: "image" }>,
  ctx: RenderContext,
): string {
  const maskClass = imageMaskClass(block.mask);
  const mediaStyle = styleAttr([
    `aspect-ratio:${pick(block.aspect, aspectRatios, aspectRatios.auto)}`,
    `object-fit:${pick(block.fit, objectFits, objectFits.cover)}`,
  ]);
  // "Sin banco de fotos" (2026-10-03): no imageRef at all is a deliberate
  // empty slot, not a broken reference. The panel's preview draws a dashed
  // "espacio para foto"; everywhere else (Publisher, Resolver, the public
  // page) the whole block draws nothing — see placeholder.ts's header.
  if (!block.imageRef) {
    if (!ctx.imagePlaceholders) return "";
    const media = `<div class="kd-image${placeholderClass(false)}${maskClass}"${mediaStyle}>${placeholderInnerHtml(block.alt, false)}</div>`;
    return `<figure${dataId(block.id)} class="kd-figure" data-placeholder=""${blockStyleAttr(block.style, ctx.px)}>${media}</figure>`;
  }
  const src = ctx.resolveImage(block.imageRef);
  const media = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}" loading="lazy" class="kd-image${maskClass}"${mediaStyle}>`
    : `<div class="kd-image kd-image-empty${maskClass}" aria-hidden="true"${mediaStyle}></div>`;
  const href = block.href ? safeHref(block.href, "https") : null;
  const inner = href
    ? `<a class="kd-image-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow ugc">${media}</a>`
    : media;
  return `<figure${dataId(block.id)} class="kd-figure"${blockStyleAttr(block.style, ctx.px)}>${inner}</figure>`;
}

const buttonVariants = { primary: "primary", secondary: "secondary" } as const;

function renderButton(
  block: Extract<DesignBlock, { kind: "button" }>,
  ctx: RenderContext,
): string {
  const variant = pick(block.variant, buttonVariants, buttonVariants.primary);
  const href = safeHref(ctx.linkHref(block.id, block.href), "https");
  const attrs = `${dataId(block.id)} class="kd-btn kd-btn--${variant}"${blockStyleAttr(block.style, ctx.px)}`;
  // `ctx.linkHref` is trusted on the Resolver (it always returns its own
  // `/go/{id}` route regardless of `block.href`), but the panel's preview
  // may return an unvalidated draft URL verbatim — `safeHref` still guards
  // it. A rejected href renders as an inert span, never a link to nowhere.
  if (!href) return `<span${attrs}>${escapeHtml(block.label)}</span>`;
  return `<a${attrs} href="${escapeHtml(href)}">${escapeHtml(block.label)}</a>`;
}

/** `path` is always one of `brands.ts`' own trusted constants (Simple Icons
 * data baked into this package, never user input) and `fill` is either a
 * validated `#rrggbb` literal or the fixed keyword `currentColor` — nothing
 * here needs escaping. */
function brandGlyphSvg(path: string, fill: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="${fill}" d="${path}"/></svg>`;
}

const brandButtonLookValues = {
  brand: "brand",
  neutral: "neutral",
  outline: "outline",
  circle: "circle",
} as const;

function renderBrandButton(
  block: Extract<DesignBlock, { kind: "brandButton" }>,
  ctx: RenderContext,
): string {
  const info = designBrandInfo(block.brand);
  const look = pick(block.look, brandButtonLookValues, "brand");
  const href = safeHref(ctx.linkHref(block.id, block.href), "https");

  let glyphFill: string;
  const lookDecls: string[] = [];
  if (look === "brand" || look === "circle") {
    glyphFill = info.glyphOnBrand;
    lookDecls.push(
      `background:${info.brandBackground}`,
      `color:${brandLabelColor(info.brandBackground)}`,
    );
  } else if (look === "neutral") {
    glyphFill = neutralGlyphFill(block.brand);
  } else {
    // "outline": the glyph inherits the button's own `color` (var(--kd-text)
    // from `.kd-brand--outline`) so it is always black-or-white and always
    // matches the surrounding page text, without needing the page's palette
    // here — see `brands.ts`' header comment on `neutralGlyphFill`.
    glyphFill = "currentColor";
  }

  const decls = [...lookDecls, ...blockStyleDecls(block.style, ctx.px)];
  const attrs = `${dataId(block.id)} class="kd-brand kd-brand--${look}"${styleAttr(decls)}`;
  const glyph = brandGlyphSvg(info.path, glyphFill);
  // The circle shows only the logo; its label stays as the link's name.
  const label =
    look === "circle"
      ? `<span class="kd-brand-label kd-visually-hidden">${escapeHtml(block.label)}</span>`
      : `<span class="kd-brand-label">${escapeHtml(block.label)}</span>`;
  const inner = `${glyph}${label}`;
  if (!href) return `<span${attrs}>${inner}</span>`;
  return `<a${attrs} href="${escapeHtml(href)}">${inner}</a>`;
}

function renderDivider(
  block: Extract<DesignBlock, { kind: "divider" }>,
  ctx: RenderContext,
): string {
  return `<hr${dataId(block.id)} class="kd-divider"${blockStyleAttr(block.style, ctx.px)}>`;
}

function renderSpacer(
  block: Extract<DesignBlock, { kind: "spacer" }>,
  ctx: RenderContext,
): string {
  const height = clampInt(block.height, 4, 160, 24);
  const px = ctx.px ?? plainPx;
  const decls = [`height:${px(height)}`, ...blockStyleDecls(block.style, px)];
  return `<div${dataId(block.id)} class="kd-spacer"${styleAttr(decls)}></div>`;
}

/** Decoration for canvas sections: it takes the size of its canvas item.
 * Geometry (`clip-path`/`border-radius`) and fill come before the block's own
 * `style` overrides, so an explicit `style.radius` on a `rect` still wins. */
function renderShape(
  block: Extract<DesignBlock, { kind: "shape" }>,
  ctx: RenderContext,
): string {
  const px = ctx.px ?? plainPx;
  const stroke = shapeStrokeDecl(
    block.shape,
    block.stroke,
    block.strokeWidth,
    px,
  );
  const decls = [
    ...shapeGeometryDecls(block.shape),
    shapeFillDecl(block.fill, block.fillTo, block.angle),
    ...(stroke ? [stroke] : []),
    ...blockStyleDecls(block.style, px),
  ];
  return `<div${dataId(block.id)} class="kd-shape kd-shape--${block.shape}" aria-hidden="true"${styleAttr(decls)}></div>`;
}

/** The customer's own HTML+CSS as one block (addendum 3): always sanitized
 * through `ctx.renderHtmlBlock` (`htmlBlockRenderer`, `custom-html/render.ts`)
 * before it is drawn, inside its own shadow root. `renderHtmlBlock` is
 * `undefined` while the panel's preview has not loaded the sanitizer yet
 * (it is lazy there): a discreet placeholder stands in for it, never the raw
 * source. Any of Kardo's own webfonts the block's CSS names are registered on
 * the page's `usedFonts` list too — `@font-face` inside a shadow root is
 * ignored by Chromium, so the page-wide rule (outside every shadow root) is
 * the only place it can actually take effect. */
function renderHtmlBlock(
  block: Extract<DesignBlock, { kind: "html" }>,
  ctx: RenderContext,
  fonts: FontUsage,
): string {
  for (const font of usedCustomFonts(block.css)) fonts.add(font);
  const rendered = ctx.renderHtmlBlock
    ? ctx.renderHtmlBlock(block.html, block.css)
    : null;
  const inner =
    rendered ?? '<div class="kd-html-placeholder">Bloque HTML</div>';
  return `<div${dataId(block.id)} class="kd-html"${blockStyleAttr(block.style, ctx.px)}>${inner}</div>`;
}

// ---------------------------------------------------------------------------
// Bound blocks: rendered from the Experience's own content, never from
// anything stored on the block itself beyond id/style/layout choices.
// ---------------------------------------------------------------------------

function renderContentTitle(
  block: Extract<DesignBlock, { kind: "contentTitle" }>,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (
    content.type === "profile" ||
    content.type === "linkpage" ||
    content.type === "image"
  )
    return "";
  // A title given its own color (white over a photo) takes its
  // description with it, softer, instead of the page's muted gray.
  const descriptionStyle =
    block.style?.color !== undefined
      ? ' style="color:inherit;opacity:0.88"'
      : "";
  const description = content.description
    ? `<p class="kd-content-title-description"${descriptionStyle}>${escapeHtml(content.description)}</p>`
    : "";
  const { box, title } = splitTitleStyle(block.style, ctx);
  return `<div${dataId(block.id)} class="kd-content-title"${box}><h1 class="kd-heading"${title}>${escapeHtml(content.title)}</h1>${description}</div>`;
}

/**
 * A bound title block's `style`, split between its box and its `h1`
 * (relevo 29, 2026-10-03). Until then the whole style sat on the box, and
 * the `h1` inside used the browser's own 2em of it: a title set to 44 px in
 * the Estudio or by the AI showed at 88 px (the test bench's covers had
 * titles running off the screen), and `.kd-page h1` kept its own weight,
 * family and line height over the ones chosen. The text of the title now
 * takes exactly the size, weight, family and line height of the style; its
 * box keeps the rest (color, align, background, spacing).
 */
function splitTitleStyle(
  style: BlockStyle | undefined,
  ctx: RenderContext,
): { box: string; title: string } {
  if (!style) return { box: "", title: "" };
  const { fontSize, fontWeight, font, lineHeight, ...rest } = style;
  const text: BlockStyle = {
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(fontWeight !== undefined ? { fontWeight } : {}),
    ...(font !== undefined ? { font } : {}),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
  };
  return {
    box: blockStyleAttr(rest, ctx.px),
    title: blockStyleAttr(text, ctx.px),
  };
}

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

const avatarShapes = {
  circle: "circle",
  rounded: "rounded",
  none: "none",
} as const;

function renderProfileHeader(
  block: Extract<DesignBlock, { kind: "profileHeader" }>,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "profile" && content.type !== "linkpage") return "";
  const displayName = content.displayName;
  const shape = pick(block.avatarShape, avatarShapes, avatarShapes.circle);
  const avatarUrl = content.avatarRef
    ? ctx.resolveImage(content.avatarRef)
    : null;
  const avatar =
    shape === "none"
      ? ""
      : avatarUrl
        ? `<img class="kd-avatar kd-avatar--${shape}" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}">`
        : `<div class="kd-avatar kd-avatar--${shape} kd-avatar-initials" aria-hidden="true">${escapeHtml(initials(displayName))}</div>`;
  const headline =
    content.type === "profile" && content.headline
      ? `<p class="kd-profile-headline">${escapeHtml(content.headline)}</p>`
      : "";
  const bio =
    content.type === "profile"
      ? content.biography
        ? `<p class="kd-profile-bio">${escapeHtml(content.biography)}</p>`
        : ""
      : content.bio
        ? `<p class="kd-profile-bio">${escapeHtml(content.bio)}</p>`
        : "";
  const layout = block.layout === "inline" ? "inline" : "stacked";
  const { box, title } = splitTitleStyle(block.style, ctx);
  return `<div${dataId(block.id)} class="kd-profile kd-profile--${layout}"${box}>${avatar}<div class="kd-profile-text"><h1 class="kd-heading"${title}>${escapeHtml(displayName)}</h1>${headline}${bio}</div></div>`;
}

const linkLayouts = { list: "list", grid: "grid" } as const;

function renderContentLinks(
  block: Extract<DesignBlock, { kind: "contentLinks" }>,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (
    content.type === "linkpage" ||
    content.type === "links" ||
    content.type === "profile"
  ) {
    const links = content.links;
    if (links.length === 0) return "";
    const layout = pick(block.layout, linkLayouts, linkLayouts.list);
    const items = links
      .map((link) => {
        const highlight = "highlight" in link && link.highlight;
        const classes = `kd-link${highlight ? " kd-link--highlight" : ""}`;
        const href = safeHref(ctx.linkHref(link.id, link.url), "https");
        if (!href)
          return `<li><span class="${classes}">${escapeHtml(link.label)}</span></li>`;
        return `<li><a class="${classes}" href="${escapeHtml(href)}">${escapeHtml(link.label)}</a></li>`;
      })
      .join("");
    return `<ul${dataId(block.id)} class="kd-links kd-links--${layout}"${blockStyleAttr(block.style, ctx.px)}>${items}</ul>`;
  }
  return "";
}

const socialSizes = {
  small: "small",
  medium: "medium",
  large: "large",
} as const;

/** Same convention the Resolver's rendered linkpage uses: only an https
 * destination opens in a new tab, email/phone navigate the current tab
 * (since they resolve to `mailto:`/`tel:`, not a page to come back from). */
function opensNewTab(network: SocialNetwork): boolean {
  return network !== "email" && network !== "phone";
}

const socialBrandSet = new Set<string>(socialBrandNetworks);

/** The brand registry entry for a social network that has an official-logo
 * "brand" look, or `null` for the networks that keep today's line icon
 * (linkedin, website, email, phone) whatever `look` is chosen. */
function socialBrandInfo(network: SocialNetwork): BrandInfo | null {
  // Safe cast: `socialBrandSet` only ever holds the `socialBrandNetworks`
  // literals, which are all valid `DesignBrand`s too (see brands.ts).
  return socialBrandSet.has(network)
    ? designBrandInfo(network as DesignBrand)
    : null;
}

function socialIconHtml(network: SocialNetwork, brandLook: boolean): string {
  const brand = brandLook ? socialBrandInfo(network) : null;
  if (!brand) return socialIcon(network);
  return brandGlyphSvg(brand.path, brand.glyphOnBrand);
}

function socialItemStyle(network: SocialNetwork, brandLook: boolean): string {
  const brand = brandLook ? socialBrandInfo(network) : null;
  if (!brand) return "";
  return styleAttr([
    `background:${brand.brandBackground}`,
    `color:${brand.glyphOnBrand}`,
  ]);
}

function renderContentSocials(
  block: Extract<DesignBlock, { kind: "contentSocials" }>,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "linkpage" || content.socials.length === 0) return "";
  const size = pick(block.size, socialSizes, socialSizes.medium);
  const brandLook = block.look === "brand";
  const items = content.socials
    .map((social) => {
      const label = escapeHtml(socialLabel(social.network));
      const href = safeHref(ctx.linkHref(social.id, social.value), "social");
      const icon = socialIconHtml(social.network, brandLook);
      const itemStyle = socialItemStyle(social.network, brandLook);
      if (!href)
        return `<li><span class="kd-social" aria-label="${label}"${itemStyle}>${icon}</span></li>`;
      const newTab = opensNewTab(social.network);
      return `<li><a class="kd-social" href="${escapeHtml(href)}" aria-label="${label}"${itemStyle}${newTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${icon}</a></li>`;
    })
    .join("");
  return `<ul${dataId(block.id)} class="kd-socials kd-socials--${size}" aria-label="Redes sociales"${blockStyleAttr(block.style, ctx.px)}>${items}</ul>`;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function renderBlock(
  block: DesignBlock,
  content: DesignableContent,
  ctx: RenderContext,
  fonts: FontUsage,
): string {
  fonts.add(block.style?.font);
  switch (block.kind) {
    case "heading":
      return renderHeading(block, ctx);
    case "text":
      return renderText(block, ctx);
    case "image":
      return renderImage(block, ctx);
    case "features":
      return renderFeaturesBlock(block, ctx);
    case "gallery":
      return renderGalleryBlock(block, ctx);
    case "button":
      return renderButton(block, ctx);
    case "brandButton":
      return renderBrandButton(block, ctx);
    case "divider":
      return renderDivider(block, ctx);
    case "spacer":
      return renderSpacer(block, ctx);
    case "shape":
      return renderShape(block, ctx);
    case "html":
      return renderHtmlBlock(block, ctx, fonts);
    case "contentTitle":
      return renderContentTitle(block, content, ctx);
    case "profileHeader":
      return renderProfileHeader(block, content, ctx);
    case "contentLinks":
      return renderContentLinks(block, content, ctx);
    case "contentSocials":
      return renderContentSocials(block, content, ctx);
    // Menú, Catálogo, Formulario, PDF and Imagen (addendum 3), plus
    // featuredItems (motor de 3 bloques, 2026-10-03): bound.ts.
    case "menu":
    case "catalog":
    case "featuredItems":
    case "leadForm":
    case "documentPages":
    case "imageMain":
      return renderBoundBlock(block, content, ctx);
    default:
      return "";
  }
}
