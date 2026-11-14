import type { ExperienceContent, PageDesign } from "@kardo/contracts";
import { prepareCustomHtml } from "@kardo/page-render";
import { describe, expect, it } from "vitest";
import { absolutePositionForSelector } from "../src/features/studio/html/css-blocks.js";
import { designToCustomCode } from "../src/features/studio/html/from-design.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";

/**
 * The blurred background ("fondo difuminado") survives Bloques → HTML
 * (addendum: the owner's "no se trae el fondo de el de bloques"). Keeping it
 * needs `position:fixed` rewritten to `position:absolute` first, since the
 * modo HTML cleaner (`@kardo/page-render`'s `sanitize-css.ts`) always strips
 * `fixed`/`sticky` positioning outright.
 */

const content: ExperienceContent = {
  title: "Café Luna",
  links: [{ id: "l1", label: "Menú", url: "https://cafeluna.example/menu" }],
};

describe("absolutePositionForSelector", () => {
  it("rewrites only position:fixed in rules matching the selector", () => {
    const css = `
.kd-ambient{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.kd-ambient::before{content:"";position:absolute;background:#fff}
.kd-other{position:fixed}
`;
    const out = absolutePositionForSelector(css, ".kd-ambient");
    expect(out).toContain("position:absolute");
    expect(out).not.toMatch(/\.kd-ambient\{[^}]*position:fixed/);
    // A rule that does not match the selector is untouched.
    expect(out).toContain("position:fixed");
    expect(out).toMatch(/\.kd-other\s*\{[^}]*position:fixed/);
  });

  it("walks into nested at-rules (@media)", () => {
    const css = "@media (min-width: 640px){.kd-ambient{position:fixed}}";
    const out = absolutePositionForSelector(css, ".kd-ambient");
    expect(out).toContain("position:absolute");
    expect(out).not.toContain("position:fixed");
  });

  it("leaves non-fixed declarations in a matching rule alone", () => {
    const css = ".kd-ambient{inset:0;z-index:-1}";
    expect(absolutePositionForSelector(css, ".kd-ambient")).toBe(
      ".kd-ambient {\n  inset:0;\n  z-index:-1;\n}",
    );
  });
});

describe("designToCustomCode keeps the ambient background", () => {
  it("keeps the auto glow ambient (default) with position:absolute and survives prepareCustomHtml", () => {
    const design = designFromContent("links", content);
    const generated = designToCustomCode("links", content, design);

    expect(generated.html).toContain(
      '<div class="kd-ambient" aria-hidden="true"></div>',
    );
    expect(generated.css).toContain(".kd-ambient");
    expect(generated.css).toMatch(/\.kd-ambient\s*\{[^}]*position:absolute/);
    expect(generated.css).not.toMatch(/position:\s*fixed/);
    expect(generated.css).toContain(".kd-page");
    expect(generated.css).toMatch(/\.kd-page\s*\{[^}]*position:relative/);
    expect(generated.css).toMatch(/\.kd-page\s*\{[^}]*overflow:hidden/);

    const prepared = prepareCustomHtml(generated);
    expect(prepared.report.removedCssRules).toBe(0);
    expect(prepared.report.removedCss).toEqual({});
    expect(prepared.html).toContain("kd-ambient");
    expect(prepared.css).toContain("kd-ambient");
    // The glows (::before/::after blurred circles) are still there.
    expect(prepared.css).toMatch(/kd-ambient::before/);
    expect(prepared.css).toMatch(/kd-ambient::after/);
  });

  it("keeps a custom-color ambient", () => {
    const base = designFromContent("links", content);
    const design: PageDesign = {
      ...base,
      style: {
        ...base.style,
        ambient: { kind: "custom", color: "#ff0000", colorTo: "#00ff00" },
      },
    };
    const generated = designToCustomCode("links", content, design);
    expect(generated.css).toContain("#ff0000");
    expect(generated.css).toContain("#00ff00");
    const prepared = prepareCustomHtml(generated);
    expect(prepared.css).toContain("#ff0000");
    expect(prepared.report.removedCss).toEqual({});
  });

  it("keeps the blurred image background (kardo-asset URL) of an image-background page", () => {
    const base = designFromContent("links", content);
    const design: PageDesign = {
      ...base,
      style: {
        ...base.style,
        background: {
          kind: "image",
          imageRef: "11111111-1111-1111-1111-111111111111",
          overlay: 20,
          position: "center",
        },
      },
    };
    const generated = designToCustomCode("links", content, design);
    expect(generated.css).toContain(
      "kardo-asset:11111111-1111-1111-1111-111111111111",
    );
    expect(generated.css).toMatch(/\.kd-ambient\s*\{[^}]*position:absolute/);
    const prepared = prepareCustomHtml(generated);
    expect(prepared.css).toContain(
      "kardo-asset:11111111-1111-1111-1111-111111111111",
    );
    expect(prepared.report.removedCss).toEqual({});
  });

  it("drops nothing when ambient is explicitly off", () => {
    const base = designFromContent("links", content);
    const design: PageDesign = {
      ...base,
      style: { ...base.style, ambient: { kind: "none" } },
    };
    const generated = designToCustomCode("links", content, design);
    expect(generated.html).not.toContain("kd-ambient");
    expect(generated.css).not.toContain("kd-ambient");
    // `.kd-page`'s own relative/overflow rule is still added (harmless with
    // no ambient layer to position).
    expect(generated.css).toContain(".kd-page");
  });
});
