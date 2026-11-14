import type {
  DesignFont,
  DesignSection,
  DesignStyle,
  PageDesign,
  SectionLayout,
} from "@kardo/contracts";
import {
  DESIGN_LEGACY_PAGE_PADDING,
  isCanvasSection,
  layoutColumns,
} from "@kardo/contracts";
import {
  ambientBaseCss,
  ambientCss,
  ambientMarkup,
  isAmbientActive,
} from "./ambient.js";
import { renderBlock } from "./blocks.js";
import { boundCssFor } from "./bound.js";
import { brandCss, designUsesBrandCss, readsOn } from "./brands.js";
import {
  canvasBaseCss,
  canvasSectionCss,
  canvasStyleCss,
  renderCanvasSection,
} from "./canvas.js";
import {
  alignCss,
  backgroundDecl,
  clampInt,
  fontFamilyDecl,
  hex,
  isBackgroundPlaceholder,
  onAccentColor,
  shadowCss,
} from "./css.js";
import { escapeHtml } from "./escape.js";
import { featureGalleryCssFor } from "./feature-gallery.js";
import { fontFaceCss } from "./fonts.js";
import {
  footerCss,
  footerToneForBackground,
  renderKardoFooter,
} from "./footer.js";
import { placeholderCss } from "./placeholder.js";
import { designImageMasks, imageMaskCss } from "./shapes.js";
import type { DesignableContent, RenderContext } from "./types.js";

/** Fixed, non-negotiable structural CSS — box model, resets and the
 * per-block-kind base look. Nothing here reads from `design`: every rule
 * that depends on validated design data is generated separately in
 * `pageCss`/`sectionCss`. */
const baseCss = `
.kd-page{margin:0;min-height:100dvh;display:flex;flex-direction:column;align-items:center;box-sizing:border-box}
.kd-page *{box-sizing:border-box}
.kd-page h1,.kd-page h2,.kd-page h3{margin:0;font-weight:700;line-height:1.15;font-family:var(--kd-font-heading)}
.kd-page p{margin:0}
/* :where keeps this at element specificity so .kd-link/.kd-btn keep their on-accent color. */
:where(.kd-page) a{color:inherit}
.kd-page ul{margin:0;padding:0;list-style:none}
.kd-container{width:100%;box-sizing:border-box;display:flex;flex-direction:column;margin:0 auto}
.kd-cols{display:grid;grid-template-columns:1fr}
.kd-col{display:flex;flex-direction:column;min-width:0}
.kd-heading,.kd-text{max-width:100%}
.kd-text{white-space:pre-wrap}
.kd-btn{display:flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;padding:14px 18px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;border:2px solid transparent;text-align:center}
.kd-btn--secondary{background:var(--kd-surface);color:var(--kd-text);border-color:color-mix(in srgb, var(--kd-text) 18%, transparent)}
.kd-divider{border:none;border-top:1px solid color-mix(in srgb, var(--kd-text) 15%, transparent);width:100%;margin:0}
.kd-spacer{width:100%}
.kd-figure{margin:0;width:100%}
.kd-image,.kd-image-empty{width:100%;display:block;background:var(--kd-surface)}
.kd-image-link{display:block}
.kd-content-title{display:flex;flex-direction:column;gap:8px;width:100%}
.kd-content-title-description{color:var(--kd-muted)}
.kd-profile{display:flex;gap:16px;width:100%}
.kd-profile--stacked{flex-direction:column;align-items:center;text-align:center}
.kd-profile--inline{flex-direction:row;align-items:center;text-align:left}
.kd-profile-text{display:flex;flex-direction:column;gap:4px;min-width:0}
.kd-profile-headline,.kd-profile-bio{color:var(--kd-muted);white-space:pre-wrap}
.kd-avatar{width:96px;height:96px;object-fit:cover;flex:none;background:var(--kd-surface)}
.kd-avatar--circle{border-radius:50%}
.kd-avatar--rounded{border-radius:20px}
.kd-avatar-initials{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.7rem;color:var(--kd-text);letter-spacing:.02em}
.kd-links{display:flex;flex-direction:column;gap:10px;width:100%}
.kd-links--grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.kd-link{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;background:var(--kd-accent);color:var(--kd-on-accent);padding:14px 16px;font-weight:600}
.kd-link--highlight{box-shadow:0 0 0 2px var(--kd-accent) inset;font-weight:700}
.kd-socials{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;width:100%}
.kd-social{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--kd-accent);color:var(--kd-on-accent);text-decoration:none}
.kd-social svg{width:18px;height:18px}
.kd-socials--small .kd-social{width:32px;height:32px}
.kd-socials--small .kd-social svg{width:14px;height:14px}
.kd-socials--large .kd-social{width:48px;height:48px}
.kd-socials--large .kd-social svg{width:22px;height:22px}
.kd-btn:focus-visible,.kd-link:focus-visible,.kd-social:focus-visible,.kd-image-link:focus-visible,.kd-text a:focus-visible{outline:3px solid var(--kd-accent);outline-offset:2px}
.kd-html{width:100%}
.kd-html-placeholder{border:1px dashed var(--kd-muted);border-radius:8px;padding:16px;color:var(--kd-muted);font-size:.85rem;text-align:center}
`;

const desktopTemplates: Record<SectionLayout, string> = {
  "1": "1fr",
  "1-1": "1fr 1fr",
  "1-2": "1fr 2fr",
  "2-1": "2fr 1fr",
  "1-1-1": "1fr 1fr 1fr",
};

/** Returns a bare pixel count (no unit) — callers append `px`. */
function buttonRadiusPx(
  shape: DesignStyle["buttonShape"],
  radius: number,
): number {
  if (shape === "pill") return 999;
  if (shape === "square") return Math.min(radius, 8);
  return radius;
}

/**
 * Global page style: palette variables, fonts, the button look, the page
 * margin and the page background — every declaration validated/clamped/
 * enum-mapped, per ADR 018.
 *
 * With the blurred backdrop active (`style.ambient`, addendum 3), `.kd-page`
 * itself only ever paints the flat palette color: the ambient layer
 * (`.kd-ambient`, a fixed sibling painted first inside `.kd-page`'s own
 * `isolation:isolate` stacking context) carries the actual glows/blurred
 * image, and — only for an image background — `.kd-container` gets that same
 * image sharp, so the content column stays crisp while everything around it
 * reads as its softened backdrop. With `ambient: "none"` nothing changes:
 * `.kd-page` keeps the full solid/gradient/image background exactly as
 * before, and the column stays transparent.
 */
function pageCss(
  style: DesignStyle,
  ctx: RenderContext,
  onAccent: string,
): string {
  const background = hex(style.palette.background, "#f7f5f0");
  const surface = hex(style.palette.surface, "#fffdf8");
  const text = hex(style.palette.text, "#16232e");
  const muted = hex(style.palette.muted, "#52646d");
  const accent = hex(style.palette.accent, "#0a6c78");
  const radius = clampInt(style.radius, 0, 32, 16);
  const maxWidth = clampInt(style.maxWidth, 360, 960, 640);
  const buttonRadius = buttonRadiusPx(style.buttonShape, radius);
  const pagePadding = clampInt(
    style.pagePadding,
    0,
    48,
    DESIGN_LEGACY_PAGE_PADDING,
  );

  const showPlaceholders = ctx.imagePlaceholders === true;
  const pageBackground = backgroundDecl(
    style.background,
    ctx.resolveImage,
    background,
    showPlaceholders,
  );
  const ambientActive = isAmbientActive(style);
  const isImageBackground = style.background.kind === "image";
  const pageBackgroundDecl = ambientActive ? "" : pageBackground;
  const containerBackgroundDecl =
    ambientActive && isImageBackground ? pageBackground : "";
  // "Sin banco de fotos" (2026-10-03): a small, discreet corner label so the
  // panel's own preview says what this flat tint actually is.
  const pageBgPlaceholder = isBackgroundPlaceholder(
    style.background,
    showPlaceholders,
  );
  const pageBgPlaceholderCss = pageBgPlaceholder
    ? `.kd-page{position:relative}.kd-page::before{content:"Foto de fondo";position:absolute;top:8px;left:8px;z-index:5;font-size:11px;font-weight:600;color:var(--kd-muted);background:var(--kd-surface);padding:3px 10px;border-radius:999px;box-shadow:${shadowCss("soft")}}`
    : "";

  // Prices "in the accent" are small text: the accent only when it reads
  // at 4.5:1 on the page and on the cards, else the text color (relevo 29,
  // the bench's gold prices on cream and on dark blue).
  const priceColor = readsOn(accent, [background, surface], 4.5)
    ? accent
    : text;

  let primaryButtonCss: string;
  if (style.buttonStyle === "outline") {
    primaryButtonCss = `background:transparent;color:${accent};border-color:${accent}`;
  } else if (style.buttonStyle === "soft") {
    primaryButtonCss = `background:color-mix(in srgb, ${accent} 16%, ${surface});color:${accent}`;
  } else {
    primaryButtonCss = `background:${accent};color:${onAccent}`;
  }

  return `
.kd-page{
--kd-background:${background};
--kd-surface:${surface};
--kd-text:${text};
--kd-muted:${muted};
--kd-accent:${accent};
--kd-on-accent:${onAccent};
--kd-price:${priceColor};
--kd-pad:${pagePadding}px;
--kd-font-heading:${fontFamilyDecl(style.fonts.heading)};
--kd-font-body:${fontFamilyDecl(style.fonts.body)};
font-family:var(--kd-font-body);
color:var(--kd-text);
isolation:isolate;
background:var(--kd-background);
${pageBackgroundDecl}
}
.kd-container{max-width:${maxWidth}px;padding-left:var(--kd-pad);padding-right:var(--kd-pad);${containerBackgroundDecl}}
.kd-btn,.kd-link{border-radius:${buttonRadius}px}
.kd-btn--primary,.kd-link{${primaryButtonCss}}
.kd-figure img,.kd-image,.kd-image-empty{border-radius:${radius}px}
${pageBgPlaceholderCss}
`;
}

/** One stacked section: its own background, spacing, alignment and column
 * template (mobile-first: a single column below 640px, the chosen template
 * at and above it). */
function sectionCss(
  section: DesignSection,
  index: number,
  ctx: RenderContext,
  style: DesignStyle,
): string {
  const paddingTop = clampInt(section.paddingTop, 0, 160, 32);
  const paddingBottom = clampInt(section.paddingBottom, 0, 160, 32);
  const gap = clampInt(section.gap, 0, 64, 16);
  const align = alignCss(section.align);
  const template = desktopTemplates[section.layout] ?? "1fr";
  const showPlaceholders = ctx.imagePlaceholders === true;
  const background = backgroundDecl(
    section.background,
    ctx.resolveImage,
    "transparent",
    showPlaceholders,
  );
  const radius = clampInt(style.radius, 0, 32, 16);
  const cardCss = section.card
    ? `background:var(--kd-surface);border-radius:${radius}px;box-shadow:${shadowCss(style.shadow)};padding-left:24px;padding-right:24px;`
    : "";
  // "Sin banco de fotos" (2026-10-03): same discreet corner label as the
  // page background, scoped to this one section.
  const bgPlaceholder = isBackgroundPlaceholder(
    section.background,
    showPlaceholders,
  );
  const bgPlaceholderCss = bgPlaceholder
    ? `.kd-sec-${index}::before{content:"Foto de fondo";position:absolute;top:8px;left:8px;z-index:5;font-size:11px;font-weight:600;color:var(--kd-muted);background:var(--kd-surface);padding:3px 10px;border-radius:999px;box-shadow:${shadowCss("soft")}}`
    : "";
  // A photo that opens a one-column card goes edge to edge across its top,
  // with the card's own corners (relevo 29, 2026-10-03: inside the card's
  // padding it left a strip above it and square corners). A masked photo
  // (a circle, an arch) keeps its own shape where it is.
  const cardPhotoCss =
    section.card && expectedColumnsOf(section) === 1
      ? `.kd-sec-${index}>.kd-cols>.kd-col>.kd-figure:first-child:not(:has([class*="kd-mask--"])){margin:-${paddingTop}px -24px 0;width:calc(100% + 48px);max-width:none;align-self:stretch}
.kd-sec-${index}>.kd-cols>.kd-col>.kd-figure:first-child:not(:has([class*="kd-mask--"])) .kd-image{width:100%;border-radius:${radius}px ${radius}px 0 0}`
      : "";
  return `
.kd-sec-${index}{padding-top:${paddingTop}px;padding-bottom:${paddingBottom}px;${background}${cardCss}${bgPlaceholder ? "position:relative;" : ""}}
${bgPlaceholderCss}
${cardPhotoCss}
.kd-cols-${index}{gap:${gap}px}
.kd-cols-${index} .kd-col{gap:${gap}px;align-items:${align}}
@media (min-width: 640px){
.kd-cols-${index}{grid-template-columns:${template}}
}
`;
}

function expectedColumnsOf(section: DesignSection): number {
  return layoutColumns[section.layout] ?? 1;
}

function renderSection(
  section: DesignSection,
  index: number,
  content: DesignableContent,
  ctx: RenderContext,
  usedFonts: DesignFont[],
): string {
  const expectedColumns = layoutColumns[section.layout] ?? 1;
  const columns = section.columns.slice(0, expectedColumns);
  const fontUsage = {
    add: (font: DesignFont | undefined) => {
      if (font) usedFonts.push(font);
    },
  };
  const columnsHtml = columns
    .map((column) => {
      // Consecutive circle brand buttons share one centered row, so a few
      // networks sit side by side instead of stacking one per line.
      let blocksHtml = "";
      let row: string[] = [];
      const flushRow = () => {
        if (row.length)
          blocksHtml += `<div class="kd-brand-row">${row.join("")}</div>`;
        row = [];
      };
      for (const block of column) {
        const html = renderBlock(block, content, ctx, fontUsage);
        if (block.kind === "brandButton" && block.look === "circle") {
          row.push(html);
          continue;
        }
        flushRow();
        blocksHtml += html;
      }
      flushRow();
      return `<div class="kd-col">${blocksHtml}</div>`;
    })
    .join("");
  return `<section class="kd-sec kd-sec-${index}" data-section-id="${escapeHtml(section.id)}"><div class="kd-cols kd-cols-${index}">${columnsHtml}</div></section>`;
}

export type RenderedDesign = { html: string; css: string; fonts: DesignFont[] };

/**
 * Renders a validated `PageDesign` plus its bound `DesignableContent` to HTML
 * and CSS. Never touches the DOM, Node or Workers APIs. The caller (the
 * Resolver, or the panel's preview) is responsible for embedding `html` in a
 * document body and `css` in a `<style>` element — see `renderDesignedDocument`
 * (`shell.ts`) for a ready-made standalone document, which is the one both of
 * them actually use.
 *
 * `options.footer` (default `true`) draws the Kardo mark as the very last
 * child of `.kd-page`, after `.kd-container` and outside every section, so no
 * canvas block can ever sit on top of it; in a short page `margin-top:auto`
 * (see `footer.ts`) pushes it to the bottom of the screen. Its tone follows
 * the palette's own background luminance. The blurred ambient backdrop
 * (`style.ambient`) is drawn as `.kd-page`'s first child, behind everything.
 */
export function renderDesignedBody(
  content: DesignableContent,
  design: PageDesign,
  ctx: RenderContext,
  options: { footer?: boolean } = {},
): RenderedDesign {
  const showFooter = options.footer ?? true;
  const onAccent = onAccentColor(design.style.palette.accent);
  const usedFonts: DesignFont[] = [
    design.style.fonts.heading,
    design.style.fonts.body,
  ];

  const fontUsage = {
    add: (font: DesignFont | undefined) => {
      if (font) usedFonts.push(font);
    },
  };
  const sectionsHtml = design.sections
    .map((section, index) =>
      isCanvasSection(section)
        ? renderCanvasSection(section, index, content, ctx, fontUsage)
        : renderSection(section, index, content, ctx, usedFonts),
    )
    .join("");

  const sectionsCss = design.sections
    .map((section, index) =>
      isCanvasSection(section)
        ? canvasSectionCss(section, index, ctx)
        : sectionCss(section, index, ctx, design.style),
    )
    .join("");
  const radius = clampInt(design.style.radius, 0, 32, 16);
  const canvasCss = design.sections.some(isCanvasSection)
    ? canvasBaseCss +
      canvasStyleCss(radius, buttonRadiusPx(design.style.buttonShape, radius))
    : "";

  const ambientHtml = ambientMarkup(design.style);
  const footerTone = footerToneForBackground(design.style.palette.background);
  const footerHtml = showFooter ? renderKardoFooter(footerTone) : "";
  const html = `<div class="kd-page">${ambientHtml}<div class="kd-container">${sectionsHtml}</div>${footerHtml}</div>`;

  const dedupedFonts = [...new Set(usedFonts)];
  const ambientStyleCss = isAmbientActive(design.style)
    ? ambientBaseCss + ambientCss(design.style, ctx.resolveImage)
    : "";
  const maskCss = imageMaskCss(designImageMasks(design));
  const css =
    baseCss +
    placeholderCss +
    pageCss(design.style, ctx, onAccent) +
    canvasCss +
    sectionsCss +
    boundCssFor(design) +
    featureGalleryCssFor(design) +
    maskCss +
    ambientStyleCss +
    (showFooter ? footerCss : "") +
    fontFaceCss(dedupedFonts, ctx.fontBaseUrl) +
    (designUsesBrandCss(design) ? brandCss : "");

  return { html, css, fonts: dedupedFonts };
}
