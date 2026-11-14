import { describe, expect, it } from "vitest";
import { renderDesignedBody } from "../src/index.js";
import { design, linksContent, section, testContext } from "./fixtures.js";

const blocks = [{ id: "cl1", kind: "contentLinks", layout: "list" } as const];

describe("ambient (fondo difuminado)", () => {
  it("is active by default (absent means auto): a fixed layer behind the page", () => {
    const d = design([section("s1", [blocks])]);
    const { html, css } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain('<div class="kd-ambient" aria-hidden="true"></div>');
    expect(html.indexOf("kd-ambient")).toBeLessThan(
      html.indexOf('class="kd-container"'),
    );
    expect(css).toContain("position:fixed;inset:0;z-index:-1");
    expect(css).toContain("isolation:isolate");
  });

  it("kind: 'none' renders no ambient layer and keeps the page's own background", () => {
    const d = design([section("s1", [blocks])]);
    d.style.ambient = { kind: "none" };
    const { html, css } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).not.toContain("kd-ambient");
    expect(css).not.toContain(".kd-ambient");
    expect(css).toContain("background:#f7f5f0");
  });

  it("kind: 'custom' uses the given colors, clamped/validated like everything else", () => {
    const d = design([section("s1", [blocks])]);
    d.style.ambient = {
      kind: "custom",
      color: "#ff0000",
      colorTo: "#0000ff",
      strength: 999,
    };
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("background:#ff0000");
    expect(css).toContain("background:#0000ff");
    // An out-of-range strength is clamped to 100 before it ever reaches the
    // opacity math, never interpolated as-is.
    const opacities = [...css.matchAll(/opacity:([0-9.]+)/g)].map((m) =>
      Number(m[1]),
    );
    expect(opacities.length).toBeGreaterThan(0);
    for (const value of opacities) expect(value).toBeLessThanOrEqual(1);
  });

  it("kind: 'auto' derives colors from the palette instead of a client string", () => {
    const d = design([section("s1", [blocks])]);
    d.style.palette.accent = "#ff9900";
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toMatch(/\.kd-ambient::before\{[^}]*background:#[0-9a-f]{6}/);
    expect(css).toMatch(/\.kd-ambient::after\{[^}]*background:#[0-9a-f]{6}/);
  });

  it("with an image page background, blurs that same image instead of drawing glows", () => {
    const d = design([section("s1", [blocks])]);
    d.style.background = { kind: "image", imageRef: "bg1", overlay: 20 };
    const { css } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ resolveImage: () => "https://cdn.example.test/bg1" }),
    );
    expect(css).toContain('url("https://cdn.example.test/bg1")');
    expect(css).toContain("filter:blur(");
    expect(css).not.toContain("::before");
  });

  it("never lets a client string reach the CSS: an invalid custom color falls back safely", () => {
    const d = design([section("s1", [blocks])]);
    d.style.ambient = {
      kind: "custom",
      color: "red;}body{background:url(https://evil.test)",
    };
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).not.toContain("evil.test");
    expect(css).not.toContain("</style>");
  });
});
