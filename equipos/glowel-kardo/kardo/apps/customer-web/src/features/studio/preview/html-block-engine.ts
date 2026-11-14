import * as pageRender from "@kardo/page-render";

/**
 * Loaded on demand (only by designs with `html` blocks): the modo HTML
 * sanitizer behind `htmlBlockRenderer` pulls parse5 and css-tree, which the
 * rest of the Estudio never needs.
 */

type Factory = (
  resolveImage: (ref: string) => string | null,
) => (html: string, css: string) => string | null;

export const htmlBlockRenderer: Factory | null =
  (pageRender as unknown as { htmlBlockRenderer?: Factory })
    .htmlBlockRenderer ?? null;
