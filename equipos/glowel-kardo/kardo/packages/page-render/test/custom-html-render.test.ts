import { describe, expect, it } from "vitest";
import {
  htmlBlockRenderer,
  prepareCustomHtml,
  renderCustomHtmlBody,
  renderCustomHtmlDocument,
} from "../src/index.js";
import {
  linkPageContent,
  linksContent,
  profileContent,
  testContext,
} from "./fixtures.js";

describe("renderCustomHtmlBody: declarative shadow root markup", () => {
  it("wraps the sanitized body in a kd-custom-host declarative shadow root", () => {
    const prepared = prepareCustomHtml({
      html: "<div>Hola</div>",
      css: ".a{color:red}",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).toContain('<div class="kd-custom-host"');
    expect(html).toContain("contain:layout paint");
    expect(html).toContain('<template shadowrootmode="open">');
    expect(html).toContain("<style>");
    expect(html).toContain("Hola");
    expect(html.indexOf("<template")).toBeLessThan(html.indexOf("Hola"));
  });

  it("sizes everything border-box inside the shadow root, before the customer's CSS", () => {
    const base = ":where(*,*::before,*::after){box-sizing:border-box}";
    const prepared = prepareCustomHtml({
      html: "<div>Hola</div>",
      css: ".a{width:100%;padding:12px}",
    });
    const page = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(page).toContain(`<style>${base}`);
    const block = htmlBlockRenderer(() => null)("<p>Hola</p>", ".a{color:red}");
    expect(block).toContain(`<style>${base}`);
  });

  it("resolves a library image in a style attribute, like in the stylesheet", () => {
    const ref = "a".repeat(64);
    const prepared = prepareCustomHtml({
      html: `<header class="hero" style="background-image: url(kardo-asset:${ref}); color: #fff">Hola</header>`,
      css: "",
    });
    const page = renderCustomHtmlBody(linksContent(), prepared, {
      ...testContext(),
      resolveImage: (value) =>
        value === ref ? "https://img.test/portada.webp" : null,
    });
    expect(page).toContain("https://img.test/portada.webp");
    expect(page).not.toContain("kardo-asset:");
    const block = htmlBlockRenderer(() => null)(
      `<div style="background-image:url(kardo-asset:${ref});color:#fff">Hola</div>`,
      "",
    );
    expect(block).not.toContain("kardo-asset:");
    expect(block).toContain("color:#fff");
  });

  it("never contains a <script> tag or an on* handler", () => {
    const prepared = prepareCustomHtml({
      html: '<img src=x onerror=alert(1)><script>alert(1)</script><div onclick="a()">hi</div>',
      css: "",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("onerror");
    expect(html.toLowerCase()).not.toContain("onclick");
  });

  it("declares the webfonts it names outside the shadow root (Chromium ignores them inside)", () => {
    const prepared = prepareCustomHtml({
      html: "<h1>Hola</h1>",
      css: 'h1{font-family:"Playfair Display",serif}',
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    const face = html.indexOf("@font-face");
    expect(face).toBeGreaterThanOrEqual(0);
    expect(face).toBeLessThan(html.indexOf('<div class="kd-custom-host"'));
    expect(html.slice(html.indexOf("<template"))).not.toContain("@font-face");
    expect(html).toContain(
      "/_fonts/playfair-display/PlayfairDisplay-700.woff2",
    );
  });

  it("adds no font rules when the CSS names none of the webfonts", () => {
    const prepared = prepareCustomHtml({ html: "<h1>Hola</h1>", css: "" });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).not.toContain("@font-face");
    expect(html.startsWith('<div class="kd-custom-host"')).toBe(true);
  });

  it("does not include the Kardo footer (the caller places it outside the host)", () => {
    const prepared = prepareCustomHtml({ html: "<div>Hola</div>", css: "" });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).not.toContain("kardo-footer");
    expect(html).not.toContain("Kardo");
  });
});

describe("renderCustomHtmlBody: token substitution", () => {
  it("resolves kardo-link: tokens through ctx.linkHref", () => {
    const prepared = prepareCustomHtml({
      html: '<a href="https://example.com/a">Go</a>',
      css: "",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).toContain('href="/go/h1"');
    expect(html).not.toContain("kardo-link:");
  });

  it("drops an <a> with a dangling kardo-link: id (defense in depth)", () => {
    const html = renderCustomHtmlBody(
      linksContent(),
      { html: '<a href="kardo-link:h9">Go</a>', css: "", links: [] },
      testContext(),
    );
    expect(html).not.toContain("href=");
    expect(html).toContain("Go");
  });

  it("resolves kardo-asset: image src through ctx.resolveImage", () => {
    const prepared = prepareCustomHtml({
      html: '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="Foto">',
      css: "",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).toContain(
      'src="https://cdn.example.test/11111111-1111-1111-1111-111111111111"',
    );
  });

  it("drops the whole <img> when resolveImage returns null", () => {
    const prepared = prepareCustomHtml({
      html: '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="Foto">',
      css: "",
    });
    const ctx = testContext({ resolveImage: () => null });
    const html = renderCustomHtmlBody(linksContent(), prepared, ctx);
    expect(html).not.toContain("<img");
  });

  it("resolves kardo-asset: in css url() and drops it when unresolved", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{background:url(kardo-asset:11111111-1111-1111-1111-111111111111)}",
    });
    const resolved = renderCustomHtmlBody(
      linksContent(),
      prepared,
      testContext(),
    );
    expect(resolved).toContain(
      "url(https://cdn.example.test/11111111-1111-1111-1111-111111111111)",
    );
    const dropped = renderCustomHtmlBody(
      linksContent(),
      prepared,
      testContext({ resolveImage: () => null }),
    );
    expect(dropped).not.toContain(".a{background");
  });
});

describe("renderCustomHtmlBody: widgets", () => {
  it("renders kardo-links as the platform's own tracked link list", () => {
    const prepared = prepareCustomHtml({
      html: "<kardo-links></kardo-links>",
      css: "",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).toContain('class="k-links"');
    expect(html).toContain('class="k-link"');
    expect(html).toContain('href="/go/l1"');
    expect(html).not.toContain("<kardo-links");
  });

  it("renders kardo-socials only for a linkpage", () => {
    const preparedSocials = prepareCustomHtml({
      html: "<kardo-socials></kardo-socials>",
      css: "",
    });
    const onLinkpage = renderCustomHtmlBody(
      linkPageContent(),
      preparedSocials,
      testContext(),
    );
    expect(onLinkpage).toContain('class="k-socials"');
    expect(onLinkpage).toContain('class="k-social"');

    const onLinks = renderCustomHtmlBody(
      linksContent(),
      preparedSocials,
      testContext(),
    );
    expect(onLinks).not.toContain('class="k-socials');
  });

  it("gives the widgets base styles any customer rule overrides", () => {
    const prepared = prepareCustomHtml({
      html: "<kardo-links></kardo-links>",
      css: "ul{padding:8px}",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    // Zero specificity, and before the customer's CSS.
    expect(html).toContain(":where(.k-links,.k-socials){list-style:none");
    expect(html.indexOf(":where(.k-links")).toBeLessThan(
      html.indexOf("ul{padding:8px}"),
    );
  });

  it("renders kardo-profile for profile and linkpage, not for links", () => {
    const prepared = prepareCustomHtml({
      html: "<kardo-profile></kardo-profile>",
      css: "",
    });
    const onProfile = renderCustomHtmlBody(
      profileContent(),
      prepared,
      testContext(),
    );
    expect(onProfile).toContain('class="k-profile"');
    expect(onProfile).toContain("Ana Pérez");

    const onLinks = renderCustomHtmlBody(
      linksContent(),
      prepared,
      testContext(),
    );
    expect(onLinks).not.toContain('class="k-profile');
  });

  it("carries the widget's own class/id onto the generated wrapper", () => {
    const prepared = prepareCustomHtml({
      html: '<kardo-links class="my-links" id="nav"></kardo-links>',
      css: "",
    });
    const html = renderCustomHtmlBody(linksContent(), prepared, testContext());
    expect(html).toContain('class="k-links my-links"');
    expect(html).toContain('id="nav"');
  });
});

describe("renderCustomHtmlDocument: standalone preview document", () => {
  it("includes the same body plus the Kardo 'chip' footer outside the shadow host, and no scripts", () => {
    const prepared = prepareCustomHtml({ html: "<div>Hola</div>", css: "" });
    const doc = renderCustomHtmlDocument(
      linksContent(),
      prepared,
      testContext(),
      {
        title: "Mi página",
      },
    );
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("<title>Mi página</title>");
    expect(doc).toContain('<div class="kd-custom-host"');
    // "chip": a translucent pill with the logo, legible over any background —
    // a modo HTML page's own background is the customer's own CSS.
    expect(doc).toContain('<footer class="kd-footer kd-footer--chip"');
    expect(doc).toContain('<span class="kd-footer-chip">');
    expect(doc.indexOf('<div class="kd-custom-host"')).toBeLessThan(
      doc.indexOf('<footer class="kd-footer kd-footer--chip"'),
    );
    expect(doc.toLowerCase()).not.toContain("<script");
    expect(doc).toContain("html,body{margin:0}");
  });
});
