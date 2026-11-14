import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { boundCssFor, renderBoundBlock } from "../src/bound.js";
import type { DesignableContent } from "../src/index.js";
import { renderDesignedBody } from "../src/index.js";
import { design, section, testContext } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Bound blocks of Menú, Catálogo, Formulario, PDF and Imagen (ADR 018,
// addendum 3). Own fixtures below (menu/catalog/form/document/image content
// and default blocks); `design`/`section`/`testContext` are the shared
// generic scaffolding from fixtures.ts.
// ---------------------------------------------------------------------------

type MenuBlockT = Extract<DesignBlock, { kind: "menu" }>;
type CatalogBlockT = Extract<DesignBlock, { kind: "catalog" }>;
type FeaturedItemsBlockT = Extract<DesignBlock, { kind: "featuredItems" }>;
type LeadFormBlockT = Extract<DesignBlock, { kind: "leadForm" }>;
type DocumentPagesBlockT = Extract<DesignBlock, { kind: "documentPages" }>;
type ImageMainBlockT = Extract<DesignBlock, { kind: "imageMain" }>;

function menuBlock(overrides: Partial<MenuBlockT> = {}): MenuBlockT {
  return {
    id: "menu1",
    kind: "menu",
    layout: "list",
    photos: "none",
    ...overrides,
  };
}
function catalogBlock(overrides: Partial<CatalogBlockT> = {}): CatalogBlockT {
  return {
    id: "cat1",
    kind: "catalog",
    layout: "grid",
    columns: 2,
    ...overrides,
  };
}
function featuredBlock(
  overrides: Partial<FeaturedItemsBlockT> = {},
): FeaturedItemsBlockT {
  return {
    id: "fi1",
    kind: "featuredItems",
    layout: "cards",
    itemIds: ["i1"],
    ...overrides,
  };
}
function formBlock(overrides: Partial<LeadFormBlockT> = {}): LeadFormBlockT {
  return { id: "form1", kind: "leadForm", look: "boxed", ...overrides };
}
function documentBlock(
  overrides: Partial<DocumentPagesBlockT> = {},
): DocumentPagesBlockT {
  return {
    id: "doc1",
    kind: "documentPages",
    pageStyle: "shadow",
    ...overrides,
  };
}
function imageBlock(overrides: Partial<ImageMainBlockT> = {}): ImageMainBlockT {
  return {
    id: "img1",
    kind: "imageMain",
    fit: "cover",
    frame: "none",
    ...overrides,
  };
}

function menuContent(
  overrides: Partial<Extract<DesignableContent, { type: "menu" }>> = {},
): Extract<DesignableContent, { type: "menu" }> {
  return {
    type: "menu",
    title: "Menú de prueba",
    currency: "MXN",
    sections: [
      {
        id: "sec1",
        name: "Entradas",
        items: [
          {
            id: "i1",
            name: "Guacamole",
            description: "Con totopos",
            price: 85,
          },
        ],
      },
      {
        id: "sec2",
        name: "Postres",
        items: [{ id: "i2", name: "Flan", price: 55 }],
      },
    ],
    ...overrides,
  };
}

function catalogContent(
  overrides: Partial<Extract<DesignableContent, { type: "catalog" }>> = {},
): Extract<DesignableContent, { type: "catalog" }> {
  return {
    type: "catalog",
    title: "Catálogo de prueba",
    currency: "MXN",
    items: [
      {
        id: "p1",
        name: "Playera",
        description: "100% algodón",
        price: 250,
        url: "https://example.com/playera",
      },
    ],
    ...overrides,
  };
}

function formContent(
  overrides: Partial<Extract<DesignableContent, { type: "form" }>> = {},
): Extract<DesignableContent, { type: "form" }> {
  return {
    type: "form",
    title: "Contacto",
    fields: { name: "optional", phone: "hidden", message: "required" },
    submitLabel: "Enviar",
    successMessage: "Gracias",
    consentText: "Acepto el tratamiento de mis datos.",
    ...overrides,
  };
}

function documentContent(
  overrides: Partial<Extract<DesignableContent, { type: "document" }>> = {},
): Extract<DesignableContent, { type: "document" }> {
  return {
    type: "document",
    title: "Catálogo PDF",
    display: "viewer",
    pages: [{ ref: "page-1", width: 1240, height: 1754 }],
    allowDownload: false,
    ...overrides,
  };
}

function imageContent(
  overrides: Partial<Extract<DesignableContent, { type: "image" }>> = {},
): Extract<DesignableContent, { type: "image" }> {
  return {
    type: "image",
    alt: "Foto de portada",
    imageRef: "hero-image",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Menú
// ---------------------------------------------------------------------------

describe("renderBoundBlock: menu", () => {
  it("renders every layout with the dish name and price", () => {
    const content = menuContent({
      sections: [
        {
          id: "sec1",
          name: "Entradas",
          items: [
            {
              id: "i1",
              name: "Guacamole",
              description: "Con totopos",
              price: 85,
              imageRef: "dish-1",
            },
          ],
        },
      ],
    });
    for (const layout of ["list", "cards", "grid", "compact"] as const) {
      const html = renderBoundBlock(
        menuBlock({ layout, photos: "small" }),
        content,
        testContext(),
      );
      expect(html).toContain("Guacamole");
      expect(html).toContain(`kd-menu-item--${layout}`);
      if (layout === "compact") {
        expect(html).not.toContain("kd-menu-photo");
      } else {
        expect(html).toContain("kd-menu-photo");
      }
    }
  });

  it("filters and orders sections by sectionIds, in the menu's own order", () => {
    const content = menuContent({
      sections: [
        { id: "sec1", name: "Entradas", items: [{ id: "i1", name: "Sopa" }] },
        { id: "sec2", name: "Postres", items: [{ id: "i2", name: "Flan" }] },
        { id: "sec3", name: "Bebidas", items: [{ id: "i3", name: "Agua" }] },
      ],
    });
    const html = renderBoundBlock(
      menuBlock({ sectionIds: ["sec3", "sec1"] }),
      content,
      testContext(),
    );
    expect(html).toContain("Entradas");
    expect(html).toContain("Bebidas");
    expect(html).not.toContain("Postres");
    // The menu's own order (sec1 before sec3), not the sectionIds order.
    expect(html.indexOf("Entradas")).toBeLessThan(html.indexOf("Bebidas"));
  });

  it("omits a section left with no dishes", () => {
    const content = menuContent({
      sections: [
        { id: "sec1", name: "Entradas", items: [{ id: "i1", name: "Sopa" }] },
        { id: "sec2", name: "Postres", items: [] },
      ],
    });
    const html = renderBoundBlock(menuBlock(), content, testContext());
    expect(html).toContain("Entradas");
    expect(html).not.toContain("Postres");
  });

  it("shows the empty notice when every section is filtered out or empty", () => {
    const content = menuContent({
      sections: [{ id: "sec1", name: "Entradas", items: [] }],
    });
    const html = renderBoundBlock(menuBlock(), content, testContext());
    expect(html).toContain("Por ahora no hay artículos disponibles.");
    expect(html).not.toContain("Entradas");
  });

  it("renders sold-out and low-stock badges (ADR 017)", () => {
    const content = menuContent({
      sections: [
        {
          id: "sec1",
          name: "Entradas",
          items: [
            {
              id: "i1",
              name: "Sopa",
              availability: { soldOut: true, remaining: null },
            },
            {
              id: "i2",
              name: "Taco",
              availability: { soldOut: false, remaining: 1 },
            },
            {
              id: "i3",
              name: "Tostada",
              availability: { soldOut: false, remaining: 4 },
            },
          ],
        },
      ],
    });
    const html = renderBoundBlock(menuBlock(), content, testContext());
    expect(html).toContain("Agotado");
    expect(html).toContain("kd-sold-out");
    expect(html).toContain("Queda 1");
    expect(html).toContain("Quedan 4");
  });

  it("formats the price in MXN like the Resolver's formatPrice", () => {
    const price = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(85);
    const html = renderBoundBlock(menuBlock(), menuContent(), testContext());
    expect(html).toContain(price);
  });

  it("escapes a dish name with a script tag and quotes", () => {
    const content = menuContent({
      sections: [
        {
          id: "sec1",
          name: 'Sección "especial" <script>x</script>',
          items: [{ id: "i1", name: '<script>alert(1)</script> "Tacos"' }],
        },
      ],
    });
    const html = renderBoundBlock(menuBlock(), content, testContext());
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;Tacos&quot;");
    expect(html).toContain("&quot;especial&quot;");
  });

  it("hides descriptions when descriptions is false", () => {
    const html = renderBoundBlock(
      menuBlock({ descriptions: false }),
      menuContent(),
      testContext(),
    );
    expect(html).not.toContain("Con totopos");
  });

  it("returns '' when the content is not a menu", () => {
    expect(renderBoundBlock(menuBlock(), catalogContent(), testContext())).toBe(
      "",
    );
  });

  describe("'sin banco de fotos': a dish with no imageRef yet", () => {
    const contentNoPhoto = menuContent({
      sections: [
        {
          id: "sec1",
          name: "Entradas",
          items: [{ id: "i1", name: "Guacamole", price: 85 }],
        },
      ],
    });

    it("shows no photo and no placeholder on the public page (no imagePlaceholders)", () => {
      const html = renderBoundBlock(
        menuBlock({ photos: "small" }),
        contentNoPhoto,
        testContext(),
      );
      expect(html).not.toContain("<img");
      expect(html).not.toContain("kd-placeholder");
      expect(html).not.toContain("data-item-photo");
    });

    it("draws an icon-only espacio para foto with imagePlaceholders: true", () => {
      const html = renderBoundBlock(
        menuBlock({ photos: "small" }),
        contentNoPhoto,
        testContext({ imagePlaceholders: true }),
      );
      expect(html).toContain("kd-menu-photo--side");
      expect(html).toContain("kd-placeholder");
      expect(html).toContain('data-item-photo="i1"');
      expect(html).toContain("<svg");
      // Item-level placeholders never show text (no alt exists per dish).
      expect(html).not.toContain("kd-placeholder-alt");
    });

    it("never draws a placeholder when photos is none, even with imagePlaceholders: true", () => {
      const html = renderBoundBlock(
        menuBlock({ photos: "none" }),
        contentNoPhoto,
        testContext({ imagePlaceholders: true }),
      );
      expect(html).not.toContain("kd-placeholder");
    });
  });
});

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

describe("renderBoundBlock: catalog", () => {
  it("renders every layout with the product name and price", () => {
    for (const layout of ["grid", "list", "cards"] as const) {
      const html = renderBoundBlock(
        catalogBlock({ layout }),
        catalogContent(),
        testContext(),
      );
      expect(html).toContain("Playera");
      expect(html).toContain(`kd-catalog--${layout}`);
    }
  });

  it("shows the empty notice with no products", () => {
    const html = renderBoundBlock(
      catalogBlock(),
      catalogContent({ items: [] }),
      testContext(),
    );
    expect(html).toContain("Por ahora no hay artículos disponibles.");
  });

  it("only shows the button when the product has a url, using buttonLabel", () => {
    const withUrl = renderBoundBlock(
      catalogBlock({ buttonLabel: "Comprar" }),
      catalogContent(),
      testContext(),
    );
    expect(withUrl).toContain("Comprar");
    expect(withUrl).toContain('href="/go/p1"');

    const withoutUrl = renderBoundBlock(
      catalogBlock(),
      catalogContent({
        items: [{ id: "p1", name: "Playera", price: 250 }],
      }),
      testContext(),
    );
    expect(withoutUrl).not.toContain("kd-catalog-button");
  });

  it("defaults the button label to 'Ver más'", () => {
    const html = renderBoundBlock(
      catalogBlock(),
      catalogContent(),
      testContext(),
    );
    expect(html).toContain("Ver más");
  });

  it("rejects a javascript: url with inert text (safeHref)", () => {
    // The Resolver's own `linkHref` always returns its tracked `/go/{id}`
    // route regardless of `url` (see RenderContext's doc comment) — only the
    // panel's preview may return an unvalidated url unchanged, which is the
    // case this guards against.
    const html = renderBoundBlock(
      catalogBlock(),
      catalogContent({
        items: [
          {
            id: "p1",
            name: "Playera",
            price: 250,
            url: "javascript:alert(1)",
          },
        ],
      }),
      testContext({ linkHref: (_itemId, url) => url }),
    );
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("kd-catalog-button--inert");
    expect(html).toContain("Ver más");
  });

  it("renders sold-out and low-stock badges (ADR 017)", () => {
    const html = renderBoundBlock(
      catalogBlock(),
      catalogContent({
        items: [
          {
            id: "p1",
            name: "Playera",
            price: 250,
            availability: { soldOut: true, remaining: null },
          },
          {
            id: "p2",
            name: "Gorra",
            price: 150,
            availability: { soldOut: false, remaining: 2 },
          },
        ],
      }),
      testContext(),
    );
    expect(html).toContain("Agotado");
    expect(html).toContain("kd-sold-out");
    expect(html).toContain("Quedan 2");
  });

  it("formats the price in MXN", () => {
    const price = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(250);
    const html = renderBoundBlock(
      catalogBlock(),
      catalogContent(),
      testContext(),
    );
    expect(html).toContain(price);
  });

  it("escapes a product name with a script tag and quotes", () => {
    const html = renderBoundBlock(
      catalogBlock(),
      catalogContent({
        items: [
          {
            id: "p1",
            name: '<script>alert(1)</script> "Playera"',
            price: 100,
          },
        ],
      }),
      testContext(),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;Playera&quot;");
  });

  it("sets the grid's column CSS variables from columns (max 4 on wide screens)", () => {
    const html = renderBoundBlock(
      catalogBlock({ layout: "grid", columns: 3 }),
      catalogContent(),
      testContext(),
    );
    expect(html).toContain("--kd-catalog-cols:3");
    expect(html).toContain("--kd-catalog-cols-lg:4");
  });

  describe("'sin banco de fotos': a product with no imageRef yet", () => {
    const contentNoPhoto = catalogContent({
      items: [{ id: "p1", name: "Playera", price: 250 }],
    });

    it("shows no hole and no placeholder on the public page (no imagePlaceholders)", () => {
      const grid = renderBoundBlock(
        catalogBlock({ layout: "grid" }),
        contentNoPhoto,
        testContext(),
      );
      expect(grid).not.toContain("<img");
      expect(grid).not.toContain("kd-placeholder");

      const list = renderBoundBlock(
        catalogBlock({ layout: "list" }),
        contentNoPhoto,
        testContext(),
      );
      expect(list).not.toContain("<img");
      expect(list).not.toContain("kd-placeholder");
    });

    it("draws an icon-only espacio para foto with imagePlaceholders: true (grid and list)", () => {
      const grid = renderBoundBlock(
        catalogBlock({ layout: "grid" }),
        contentNoPhoto,
        testContext({ imagePlaceholders: true }),
      );
      expect(grid).toContain("kd-catalog-image");
      expect(grid).toContain("kd-placeholder");
      expect(grid).toContain('data-item-photo="p1"');
      expect(grid).not.toContain("kd-placeholder-alt");

      const list = renderBoundBlock(
        catalogBlock({ layout: "list" }),
        contentNoPhoto,
        testContext({ imagePlaceholders: true }),
      );
      expect(list).toContain("kd-catalog-row-image");
      expect(list).toContain("kd-placeholder");
      expect(list).toContain('data-item-photo="p1"');
    });
  });
});

// ---------------------------------------------------------------------------
// Destacados (featuredItems)
// ---------------------------------------------------------------------------

describe("renderBoundBlock: featuredItems", () => {
  const menuWithThree = menuContent({
    sections: [
      {
        id: "sec1",
        name: "Entradas",
        items: [
          {
            id: "i1",
            name: "Guacamole",
            description: "Con totopos",
            price: 85,
            imageRef: "dish-1",
          },
          { id: "i2", name: "Sopa", price: 60 },
        ],
      },
      {
        id: "sec2",
        name: "Postres",
        items: [{ id: "i3", name: "Flan", price: 55, imageRef: "dish-3" }],
      },
    ],
  });

  it("selects real items by id, in itemIds order, across every menu section", () => {
    const html = renderBoundBlock(
      featuredBlock({ layout: "cards", itemIds: ["i3", "i1"] }),
      menuWithThree,
      testContext(),
    );
    expect(html.indexOf("Flan")).toBeLessThan(html.indexOf("Guacamole"));
  });

  it("skips an itemId the content does not have (hidden by availability or deleted)", () => {
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["ghost", "i1"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).toContain("Guacamole");
    expect(html).not.toContain("ghost");
  });

  it("renders nothing when none of the itemIds exist in the content", () => {
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["ghost1", "ghost2"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).toBe("");
  });

  it("hero layout: the first item is a big card, the rest are a 2-column grid", () => {
    const html = renderBoundBlock(
      featuredBlock({ layout: "hero", itemIds: ["i1", "i2", "i3"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).toContain("kd-featured-hero");
    expect(html).toContain("kd-featured-items--cards");
    expect(html.indexOf("Guacamole")).toBeLessThan(html.indexOf("Sopa"));
  });

  it("cards layout: a grid of cards", () => {
    const html = renderBoundBlock(
      featuredBlock({ layout: "cards", itemIds: ["i1", "i2"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).toContain("kd-featured--cards");
    expect(html).toContain("kd-featured-items--cards");
    expect(html).not.toContain("kd-featured-hero");
  });

  it("carousel layout: scroll-snap classes", () => {
    const html = renderBoundBlock(
      featuredBlock({ layout: "carousel", itemIds: ["i1", "i2"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).toContain("kd-featured-items--carousel");
  });

  it("shows the label pill only when set", () => {
    const withLabel = renderBoundBlock(
      featuredBlock({ label: "Lo más pedido" }),
      menuWithThree,
      testContext(),
    );
    expect(withLabel).toContain("kd-featured-label");
    expect(withLabel).toContain("Lo más pedido");

    const withoutLabel = renderBoundBlock(
      featuredBlock(),
      menuWithThree,
      testContext(),
    );
    expect(withoutLabel).not.toContain("kd-featured-label");
  });

  it("reuses the sold-out/low-stock badge and kd-sold-out class (ADR 017)", () => {
    const html = renderBoundBlock(
      featuredBlock({ layout: "hero", itemIds: ["i1", "i2"] }),
      menuContent({
        sections: [
          {
            id: "sec1",
            name: "Entradas",
            items: [
              {
                id: "i1",
                name: "Guacamole",
                price: 85,
                availability: { soldOut: true, remaining: null },
              },
              {
                id: "i2",
                name: "Sopa",
                price: 60,
                availability: { soldOut: false, remaining: 2 },
              },
            ],
          },
        ],
      }),
      testContext(),
    );
    expect(html).toContain("kd-sold-out");
    expect(html).toContain("Agotado");
    expect(html).toContain("Quedan 2");
  });

  it("formats the price with the content's currency", () => {
    const price = new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(85);
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["i1"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).toContain(price);
  });

  it("shows descriptions by default and hides them when descriptions is false", () => {
    const withDesc = renderBoundBlock(
      featuredBlock({ itemIds: ["i1"] }),
      menuWithThree,
      testContext(),
    );
    expect(withDesc).toContain("Con totopos");

    const withoutDesc = renderBoundBlock(
      featuredBlock({ itemIds: ["i1"], descriptions: false }),
      menuWithThree,
      testContext(),
    );
    expect(withoutDesc).not.toContain("Con totopos");
  });

  it("draws a text-only card (no empty hole) for an item with no photo", () => {
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["i2"] }),
      menuWithThree,
      testContext(),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("kd-featured-card--no-photo");
  });

  it("draws an icon-only espacio para foto instead with imagePlaceholders: true", () => {
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["i2"] }),
      menuWithThree,
      testContext({ imagePlaceholders: true }),
    );
    expect(html).toContain("kd-placeholder");
    expect(html).toContain('data-item-photo="i2"');
    expect(html).not.toContain("kd-featured-card--no-photo");
    expect(html).not.toContain("kd-placeholder-alt");
  });

  it("works for a catalog's products too", () => {
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["p1"] }),
      catalogContent(),
      testContext(),
    );
    expect(html).toContain("Playera");
  });

  it("escapes an item name with a script tag and quotes", () => {
    const html = renderBoundBlock(
      featuredBlock({ itemIds: ["i1"] }),
      menuContent({
        sections: [
          {
            id: "sec1",
            name: "Entradas",
            items: [
              {
                id: "i1",
                name: '<script>alert(1)</script> "Tacos"',
                price: 10,
              },
            ],
          },
        ],
      }),
      testContext(),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;Tacos&quot;");
  });

  it("returns '' when the content is neither menu nor catalog", () => {
    expect(
      renderBoundBlock(featuredBlock(), formContent(), testContext()),
    ).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

describe("renderBoundBlock: leadForm", () => {
  it("renders with an action when ctx.formAction is set", () => {
    const html = renderBoundBlock(
      formBlock(),
      formContent(),
      testContext({ formAction: "/t/abc/leads?src=qr" }),
    );
    expect(html).toMatch(/<form[^>]*action="\/t\/abc\/leads\?src=qr"/);
  });

  it("omits the action attribute in a preview with no formAction", () => {
    const html = renderBoundBlock(formBlock(), formContent(), testContext());
    expect(html).not.toMatch(/<form[^>]*\saction=/);
  });

  it("always requires email, and applies hidden/optional/required to name/phone/message", () => {
    const html = renderBoundBlock(formBlock(), formContent(), testContext());
    expect(html).toMatch(/<input[^>]*type="email"[^>]*required/);
    // name: optional -> shown, suffixed, not required
    expect(html).toContain("Nombre (opcional)");
    expect(html).not.toMatch(/name="name"[^>]*required/);
    // phone: hidden -> not rendered at all
    expect(html).not.toContain('name="phone"');
    // message: required -> shown, not suffixed, required
    expect(html).toContain("Mensaje");
    expect(html).not.toContain("Mensaje (opcional)");
    expect(html).toMatch(/name="message"[^>]*required/);
  });

  it("always renders the hidden honeypot trap", () => {
    const html = renderBoundBlock(formBlock(), formContent(), testContext());
    expect(html).toContain('class="kd-hp"');
    expect(html).toContain('name="website"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('autocomplete="off"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders the Turnstile widget only when ctx.turnstileSiteKey is set", () => {
    const withKey = renderBoundBlock(
      formBlock(),
      formContent(),
      testContext({ turnstileSiteKey: "site-key-123" }),
    );
    expect(withKey).toContain('class="cf-turnstile"');
    expect(withKey).toContain('data-sitekey="site-key-123"');

    const withoutKey = renderBoundBlock(
      formBlock(),
      formContent(),
      testContext(),
    );
    expect(withoutKey).not.toContain("cf-turnstile");
  });

  it("renders the required consent checkbox with the content's consentText", () => {
    const html = renderBoundBlock(formBlock(), formContent(), testContext());
    expect(html).toMatch(
      /<input type="checkbox" name="consent" value="yes" required>/,
    );
    expect(html).toContain("Acepto el tratamiento de mis datos.");
  });

  it("links the privacy notice only when set, and rejects an unsafe url", () => {
    const withNotice = renderBoundBlock(
      formBlock(),
      formContent({ privacyNoticeUrl: "https://example.com/aviso" }),
      testContext(),
    );
    expect(withNotice).toContain("Aviso de privacidad");
    expect(withNotice).toContain('href="https://example.com/aviso"');
    expect(withNotice).toContain('target="_blank"');

    const withoutNotice = renderBoundBlock(
      formBlock(),
      formContent(),
      testContext(),
    );
    expect(withoutNotice).not.toContain("Aviso de privacidad");

    const unsafeNotice = renderBoundBlock(
      formBlock(),
      formContent({ privacyNoticeUrl: "javascript:alert(1)" }),
      testContext(),
    );
    expect(unsafeNotice).not.toContain("Aviso de privacidad");
    expect(unsafeNotice).not.toContain("javascript:");
  });

  it("returns '' when the content is not a form", () => {
    expect(renderBoundBlock(formBlock(), menuContent(), testContext())).toBe(
      "",
    );
  });
});

// ---------------------------------------------------------------------------
// PDF (documentPages)
// ---------------------------------------------------------------------------

describe("renderBoundBlock: documentPages", () => {
  it("viewer: renders each page as an image with alt text and dimensions", () => {
    const html = renderBoundBlock(
      documentBlock(),
      documentContent(),
      testContext(),
    );
    expect(html).toContain('alt="Página 1 de Catálogo PDF"');
    expect(html).toContain('width="1240"');
    expect(html).toContain('height="1754"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain("kd-document-page--shadow");
  });

  it("viewer: shows the download button after the pages only when allowDownload and documentHref are set", () => {
    const withDownload = renderBoundBlock(
      documentBlock(),
      documentContent({ allowDownload: true }),
      testContext({ documentHref: "https://cdn.example.test/doc.pdf" }),
    );
    expect(withDownload).toContain("Descargar PDF");
    expect(withDownload.indexOf("kd-document-page")).toBeLessThan(
      withDownload.indexOf("Descargar PDF"),
    );

    const withoutAllow = renderBoundBlock(
      documentBlock(),
      documentContent({ allowDownload: false }),
      testContext({ documentHref: "https://cdn.example.test/doc.pdf" }),
    );
    expect(withoutAllow).not.toContain("Descargar PDF");
  });

  it("viewer: shows the discreet notice when there are no pages", () => {
    const html = renderBoundBlock(
      documentBlock(),
      documentContent({ pages: [] }),
      testContext(),
    );
    expect(html).toContain("Este documento todavía no tiene páginas.");
    expect(html).not.toContain("<img");
  });

  it("download mode: renders the PDF icon and a download button", () => {
    const html = renderBoundBlock(
      documentBlock(),
      documentContent({ display: "download" }),
      testContext({ documentHref: "https://cdn.example.test/doc.pdf" }),
    );
    expect(html).toContain("kd-document-icon");
    expect(html).toContain(">PDF<");
    expect(html).toContain('href="https://cdn.example.test/doc.pdf"');
  });

  it("download mode: renders inert text with no documentHref", () => {
    const html = renderBoundBlock(
      documentBlock(),
      documentContent({ display: "download" }),
      testContext(),
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain("kd-document-download--inert");
    expect(html).toContain("Descargar PDF");
  });

  it("returns '' when the content is not a document", () => {
    expect(
      renderBoundBlock(documentBlock(), menuContent(), testContext()),
    ).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Imagen (imageMain)
// ---------------------------------------------------------------------------

describe("renderBoundBlock: imageMain", () => {
  it("renders the image with the content's alt", () => {
    const html = renderBoundBlock(
      imageBlock(),
      imageContent({ alt: "Foto de portada" }),
      testContext(),
    );
    expect(html).toContain('alt="Foto de portada"');
    expect(html).toContain("https://cdn.example.test/hero-image");
  });

  it("adds the mask class only when mask is set and not 'none'", () => {
    const withMask = renderBoundBlock(
      imageBlock({ mask: "circle" }),
      imageContent(),
      testContext(),
    );
    expect(withMask).toContain("kd-mask--circle");

    const noMask = renderBoundBlock(
      imageBlock({ mask: "none" }),
      imageContent(),
      testContext(),
    );
    expect(noMask).not.toContain("kd-mask--");

    const absentMask = renderBoundBlock(
      imageBlock(),
      imageContent(),
      testContext(),
    );
    expect(absentMask).not.toContain("kd-mask--");
  });

  it("falls back to an empty placeholder when the image cannot be resolved", () => {
    const html = renderBoundBlock(
      imageBlock(),
      imageContent(),
      testContext({ resolveImage: () => null }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("kd-image-main-empty");
  });

  it("returns '' when the content is not an image", () => {
    expect(renderBoundBlock(imageBlock(), menuContent(), testContext())).toBe(
      "",
    );
  });
});

// ---------------------------------------------------------------------------
// boundCssFor
// ---------------------------------------------------------------------------

describe("boundCssFor", () => {
  it("returns '' for a design with no bound blocks", () => {
    const blocks: DesignBlock[] = [
      { id: "h1", kind: "heading", text: "Hola", level: 1 },
    ];
    const css = boundCssFor(design([section("s1", [blocks])]));
    expect(css).toBe("");
  });

  it("only includes CSS for the block kinds a design actually uses", () => {
    const onlyMenu = boundCssFor(design([section("s1", [[menuBlock()]])]));
    expect(onlyMenu).toContain(".kd-menu{");
    expect(onlyMenu).not.toContain(".kd-catalog{");
    expect(onlyMenu).not.toContain(".kd-form{");
    expect(onlyMenu).not.toContain(".kd-document{");
    expect(onlyMenu).not.toContain(".kd-image-main{");

    const onlyCatalog = boundCssFor(
      design([section("s1", [[catalogBlock()]])]),
    );
    expect(onlyCatalog).toContain(".kd-catalog{");
    expect(onlyCatalog).not.toContain(".kd-menu{");

    const onlyForm = boundCssFor(design([section("s1", [[formBlock()]])]));
    expect(onlyForm).toContain(".kd-form{");
    // The shared name/price/badge CSS is only for menu and catalog.
    expect(onlyForm).not.toContain(".kd-item-name{");

    const onlyDocument = boundCssFor(
      design([section("s1", [[documentBlock()]])]),
    );
    expect(onlyDocument).toContain(".kd-document{");
    expect(onlyDocument).not.toContain(".kd-menu{");

    const onlyImage = boundCssFor(design([section("s1", [[imageBlock()]])]));
    expect(onlyImage).toContain(".kd-image-main{");
    expect(onlyImage).not.toContain(".kd-document{");

    const onlyFeatured = boundCssFor(
      design([section("s1", [[featuredBlock()]])]),
    );
    expect(onlyFeatured).toContain(".kd-featured{");
    expect(onlyFeatured).toContain(".kd-item-name{");
    expect(onlyFeatured).not.toContain(".kd-menu{");
  });

  it("includes the shared item CSS once for a page with menu, catalog and featuredItems", () => {
    const css = boundCssFor(
      design([
        section("s1", [[menuBlock()]]),
        section("s2", [[catalogBlock()]]),
        section("s3", [[featuredBlock()]]),
      ]),
    );
    expect(css).toContain(".kd-menu{");
    expect(css).toContain(".kd-catalog{");
    expect(css).toContain(".kd-featured{");
    expect(css.match(/\.kd-item-name\{/g)?.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: dispatched correctly from renderDesignedBody (blocks.ts).
// ---------------------------------------------------------------------------

describe("renderDesignedBody: dispatches bound blocks correctly", () => {
  it("renders a menu block inside a full designed page", () => {
    const { html } = renderDesignedBody(
      menuContent(),
      design([section("s1", [[menuBlock()]])]),
      testContext(),
    );
    expect(html).toContain('data-block-id="menu1"');
    expect(html).toContain("kd-menu");
    expect(html).toContain("Guacamole");
  });

  it("renders a featuredItems block inside a full designed menu page", () => {
    const { html } = renderDesignedBody(
      menuContent(),
      design([
        section("s1", [[menuBlock(), featuredBlock({ itemIds: ["i1"] })]]),
      ]),
      testContext(),
    );
    expect(html).toContain('data-block-id="fi1"');
    expect(html).toContain("kd-featured");
    expect(html).toContain("Guacamole");
  });
});
