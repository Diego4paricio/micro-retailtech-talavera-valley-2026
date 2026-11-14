import {
  checkDesign,
  type DesignableExperienceType,
  isCanvasSection,
  type PageDesign,
  PageDesignSchema,
  sectionBlocks,
} from "@kardo/contracts";
import { FormatRegistry } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import {
  brandAccentFor,
  type StudioOrganizationBrand,
  withOrganizationBrand,
} from "../src/features/studio/model/organization-brand.js";
import {
  adaptTemplateDesign,
  studioTemplatesFor,
} from "../src/features/studio/model/templates.js";

// Same permissive format checks the customer-api registers
// (services/customer-api/src/validation/formats.ts).
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  });
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

const logo = "11111111-1111-4111-8111-111111111111";
const cover = "22222222-2222-4222-8222-222222222222";

const org: StudioOrganizationBrand = {
  name: "Florería Lila",
  logoAssetId: logo,
  coverAssetId: cover,
  brand: { primary: "#2f5d50", accent: "#e07a93" },
};

const linksDesign: PageDesign = {
  schema: 1,
  style: {
    palette: {
      background: "#f7f5f0",
      surface: "#fffdf8",
      text: "#16232e",
      muted: "#52646d",
      accent: "#0a6c78",
    },
    fonts: { heading: "dm-sans", body: "dm-sans" },
    radius: 16,
    buttonStyle: "solid",
    buttonShape: "rounded",
    shadow: "soft",
    background: { kind: "none" },
    maxWidth: 576,
  },
  sections: [
    {
      id: "s1",
      layout: "1",
      columns: [
        [
          { id: "b1", kind: "contentTitle" },
          { id: "b2", kind: "contentLinks", layout: "list" },
        ],
      ],
      paddingTop: 28,
      paddingBottom: 28,
      gap: 16,
      align: "start",
    },
  ],
} as PageDesign;

const imageRefs = (design: PageDesign) =>
  design.sections
    .flatMap(sectionBlocks)
    .flatMap((block) =>
      block.kind === "image" ? [(block as { imageRef: string }).imageRef] : [],
    );

describe("withOrganizationBrand", () => {
  it("puts the cover and the logo on top in a canvas header", () => {
    const next = withOrganizationBrand(
      linksDesign,
      "links",
      org,
      createIdFactory(["s1", "b1", "b2"]),
    );
    expect(next.schema).toBe(2);
    const header = next.sections[0];
    expect(header && isCanvasSection(header)).toBe(true);
    expect(imageRefs(next)).toEqual([cover, logo]);
    // The page's own first section stays, with less top padding: the
    // header already opens the page.
    expect(next.sections.slice(1)).toEqual([
      { ...linksDesign.sections[0], paddingTop: 12 },
    ]);
    expect(Value.Check(PageDesignSchema, next)).toBe(true);
    expect(checkDesign("links", next, [])).toEqual([]);
  });

  it("keeps the page's own colors unless asked to recolor", () => {
    const kept = withOrganizationBrand(
      linksDesign,
      "links",
      org,
      createIdFactory([]),
    );
    expect(kept.style.palette.accent).toBe("#0a6c78");
    const recolored = withOrganizationBrand(
      linksDesign,
      "links",
      org,
      createIdFactory([]),
      { recolor: true },
    );
    expect(recolored.style.palette.accent).toBe("#2f5d50");
  });

  it("adds only the cover on pages that open with the person's photo", () => {
    for (const type of ["profile", "linkpage"] as const) {
      const next = withOrganizationBrand(
        linksDesign,
        type,
        org,
        createIdFactory([]),
      );
      expect(imageRefs(next)).toEqual([cover]);
    }
  });

  it("leaves the logo alone when there is no cover", () => {
    const next = withOrganizationBrand(
      linksDesign,
      "menu",
      { ...org, coverAssetId: undefined },
      createIdFactory([]),
    );
    expect(imageRefs(next)).toEqual([logo]);
  });

  it("never adds a header to an image or a PDF, nor without a logo or cover", () => {
    for (const type of ["image", "document"] as DesignableExperienceType[]) {
      expect(
        withOrganizationBrand(linksDesign, type, org, createIdFactory([])),
      ).toEqual(linksDesign);
    }
    expect(
      withOrganizationBrand(
        linksDesign,
        "links",
        { name: "Sin marca" },
        createIdFactory([]),
      ),
    ).toEqual(linksDesign);
    expect(
      withOrganizationBrand(linksDesign, "links", null, createIdFactory([])),
    ).toBe(linksDesign);
  });

  it("does not stack a second cover over a design that opens with a canvas", () => {
    const once = withOrganizationBrand(
      linksDesign,
      "links",
      org,
      createIdFactory([]),
    );
    const twice = withOrganizationBrand(
      once,
      "links",
      org,
      createIdFactory(["s1", "b1", "b2"]),
    );
    expect(twice.sections.length).toBe(once.sections.length);
  });

  it("keeps every Kardo template valid with the brand applied", () => {
    for (const type of [
      "links",
      "profile",
      "linkpage",
      "menu",
      "catalog",
      "form",
    ] as const) {
      for (const template of studioTemplatesFor(type)) {
        const adapted = adaptTemplateDesign(template.design, type, []);
        // With the business's phone: a template's WhatsApp gets the number
        // (without one it waits empty, a pending item; see
        // studio-business-contact.test.ts).
        const next = withOrganizationBrand(
          adapted,
          type,
          { ...org, whatsappUrl: "https://wa.me/522221234567" },
          createIdFactory([]),
          { recolor: true },
        );
        expect(
          checkDesign(type, next, []),
          `${template.id} as ${type}`,
        ).toEqual([]);
      }
    }
  });
});

describe("brandAccentFor", () => {
  it("prefers the primary, falls back to the accent, then to nothing", () => {
    expect(
      brandAccentFor("#ffffff", { primary: "#2f5d50", accent: "#e07a93" }),
    ).toBe("#2f5d50");
    expect(
      brandAccentFor("#ffffff", { primary: "#f4d35e", accent: "#8c5a2b" }),
    ).toBe("#8c5a2b");
    expect(
      brandAccentFor("#ffffff", { primary: "#fafafa", accent: "#f0f0f0" }),
    ).toBeUndefined();
  });
});
