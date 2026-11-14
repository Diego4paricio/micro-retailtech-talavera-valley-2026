import type { CanvasSection, PageDesign } from "@kardo/contracts";
import { checkDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { parsePublishedDesign, renderDesignedBody } from "../src/index.js";
import { baseStyle, linksContent, section, testContext } from "./fixtures.js";

const imageHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function canvas(overrides: Partial<CanvasSection> = {}): CanvasSection {
  return {
    id: "c1",
    kind: "canvas",
    height: 640,
    items: [
      // Listed out of reading order on purpose.
      {
        block: {
          id: "shape1",
          kind: "shape",
          shape: "ellipse",
          fill: "accent",
        },
        x: 200,
        y: 300,
        w: 120,
        h: 120,
        z: 1,
      },
      {
        block: {
          id: "h1",
          kind: "heading",
          text: "Luna",
          level: 1,
          style: { fontSize: 40, paddingX: 8 },
        },
        x: 16,
        y: 40,
        w: 200,
      },
      {
        block: {
          id: "img1",
          kind: "image",
          imageRef: imageHash,
          alt: "Ramo",
          aspect: "1:1",
          fit: "cover",
        },
        x: -20,
        y: 120,
        w: 220,
        h: 180,
        z: 2,
      },
    ],
    ...overrides,
  };
}

function canvasDesign(extra: Partial<CanvasSection> = {}): PageDesign {
  return {
    schema: 2,
    style: baseStyle(),
    sections: [
      section("s1", [[{ id: "links1", kind: "contentLinks", layout: "list" }]]),
      canvas(extra),
    ],
  };
}

describe("canvas sections (lienzo libre)", () => {
  it("renders items in reading order with scalable positions", () => {
    const { html, css } = renderDesignedBody(
      linksContent(),
      canvasDesign(),
      testContext(),
    );
    // Top to bottom, then left to right, whatever the z order.
    const order = [...html.matchAll(/data-item-id="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(order).toEqual(["h1", "img1", "shape1"]);
    expect(html).toContain('class="kd-sec kd-canvas kd-canvas-1"');
    expect(css).toContain("--u:calc(100cqw / 390)");
    expect(css).toContain("container-type:inline-size");
    expect(css).toContain("aspect-ratio:390 / 640");
    // Item boxes in design px, negative x allowed (bleeds and is clipped).
    expect(css).toContain(
      ".kd-cv-1-1{left:calc(-20 * var(--u));top:calc(120 * var(--u));width:calc(220 * var(--u));height:calc(180 * var(--u));z-index:2}",
    );
    // Text blocks keep their own height: no fixed height for the heading.
    expect(css).toContain(
      ".kd-cv-1-0{left:calc(16 * var(--u));top:calc(40 * var(--u));width:calc(200 * var(--u))}",
    );
  });

  it("writes block styles in canvas units so everything scales together", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      canvasDesign(),
      testContext(),
    );
    expect(html).toContain("font-size:calc(40 * var(--u))");
    expect(html).toContain("padding-left:calc(8 * var(--u))");
    expect(html).not.toContain("font-size:40px");
  });

  it("fills images and shapes to their item box", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      canvasDesign(),
      testContext(),
    );
    expect(html).toMatch(
      /class="kd-ci kd-cv-1-1 kd-ci--fill" data-item-id="img1"/,
    );
    expect(html).toContain('class="kd-shape kd-shape--ellipse"');
    expect(html).toContain("background:var(--kd-accent)");
  });

  it("adds the canvas CSS only when the page has a canvas", () => {
    const flowOnly: PageDesign = {
      schema: 1,
      style: baseStyle(),
      sections: [
        section("s1", [
          [{ id: "links1", kind: "contentLinks", layout: "list" }],
        ]),
      ],
    };
    const { css } = renderDesignedBody(linksContent(), flowOnly, testContext());
    expect(css).not.toContain("kd-canvas");
    expect(css).not.toContain("--u:");
  });

  it("is accepted by the Resolver's validation as schema 2", () => {
    const parsed = parsePublishedDesign(
      canvasDesign(),
      "links",
      new Set([imageHash]),
      ["l1"],
    );
    expect(parsed).not.toBeNull();
  });

  it("is refused as schema 1, off the canvas or with flow-only blocks", () => {
    const asSchema1 = { ...canvasDesign(), schema: 1 as const };
    expect(checkDesign("links", asSchema1).map((i) => i.message)).toContain(
      "Canvas sections need design schema 2.",
    );

    const outside = canvasDesign({
      items: [
        {
          block: { id: "h9", kind: "heading", text: "Fuera", level: 2 },
          x: 400,
          y: 10,
          w: 100,
        },
      ],
    });
    expect(checkDesign("links", outside).map((i) => i.message)).toContain(
      "Outside the canvas.",
    );

    const spacer = canvasDesign({
      items: [
        { block: { id: "sp9", kind: "spacer", height: 24 }, x: 0, y: 0, w: 40 },
      ],
    });
    expect(checkDesign("links", spacer).map((i) => i.message)).toContain(
      "spacer cannot be placed on a canvas.",
    );

    const shapeInFlow: PageDesign = {
      schema: 1,
      style: baseStyle(),
      sections: [
        section("s1", [
          [
            { id: "links1", kind: "contentLinks", layout: "list" },
            { id: "sh1", kind: "shape", shape: "rect", fill: "text" },
          ],
        ]),
      ],
    };
    expect(checkDesign("links", shapeInFlow).map((i) => i.message)).toContain(
      "Shapes can only be placed on a canvas.",
    );
  });

  it("checks every canvas block against the full block schema", () => {
    const bad = canvasDesign({
      items: [
        {
          block: {
            id: "wa1",
            kind: "brandButton",
            brand: "myspace",
            label: "Hola",
            href: "https://example.com/",
            look: "brand",
          } as never,
          x: 0,
          y: 0,
          w: 200,
        },
        {
          block: { id: "h2", kind: "heading", text: "Hola", level: 9 } as never,
          x: 0,
          y: 60,
          w: 200,
        },
      ],
    });
    const issues = checkDesign("links", bad);
    expect(issues.filter((i) => i.message === "Invalid block.")).toHaveLength(
      2,
    );
    expect(parsePublishedDesign(bad, "links", new Set(), ["l1"])).toBeNull();
  });

  it("rejects ids repeated across flow and canvas sections", () => {
    const repeated = canvasDesign({
      items: [
        {
          block: { id: "links1", kind: "divider" },
          x: 0,
          y: 0,
          w: 100,
        },
      ],
    });
    expect(checkDesign("links", repeated).map((i) => i.message)).toContain(
      "Repeated id.",
    );
  });
});

describe("canvas items: rotation and hidden (addendum 3)", () => {
  it("writes a clamped rotate() transform for r", () => {
    const d = canvasDesign({
      items: [
        {
          block: { id: "h1", kind: "heading", text: "Luna", level: 1 },
          x: 0,
          y: 0,
          w: 200,
          r: 15,
        },
      ],
    });
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("transform:rotate(15deg)");
  });

  it("clamps an out-of-range rotation to ±180", () => {
    const d = canvasDesign({
      items: [
        {
          block: { id: "h1", kind: "heading", text: "Luna", level: 1 },
          x: 0,
          y: 0,
          w: 200,
          r: 999,
        },
      ],
    });
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("transform:rotate(180deg)");
  });

  it("writes no transform when r is absent", () => {
    const { css } = renderDesignedBody(
      linksContent(),
      canvasDesign(),
      testContext(),
    );
    expect(css).not.toContain("transform:rotate");
  });

  it("never draws a hidden item, in the markup or its own CSS rule", () => {
    const d = canvasDesign({
      items: [
        {
          block: { id: "h1", kind: "heading", text: "Visible", level: 1 },
          x: 0,
          y: 0,
          w: 200,
        },
        {
          block: { id: "h2", kind: "heading", text: "Oculto", level: 1 },
          x: 0,
          y: 60,
          w: 200,
          hidden: true,
        },
      ],
    });
    const { html, css } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain("Visible");
    expect(html).not.toContain("Oculto");
    expect(html).not.toContain('data-item-id="h2"');
    // The hidden item does not shift the CSS index of the one after it.
    expect(css).toContain(
      ".kd-cv-1-0{left:0;top:0;width:calc(200 * var(--u))}",
    );
  });

  it("locked does not change the render at all", () => {
    const unlocked = canvasDesign({
      items: [
        {
          block: { id: "h1", kind: "heading", text: "Luna", level: 1 },
          x: 10,
          y: 10,
          w: 200,
        },
      ],
    });
    const locked = canvasDesign({
      items: [
        {
          block: { id: "h1", kind: "heading", text: "Luna", level: 1 },
          x: 10,
          y: 10,
          w: 200,
          locked: true,
        },
      ],
    });
    const a = renderDesignedBody(linksContent(), unlocked, testContext());
    const b = renderDesignedBody(linksContent(), locked, testContext());
    expect(a.html).toBe(b.html);
    expect(a.css).toBe(b.css);
  });
});

describe("canvas full bleed on phone follows the page's own margin", () => {
  it("uses the design's pagePadding, not a hardcoded 16px", () => {
    const d = canvasDesign();
    d.style.pagePadding = 24;
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("--kd-pad:24px");
    expect(css).toContain(
      "margin-left:calc(var(--kd-pad, 16px) * -1);margin-right:calc(var(--kd-pad, 16px) * -1)",
    );
  });
});
