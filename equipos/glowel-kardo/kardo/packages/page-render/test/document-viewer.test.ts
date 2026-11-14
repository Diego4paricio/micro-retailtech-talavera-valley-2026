import { checkDesign, PageDesignSchema } from "@kardo/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { documentViewerDesign, renderDesignedBody } from "../src/index.js";
import { testContext } from "./fixtures.js";

if (!FormatRegistry.Has("uri"))
  FormatRegistry.Set("uri", (value) => URL.canParse(value));

describe("Documento PDF default design (2026-10-02)", () => {
  it("is a valid document design with only its pages, edge to edge", () => {
    const design = documentViewerDesign();
    expect(Value.Check(PageDesignSchema, design)).toBe(true);
    expect(checkDesign("document", design)).toEqual([]);
    expect(design.style.pagePadding).toBe(0);
  });

  it("keeps each page's proportions instead of squashing it", () => {
    const { html, css } = renderDesignedBody(
      {
        type: "document",
        title: "Menú",
        display: "viewer",
        pages: [{ ref: "page-1", width: 1080, height: 1527 }],
        allowDownload: false,
      },
      documentViewerDesign(),
      testContext(),
    );
    expect(html).toContain('width="1080" height="1527"');
    expect(css).toContain(
      ".kd-document-page{width:100%;height:auto;display:block",
    );
    expect(css).toContain(".kd-document-page--flat{border-radius:0}");
  });
});
