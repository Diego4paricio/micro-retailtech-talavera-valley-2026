import { reset, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

const publicId = "kardotesttouchpoint01";
const commandHeaders = {
  authorization: "Bearer resolver-test-command",
  "content-type": "application/json",
};

afterEach(async () => reset());

async function publishExperience(
  experience: unknown,
  options: { revision?: number; assets?: unknown; id?: string } = {},
): Promise<Response> {
  return SELF.fetch("https://resolver.test/internal/publish", {
    method: "POST",
    headers: commandHeaders,
    body: JSON.stringify({
      publicId: options.id ?? publicId,
      revision: options.revision ?? 1,
      experience,
      ...(options.assets ? { assets: options.assets } : {}),
    }),
  });
}

const imageSha256 = "c".repeat(64);

describe('custom HTML page rendering ("modo HTML", ADR 018)', () => {
  it("renders inside a declarative shadow root template; no script tags or on* handlers ever appear", async () => {
    // Already sanitizer-clean (no <script>, no on*): parsePublishedCustomHtml
    // requires the stored value to be exactly what prepareCustomHtml would
    // produce — see the "rejects ... not sanitizer-clean" test below for
    // proof that raw, unsanitized markup is rejected at publish time.
    const publish = await publishExperience(
      {
        type: "links",
        title: "Panadería El Sol",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        customHtml: {
          html: `<div class="hero"><img src="kardo-asset:${imageSha256}" alt="Foto"><kardo-links></kardo-links></div>`,
          css: `.hero{color:red;background:url(kardo-asset:${imageSha256})}`,
          links: [],
        },
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(200);
    const html = await page.text();

    expect(html).toContain('<div class="kd-custom-host"');
    expect(html).toContain('<template shadowrootmode="open">');
    expect(html).toContain("contain:layout paint");
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("onerror");
    expect(html).toContain(
      `src="https://resolver.test/t/${publicId}/assets/${imageSha256}"`,
    );
    // The platform's own tracked link list replaced the widget tag.
    expect(html).toContain('class="k-links"');
    expect(html).toContain(`href="/t/${publicId}/go/l1?src=link`);
    // The Kardo footer stays outside the shadow host, visible in light DOM,
    // as a translucent "chip" (a modo HTML page's own background is the
    // customer's own CSS, so its luminance is never known ahead of time).
    expect(html).toContain('<footer class="kd-footer kd-footer--chip"');
    expect(html).toContain('<span class="kd-footer-chip">');
    expect(html.indexOf("kd-custom-host")).toBeLessThan(
      html.indexOf('<footer class="kd-footer kd-footer--chip"'),
    );
    // The fixed theme template never renders alongside custom HTML.
    expect(html).not.toContain('class="card"');
  });

  it("tracks a custom HTML link's click through the same /go/{itemId} route", async () => {
    await publishExperience({
      type: "links",
      title: "Panadería",
      links: [
        { id: "native", label: "Nativo", url: "https://kardo.test/nativo" },
      ],
      customHtml: {
        html: '<a href="kardo-link:h1">Reservar</a>',
        css: "",
        links: [{ id: "h1", url: "https://kardo.test/reservar" }],
      },
    });

    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/h1`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://kardo.test/reservar",
    );
  });

  it("404s for an unknown custom HTML link id", async () => {
    await publishExperience({
      type: "links",
      title: "Panadería",
      links: [
        { id: "native", label: "Nativo", url: "https://kardo.test/nativo" },
      ],
      customHtml: {
        html: '<a href="kardo-link:h1">Reservar</a>',
        css: "",
        links: [{ id: "h1", url: "https://kardo.test/reservar" }],
      },
    });

    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/h9`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(404);
  });

  it("never accepts a raw destination URL for /go — only an id already inside the published snapshot", async () => {
    await publishExperience({
      type: "links",
      title: "Panadería",
      links: [
        { id: "native", label: "Nativo", url: "https://kardo.test/nativo" },
      ],
      customHtml: {
        html: '<a href="kardo-link:h1">Reservar</a>',
        css: "",
        links: [{ id: "h1", url: "https://kardo.test/reservar" }],
      },
    });
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/${encodeURIComponent("https://evil.test")}`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(404);
  });

  it("rejects publishing when customHtml is not sanitizer-clean (idempotency check fails)", async () => {
    const publish = await publishExperience({
      type: "links",
      title: "Panadería",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      customHtml: {
        html: "<script>alert(1)</script>",
        css: "",
        links: [],
      },
    });
    expect(publish.status).toBe(400);

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(404);
  });

  it("rejects a custom HTML image ref that is not in the snapshot's own asset list", async () => {
    const publish = await publishExperience({
      type: "links",
      title: "Panadería",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      customHtml: {
        html: `<img src="kardo-asset:${imageSha256}" alt="Foto">`,
        css: "",
        links: [],
      },
      // No `assets` supplied: the image hash cannot be verified.
    });
    expect(publish.status).toBe(400);
  });

  it("rejects a custom HTML link entry never referenced by the html", async () => {
    const publish = await publishExperience({
      type: "links",
      title: "Panadería",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      customHtml: {
        html: "<div>Hola</div>",
        css: "",
        links: [{ id: "h1", url: "https://kardo.test/dangling" }],
      },
    });
    expect(publish.status).toBe(400);
  });

  it("precedence: customHtml wins over design, and design wins over theme", async () => {
    const design = {
      schema: 1,
      style: {
        palette: {
          background: "#ffffff",
          surface: "#f5f5f5",
          text: "#111111",
          muted: "#666666",
          accent: "#0a6c78",
        },
        fonts: { heading: "geist", body: "system" },
        radius: 12,
        buttonStyle: "solid",
        buttonShape: "rounded",
        shadow: "none",
        background: { kind: "solid", color: "#ffffff" },
        maxWidth: 640,
      },
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [[{ id: "cl1", kind: "contentLinks", layout: "list" }]],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    await publishExperience({
      type: "links",
      title: "Panadería",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      design,
      customHtml: {
        html: "<div>Custom gana</div>",
        css: "",
        links: [],
      },
      theme: {
        background: { kind: "solid", color: "#000000" },
        surface: "dark",
        accent: "#ffffff",
        buttonStyle: "pill",
        font: "sans",
      },
    });
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    const html = await page.text();
    expect(html).toContain("Custom gana");
    expect(html).toContain("kd-custom-host");
    expect(html).not.toContain("kd-page"); // the design renderer's own wrapper
    expect(html).not.toContain('class="card"'); // the fixed theme template
  });

  it("renders exactly as before when the experience has no customHtml", async () => {
    await publishExperience({
      type: "links",
      title: "Sin HTML propio",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
    });
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('class="card"');
    expect(html).not.toContain("kd-custom-host");
  });
});
