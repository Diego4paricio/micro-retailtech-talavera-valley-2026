import { describe, expect, it } from "vitest";
import { parsePublishedDesign } from "../src/index.js";
import { design, section } from "./fixtures.js";

const validImageHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherImageHash =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const someUuid = "11111111-1111-4111-8111-111111111111";

function validLinksDesign() {
  return design([
    section("s1", [
      [
        { id: "ct1", kind: "contentTitle" },
        { id: "cl1", kind: "contentLinks", layout: "list" },
      ],
    ]),
  ]);
}

describe("parsePublishedDesign", () => {
  it("accepts a valid design with a resolved image hash", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "img1",
      kind: "image",
      imageRef: validImageHash,
      alt: "",
      aspect: "auto",
      fit: "cover",
    });
    const result = parsePublishedDesign(d, "links", new Set([validImageHash]), [
      "l1",
    ]);
    expect(result).not.toBeNull();
  });

  it("rejects a design whose imageRef is a workspace asset uuid (not a published hash)", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "img1",
      kind: "image",
      imageRef: someUuid,
      alt: "",
      aspect: "auto",
      fit: "cover",
    });
    const result = parsePublishedDesign(d, "links", new Set([someUuid]), [
      "l1",
    ]);
    expect(result).toBeNull();
  });

  it("accepts a gallery block whose every photo hash is in the snapshot", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "g1",
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images: [
        { imageRef: validImageHash, alt: "Uno" },
        { imageRef: otherImageHash, alt: "Dos" },
      ],
    });
    const result = parsePublishedDesign(
      d,
      "links",
      new Set([validImageHash, otherImageHash]),
      ["l1"],
    );
    expect(result).not.toBeNull();
  });

  it("rejects a gallery block with one photo hash absent from the snapshot", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "g1",
      kind: "gallery",
      layout: "grid",
      aspect: "1:1",
      images: [
        { imageRef: validImageHash, alt: "Uno" },
        { imageRef: otherImageHash, alt: "Dos" },
      ],
    });
    const result = parsePublishedDesign(d, "links", new Set([validImageHash]), [
      "l1",
    ]);
    expect(result).toBeNull();
  });

  it("rejects a design referencing an image hash absent from the snapshot", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "img1",
      kind: "image",
      imageRef: validImageHash,
      alt: "",
      aspect: "auto",
      fit: "cover",
    });
    const result = parsePublishedDesign(d, "links", new Set([otherImageHash]), [
      "l1",
    ]);
    expect(result).toBeNull();
  });

  it("rejects a section whose column count does not match its layout", () => {
    const d = validLinksDesign();
    // "1" needs exactly one column; this section claims a second, empty one.
    d.sections[0]?.columns.push([]);
    const result = parsePublishedDesign(d, "links", new Set(), ["l1"]);
    expect(result).toBeNull();
  });

  it("rejects duplicate block ids", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({ id: "cl1", kind: "divider" });
    const result = parsePublishedDesign(d, "links", new Set(), ["l1"]);
    expect(result).toBeNull();
  });

  it("rejects a block id that collides with a content item id", () => {
    const d = validLinksDesign();
    const result = parsePublishedDesign(d, "links", new Set(), ["ct1"]);
    expect(result).toBeNull();
  });

  it("rejects a design missing its required bound block", () => {
    const d = design([
      section("s1", [[{ id: "h1", kind: "heading", text: "Hi", level: 1 }]]),
    ]);
    const result = parsePublishedDesign(d, "links", new Set(), []);
    expect(result).toBeNull();
  });

  it("rejects a bound block not available for the experience type", () => {
    const d = design([
      section("s1", [
        [
          { id: "cl1", kind: "contentLinks", layout: "list" },
          { id: "cs1", kind: "contentSocials", size: "medium" },
        ],
      ]),
    ]);
    // contentSocials is only valid for linkpage, not links.
    const result = parsePublishedDesign(d, "links", new Set(), []);
    expect(result).toBeNull();
  });

  it("rejects structurally invalid input (fails Value.Check)", () => {
    expect(
      parsePublishedDesign({ schema: 2 }, "links", new Set(), []),
    ).toBeNull();
    expect(parsePublishedDesign(null, "links", new Set(), [])).toBeNull();
    expect(
      parsePublishedDesign("not an object", "links", new Set(), []),
    ).toBeNull();
  });

  it("rejects a hex color outside #rrggbb shape smuggled onto the style", () => {
    const d = validLinksDesign();
    (d.style.palette as unknown as Record<string, unknown>).accent =
      "red; } body { background: url(evil) ";
    const result = parsePublishedDesign(d, "links", new Set(), ["l1"]);
    expect(result).toBeNull();
  });

  it("checks a menu block's sectionIds against the given menuSectionIds context (addendum 3)", () => {
    const d = design([
      section("s1", [
        [
          { id: "ct1", kind: "contentTitle" },
          {
            id: "mn1",
            kind: "menu",
            layout: "list",
            photos: "none",
            sectionIds: ["bebidas"],
          },
        ],
      ]),
    ]);
    expect(
      parsePublishedDesign(d, "menu", new Set(), [], {
        menuSectionIds: ["bebidas", "postres"],
      }),
    ).not.toBeNull();
    expect(
      parsePublishedDesign(d, "menu", new Set(), [], {
        menuSectionIds: ["postres"],
      }),
    ).toBeNull();
    // No context at all: `checkDesign` has nothing to check the section id
    // against, so it is accepted (mirrors an absent `menuSectionIds`).
    expect(parsePublishedDesign(d, "menu", new Set(), [])).not.toBeNull();
  });

  it("checks a featuredItems block's itemIds against the given featurableItemIds context", () => {
    const d = design([
      section("s1", [
        [
          { id: "ct1", kind: "contentTitle" },
          {
            id: "mn1",
            kind: "menu",
            layout: "list",
            photos: "none",
          },
          {
            id: "fi1",
            kind: "featuredItems",
            layout: "cards",
            itemIds: ["d1"],
          },
        ],
      ]),
    ]);
    expect(
      parsePublishedDesign(d, "menu", new Set(), ["d1", "d2"], {
        featurableItemIds: ["d1", "d2"],
      }),
    ).not.toBeNull();
    expect(
      parsePublishedDesign(d, "menu", new Set(), ["d1", "d2"], {
        featurableItemIds: ["d2"],
      }),
    ).toBeNull();
  });

  it("checks an html block's kardo-asset tokens against the snapshot's own image hashes (addendum 3)", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "h1",
      kind: "html",
      html: `<img src="kardo-asset:${validImageHash}">`,
      css: `.a{background:url(kardo-asset:${validImageHash})}`,
    });
    expect(
      parsePublishedDesign(d, "links", new Set([validImageHash]), ["l1"]),
    ).not.toBeNull();
    expect(
      parsePublishedDesign(d, "links", new Set([otherImageHash]), ["l1"]),
    ).toBeNull();
  });

  it("rejects an html block whose kardo-asset token is a workspace uuid, not a published hash", () => {
    const d = validLinksDesign();
    d.sections[0]?.columns[0]?.push({
      id: "h1",
      kind: "html",
      html: `<img src="kardo-asset:${someUuid}">`,
      css: "",
    });
    expect(
      parsePublishedDesign(d, "links", new Set([someUuid]), ["l1"]),
    ).toBeNull();
  });
});
