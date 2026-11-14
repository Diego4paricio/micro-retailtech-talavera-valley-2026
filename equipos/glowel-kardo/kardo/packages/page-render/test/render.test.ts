import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { renderDesignedBody, renderDesignedDocument } from "../src/index.js";
import {
  design,
  linkPageContent,
  linksContent,
  profileContent,
  section,
  testContext,
} from "./fixtures.js";

describe("renderDesignedBody: every block kind", () => {
  it("renders heading, text, image, button, divider and spacer", () => {
    const blocks: DesignBlock[] = [
      { id: "h1", kind: "heading", text: "Título", level: 1 },
      {
        id: "t1",
        kind: "text",
        runs: [
          { text: "Hola " },
          { text: "mundo", bold: true },
          { text: " ", italic: true },
          { text: "enlace", href: "https://example.com/a" },
        ],
      },
      {
        id: "i1",
        kind: "image",
        imageRef: "abc123",
        alt: "Una foto",
        aspect: "1:1",
        fit: "cover",
        href: "https://example.com/photo",
      },
      {
        id: "b1",
        kind: "button",
        label: "Reservar",
        href: "https://example.com/book",
        variant: "primary",
      },
      { id: "d1", kind: "divider" },
      { id: "sp1", kind: "spacer", height: 40 },
    ];
    const d = design([section("s1", [blocks])]);
    const { html, css, fonts } = renderDesignedBody(
      linksContent(),
      d,
      testContext(),
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Título");
    expect(html).toContain("<strong>mundo</strong>");
    expect(html).toContain("<em> </em>");
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain("<img");
    expect(html).toContain('alt="Una foto"');
    expect(html).toContain("kd-btn--primary");
    expect(html).toContain("Reservar");
    expect(html).toContain("<hr");
    expect(html).toContain("kd-spacer");
    expect(html).toContain("height:40px");
    expect(css.length).toBeGreaterThan(0);
    expect(fonts).toContain("geist");
    expect(fonts).toContain("system");
  });

  it("renders bound blocks: contentTitle and contentLinks for links", () => {
    const blocks: DesignBlock[] = [
      { id: "ct1", kind: "contentTitle" },
      { id: "cl1", kind: "contentLinks", layout: "list" },
    ];
    const d = design([section("s1", [blocks])]);
    const { html } = renderDesignedBody(
      linksContent({
        title: "Panadería El Sol",
        description: "Frescura diaria",
      }),
      d,
      testContext(),
    );
    expect(html).toContain("Panadería El Sol");
    expect(html).toContain("Frescura diaria");
    expect(html).toContain("Sitio");
    expect(html).toContain('href="/go/l1"');
  });

  it("renders bound blocks: profileHeader for profile, with avatar initials fallback", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ph1",
        kind: "profileHeader",
        layout: "stacked",
        avatarShape: "circle",
      },
    ];
    const d = design([section("s1", [blocks])]);
    const { html } = renderDesignedBody(profileContent(), d, testContext());
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("Fotógrafa");
    expect(html).toContain("kd-avatar-initials");
    expect(html).toContain(">AP<");
  });

  it("resolves an avatar image when avatarRef is set", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ph1",
        kind: "profileHeader",
        layout: "stacked",
        avatarShape: "circle",
      },
    ];
    const d = design([section("s1", [blocks])]);
    const { html } = renderDesignedBody(
      profileContent({ avatarRef: "avatar-hash" }),
      d,
      testContext(),
    );
    expect(html).toContain('src="https://cdn.example.test/avatar-hash"');
  });

  it("renders bound blocks: contentSocials for linkpage", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ph1",
        kind: "profileHeader",
        layout: "inline",
        avatarShape: "none",
      },
      { id: "cs1", kind: "contentSocials", size: "medium" },
      { id: "cl1", kind: "contentLinks", layout: "grid" },
    ];
    const d = design([section("s1", [blocks])]);
    const { html } = renderDesignedBody(linkPageContent(), d, testContext());
    expect(html).toContain("kd-social");
    expect(html).toContain("kd-link--highlight");
    expect(html).toContain('href="/go/s1"');
    expect(html).toContain('href="/go/l1"');
  });

  it("skips an unresolvable image and renders a placeholder", () => {
    const blocks: DesignBlock[] = [
      {
        id: "i1",
        kind: "image",
        imageRef: "missing",
        alt: "",
        aspect: "auto",
        fit: "cover",
      },
    ];
    const d = design([section("s1", [blocks])]);
    const { html } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ resolveImage: () => null }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("kd-image-empty");
  });
});

describe("renderDesignedBody: layout/stacking CSS", () => {
  it("stacks columns under 640px and lays them side by side above it", () => {
    const blocks: DesignBlock[] = [
      { id: "h1", kind: "heading", text: "A", level: 2 },
    ];
    const d = design([section("s1", [blocks, blocks], { layout: "1-1" })]);
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    // Mobile-first: the shared `.kd-cols` rule is a single column with no
    // media query, and the multi-column template only applies from 640px up.
    expect(css).toMatch(/\.kd-cols\{display:grid;grid-template-columns:1fr\}/);
    expect(css).toMatch(
      /@media \(min-width: 640px\)\{\s*\.kd-cols-0\{grid-template-columns:1fr 1fr\}/,
    );
  });

  it("carries data-section-id and data-block-id for the panel's selection", () => {
    const blocks: DesignBlock[] = [{ id: "my-block", kind: "divider" }];
    const d = design([section("my-section", [blocks])]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain('data-section-id="my-section"');
    expect(html).toContain('data-block-id="my-block"');
  });
});

describe("renderDesignedBody: button/link radius css", () => {
  it("emits a single valid px unit for pill, rounded and square button shapes", () => {
    const blocks: DesignBlock[] = [
      {
        id: "b1",
        kind: "button",
        label: "Ir",
        href: "https://example.com/a",
        variant: "primary",
      },
    ];
    for (const buttonShape of ["pill", "rounded", "square"] as const) {
      const d = design([section("s1", [blocks])]);
      d.style.buttonShape = buttonShape;
      d.style.radius = 20;
      const { css } = renderDesignedBody(linksContent(), d, testContext());
      const match = /\.kd-btn,\.kd-link\{border-radius:([^}]+)\}/.exec(css);
      expect(match).not.toBeNull();
      expect(match?.[1]).toMatch(/^\d+px$/);
    }
  });
});

describe("renderDesignedDocument", () => {
  it("produces a full document with no scripts", () => {
    const blocks: DesignBlock[] = [
      { id: "h1", kind: "heading", text: "Hola", level: 1 },
    ];
    const d = design([section("s1", [blocks])]);
    const doc = renderDesignedDocument(linksContent(), d, testContext(), {
      title: "Mi página",
    });
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("<title>Mi página</title>");
    expect(doc).toContain("<style>");
    expect(doc).not.toContain("<script");
  });
});

describe("renderDesignedBody: pagePadding (style.pagePadding)", () => {
  const blocks: DesignBlock[] = [
    { id: "h1", kind: "heading", text: "Hola", level: 1 },
  ];

  it("defaults to 16px (DESIGN_LEGACY_PAGE_PADDING) and applies at every width", () => {
    const { css } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(css).toContain("--kd-pad:16px");
    expect(css).toContain(
      ".kd-container{max-width:640px;padding-left:var(--kd-pad);padding-right:var(--kd-pad)",
    );
    // Not gated behind a max-width media query any more.
    expect(css).not.toMatch(
      /@media \(max-width: 640px\)\{\s*\.kd-page \.kd-container/,
    );
  });

  it("honors a custom value, clamped to 0–48", () => {
    const d = design([section("s1", [blocks])]);
    d.style.pagePadding = 32;
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("--kd-pad:32px");

    const outOfRange = design([section("s1", [blocks])]);
    outOfRange.style.pagePadding = 999;
    const { css: clampedCss } = renderDesignedBody(
      linksContent(),
      outOfRange,
      testContext(),
    );
    expect(clampedCss).toContain("--kd-pad:48px");
  });
});

describe("renderDesignedBody: legible buttons and a clean preview document", () => {
  const blocks: DesignBlock[] = [
    { id: "links", kind: "contentLinks", layout: "list" },
  ];

  it("keeps link/button colors above the generic anchor rule", () => {
    const { css } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(css).not.toContain(".kd-page a{color:inherit}");
    expect(css).toContain(":where(.kd-page) a{color:inherit}");
    expect(css).toContain("color:var(--kd-on-accent)");
  });

  it("removes the browser's default body margin in the preview document", () => {
    const html = renderDesignedDocument(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
      { title: "Vista previa" },
    );
    expect(html).toContain("<style>html,body{margin:0;padding:0}");
  });
});

// ---------------------------------------------------------------------------
// "Sin banco de fotos" (2026-10-03): an `image` block, or a page/section
// image background, with no imageRef at all is a deliberate empty slot.
// ---------------------------------------------------------------------------

describe("renderDesignedBody: image block placeholders ('sin banco de fotos')", () => {
  const blockNoRef: DesignBlock = {
    id: "img1",
    kind: "image",
    alt: "Foto de tu platillo más pedido",
    aspect: "4:3",
    fit: "cover",
  };

  it("draws nothing at all with no imagePlaceholders (public page)", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [[blockNoRef]])]),
      testContext(),
    );
    expect(html).not.toContain('data-block-id="img1"');
    expect(html).not.toContain("<figure");
  });

  it("draws a dashed espacio para foto with imagePlaceholders: true", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [[blockNoRef]])]),
      testContext({ imagePlaceholders: true }),
    );
    expect(html).toContain('data-block-id="img1"');
    expect(html).toContain('data-placeholder=""');
    expect(html).toContain("kd-placeholder");
    expect(html).toContain("<svg");
    expect(html).toContain("Foto de tu platillo más pedido");
    expect(html).not.toContain("<img");
  });

  it("keeps the real photo exactly as before when imageRef is set, even with imagePlaceholders: true", () => {
    const withRef: DesignBlock = { ...blockNoRef, imageRef: "abc123" };
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [[withRef]])]),
      testContext({ imagePlaceholders: true }),
    );
    expect(html).toContain("<img");
    expect(html).toContain("https://cdn.example.test/abc123");
    expect(html).not.toContain("kd-placeholder");
  });
});

describe("renderDesignedBody: page and section background placeholders", () => {
  it("falls back to the flat color with no imagePlaceholders, no label", () => {
    const d = design([
      section("s1", [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]]),
    ]);
    d.style.background = { kind: "image", color: "#112233" };
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("background:#112233");
    expect(css).not.toContain("Foto de fondo");
  });

  it("draws the placeholder tint and a 'Foto de fondo' label with imagePlaceholders: true", () => {
    const d = design([
      section("s1", [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]]),
    ]);
    d.style.background = { kind: "image", color: "#112233" };
    const { css } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ imagePlaceholders: true }),
    );
    // The photo space shows its own color (white text on it still reads),
    // with the label; without a color, the neutral tint.
    expect(css).toContain("background:#112233");
    expect(css).toContain("Foto de fondo");
    d.style.background = { kind: "image" };
    const tinted = renderDesignedBody(
      linksContent(),
      d,
      testContext({ imagePlaceholders: true }),
    ).css;
    expect(tinted).toContain(
      "color-mix(in srgb, var(--kd-text) 6%, var(--kd-surface))",
    );
  });

  it("draws a section's own background placeholder label, scoped to that section", () => {
    const d = design([
      section("s1", [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]], {
        background: { kind: "image", color: "#334455" },
      }),
    ]);
    const { css } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ imagePlaceholders: true }),
    );
    expect(css).toContain(".kd-sec-0::before");
    expect(css).toContain("Foto de fondo");
  });

  it("publishes a section photo space with its color, never a broken image", () => {
    const d = design([
      section("s1", [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]], {
        background: { kind: "image", color: "#334455" },
      }),
    ]);
    d.style.background = { kind: "image" };
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain("background:#334455");
    expect(css).not.toContain("background-image:linear-gradient(rgba");
    expect(css).not.toContain("Foto de fondo");
  });

  it("never shows the placeholder label for a background that already has an image", () => {
    const d = design([
      section("s1", [[{ id: "h1", kind: "heading", text: "Hola", level: 1 }]]),
    ]);
    d.style.background = { kind: "image", imageRef: "abc123" };
    const { css } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ imagePlaceholders: true }),
    );
    expect(css).not.toContain("Foto de fondo");
  });
});

// ---------------------------------------------------------------------------
// New free blocks (motor de 3 bloques, 2026-10-03): features and gallery.
// ---------------------------------------------------------------------------

describe("renderDesignedBody: features block", () => {
  it("row layout: icon plus title only, never the note", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ft1",
        kind: "features",
        layout: "row",
        items: [{ icon: "clock", title: "Lun a dom 9 a 21", text: "Horario" }],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("kd-features--row");
    expect(html).toContain("Lun a dom 9 a 21");
    expect(html).not.toContain("Horario");
    expect(html).toContain("<svg");
  });

  it("list layout: title and note, icon circle by default", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ft1",
        kind: "features",
        layout: "list",
        items: [
          { icon: "truck", title: "Entrega a domicilio", text: "En 30 min" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("kd-features--list");
    expect(html).toContain("Entrega a domicilio");
    expect(html).toContain("En 30 min");
    expect(html).toContain("kd-feature-icon--circle");
  });

  it("grid layout: sets the column count and accepts square/plain icon styles", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ft1",
        kind: "features",
        layout: "grid",
        columns: 3,
        iconStyle: "square",
        items: [
          { icon: "wifi", title: "WiFi gratis" },
          { icon: "car", title: "Estacionamiento" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("--kd-features-cols:3");
    expect(html).toContain("kd-feature-icon--square");
  });

  it("plain icon style: no background wrapper classes", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ft1",
        kind: "features",
        layout: "list",
        iconStyle: "plain",
        items: [{ icon: "star", title: "Destacado" }],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("kd-feature-icon--plain");
    expect(html).not.toContain("kd-feature-icon--circle");
  });

  it("chips layout: icon plus title in a pill, never the note", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ft1",
        kind: "features",
        layout: "chips",
        items: [{ icon: "tag", title: "Ofertas", text: "nota" }],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("kd-features--chips");
    expect(html).toContain("Ofertas");
    expect(html).not.toContain("nota");
  });

  it("escapes a title and note with a script tag and quotes", () => {
    const blocks: DesignBlock[] = [
      {
        id: "ft1",
        kind: "features",
        layout: "list",
        items: [
          {
            icon: "star",
            title: '<script>alert(1)</script> "Título"',
            text: '<b>nota</b> "comillas"',
          },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>nota</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;Título&quot;");
    expect(html).toContain("&quot;comillas&quot;");
  });
});

describe("renderDesignedBody: gallery block placeholders ('sin banco de fotos')", () => {
  const blocks = (): DesignBlock[] => [
    {
      id: "g1",
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images: [
        { imageRef: "img-1", alt: "Con foto" },
        { alt: "Espacio para la foto del postre" },
      ],
    },
  ];

  it("omits the empty slot with no imagePlaceholders (public page)", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks()])]),
      testContext(),
    );
    expect(html).toContain("Con foto");
    expect(html).not.toContain("Espacio para la foto del postre");
    expect(html.match(/<li class="kd-gallery-item/g)?.length).toBe(1);
  });

  it("draws the slot as an espacio para foto with imagePlaceholders: true", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks()])]),
      testContext({ imagePlaceholders: true }),
    );
    expect(html).toContain("Con foto");
    expect(html).toContain("Espacio para la foto del postre");
    expect(html).toContain('data-placeholder=""');
    expect(html.match(/<li class="kd-gallery-item/g)?.length).toBe(2);
  });
});

describe("renderDesignedBody: gallery block", () => {
  it("grid layout: sets the column and aspect CSS variables", () => {
    const blocks: DesignBlock[] = [
      {
        id: "g1",
        kind: "gallery",
        layout: "grid",
        aspect: "4:3",
        columns: 3,
        images: [
          { imageRef: "img-1", alt: "Local" },
          { imageRef: "img-2", alt: "Platillo" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("--kd-gallery-cols:3");
    expect(html).toContain("--kd-gallery-aspect:4 / 3");
    expect(html).toContain('alt="Local"');
    expect(html).toContain('alt="Platillo"');
    expect(html).toContain('loading="lazy"');
  });

  it("omits a photo whose resolveImage returns null, keeping the rest", () => {
    const blocks: DesignBlock[] = [
      {
        id: "g1",
        kind: "gallery",
        layout: "grid",
        aspect: "1:1",
        images: [
          { imageRef: "missing", alt: "No existe" },
          { imageRef: "img-2", alt: "Sí existe" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext({
        resolveImage: (ref) =>
          ref === "missing" ? null : `https://cdn.example.test/${ref}`,
      }),
    );
    expect(html).not.toContain("No existe");
    expect(html).toContain("Sí existe");
    expect(html.match(/<li class="kd-gallery-item/g)?.length).toBe(1);
  });

  it("mosaic layout: the first photo spans the row (16:9)", () => {
    const blocks: DesignBlock[] = [
      {
        id: "g1",
        kind: "gallery",
        layout: "mosaic",
        aspect: "3:4",
        images: [
          { imageRef: "img-1", alt: "Uno" },
          { imageRef: "img-2", alt: "Dos" },
          { imageRef: "img-3", alt: "Tres" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    const items = html.split('kd-gallery-item"');
    expect(html).toContain("kd-gallery-item--feature");
    expect(html.indexOf("kd-gallery-item--feature")).toBeLessThan(
      html.indexOf("Dos"),
    );
    expect(items.length).toBeGreaterThan(1);
  });

  it("carousel layout: scroll-snap class", () => {
    const blocks: DesignBlock[] = [
      {
        id: "g1",
        kind: "gallery",
        layout: "carousel",
        aspect: "16:9",
        images: [
          { imageRef: "img-1", alt: "Uno" },
          { imageRef: "img-2", alt: "Dos" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("kd-gallery--carousel");
  });

  it("escapes an alt attribute with a script tag and quotes", () => {
    const blocks: DesignBlock[] = [
      {
        id: "g1",
        kind: "gallery",
        layout: "grid",
        aspect: "1:1",
        images: [
          { imageRef: "img-1", alt: '<script>alert(1)</script> "foto"' },
          { imageRef: "img-2", alt: "Normal" },
        ],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;foto&quot;");
  });
});
