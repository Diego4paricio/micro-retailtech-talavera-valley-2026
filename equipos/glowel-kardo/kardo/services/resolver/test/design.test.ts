import { reset, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { publicHtmlHeaders } from "../src/index.js";

const publicId = "kardotesttouchpoint01";
const commandHeaders = {
  authorization: "Bearer resolver-test-command",
  "content-type": "application/json",
};

afterEach(async () => reset());

async function publishExperience(
  experience: unknown,
  options: {
    revision?: number;
    assets?: unknown;
    id?: string;
    experienceId?: string;
  } = {},
): Promise<Response> {
  return SELF.fetch("https://resolver.test/internal/publish", {
    method: "POST",
    headers: commandHeaders,
    body: JSON.stringify({
      publicId: options.id ?? publicId,
      revision: options.revision ?? 1,
      experience,
      ...(options.assets ? { assets: options.assets } : {}),
      ...(options.experienceId ? { experienceId: options.experienceId } : {}),
    }),
  });
}

function baseDesignStyle() {
  return {
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
  };
}

const imageSha256 = "c".repeat(64);
const pdfSha256 = "d".repeat(64);

function linksDesign() {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [
            { id: "ct1", kind: "contentTitle" },
            {
              id: "img1",
              kind: "image",
              imageRef: imageSha256,
              alt: "Foto",
              aspect: "1:1",
              fit: "cover",
            },
            {
              id: "b1",
              kind: "button",
              label: "Reservar",
              href: "https://kardo.test/reservar",
              variant: "primary",
            },
            { id: "cl1", kind: "contentLinks", layout: "list" },
          ],
        ],
        paddingTop: 24,
        paddingBottom: 24,
        gap: 12,
        align: "center",
      },
    ],
  };
}

describe("designed page rendering", () => {
  it("renders a links experience's design blocks, including a tracked content link", async () => {
    const publish = await publishExperience(
      {
        type: "links",
        title: "Panadería El Sol",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design: linksDesign(),
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(200);
    const html = await page.text();

    expect(html).toContain("Panadería El Sol");
    expect(html).toContain('data-section-id="s1"');
    expect(html).toContain('data-block-id="ct1"');
    expect(html).toContain(
      `src="https://resolver.test/t/${publicId}/assets/${imageSha256}"`,
    );
    expect(html).toContain("Reservar");
    expect(html).toContain(`href="/t/${publicId}/go/l1?src=link`);
    // The design replaces the old fixed template entirely.
    expect(html).not.toContain('class="card"');
  });

  it("renders a linkpage design with a profile header and socials", async () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              {
                id: "ph1",
                kind: "profileHeader",
                layout: "stacked",
                avatarShape: "circle",
              },
              { id: "cs1", kind: "contentSocials", size: "medium" },
              { id: "cl1", kind: "contentLinks", layout: "list" },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 12,
          align: "center",
        },
      ],
    };
    const publish = await publishExperience({
      type: "linkpage",
      displayName: "Ana",
      socials: [
        { id: "so1", network: "instagram", value: "https://instagram.com/ana" },
      ],
      links: [
        {
          id: "l1",
          label: "Tienda",
          url: "https://kardo.test/tienda",
          highlight: true,
        },
      ],
      design,
    });
    expect(publish.status).toBe(200);

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Ana");
    expect(html).toContain("kd-social");
    expect(html).toContain("kd-link--highlight");
  });

  it("tracks a design button's click through the same /go/{itemId} route as a content link", async () => {
    await publishExperience(
      {
        type: "links",
        title: "Panadería",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design: linksDesign(),
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );

    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/b1`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://kardo.test/reservar",
    );
  });

  it("serves a schema 2 canvas and tracks its brand button through /go/{itemId}", async () => {
    const design = { ...linksDesign(), schema: 2 };
    (design.sections as unknown[]).push({
      id: "c1",
      kind: "canvas",
      height: 480,
      items: [
        {
          block: {
            id: "wa1",
            kind: "brandButton",
            brand: "whatsapp",
            label: "Escríbenos",
            href: "https://wa.me/525512345678",
            look: "brand",
          },
          x: 24,
          y: 40,
          w: 342,
        },
        {
          block: { id: "sh1", kind: "shape", shape: "ellipse", fill: "accent" },
          x: 200,
          y: 200,
          w: 120,
          h: 120,
        },
      ],
    });
    const publish = await publishExperience(
      {
        type: "links",
        title: "Florería Luna",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design,
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('class="kd-sec kd-canvas kd-canvas-1"');
    expect(html).toContain('data-item-id="wa1"');
    expect(html).toContain("kd-brand");
    expect(html).toContain(`href="/t/${publicId}/go/wa1`);

    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/wa1`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://wa.me/525512345678");
  });

  it("never accepts a raw href for a design button id it does not recognize", async () => {
    await publishExperience(
      {
        type: "links",
        title: "Panadería",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design: linksDesign(),
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/${encodeURIComponent("https://evil.test")}`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(404);
  });

  it("rejects publishing a snapshot whose design is invalid, so the Touchpoint stays unavailable", async () => {
    const publish = await publishExperience({
      type: "links",
      title: "Panadería",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      // Missing the required contentLinks bound block.
      design: {
        schema: 1,
        style: baseDesignStyle(),
        sections: [
          {
            id: "s1",
            layout: "1",
            columns: [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]],
            paddingTop: 0,
            paddingBottom: 0,
            gap: 0,
            align: "start",
          },
        ],
      },
    });
    expect(publish.status).toBe(400);

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(404);
  });

  it("rejects a design image whose hash is not in the snapshot's own asset list", async () => {
    const publish = await publishExperience(
      {
        type: "links",
        title: "Panadería",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design: linksDesign(),
      },
      // No `assets` supplied at all: the image's hash cannot be verified.
    );
    expect(publish.status).toBe(400);
  });

  it("renders exactly as before when the experience has no design", async () => {
    await publishExperience({
      type: "links",
      title: "Sin diseño",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
    });
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('class="card"');
    expect(html).not.toContain("kd-page");
  });
});

describe("webfonts: /_fonts/*", () => {
  it("serves a designed page's webfont with a long immutable cache", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/_fonts/geist/Geist-400.woff2",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const bytes = await response.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("returns 404 for a font path outside the served catalog", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/_fonts/does-not-exist.woff2",
    );
    expect(response.status).toBe(404);
  });
});

describe("publicHtmlHeaders: font-src", () => {
  it("always includes font-src 'self' alongside every other existing directive", () => {
    const csp = (
      publicHtmlHeaders({ formAction: "none" }) as Record<string, string>
    )["content-security-policy"];
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("img-src 'self'");
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("keeps font-src alongside the Turnstile relaxation", () => {
    const csp = (
      publicHtmlHeaders({ formAction: "self", turnstile: true }) as Record<
        string,
        string
      >
    )["content-security-policy"];
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("script-src https://challenges.cloudflare.com");
  });
});

// ---------------------------------------------------------------------------
// Addendum 3 (2026-09-30): the Estudio opens to every designable type. Each
// one now serves `@kardo/page-render`'s `renderDesignedDocument` directly —
// the same document the panel's preview builds — instead of the Resolver's
// own fixed template.
// ---------------------------------------------------------------------------

function menuDesign() {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [
            { id: "ct1", kind: "contentTitle" },
            { id: "menu1", kind: "menu", layout: "list", photos: "small" },
          ],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 12,
        align: "start",
      },
    ],
  };
}

function catalogDesign() {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [
            { id: "ct1", kind: "contentTitle" },
            { id: "cat1", kind: "catalog", layout: "grid", columns: 2 },
          ],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 12,
        align: "start",
      },
    ],
  };
}

function formDesign() {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [
            { id: "ct1", kind: "contentTitle" },
            { id: "lf1", kind: "leadForm", look: "boxed", buttonWidth: "full" },
          ],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 12,
        align: "start",
      },
    ],
  };
}

function documentDesign() {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [
            { id: "ct1", kind: "contentTitle" },
            { id: "dp1", kind: "documentPages", pageStyle: "shadow" },
          ],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 12,
        align: "start",
      },
    ],
  };
}

function imageDesign() {
  return {
    schema: 1,
    style: baseDesignStyle(),
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [{ id: "im1", kind: "imageMain", fit: "cover", frame: "card" }],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
        align: "start",
      },
    ],
  };
}

describe("designed pages: Menú, Catálogo, Formulario, PDF and Imagen (addendum 3)", () => {
  it("renders a designed Menú with its sections, prices and the Kardo footer", async () => {
    const publish = await publishExperience({
      type: "menu",
      title: "Menú de prueba",
      currency: "MXN",
      sections: [
        {
          id: "sec1",
          name: "Entradas",
          items: [{ id: "d1", name: "Sopa de la casa", price: 45 }],
        },
      ],
      design: menuDesign(),
    });
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain("Menú de prueba");
    expect(html).toContain("Sopa de la casa");
    expect(html).toContain('class="kd-menu"');
    expect(html).toContain("$45.00");
    expect(html).toContain('<footer class="kd-footer');
    expect(html).not.toContain('class="card"');
  });

  it("renders a featuredItems block with the Menú's own live availability applied (ADR 017)", async () => {
    const experienceId = "2f7a4dc0-0bb7-450e-91c6-342045d779e9";
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              {
                id: "fi1",
                kind: "featuredItems",
                layout: "hero",
                label: "Lo más pedido",
                itemIds: ["d1", "d2"],
              },
              { id: "menu1", kind: "menu", layout: "list", photos: "none" },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 12,
          align: "start",
        },
      ],
    };
    const publish = await publishExperience(
      {
        type: "menu",
        title: "Menú de prueba",
        currency: "MXN",
        sections: [
          {
            id: "sec1",
            name: "Entradas",
            items: [
              { id: "d1", name: "Sopa de la casa", price: 45 },
              { id: "d2", name: "Tacos", price: 60 },
            ],
          },
        ],
        design,
      },
      { experienceId },
    );
    expect(publish.status).toBe(200);

    const availability = await SELF.fetch(
      "https://resolver.test/internal/item-availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({
          experienceId,
          version: 1,
          items: [
            { id: "d1", status: "sold_out", quantity: null },
            { id: "d2", status: "available", quantity: 2 },
          ],
        }),
      },
    );
    expect(availability.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('data-block-id="fi1"');
    expect(html).toContain("kd-featured-label");
    expect(html).toContain("Lo más pedido");
    expect(html).toContain("Sopa de la casa");
    expect(html).toContain("Tacos");
    expect(html).toContain(
      '<span class="kd-badge kd-badge--sold-out">Agotado</span>',
    );
    expect(html).toContain(
      '<span class="kd-badge kd-badge--low">Quedan 2</span>',
    );
    expect(html).toMatch(/kd-featured-hero[^"]*"[^>]*>[\s\S]*kd-sold-out/);
  });

  it("'sin banco de fotos': a dish with no photo shows no placeholder on the public page", async () => {
    const publish = await publishExperience({
      type: "menu",
      title: "Menú de prueba",
      currency: "MXN",
      sections: [
        {
          id: "sec1",
          name: "Entradas",
          items: [{ id: "d1", name: "Sopa de la casa", price: 45 }],
        },
      ],
      design: menuDesign(),
    });
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    // The static placeholder CSS is always present; no element ever uses it.
    expect(html).not.toContain("data-item-photo");
    expect(html).not.toContain("data-placeholder");
    expect(html).not.toMatch(/class="[^"]*\bkd-placeholder\b/);
    expect(html).not.toContain("<img");
  });

  it("renders a designed Catálogo with its products", async () => {
    const publish = await publishExperience({
      type: "catalog",
      title: "Catálogo de prueba",
      currency: "MXN",
      items: [{ id: "p1", name: "Ramo de rosas", price: 350 }],
      design: catalogDesign(),
    });
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain("Catálogo de prueba");
    expect(html).toContain("Ramo de rosas");
    expect(html).toContain('class="kd-catalog kd-catalog--grid"');
  });

  it("renders a designed Formulario that posts to the same leads route", async () => {
    const publish = await publishExperience({
      type: "form",
      title: "Contáctanos",
      fields: { name: "optional", phone: "hidden", message: "optional" },
      submitLabel: "Enviar",
      successMessage: "Gracias",
      consentText: "Acepto ser contactado.",
      design: formDesign(),
    });
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('class="kd-form kd-form--boxed"');
    expect(html).toContain(`action="/t/${publicId}/leads?src=link`);
    expect(html).toContain("Acepto ser contactado.");
  });

  it("renders a designed visor de PDF with its pages", async () => {
    const publish = await publishExperience(
      {
        type: "document",
        title: "Catálogo en PDF",
        display: "viewer",
        pages: [{ sha256: imageSha256, width: 800, height: 1000 }],
        allowDownload: true,
        design: documentDesign(),
      },
      {
        // The PDF itself is always `assets[0]` (see snapshot.ts's
        // `ExperiencePayload` doc comment); the page image follows it.
        assets: [
          { sha256: pdfSha256, mediaType: "application/pdf" },
          { sha256: imageSha256, mediaType: "image/png" },
        ],
      },
    );
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain("Catálogo en PDF");
    expect(html).toContain('class="kd-document kd-document-viewer"');
    expect(html).toContain(
      `src="https://resolver.test/t/${publicId}/assets/${imageSha256}"`,
    );
    expect(html).toContain('alt="Página 1 de Catálogo en PDF"');
    // The download button uses the PDF asset, not a page image.
    expect(html).toContain(
      `href="https://resolver.test/t/${publicId}/assets/${pdfSha256}"`,
    );
  });

  it("never offers a page image as the download when a viewer has no PDF file (2026-10-02)", async () => {
    // A PDF rejected for active content is published with its pages only;
    // even a stray `allowDownload` must not turn a page into the download.
    const publish = await publishExperience(
      {
        type: "document",
        title: "Calculadora",
        display: "viewer",
        pages: [{ sha256: imageSha256, width: 800, height: 1000 }],
        allowDownload: true,
        design: documentDesign(),
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('alt="Página 1 de Calculadora"');
    expect(html).not.toContain(
      `href="https://resolver.test/t/${publicId}/assets/${imageSha256}"`,
    );
  });

  it("renders a designed Imagen with the main picture and the Kardo footer", async () => {
    const publish = await publishExperience(
      { type: "image", alt: "Fachada de la tienda", design: imageDesign() },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('class="kd-image-main');
    expect(html).toContain(
      `src="https://resolver.test/t/${publicId}/assets/${imageSha256}"`,
    );
    expect(html).toContain('<footer class="kd-footer');
  });
});

/** Adds a WhatsApp brand button and a plain button to a design's first
 * column, the way a template or the AI leaves them on any type. */
function withButtons<T extends { sections: { columns: unknown[][] }[] }>(
  design: T,
): T {
  design.sections[0]?.columns[0]?.push(
    {
      id: "wa1",
      kind: "brandButton",
      brand: "whatsapp",
      label: "Pedir por WhatsApp",
      href: "https://wa.me/525512345678",
      look: "brand",
    },
    {
      id: "b1",
      kind: "button",
      label: "Cómo llegar",
      href: "https://kardo.test/mapa",
      variant: "secondary",
    },
  );
  return design;
}

describe("tracked design buttons on every designable type (2026-10-03)", () => {
  const cases: {
    name: string;
    experience: Record<string, unknown>;
    assets?: unknown;
  }[] = [
    {
      name: "Menú",
      experience: {
        type: "menu",
        title: "Menú",
        currency: "MXN",
        sections: [
          {
            id: "sec1",
            name: "Tacos",
            items: [{ id: "d1", name: "Pastor", price: 18 }],
          },
        ],
        design: withButtons(menuDesign()),
      },
    },
    {
      name: "Catálogo",
      experience: {
        type: "catalog",
        title: "Servicios",
        currency: "MXN",
        items: [
          {
            id: "p1",
            name: "Uñas acrílicas",
            price: 350,
            url: "https://kardo.test/unas",
          },
        ],
        design: withButtons(catalogDesign()),
      },
    },
    {
      name: "Formulario",
      experience: {
        type: "form",
        title: "Contáctanos",
        fields: { name: "optional", phone: "hidden", message: "optional" },
        submitLabel: "Enviar",
        successMessage: "Gracias",
        consentText: "Acepto ser contactado.",
        design: withButtons(formDesign()),
      },
    },
    {
      name: "PDF",
      experience: {
        type: "document",
        title: "Lista de precios",
        display: "viewer",
        pages: [{ sha256: imageSha256, width: 800, height: 1000 }],
        design: withButtons(documentDesign()),
      },
      assets: [
        { sha256: pdfSha256, mediaType: "application/pdf" },
        { sha256: imageSha256, mediaType: "image/png" },
      ],
    },
    {
      name: "Imagen",
      experience: {
        type: "image",
        alt: "Fachada",
        design: withButtons(imageDesign()),
      },
      assets: [{ sha256: imageSha256, mediaType: "image/png" }],
    },
  ];

  for (const { name, experience, assets } of cases) {
    it(`${name}: a published button redirects and is not a 404`, async () => {
      const publish = await publishExperience(
        experience,
        assets ? { assets } : {},
      );
      expect(publish.status).toBe(200);

      const html = await (
        await SELF.fetch(`https://resolver.test/t/${publicId}`)
      ).text();
      expect(html).toContain(`href="/t/${publicId}/go/wa1`);
      expect(html).toContain(`href="/t/${publicId}/go/b1`);

      const whatsapp = await SELF.fetch(
        `https://resolver.test/t/${publicId}/go/wa1`,
        { redirect: "manual" },
      );
      expect(whatsapp.status).toBe(302);
      expect(whatsapp.headers.get("location")).toBe(
        "https://wa.me/525512345678",
      );
      const button = await SELF.fetch(
        `https://resolver.test/t/${publicId}/go/b1`,
        { redirect: "manual" },
      );
      expect(button.status).toBe(302);
      expect(button.headers.get("location")).toBe("https://kardo.test/mapa");
    });
  }

  it("Catálogo: a product's «Ver más» still wins, and an unknown id is still a 404", async () => {
    const [catalog] = cases.filter((entry) => entry.name === "Catálogo");
    await publishExperience(catalog?.experience);

    const product = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/p1`,
      { redirect: "manual" },
    );
    expect(product.status).toBe(302);
    expect(product.headers.get("location")).toBe("https://kardo.test/unas");

    const unknown = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/${encodeURIComponent("https://evil.test")}`,
      { redirect: "manual" },
    );
    expect(unknown.status).toBe(404);
  });
});

describe("designed pages: the Kardo footer and the ambient backdrop", () => {
  it("is present, inside .kd-page, with the tone matching the palette background", async () => {
    const design = linksDesign();
    design.style.palette.background = "#101418";
    const publish = await publishExperience(
      {
        type: "links",
        title: "Fondo oscuro",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design,
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain("kd-footer--dark");
    expect(html.indexOf('class="kd-container"')).toBeLessThan(
      html.lastIndexOf("<footer"),
    );
  });

  it("draws the blurred ambient layer by default (absent means auto)", async () => {
    const publish = await publishExperience(
      {
        type: "links",
        title: "Panadería",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
        design: linksDesign(),
      },
      { assets: [{ sha256: imageSha256, mediaType: "image/png" }] },
    );
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('<div class="kd-ambient" aria-hidden="true"></div>');
    expect(html).toContain(".kd-ambient{position:fixed;inset:0;z-index:-1");
  });
});

describe("designed pages: the html block", () => {
  it("sanitizes the block's HTML before serving it in its own shadow root", async () => {
    const design = {
      schema: 1,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              {
                id: "html1",
                kind: "html",
                html: "<p>Hola</p><script>alert(1)</script>",
                css: "",
              },
              { id: "cl1", kind: "contentLinks", layout: "list" },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start",
        },
      ],
    };
    const publish = await publishExperience({
      type: "links",
      title: "Con bloque HTML",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      design,
    });
    expect(publish.status).toBe(200);

    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain('class="kd-html"');
    expect(html).toContain('class="kd-html-host"');
    expect(html).toContain('<template shadowrootmode="open">');
    expect(html).toContain("Hola");
    expect(html.toLowerCase()).not.toContain("<script>alert(1)</script>");
  });
});
