import type { PageDesign } from "@kardo/contracts";

/**
 * The look of a Documento PDF that has no design of its own: only its pages,
 * edge to edge on a phone and in a wide column on a computer, over the
 * blurred backdrop. No title or text: a restaurant that uploads its menu
 * wants its menu on screen (owner, 2026-10-02). The Estudio starts from the
 * same structure, and the Resolver serves it for viewers published without
 * a design, so both look the same.
 */
export function documentViewerDesign(): PageDesign {
  return {
    schema: 1,
    style: {
      palette: {
        background: "#f3f1ec",
        surface: "#ffffff",
        text: "#16232e",
        muted: "#52646d",
        accent: "#0a6c78",
      },
      fonts: { heading: "geist", body: "dm-sans" },
      radius: 12,
      buttonStyle: "solid",
      buttonShape: "pill",
      shadow: "soft",
      background: { kind: "solid", color: "#f3f1ec" },
      maxWidth: 960,
      ambient: { kind: "auto" },
      pagePadding: 0,
    },
    sections: [
      {
        id: "document-pages",
        layout: "1",
        columns: [
          [
            {
              id: "document-pages-block",
              kind: "documentPages",
              pageStyle: "flat",
              gap: 8,
            },
          ],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
        align: "center",
      },
    ],
  };
}
