import type { DesignableContent, DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { renderDesignedBody } from "../src/index.js";
import { design, linksContent, section, testContext } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Relevo 29 (2026-10-03): photos that fill their card, titles at the size
// they were given, a lone featured card that is not half a row.
// ---------------------------------------------------------------------------

const menu: Extract<DesignableContent, { type: "menu" }> = {
  type: "menu",
  title: "Fonda",
  currency: "MXN",
  sections: [
    {
      id: "s1",
      name: "Comida",
      items: [
        { id: "a", name: "Enchiladas", price: 110, imageRef: "foto-a" },
        { id: "b", name: "Atole", price: 30 },
        { id: "c", name: "Concha", price: 25, imageRef: "foto-c" },
      ],
    },
  ],
};

describe("titles", () => {
  it("a bound title takes its own size, weight and family on the h1", () => {
    const blocks: DesignBlock[] = [
      {
        id: "t",
        kind: "contentTitle",
        style: {
          color: "#ffffff",
          fontSize: 44,
          fontWeight: 700,
          font: "poppins",
          lineHeight: 11,
        },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent({ title: "Veterinaria Patitas" }),
      design([section("s", [blocks])]),
      testContext(),
    );
    const box = /<div data-block-id="t" class="kd-content-title"([^>]*)>/.exec(
      html,
    )?.[1];
    const title = /<h1 class="kd-heading"([^>]*)>Veterinaria Patitas/.exec(
      html,
    )?.[1];
    expect(box).toContain("color:#ffffff");
    expect(box).not.toContain("font-size");
    expect(title).toContain("font-size:44px");
    expect(title).toContain("font-weight:700");
    expect(title).toContain("line-height:1.1");
  });
});

describe("photos in cards", () => {
  it("menu cards have no padding of their own, so the photo reaches the edges", () => {
    const { css } = renderDesignedBody(
      menu,
      design([
        section("s", [
          [{ id: "m", kind: "menu", layout: "cards", photos: "large" }],
        ]),
      ]),
      testContext({ imagePlaceholders: true }),
    );
    expect(css).toMatch(
      /\.kd-menu-item--cards,\.kd-menu-item--grid\{[^}]*padding:0[;}]/,
    );
    expect(css).toContain(
      ".kd-menu-item--cards .kd-menu-photo--top,.kd-menu-item--grid .kd-menu-photo--top{margin-bottom:0;border-radius:0}",
    );
  });

  it("a photo that opens a one-column card goes edge to edge with its corners", () => {
    const d = design([
      section(
        "s",
        [
          [
            {
              id: "img",
              kind: "image",
              imageRef: "foto-a",
              alt: "Platillo",
              aspect: "4:3",
              fit: "cover",
            },
            { id: "h", kind: "heading", text: "Pide hoy", level: 2 },
          ],
        ],
        { card: true },
      ),
    ]);
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).toContain(
      '.kd-sec-0>.kd-cols>.kd-col>.kd-figure:first-child:not(:has([class*="kd-mask--"])){margin:-32px -24px 0;width:calc(100% + 48px)',
    );
    expect(css).toContain("border-radius:16px 16px 0 0");
  });

  it("a card with several columns keeps its photos where they are", () => {
    const d = design([
      section(
        "s",
        [
          [
            {
              id: "img",
              kind: "image",
              imageRef: "foto-a",
              alt: "Platillo",
              aspect: "4:3",
              fit: "cover",
            },
          ],
          [{ id: "h", kind: "heading", text: "Hola", level: 2 }],
        ],
        { card: true },
      ),
    ]);
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).not.toContain("width:calc(100% + 48px)");
  });

  it("a lone last featured card spans the row with a wide photo", () => {
    const { css } = renderDesignedBody(
      menu,
      design([
        section("s", [
          [
            {
              id: "f",
              kind: "featuredItems",
              itemIds: ["a", "c"],
              layout: "hero",
            },
          ],
        ]),
      ]),
      testContext(),
    );
    expect(css).toContain(
      ".kd-featured-items--cards>.kd-featured-card:last-child:nth-child(odd){grid-column:1 / -1}",
    );
  });
});

describe("prices in the accent", () => {
  it("use the accent only when it reads on the page and the cards", () => {
    const readable = design([
      section("s", [
        [{ id: "m", kind: "menu", layout: "list", photos: "none" }],
      ]),
    ]);
    const dark = renderDesignedBody(menu, readable, testContext()).css;
    // The fixture's accent (#0a6c78) reads on its cream page and white cards.
    expect(dark).toContain("--kd-price:#0a6c78");
    const gold = {
      ...readable,
      style: {
        ...readable.style,
        palette: { ...readable.style.palette, accent: "#d4a853" },
      },
    };
    const pale = renderDesignedBody(menu, gold, testContext()).css;
    expect(pale).toContain(`--kd-price:${readable.style.palette.text}`);
    expect(pale).toContain(
      ".kd-price--accent{color:var(--kd-price, var(--kd-accent))}",
    );
  });
});
