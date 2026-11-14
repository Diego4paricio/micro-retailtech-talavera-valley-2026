import {
  htmlBlockRenderer,
  type RenderContext,
  renderDesignedDocument,
} from "@kardo/page-render";
import { describe, expect, it } from "vitest";
import type { ItemAvailabilityOverlay } from "../src/item-availability.js";
import {
  formatPrice,
  renderExperiencePage,
  renderNoticePage,
} from "../src/render.js";
import type { PublishedSnapshot } from "../src/snapshot.js";

const publicId = "kardotesttouchpoint01";
const origin = "https://resolver.test";
const channel = "nfc";

function page(
  experience: NonNullable<PublishedSnapshot["experience"]>,
  extra: Partial<PublishedSnapshot> = {},
): string {
  const snapshot: PublishedSnapshot = {
    schemaVersion: 1,
    status: "active",
    publicId,
    revision: 1,
    experience,
    ...extra,
  };
  return renderExperiencePage({ snapshot, origin, channel });
}

function overlayPage(
  experience: NonNullable<PublishedSnapshot["experience"]>,
  itemAvailability: ItemAvailabilityOverlay,
): string {
  const snapshot: PublishedSnapshot = {
    schemaVersion: 1,
    status: "active",
    publicId,
    revision: 1,
    experience,
  };
  return renderExperiencePage({ snapshot, origin, channel, itemAvailability });
}

describe("rendering escapes untrusted text for every template", () => {
  it("escapes a script tag and quotes in a links experience", () => {
    const html = page({
      type: "links",
      title: `<script>alert('x')</script>`,
      description: `"quoted" & <b>bold</b>`,
      links: [
        {
          id: "l1",
          label: `<img src=x onerror=alert(1)>`,
          url: "https://kardo.test/",
        },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).toContain(`href="/t/${publicId}/go/l1?src=nfc"`);
  });

  it("escapes profile fields including biography and headline", () => {
    const html = page({
      type: "profile",
      displayName: `<script>1</script>`,
      headline: `"h" <i>`,
      biography: `bio <script>2</script>`,
      links: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;1&lt;/script&gt;");
    expect(html).toContain("bio &lt;script&gt;2&lt;/script&gt;");
  });

  it("escapes image alt text", () => {
    const html = page(
      { type: "image", alt: `"><script>alert(1)</script>` },
      { asset: { sha256: "a".repeat(64), mediaType: "image/png", title: "x" } },
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("escapes document title and description", () => {
    const html = page({
      type: "document",
      title: `<script>3</script>`,
      description: `<b>desc</b>`,
    });
    expect(html).not.toContain("<script>3</script>");
    expect(html).toContain("Descargar PDF");
  });

  it("escapes menu section, item, and description text and formats a price", () => {
    const html = page({
      type: "menu",
      title: "Carta",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: `<script>s</script>`,
          items: [
            {
              id: "i1",
              name: `<b>Café</b>`,
              description: `"fuerte" <script>x</script>`,
              price: 45,
            },
          ],
        },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;Café&lt;/b&gt;");
    expect(html).toContain(formatPrice(45, "MXN").replace(/&/g, "&amp;"));
  });

  it("escapes catalog item text and only shows a tracked 'Ver más' link when a url is present", () => {
    const html = page({
      type: "catalog",
      title: "Productos",
      currency: "MXN",
      items: [
        {
          id: "p1",
          name: `<script>p</script>`,
          description: `desc <i>x</i>`,
          price: 199,
          url: "https://kardo.test/p1",
          imageSha256: "a".repeat(64),
        },
        { id: "p2", name: "Sin liga" },
      ],
    });
    expect(html).not.toContain("<script>p</script>");
    expect(html).toContain(`href="/t/${publicId}/go/p1?src=nfc"`);
    expect(html).toContain("Ver más");
    // The second item has no url, so it must not get a go/ link for its id.
    expect(html).not.toContain(`go/p2`);
  });

  it("escapes form title, description, and consent text and renders only enabled fields", () => {
    const html = page({
      type: "form",
      title: `<script>f</script>`,
      description: `"desc"`,
      fields: { name: "required", phone: "hidden", message: "optional" },
      submitLabel: `<b>Enviar</b>`,
      successMessage: "Gracias",
      consentText: `Acepto <script>y</script>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain(`action="/t/${publicId}/leads?src=nfc"`);
    expect(html).toContain('name="email"');
    expect(html).toContain('name="name"');
    expect(html).not.toContain('name="phone"');
    expect(html).toContain('name="message"');
    expect(html).toContain('name="website"');
    expect(html).toContain("Acepto &lt;script&gt;y&lt;/script&gt;");
  });

  it("links the business's own privacy notice next to the consent box", () => {
    const html = page({
      type: "form",
      title: "Pide informes",
      fields: { name: "required", phone: "hidden", message: "optional" },
      submitLabel: "Enviar",
      successMessage: "Gracias",
      consentText: "Acepto.",
      privacyNoticeUrl: 'https://florerialila.mx/privacidad?a=1&b="2"',
    });
    expect(html).toContain(
      '<a href="https://florerialila.mx/privacidad?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener noreferrer">Aviso de privacidad</a>',
    );
    const without = page({
      type: "form",
      title: "Pide informes",
      fields: { name: "required", phone: "hidden", message: "optional" },
      submitLabel: "Enviar",
      successMessage: "Gracias",
      consentText: "Acepto.",
    });
    expect(without).not.toContain('consent-notice">');
  });

  it("escapes notice page titles and messages (used for lead success/error pages)", () => {
    const html = renderNoticePage({
      title: `<script>t</script>`,
      message: `"m" <b>bold</b>`,
    });
    expect(html).not.toContain("<script>t</script>");
    expect(html).toContain("&quot;m&quot;");
  });
});

describe("formatPrice", () => {
  it("formats a price with the Intl currency for es-MX", () => {
    expect(formatPrice(45, "MXN")).toContain("45");
    expect(formatPrice(45, "MXN")).toMatch(/\$/);
  });

  it("falls back gracefully for a currency Intl cannot format", () => {
    expect(() => formatPrice(10, "ZZZ")).not.toThrow();
  });
});

describe("form honeypot field", () => {
  it("renders a visually hidden, aria-hidden, non-tabbable, autocomplete-off honeypot input", () => {
    const html = page({
      type: "form",
      title: "Contacto",
      fields: { name: "hidden", phone: "hidden", message: "hidden" },
      submitLabel: "Enviar",
      successMessage: "Gracias",
      consentText: "Acepto.",
    });
    expect(html).toContain('<label class="hp" aria-hidden="true">');
    expect(html).toContain(
      '<input type="text" name="website" tabindex="-1" autocomplete="off">',
    );
  });
});

describe("form Turnstile widget", () => {
  const formExperience: Extract<
    NonNullable<PublishedSnapshot["experience"]>,
    { type: "form" }
  > = {
    type: "form",
    title: "Contacto",
    fields: { name: "hidden", phone: "hidden", message: "hidden" },
    submitLabel: "Enviar",
    successMessage: "Gracias",
    consentText: "Acepto.",
  };

  function formPage(turnstileSiteKey?: string): string {
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: formExperience,
    };
    return renderExperiencePage({
      snapshot,
      origin,
      channel,
      ...(turnstileSiteKey !== undefined ? { turnstileSiteKey } : {}),
    });
  }

  it("renders the Turnstile widget and script when a site key is provided", () => {
    const html = formPage("site-key-123");
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="site-key-123"');
    expect(html).toContain(
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
    );
  });

  it("escapes a hostile site key value", () => {
    const html = formPage(`"><script>alert(1)</script>`);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders no Turnstile markup at all when no site key is provided", () => {
    const html = formPage();
    expect(html).not.toContain("cf-turnstile");
    expect(html).not.toContain("challenges.cloudflare.com");
  });
});

describe("linkpage rendering and escaping", () => {
  it("escapes displayName, bio, and link labels; renders an initials avatar when no avatarSha256", () => {
    const html = page({
      type: "linkpage",
      displayName: `<script>1</script> Ana`,
      bio: `bio <script>2</script>`,
      links: [
        {
          id: "l1",
          label: `<img src=x onerror=alert(1)>`,
          url: "https://kardo.test/",
        },
      ],
      socials: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;1&lt;/script&gt; Ana");
    expect(html).toContain("bio &lt;script&gt;2&lt;/script&gt;");
    expect(html).toContain(`href="/t/${publicId}/go/l1?src=nfc"`);
    expect(html).toContain('class="avatar avatar-initials"');
  });

  it("renders an avatar image instead of initials when avatarSha256 is present", () => {
    const html = page({
      type: "linkpage",
      displayName: "Ana",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      socials: [],
      avatarSha256: "a".repeat(64),
    });
    expect(html).toContain(
      `<img class="avatar" src="${origin}/t/${publicId}/assets/${"a".repeat(64)}"`,
    );
    expect(html).not.toContain('class="avatar avatar-initials"');
  });

  it("marks a highlighted link with the highlight class", () => {
    const html = page({
      type: "linkpage",
      displayName: "Ana",
      links: [
        { id: "l1", label: "Normal", url: "https://kardo.test/a" },
        {
          id: "l2",
          label: "Destacado",
          url: "https://kardo.test/b",
          highlight: true,
        },
      ],
      socials: [],
    });
    expect(html).toContain(
      `<a class="link-button link-button--highlight" href="/t/${publicId}/go/l2?src=nfc">`,
    );
    expect(html).toContain(
      `<a class="link-button" href="/t/${publicId}/go/l1?src=nfc">`,
    );
  });

  it("renders every social entry through the tracked click route, never a raw mailto/tel/external href", () => {
    const html = page({
      type: "linkpage",
      displayName: "Ana",
      links: [],
      socials: [
        { id: "ig", network: "instagram", value: "https://instagram.com/x" },
        { id: "mail", network: "email", value: "hola@kardo.test" },
        { id: "tel", network: "phone", value: "+525512345678" },
      ],
    });
    expect(html).toContain(`href="/t/${publicId}/go/ig?src=nfc"`);
    expect(html).toContain(`href="/t/${publicId}/go/mail?src=nfc"`);
    expect(html).toContain(`href="/t/${publicId}/go/tel?src=nfc"`);
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("https://instagram.com/x");
    expect(html).toContain('aria-label="Instagram"');
    expect(html).toContain('aria-label="Correo electrónico"');
    expect(html).toContain('aria-label="Teléfono"');
    // https networks open in a new tab; email/phone do not (they resolve to
    // mailto:/tel: at the go route and should navigate the current tab).
    expect(html).toContain(
      `<a class="social-icon" href="/t/${publicId}/go/ig?src=nfc" aria-label="Instagram" target="_blank"`,
    );
    expect(html).toContain(
      `<a class="social-icon" href="/t/${publicId}/go/mail?src=nfc" aria-label="Correo electrónico">`,
    );
  });

  it("omits the socials/links list markup entirely when a list is empty", () => {
    const html = page({
      type: "linkpage",
      displayName: "Ana",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      socials: [],
    });
    expect(html).not.toContain('class="socials');
  });
});

describe("theme application", () => {
  const solidTheme = {
    background: { kind: "solid", color: "#112233" } as const,
    surface: "dark" as const,
    accent: "#ff9900",
    buttonStyle: "outline" as const,
    font: "serif" as const,
  };

  it("applies solid background color, accent, surface, button style, and font as page classes/vars", () => {
    const html = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: solidTheme,
    });
    expect(html).toContain("theme-dark");
    expect(html).toContain("btn-outline");
    expect(html).toContain("font-serif");
    expect(html).toContain("--t-bg:#112233");
    expect(html).toContain("--t-accent:#ff9900");
  });

  it("keeps button text legible on light accents (ink) and dark ones (white)", () => {
    const light = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: { ...solidTheme, accent: "#fffefa", buttonStyle: "pill" as const },
    });
    expect(light).toContain("--t-on-accent:#16232e");
    const aqua = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: { ...solidTheme, accent: "#8ce0dc", buttonStyle: "pill" as const },
    });
    expect(aqua).toContain("--t-on-accent:#16232e");
    const dark = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: { ...solidTheme, accent: "#0a6c78", buttonStyle: "pill" as const },
    });
    expect(dark).toContain("--t-on-accent:#fff");
    expect(dark).toContain("color:var(--t-on-accent, #fff)");
    // A mid-tone accent (orange, luminance ~0.46) reads with ink, not with
    // the white the old 0.5 split gave it (about 2:1).
    const orange = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: { ...solidTheme, accent: "#f2a541", buttonStyle: "pill" as const },
    });
    expect(orange).toContain("--t-on-accent:#16232e");
  });

  it("keeps catalog availability badges as pills instead of full-width bars", () => {
    const html = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    });
    expect(html).toContain(".catalog-body .badge{align-self:flex-start}");
  });

  it("renders a gradient background as a linear-gradient with the given angle", () => {
    const html = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: {
        ...solidTheme,
        background: {
          kind: "gradient",
          color: "#112233",
          colorTo: "#445566",
          angle: 45,
        },
      },
    });
    expect(html).toContain("--t-bg:linear-gradient(45deg, #112233, #445566)");
  });

  it("renders an image background as a relative asset path, never the request origin (no Host-header CSS injection)", () => {
    const html = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: {
        ...solidTheme,
        background: {
          kind: "image",
          color: "#112233",
          imageSha256: "a".repeat(64),
          overlay: 40,
        },
      },
    });
    expect(html).toContain(`url(/t/${publicId}/assets/${"a".repeat(64)})`);
    expect(html).not.toContain(`url(${origin}`);
  });

  it("renders no theme classes or inline style at all when the experience has no theme", () => {
    const html = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    });
    expect(html).toContain('<div class="page">');
    expect(html).not.toContain('style="--t-');
  });
});

describe("branded pages carry the Kardo logo instead of a text footer", () => {
  it("renders the inline Kardo logo mark in the footer of an ordinary experience page", () => {
    const html = page({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    });
    // No theme: the fixed neutral background is light, so the footer uses
    // the light-tone logo, pushed to the bottom of a short page.
    expect(html).toContain('<footer class="kd-footer kd-footer--light">');
    expect(html).toContain('aria-label="Kardo"');
    expect(html).toContain("margin-top:auto");
    expect(html).not.toContain("Creado con Kardo");
  });

  it("renders the full Kardo logo on a notice/status page card", () => {
    const html = renderNoticePage({
      title: "Este Kardo aún no tiene contenido",
      message: "Vuelve a intentarlo más tarde.",
    });
    expect(html).toContain('class="notice-logo"');
    expect(html).toContain('aria-label="Kardo"');
    expect(html).toContain("Este Kardo aún no tiene contenido");
  });
});

describe("legacy asset-only rendering (no experience field)", () => {
  function legacyAssetPage(
    mediaType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf",
  ): string {
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      asset: { sha256: "a".repeat(64), mediaType, title: "Recurso" },
    };
    return renderExperiencePage({ snapshot, origin, channel });
  }

  it.each(["image/png", "image/jpeg", "image/webp"] as const)(
    "renders %s inline as an image, not a PDF download",
    (mediaType) => {
      const html = legacyAssetPage(mediaType);
      expect(html).toContain('<img class="hero-image"');
      expect(html).not.toContain("Descargar PDF");
    },
  );

  it("still renders a PDF as a download link, not an image", () => {
    const html = legacyAssetPage("application/pdf");
    expect(html).toContain("Descargar PDF");
    expect(html).not.toContain('<img class="hero-image"');
  });
});

describe("menu item photos", () => {
  it("renders a 64x64 rounded thumbnail to the left of the text when an item has an image", () => {
    const html = page({
      type: "menu",
      title: "Carta",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: "Bebidas",
          items: [
            {
              id: "i1",
              name: "Café",
              price: 45,
              imageSha256: "a".repeat(64),
            },
          ],
        },
      ],
    });
    expect(html).toContain(
      `<img class="menu-thumb" src="${origin}/t/${publicId}/assets/${"a".repeat(64)}" alt="" loading="lazy" width="64" height="64">`,
    );
    expect(html).toContain('<span class="menu-text">');
  });

  it("keeps today's look (no thumbnail, no menu-text wrapper) for an item with no image", () => {
    const html = page({
      type: "menu",
      title: "Carta",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: "Bebidas",
          items: [{ id: "i1", name: "Té", price: 30 }],
        },
      ],
    });
    expect(html).not.toContain('<img class="menu-thumb"');
    expect(html).not.toContain('<span class="menu-text">');
    expect(html).toContain('<span class="name">Té</span>');
  });
});

describe("item availability overlay: menu", () => {
  const twoSectionMenu = {
    type: "menu" as const,
    title: "Carta",
    description: "Nuestra selección",
    currency: "MXN",
    sections: [
      {
        id: "s1",
        name: "Bebidas",
        items: [
          { id: "i1", name: "Café", price: 45 },
          { id: "i2", name: "Té", price: 30 },
        ],
      },
      {
        id: "s2",
        name: "Postres",
        items: [{ id: "i3", name: "Pastel", price: 60 }],
      },
    ],
  };

  it("omits a hidden item and drops a section left with no items", () => {
    const html = overlayPage(twoSectionMenu, {
      i1: { status: "hidden", quantity: null },
      i2: { status: "hidden", quantity: null },
    });
    expect(html).not.toContain("Café");
    expect(html).not.toContain("Bebidas");
    expect(html).toContain("Pastel");
  });

  it("renders a friendly message instead of an empty list when every item is hidden, keeping title/description", () => {
    const html = overlayPage(
      {
        type: "menu",
        title: "Carta",
        description: "Nuestra selección",
        currency: "MXN",
        sections: [
          { id: "s1", name: "Bebidas", items: [{ id: "i1", name: "Café" }] },
        ],
      },
      { i1: { status: "hidden", quantity: null } },
    );
    expect(html).toContain("<h1>Carta</h1>");
    expect(html).toContain("Nuestra selección");
    expect(html).toContain(
      '<p class="description">Por ahora no hay artículos disponibles.</p>',
    );
    expect(html).not.toContain("Café");
  });

  it("marks a sold-out item is-sold-out with an Agotado badge, keeping the price", () => {
    const html = overlayPage(twoSectionMenu, {
      i1: { status: "sold_out", quantity: null },
    });
    expect(html).toContain('<li class="menu-item is-sold-out">');
    expect(html).toContain('<span class="badge badge-sold-out">Agotado</span>');
    expect(html).toContain(formatPrice(45, "MXN").replace(/&/g, "&amp;"));
  });

  it("treats quantity 0 as sold out even when status is 'available'", () => {
    const html = overlayPage(twoSectionMenu, {
      i1: { status: "available", quantity: 0 },
    });
    expect(html).toContain('<li class="menu-item is-sold-out">');
    expect(html).toContain("Agotado");
  });

  it("shows 'Queda 1' for quantity 1 and 'Quedan N' for larger quantities", () => {
    const html = overlayPage(twoSectionMenu, {
      i1: { status: "available", quantity: 1 },
      i2: { status: "available", quantity: 3 },
    });
    expect(html).toContain('<span class="badge badge-low">Queda 1</span>');
    expect(html).toContain('<span class="badge badge-low">Quedan 3</span>');
  });

  it("ignores an overlay entry for an unknown item id", () => {
    const html = overlayPage(twoSectionMenu, {
      "does-not-exist": { status: "hidden", quantity: null },
    });
    expect(html).toContain("Café");
    expect(html).toContain("Té");
    expect(html).toContain("Pastel");
    expect(html).not.toContain('<span class="badge');
  });

  it("renders with no overlay at all exactly as before (undefined itemAvailability)", () => {
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: twoSectionMenu,
    };
    const html = renderExperiencePage({ snapshot, origin, channel });
    expect(html).toContain("Café");
    expect(html).not.toContain('<span class="badge');
    expect(html).not.toContain(' is-sold-out"');
  });
});

describe("item availability overlay: catalog", () => {
  const catalogExperience = {
    type: "catalog" as const,
    title: "Productos",
    currency: "MXN",
    items: [
      { id: "p1", name: "Vela", price: 199, url: "https://kardo.test/vela" },
      { id: "p2", name: "Jabón", price: 89 },
    ],
  };

  it("applies catalog-card is-sold-out and places the badge right under the name, keeping 'Ver más'", () => {
    const html = overlayPage(catalogExperience, {
      p1: { status: "sold_out", quantity: null },
    });
    expect(html).toContain('<div class="catalog-card is-sold-out">');
    const nameIndex = html.indexOf('<div class="name">Vela</div>');
    const badgeIndex = html.indexOf(
      '<span class="badge badge-sold-out">Agotado</span>',
    );
    expect(nameIndex).toBeGreaterThan(-1);
    expect(badgeIndex).toBeGreaterThan(nameIndex);
    expect(html).toContain("Ver más");
  });

  it("shows a low-stock badge for a catalog item", () => {
    const html = overlayPage(catalogExperience, {
      p2: { status: "available", quantity: 2 },
    });
    expect(html).toContain('<span class="badge badge-low">Quedan 2</span>');
  });

  it("renders a friendly message when every catalog item is hidden", () => {
    const html = overlayPage(catalogExperience, {
      p1: { status: "hidden", quantity: null },
      p2: { status: "hidden", quantity: null },
    });
    expect(html).toContain(
      '<p class="description">Por ahora no hay artículos disponibles.</p>',
    );
    expect(html).not.toContain("Vela");
    expect(html).not.toContain("Jabón");
  });
});

function designStyle() {
  return {
    palette: {
      background: "#ffffff",
      surface: "#f5f5f5",
      text: "#111111",
      muted: "#666666",
      accent: "#0a6c78",
    },
    fonts: { heading: "geist" as const, body: "system" as const },
    radius: 12,
    buttonStyle: "solid" as const,
    buttonShape: "rounded" as const,
    shadow: "none" as const,
    background: { kind: "solid" as const, color: "#ffffff" },
    maxWidth: 640,
  };
}

describe("a designed Formulario's Turnstile widget", () => {
  const design = {
    schema: 1 as const,
    style: designStyle(),
    sections: [
      {
        id: "s1",
        layout: "1" as const,
        columns: [
          [{ id: "lf1", kind: "leadForm" as const, look: "boxed" as const }],
        ],
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
        align: "start" as const,
      },
    ],
  };

  function designedFormPage(turnstileSiteKey?: string): string {
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: {
        type: "form",
        title: "Contacto",
        fields: { name: "hidden", phone: "hidden", message: "hidden" },
        submitLabel: "Enviar",
        successMessage: "Gracias",
        consentText: "Acepto.",
        design,
      },
    };
    return renderExperiencePage({
      snapshot,
      origin,
      channel,
      ...(turnstileSiteKey !== undefined ? { turnstileSiteKey } : {}),
    });
  }

  it("puts the widget div in the leadForm block and the script at the end of the body", () => {
    const html = designedFormPage("site-key-123");
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="site-key-123"');
    const script =
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';
    expect(html).toContain(script);
    // The script sits after the page's own closing </div>, not inside the
    // leadForm block itself (only the div lives there — see bound/form.ts).
    expect(html.indexOf("</html>")).toBeGreaterThan(html.indexOf(script));
    expect(html.indexOf(script)).toBeGreaterThan(
      html.lastIndexOf("cf-turnstile"),
    );
  });

  it("renders neither the widget nor the script without a site key", () => {
    const html = designedFormPage();
    expect(html).not.toContain("cf-turnstile");
    expect(html).not.toContain("challenges.cloudflare.com");
  });
});

describe("footer tone on a themed page with an image background", () => {
  it("uses the translucent chip (an image's luminance is not known ahead of time)", () => {
    const html = page(
      {
        type: "links",
        title: "Fondo de foto",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
        theme: {
          background: {
            kind: "image",
            color: "#000000",
            imageAssetId: "11111111-1111-1111-1111-111111111111",
          },
          surface: "light",
          accent: "#0a6c78",
          buttonStyle: "pill",
          font: "sans",
        },
      },
      {
        asset: {
          sha256: "1".repeat(64),
          mediaType: "image/png",
          title: "fondo",
        },
      },
    );
    expect(html).toContain('<footer class="kd-footer kd-footer--chip"');
  });
});

describe("the Resolver serves exactly @kardo/page-render's own document", () => {
  it("matches renderDesignedDocument byte for byte given the same content/design/context", () => {
    const design = {
      schema: 1 as const,
      style: designStyle(),
      sections: [
        {
          id: "s1",
          layout: "1" as const,
          columns: [
            [
              { id: "ct1", kind: "contentTitle" as const },
              {
                id: "cl1",
                kind: "contentLinks" as const,
                layout: "list" as const,
              },
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 12,
          align: "start" as const,
        },
      ],
    };
    const links = [
      { id: "l1", label: "Sitio", url: "https://kardo.test/sitio" },
    ];
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: { type: "links", title: "Panadería", links, design },
    };
    const resolverHtml = renderExperiencePage({ snapshot, origin, channel });

    const resolveImage = (sha256: string) =>
      `${origin}/t/${publicId}/assets/${sha256}`;
    const ctx: RenderContext = {
      resolveImage,
      linkHref: (itemId) => `/t/${publicId}/go/${itemId}?src=${channel}`,
      fontBaseUrl: "/_fonts/",
      renderHtmlBlock: htmlBlockRenderer(resolveImage),
    };
    const pageRenderDoc = renderDesignedDocument(
      { type: "links", title: "Panadería", links },
      design,
      ctx,
      { title: "Panadería" },
    );

    expect(resolverHtml).toBe(pageRenderDoc);
  });
});
