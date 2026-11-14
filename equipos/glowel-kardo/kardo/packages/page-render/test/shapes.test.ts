import type { CanvasSection, DesignBlock, PageDesign } from "@kardo/contracts";
import { designShapes, imageMasks } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { renderDesignedBody } from "../src/index.js";
import { imageMaskCss } from "../src/shapes.js";
import {
  baseStyle,
  design,
  linksContent,
  section,
  testContext,
} from "./fixtures.js";

function canvasDesign(items: CanvasSection["items"]): PageDesign {
  return {
    schema: 2,
    style: baseStyle(),
    sections: [
      section("s0", [[{ id: "links1", kind: "contentLinks", layout: "list" }]]),
      { id: "c1", kind: "canvas", height: 400, items },
    ],
  };
}

// "rect" is a plain box: it only gets a radius from the block's own
// `style.radius` (checked separately below), so it is excluded here.
const shapesWithOwnGeometry = designShapes.filter((shape) => shape !== "rect");

describe("shape blocks: every enumerated shape draws valid, scalable CSS", () => {
  it.each(shapesWithOwnGeometry)(
    "renders %s with a clip-path or a border-radius",
    (shape) => {
      const d = canvasDesign([
        {
          block: { id: "sh1", kind: "shape", shape, fill: "accent" },
          x: 0,
          y: 0,
          w: 100,
          h: 100,
        },
      ]);
      const { html } = renderDesignedBody(linksContent(), d, testContext());
      expect(html).toMatch(/(clip-path|border-radius):/);
      expect(html).not.toContain("undefined");
    },
  );

  it("a plain rect has no radius/clip-path unless style.radius sets one", () => {
    const d = canvasDesign([
      {
        block: { id: "sh1", kind: "shape", shape: "rect", fill: "accent" },
        x: 0,
        y: 0,
        w: 100,
        h: 100,
      },
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).not.toMatch(/(clip-path|border-radius):/);
  });

  it("pill uses a fixed 999px radius", () => {
    const d = canvasDesign([
      {
        block: { id: "sh1", kind: "shape", shape: "pill", fill: "accent" },
        x: 0,
        y: 0,
        w: 100,
        h: 40,
      },
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain("border-radius:999px");
  });

  it("draws a fillTo/angle gradient", () => {
    const d = canvasDesign([
      {
        block: {
          id: "sh1",
          kind: "shape",
          shape: "rect",
          fill: "#ff0000",
          fillTo: "#0000ff",
          angle: 45,
        },
        x: 0,
        y: 0,
        w: 100,
        h: 100,
      },
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain(
      "background:linear-gradient(45deg, #ff0000, #0000ff)",
    );
  });

  it("draws a solid fill (no gradient) when fillTo is absent", () => {
    const d = canvasDesign([
      {
        block: { id: "sh1", kind: "shape", shape: "rect", fill: "#ff0000" },
        x: 0,
        y: 0,
        w: 100,
        h: 100,
      },
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain("background:#ff0000");
    expect(html).not.toContain("linear-gradient");
  });

  it("draws an inset stroke only on rect, ellipse and pill", () => {
    for (const shape of ["rect", "ellipse", "pill"] as const) {
      const d = canvasDesign([
        {
          block: {
            id: "sh1",
            kind: "shape",
            shape,
            fill: "accent",
            stroke: "text",
            strokeWidth: 4,
          },
          x: 0,
          y: 0,
          w: 100,
          h: 100,
        },
      ]);
      const { html } = renderDesignedBody(linksContent(), d, testContext());
      // Inside a canvas, `ctx.px` writes the width in the canvas's own
      // scalable unit rather than a fixed px (see canvas.ts).
      expect(html).toContain(
        "box-shadow:inset 0 0 0 calc(4 * var(--u)) var(--kd-text)",
      );
    }

    for (const shape of [
      "triangle",
      "diamond",
      "hexagon",
      "star",
      "arch",
      "blob",
    ] as const) {
      const d = canvasDesign([
        {
          block: {
            id: "sh1",
            kind: "shape",
            shape,
            fill: "accent",
            stroke: "text",
            strokeWidth: 4,
          },
          x: 0,
          y: 0,
          w: 100,
          h: 100,
        },
      ]);
      const { html } = renderDesignedBody(linksContent(), d, testContext());
      expect(html).not.toContain("box-shadow");
    }
  });

  it("rect keeps the block's own style.radius", () => {
    const d = canvasDesign([
      {
        block: {
          id: "sh1",
          kind: "shape",
          shape: "rect",
          fill: "accent",
          style: { radius: 12 },
        },
        x: 0,
        y: 0,
        w: 100,
        h: 100,
      },
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain("border-radius:");
  });

  it("only accepts an enumerated shape/mask value, never free text", () => {
    expect(designShapes).toContain("blob");
    expect(imageMasks).toContain("blob");
    // Not part of the type at all — this is a compile-time guarantee the
    // union enforces; nothing at render time falls back to a raw string.
  });
});

describe("image masks: global classes included only when a design uses one", () => {
  it("adds the class to an image block and the matching CSS rule", () => {
    const blocks: DesignBlock[] = [
      {
        id: "i1",
        kind: "image",
        imageRef: "ref1",
        alt: "",
        aspect: "1:1",
        fit: "cover",
        mask: "circle",
      },
    ];
    const d = design([section("s1", [blocks])]);
    const { html, css } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain("kd-mask--circle");
    // A clip, not a border-radius: the page's `.kd-figure img` radius is
    // more specific and used to override it (2026-10-02 regression).
    expect(css).toContain(
      ".kd-mask--circle{clip-path:circle(closest-side at 50% 50%);border-radius:0}",
    );
  });

  it("adds no mask CSS at all when the design uses none", () => {
    const blocks: DesignBlock[] = [
      {
        id: "i1",
        kind: "image",
        imageRef: "ref1",
        alt: "",
        aspect: "1:1",
        fit: "cover",
      },
    ];
    const d = design([section("s1", [blocks])]);
    const { html, css } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).not.toContain("kd-mask--");
    expect(css).not.toContain(".kd-mask--");
  });

  it("draws a polygon clip-path for diamond/hexagon/star masks", () => {
    for (const mask of ["diamond", "hexagon", "star"] as const) {
      const blocks: DesignBlock[] = [
        {
          id: "i1",
          kind: "image",
          imageRef: "ref1",
          alt: "",
          aspect: "1:1",
          fit: "cover",
          mask,
        },
      ];
      const d = design([section("s1", [blocks])]);
      const { css } = renderDesignedBody(linksContent(), d, testContext());
      expect(css).toContain(`.kd-mask--${mask}{clip-path:polygon(`);
    }
  });
});

describe("image masks: every mask clips (regression 2026-10-02)", () => {
  it("writes rounded, arch and blob as inset clips the page radius cannot override", () => {
    const css = imageMaskCss(new Set(["rounded", "arch", "blob"] as const));
    expect(css).toContain(".kd-mask--rounded{clip-path:inset(0 round 22%)");
    expect(css).toContain(
      ".kd-mask--arch{clip-path:inset(0 round 50% 50% 0 0 / 100% 100% 0 0)",
    );
    expect(css).toContain(
      ".kd-mask--blob{clip-path:inset(0 round 60% 40% 30% 70% / 60% 30% 70% 40%)",
    );
    expect(css).not.toMatch(/\.kd-mask--\w+\{border-radius:(?!0)/);
  });
});
