import type { PageDesign } from "@kardo/contracts";
import { escapeHtml } from "./escape.js";
import { renderDesignedBody } from "./render.js";
import type { DesignableContent, RenderContext } from "./types.js";

// ---------------------------------------------------------------------------
// The one document a designed page ever becomes (ADR 018 addendum 3): the
// Resolver serves it verbatim, and the panel's preview adds only its own
// editor CSS on top — so what the customer designs is exactly what the
// public page shows. Built from `renderDesignedBody` alone: the shared
// markup and CSS already include the Kardo footer, the blurred ambient
// backdrop and the bound Menú/Catálogo/Formulario/PDF/Imagen blocks' own CSS
// (`boundCssFor`, `bound.ts`, R2's file) — this module only adds the
// document shell (doctype, head, viewport, title).
// ---------------------------------------------------------------------------

/**
 * A full standalone `<!doctype html>` document for a designed page: used both
 * by the Resolver to serve the public page and by the panel's sandboxed
 * preview iframe (`srcdoc`, no scripts). Fills the safe areas within the
 * page itself (the background reaches under the status bar/home indicator
 * island; the page's own content still respects them through the bound
 * blocks/footer that need to).
 */
export function renderDesignedDocument(
  content: DesignableContent,
  design: PageDesign,
  ctx: RenderContext,
  options: { title: string; headExtra?: string; bodyEnd?: string },
): string {
  const { html, css } = renderDesignedBody(content, design, ctx);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(options.title)}</title>
<style>html,body{margin:0;padding:0}${css}</style>
${options.headExtra ?? ""}
</head>
<body>
${html}
${options.bodyEnd ?? ""}
</body>
</html>`;
}
