import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { htmlBlockRenderer, renderDesignedBody } from "../src/index.js";
import { design, linksContent, section, testContext } from "./fixtures.js";

describe("html block: rendering inside a designed page", () => {
  it("calls ctx.renderHtmlBlock and embeds its markup", () => {
    const blocks: DesignBlock[] = [
      { id: "html1", kind: "html", html: "<p>Hola</p>", css: "" },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext({
        renderHtmlBlock: (h, c) => `<div class="stub">${h}|${c}</div>`,
      }),
    );
    expect(html).toContain('class="kd-html"');
    expect(html).toContain('<div class="stub"><p>Hola</p>|</div>');
  });

  it("draws a discreet placeholder when renderHtmlBlock is not wired up", () => {
    const blocks: DesignBlock[] = [
      { id: "html1", kind: "html", html: "<p>Hola</p>", css: "" },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("kd-html-placeholder");
    expect(html).toContain("Bloque HTML");
    expect(html).not.toContain("<p>Hola</p>");
  });

  it("registers a Kardo webfont the block's CSS names, on the page's own @font-face", () => {
    const blocks: DesignBlock[] = [
      {
        id: "html1",
        kind: "html",
        html: "<p>Hola</p>",
        css: 'p{font-family:"Playfair Display",serif}',
      },
    ];
    const { css } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext({ renderHtmlBlock: (h) => h }),
    );
    expect(css).toContain("@font-face");
    expect(css).toContain("Playfair Display");
  });
});

describe("htmlBlockRenderer: sanitized, isolated, untracked links", () => {
  const resolveImage = (ref: string) => `https://cdn.example.test/${ref}`;

  it("returns a host with a declarative shadow root", () => {
    const render = htmlBlockRenderer(resolveImage);
    const out = render("<div>Hola</div>", ".a{color:red}");
    expect(out).toContain('class="kd-html-host"');
    expect(out).toContain('<template shadowrootmode="open">');
    expect(out).toContain("Hola");
  });

  it("strips script tags, on* handlers and javascript: links", () => {
    const render = htmlBlockRenderer(resolveImage);
    const out = render(
      '<script>alert(1)</script><div onclick="a()"><a href="javascript:alert(1)">x</a></div>',
      "",
    );
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out.toLowerCase()).not.toContain("onclick");
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("resolves a kardo-asset: image and drops it when unresolved", () => {
    const render = htmlBlockRenderer(resolveImage);
    const out = render(
      '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="">',
      "",
    );
    expect(out).toContain(
      'src="https://cdn.example.test/11111111-1111-1111-1111-111111111111"',
    );
    const dropped = htmlBlockRenderer(() => null)(
      '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="">',
      "",
    );
    expect(dropped).not.toContain("<img");
  });

  it("renders a plain https link untracked, straight to its own URL", () => {
    const render = htmlBlockRenderer(resolveImage);
    const out = render('<a href="https://example.com/a">Ir</a>', "");
    expect(out).toContain('href="https://example.com/a"');
  });

  it("drops platform widgets (no bound content inside a block)", () => {
    const render = htmlBlockRenderer(resolveImage);
    const out = render("<kardo-links></kardo-links><p>Resto</p>", "");
    expect(out).not.toContain("kardo-links");
    expect(out).not.toContain("k-links");
    expect(out).toContain("Resto");
  });

  it("keeps position:fixed and @import out of the block's CSS", () => {
    const render = htmlBlockRenderer(resolveImage);
    const out = render(
      "<div>x</div>",
      "@import url(https://evil.test/x.css); .a{position:fixed}",
    );
    expect(out).not.toContain("@import");
    expect(out).not.toContain("position:fixed");
  });
});
