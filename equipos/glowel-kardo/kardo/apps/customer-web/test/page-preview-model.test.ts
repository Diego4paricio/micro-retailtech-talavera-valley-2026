import type { ExperienceContent } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  activeCustomHtml,
  pagePreviewKind,
} from "../src/features/experiences/page-preview-model.js";

// One preview decision for Diseño and Historial (domain audit A2-26).

const html = (active: boolean, source = "<p>Hola</p>") => ({
  schema: 1 as const,
  active,
  html: source,
  css: "",
});

const links = (extra: Record<string, unknown> = {}) =>
  ({
    title: "Hola",
    links: [{ id: "a", label: "Uno", url: "https://sitio.mx" }],
    ...extra,
  }) as unknown as ExperienceContent;

describe("pagePreviewKind", () => {
  it("shows the active HTML first, even over a design", () => {
    expect(
      pagePreviewKind(
        "links",
        links({ customHtml: html(true), design: { schema: 2, sections: [] } }),
      ),
    ).toBe("html");
  });

  it("an inactive or empty HTML is not shown", () => {
    expect(pagePreviewKind("links", links({ customHtml: html(false) }))).toBe(
      "from-content",
    );
    expect(
      pagePreviewKind("links", links({ customHtml: html(true, "   ") })),
    ).toBe("from-content");
  });

  it("then the Estudio design, then the design built from the content", () => {
    expect(
      pagePreviewKind(
        "links",
        links({ design: { schema: 2, style: {}, sections: [] } }),
      ),
    ).toBe("design");
    expect(pagePreviewKind("links", links())).toBe("from-content");
  });

  it("only the types that support modo HTML can have it", () => {
    expect(
      activeCustomHtml("menu", {
        customHtml: html(true),
      } as unknown as ExperienceContent),
    ).toBeNull();
  });

  it("Redirección keeps the plain theme preview", () => {
    expect(
      pagePreviewKind("redirect", {
        destinationUrl: "https://sitio.mx",
      } as unknown as ExperienceContent),
    ).toBe("theme");
  });
});
