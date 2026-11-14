import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { blockStyleAttr, blockStyleDecls, styleAttr } from "../block-style.js";
import { clampInt, pick } from "../css.js";
import { escapeHtml } from "../escape.js";
import type { DesignableContent, RenderContext } from "../types.js";
import { safeHref } from "../url-safety.js";
import { dataId, pageRadius, pageShadow } from "./shared.js";

// ---------------------------------------------------------------------------
// PDF bound block (`documentPages`, ADR 018 addendum 3): the Document
// Experience's own pages, drawn as the images the panel already rasterized
// with pdf.js on upload (no PDF viewer or script ever runs on the public
// page — Chrome for Android does not show embedded PDFs), or its download
// card. `contentTitle` renders the title/description separately.
// ---------------------------------------------------------------------------

type DocumentPagesBlock = Extract<DesignBlock, { kind: "documentPages" }>;

const pageStyles = {
  shadow: "shadow",
  border: "border",
  flat: "flat",
} as const;

/** `ctx.documentHref`, when present and safe, else inert text — never a
 * download link to nowhere. */
function downloadButtonHtml(ctx: RenderContext): string {
  const classes = "kd-btn kd-btn--secondary kd-document-download";
  const href = ctx.documentHref ? safeHref(ctx.documentHref, "https") : null;
  if (!href)
    return `<span class="${classes} kd-document-download--inert">Descargar PDF</span>`;
  return `<a class="${classes}" href="${escapeHtml(href)}">Descargar PDF</a>`;
}

export function renderDocumentPagesBlock(
  block: DocumentPagesBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "document") return "";

  if (content.display === "download") {
    return `<div${dataId(block.id)} class="kd-document kd-document-card"${blockStyleAttr(block.style, ctx.px)}><div class="kd-document-icon" aria-hidden="true">PDF</div>${downloadButtonHtml(ctx)}</div>`;
  }

  if (content.pages.length === 0) {
    return `<div${dataId(block.id)} class="kd-document kd-document-empty"${blockStyleAttr(block.style, ctx.px)}><p class="kd-empty-note">Este documento todavía no tiene páginas.</p></div>`;
  }

  const pageStyle = pick(block.pageStyle, pageStyles, pageStyles.shadow);
  const gap = clampInt(block.gap, 0, 48, 16);
  const pagesHtml = content.pages
    .map((page, index) => {
      const src = ctx.resolveImage(page.ref);
      const alt = `Página ${index + 1} de ${content.title}`;
      // An image the preview has not loaded yet keeps the page's shape, so
      // the document never shows empty or jumps when it arrives.
      if (!src) {
        const width = clampInt(page.width, 1, 10_000, 1);
        const height = clampInt(page.height, 1, 10_000, 1);
        return `<div class="kd-document-page kd-document-page--${pageStyle} kd-document-page--pending" role="img" aria-label="${escapeHtml(alt)}" style="aspect-ratio:${width} / ${height}"></div>`;
      }
      return `<img class="kd-document-page kd-document-page--${pageStyle}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${page.width}" height="${page.height}" loading="lazy" decoding="async">`;
    })
    .join("");
  const download = content.allowDownload ? downloadButtonHtml(ctx) : "";
  const decls = [
    `--kd-doc-gap:${gap}px`,
    ...blockStyleDecls(block.style, ctx.px),
  ];
  return `<div${dataId(block.id)} class="kd-document kd-document-viewer"${styleAttr(decls)}>${pagesHtml}${download}</div>`;
}

export function documentCss(design: PageDesign): string {
  const radius = pageRadius(design);
  const shadow = pageShadow(design);
  return `
.kd-document{width:100%}
.kd-document-viewer{display:flex;flex-direction:column;align-items:center;gap:var(--kd-doc-gap,16px)}
.kd-document-page{width:100%;height:auto;display:block;background:var(--kd-surface)}
.kd-document-page--shadow{border-radius:${radius}px;box-shadow:${shadow}}
.kd-document-page--border{border-radius:${radius}px;border:1px solid color-mix(in srgb, var(--kd-text) 15%, transparent)}
.kd-document-page--flat{border-radius:0}
.kd-document-page--pending{background:color-mix(in srgb, var(--kd-text) 6%, var(--kd-surface))}
.kd-document-download{margin-top:4px}
.kd-document-download--inert{opacity:.6;cursor:default}
.kd-document-card{display:flex;flex-direction:column;align-items:flex-start;gap:14px;background:var(--kd-surface);border-radius:${radius}px;box-shadow:${shadow};padding:24px;width:100%}
.kd-document-icon{width:56px;height:56px;border-radius:${Math.min(radius, 14)}px;background:var(--kd-accent);color:var(--kd-on-accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;letter-spacing:.04em}
.kd-document-empty{padding:20px 0;width:100%}
`;
}
