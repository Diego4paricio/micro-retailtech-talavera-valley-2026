import type { DesignBlock, DesignBrand, PageDesign } from "@kardo/contracts";
import { designBrands } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  brandLabelColor,
  designBrandInfo,
  designBrandList,
} from "../src/brands.js";
import { renderDesignedBody } from "../src/index.js";
import {
  baseStyle,
  design,
  linkPageContent,
  linksContent,
  section,
  testContext,
} from "./fixtures.js";

describe("designBrandInfo / designBrandList", () => {
  it("covers every contract brand, in contract order, without guidelineUrl", () => {
    expect(designBrandList.map((entry) => entry.brand)).toEqual([
      ...designBrands,
    ]);
    for (const brand of designBrands) {
      const info = designBrandInfo(brand);
      expect(info).not.toHaveProperty("guidelineUrl");
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(info.brandBackground).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(info.glyphOnBrand).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // Simple Icons ships one <path> per glyph; a d attribute always
      // starts with an absolute moveto.
      expect(info.path.startsWith("M")).toBe(true);
    }
  });

  it("keeps TikTok, X and Threads on a black tile with a white glyph", () => {
    for (const brand of ["tiktok", "x", "threads"] as const) {
      const info = designBrandInfo(brand);
      expect(info.brandBackground).toBe("#000000");
      expect(info.glyphOnBrand).toBe("#FFFFFF");
    }
  });

  it("keeps Spotify's green glyph on its black tile (never turned black/white)", () => {
    const info = designBrandInfo("spotify");
    expect(info.brandBackground).toBe("#000000");
    expect(info.glyphOnBrand).toBe(info.color);
    expect(info.glyphOnBrand).not.toBe("#FFFFFF");
    expect(info.glyphOnBrand).not.toBe("#000000");
  });

  it("keeps Instagram a single solid color, never the gradient", () => {
    const info = designBrandInfo("instagram");
    expect(info.brandBackground).toBe(info.color);
    expect(info.brandBackground).not.toContain("gradient");
  });
});

describe("brandLabelColor: real WCAG contrast, not the simpler luminance shortcut", () => {
  // `onAccentColor` (css.ts) would pick white for WhatsApp green (luminance
  // ≈0.48, just under its 0.5 cutoff) but white-on-WhatsApp-green is only a
  // 1.98:1 contrast — this picks black instead, which clears 9:1.
  it("darkens the label for WhatsApp and Telegram", () => {
    expect(brandLabelColor(designBrandInfo("whatsapp").brandBackground)).toBe(
      "#0B1A14",
    );
    expect(brandLabelColor(designBrandInfo("telegram").brandBackground)).toBe(
      "#0B1A14",
    );
  });

  it("keeps a white label for Facebook (barely clears 4.5:1)", () => {
    expect(brandLabelColor(designBrandInfo("facebook").brandBackground)).toBe(
      "#FFFFFF",
    );
  });

  it("picks the higher-contrast label for YouTube's pure red, even though neither side clears 4.5:1", () => {
    // White-on-#FF0000 is ≈4.0:1 and black-on-#FF0000 is ≈4.48:1 — a known
    // quirk of pure red: neither passes AA normal text, so this picks the
    // closer one instead of always defaulting to white.
    expect(brandLabelColor(designBrandInfo("youtube").brandBackground)).toBe(
      "#0B1A14",
    );
  });

  it("is deterministic and colors every registered brand", () => {
    for (const brand of designBrands) {
      const color = brandLabelColor(designBrandInfo(brand).brandBackground);
      expect(["#FFFFFF", "#0B1A14"]).toContain(color);
    }
  });
});

function brandButtonBlock(
  overrides: Partial<Extract<DesignBlock, { kind: "brandButton" }>> = {},
): Extract<DesignBlock, { kind: "brandButton" }> {
  return {
    id: "bb1",
    kind: "brandButton",
    brand: "whatsapp",
    label: "Escríbenos por WhatsApp",
    href: "https://wa.me/525512345678",
    look: "brand",
    ...overrides,
  };
}

describe("renderDesignedBody: brandButton", () => {
  it("brand look: brandBackground fill, glyphOnBrand glyph, a contrast-picked label color", () => {
    const d = design([section("s1", [[brandButtonBlock()]])]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain('class="kd-brand kd-brand--brand"');
    expect(html).toContain("background:#25D366");
    expect(html).toContain("color:#0B1A14");
    expect(html).toContain('fill="#FFFFFF"');
    expect(html).toContain("Escríbenos por WhatsApp");
    expect(html).toContain('href="/go/bb1"');
  });

  it("neutral look: the brand's own color on the glyph, no inline background", () => {
    const d = design([
      section("s1", [
        [brandButtonBlock({ brand: "pinterest", look: "neutral" })],
      ]),
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain('class="kd-brand kd-brand--neutral"');
    expect(html).not.toMatch(/style="[^"]*background:/);
    expect(html).toContain('fill="#BD081C"');
  });

  it("neutral look on a black-only brand (TikTok/X/Threads) inherits the page text color instead of black", () => {
    const d = design([
      section("s1", [[brandButtonBlock({ brand: "tiktok", look: "neutral" })]]),
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain('fill="currentColor"');
  });

  it("outline look: transparent, currentColor glyph, no brand color leaks into the markup", () => {
    const d = design([
      section("s1", [
        [brandButtonBlock({ brand: "spotify", look: "outline" })],
      ]),
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).toContain('class="kd-brand kd-brand--outline"');
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain("#1ED760");
  });

  it("renders an inert span (never a link to nowhere) when the href is unsafe", () => {
    const d = design([section("s1", [[brandButtonBlock()]])]);
    const { html } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ linkHref: () => "javascript:alert(1)" }),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="#"');
    expect(html).toContain("<span");
    expect(html).toContain("Escríbenos por WhatsApp</span>");
  });

  it("escapes a malicious label", () => {
    const d = design([
      section("s1", [
        [brandButtonBlock({ label: "<script>alert(1)</script>" })],
      ]),
    ]);
    const { html } = renderDesignedBody(linksContent(), d, testContext());
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("renderDesignedBody: contentSocials brand look", () => {
  const socials = [
    {
      id: "s1",
      network: "instagram" as const,
      value: "https://instagram.com/a",
    },
    {
      id: "s2",
      network: "linkedin" as const,
      value: "https://linkedin.com/in/a",
    },
  ];

  it("gives a brand-registered network its official background and glyph", () => {
    const blocks: DesignBlock[] = [
      { id: "cs1", kind: "contentSocials", size: "medium", look: "brand" },
    ];
    const { html } = renderDesignedBody(
      linkPageContent({ socials }),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("background:#FF0069");
    expect(html).toContain("color:#FFFFFF");
  });

  it("keeps linkedin/website/email/phone as today's line icon even in brand look", () => {
    const blocks: DesignBlock[] = [
      { id: "cs1", kind: "contentSocials", size: "medium", look: "brand" },
    ];
    const { html } = renderDesignedBody(
      linkPageContent({ socials }),
      design([section("s1", [blocks])]),
      testContext(),
    );
    // linkedin's line icon (icons.ts) uses a stroked rect+circle path, never
    // a background/color pair.
    expect(html).toContain('aria-label="LinkedIn"');
    const linkedinItem = html.slice(
      html.indexOf('aria-label="LinkedIn"') - 200,
    );
    expect(linkedinItem.split("</li>")[0]).not.toMatch(
      /style="[^"]*background:/,
    );
  });

  it("defaults ('theme'/undefined) stay exactly as today's accent line icons", () => {
    const blocks: DesignBlock[] = [
      { id: "cs1", kind: "contentSocials", size: "medium" },
    ];
    const { html } = renderDesignedBody(
      linkPageContent({ socials }),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toMatch(/style="[^"]*background:#FF0069/);
  });
});

describe("brandCss is only shipped to pages that actually use it", () => {
  it("omits .kd-brand CSS when no brandButton/brand-look socials are present", () => {
    const d = design([section("s1", [[{ id: "d1", kind: "divider" }]])]);
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).not.toContain(".kd-brand{");
  });

  it("includes .kd-brand CSS (and its canvas scaling rules) when a brandButton is used", () => {
    const canvasDesign: PageDesign = {
      schema: 2,
      style: baseStyle(),
      sections: [
        {
          id: "cv1",
          kind: "canvas",
          height: 400,
          items: [{ block: brandButtonBlock(), x: 20, y: 20, w: 350 }],
        },
      ],
    };
    const { html, css } = renderDesignedBody(
      linksContent(),
      canvasDesign,
      testContext(),
    );
    expect(css).toContain(".kd-brand{");
    // Canvas scaling: every length inside `.kd-ci` is a multiple of `--u`.
    expect(css).toContain(
      ".kd-ci .kd-brand{padding:calc(14 * var(--u)) calc(18 * var(--u))",
    );
    expect(html).toContain('class="kd-ci kd-cv-0-0"');
    expect(html).toContain("kd-brand--brand");
  });

  it("includes .kd-brand CSS for a brand-look contentSocials too", () => {
    const blocks: DesignBlock[] = [
      { id: "cs1", kind: "contentSocials", size: "medium", look: "brand" },
    ];
    const { css } = renderDesignedBody(
      linkPageContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(css).toContain(".kd-brand{");
  });
});

describe("renderDesignedBody: a full page with a brand button and brand-look socials", () => {
  it("matches a stable snapshot", () => {
    const blocks: DesignBlock[] = [
      { id: "h1", kind: "heading", text: "Panadería El Sol", level: 1 },
      brandButtonBlock({
        brand: "whatsapp",
        label: "Escríbenos por WhatsApp",
        href: "https://wa.me/525512345678",
        look: "brand",
      }),
      { id: "cs1", kind: "contentSocials", size: "medium", look: "brand" },
    ];
    const d = design([section("s1", [blocks])]);
    // Ambient (auto by default) and the Kardo footer are covered by their own
    // dedicated tests (footer.test.ts, ambient.test.ts); left out here so
    // this snapshot stays scoped to the brand markup it actually exercises.
    d.style.ambient = { kind: "none" };
    const { html, css } = renderDesignedBody(
      linkPageContent({
        displayName: "Panadería El Sol",
        socials: [
          {
            id: "soc1",
            network: "instagram",
            value: "https://instagram.com/elsol",
          },
        ],
      }),
      d,
      testContext(),
      { footer: false },
    );
    expect(html).toMatchSnapshot();
    expect(css).toContain(".kd-brand{");
  });
});

describe("brand button circle look (2026-10-02)", () => {
  const circle = (id: string, brand: DesignBrand) =>
    ({
      id,
      kind: "brandButton",
      brand,
      label: `Abrir ${brand}`,
      href: "https://example.com/",
      look: "circle",
    }) as DesignBlock;

  it("shows only the logo on the brand color and keeps the label as the accessible name", () => {
    const { html, css } = renderDesignedBody(
      linksContent(),
      design([
        section("s1", [
          [
            { id: "links", kind: "contentLinks", layout: "list" },
            circle("wa", "whatsapp"),
          ],
        ]),
      ]),
      testContext(),
    );
    expect(html).toContain('class="kd-brand kd-brand--circle"');
    expect(html).toContain(
      '<span class="kd-brand-label kd-visually-hidden">Abrir whatsapp</span>',
    );
    expect(css).toContain(".kd-brand--circle{");
    expect(css).toContain(".kd-visually-hidden{");
  });

  it("puts consecutive circles of a column in one row and leaves other blocks out of it", () => {
    const { html } = renderDesignedBody(
      linksContent(),
      design([
        section("s1", [
          [
            circle("wa", "whatsapp"),
            circle("ig", "instagram"),
            circle("tt", "tiktok"),
            circle("yt", "youtube"),
            { id: "links", kind: "contentLinks", layout: "list" },
            circle("fb", "facebook"),
          ],
        ]),
      ]),
      testContext(),
    );
    const rows = html.match(/<div class="kd-brand-row">/g) ?? [];
    expect(rows).toHaveLength(2);
    const firstRow = html.slice(
      html.indexOf('<div class="kd-brand-row">'),
      html.indexOf('data-block-id="links"'),
    );
    for (const id of ["wa", "ig", "tt", "yt"])
      expect(firstRow).toContain(`data-block-id="${id}"`);
  });
});
