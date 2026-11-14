import type { ExperienceContent, PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  applyItemPhotos,
  photoSpacesIn,
} from "../src/features/studio/ai/apply-design.js";
import {
  fillBlockSpace,
  fillItemSpace,
  fillPageBackgroundSpace,
  fillSectionBackgroundSpace,
  photoSpaceOf,
} from "../src/features/studio/stage/photo-spaces.js";

// ---------------------------------------------------------------------------
// Espacios para foto (2026-10-03): the AI leaves a space where a photo the
// business does not have yet would go; the owner taps it and uploads.
// ---------------------------------------------------------------------------

const photo = "33333333-3333-4333-8333-333333333333";

const design = {
  schema: 1,
  style: {
    palette: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#555555",
      accent: "#b4471f",
    },
    fonts: { heading: "bricolage", body: "dm-sans" },
    radius: 16,
    buttonStyle: "solid",
    buttonShape: "pill",
    shadow: "soft",
    background: { kind: "solid", color: "#ffffff" },
    maxWidth: 480,
  },
  sections: [
    {
      id: "s-1",
      layout: "1",
      columns: [
        [
          {
            id: "foto-local",
            kind: "image",
            alt: "Foto del local de día",
            aspect: "4:3",
            fit: "cover",
          },
          {
            id: "galeria",
            kind: "gallery",
            layout: "grid",
            aspect: "1:1",
            images: [
              { alt: "Tu terraza" },
              { imageRef: photo, alt: "Tu barra" },
              { alt: "Tu cocina" },
            ],
          },
          { id: "b-menu", kind: "menu", layout: "cards", photos: "large" },
        ],
      ],
      paddingTop: 24,
      paddingBottom: 24,
      gap: 16,
      align: "start",
    },
  ],
} as unknown as PageDesign;

const menu = {
  title: "Fonda",
  currency: "MXN",
  sections: [
    {
      id: "sec-1",
      name: "Comida",
      items: [
        { id: "comida-1", name: "Comida 1", price: 100 },
        { id: "comida-2", name: "Comida 2", price: 110 },
        { id: "comida-3", name: "Comida 3", price: 120, imageAssetId: photo },
      ],
    },
  ],
} as unknown as ExperienceContent;

type Items = { items: { id: string; imageAssetId?: string }[] }[];
const itemsOf = (content: ExperienceContent) =>
  (content as unknown as { sections: Items }).sections[0]?.items ?? [];

/** A tiny stand-in for a preview element: `closest` walks a chain of
 * ancestors, innermost first. Each ancestor is either an attribute map
 * (`[data-x]` selectors) or `{ class: "a b" }` (`.a`/`.b` selectors). */
type FakeAncestor = { class?: string } & Record<string, string | undefined>;

function element(chain: FakeAncestor[]): Element {
  function matches(node: FakeAncestor, selector: string): boolean {
    if (selector.startsWith("."))
      return (node.class ?? "").split(/\s+/).includes(selector.slice(1));
    const name = selector.slice(1, -1);
    return name in node;
  }
  return {
    closest(selector: string) {
      const found = chain.find((node) => matches(node, selector));
      return found
        ? { getAttribute: (attribute: string) => found[attribute] ?? null }
        : null;
    },
  } as unknown as Element;
}

describe("photo spaces", () => {
  it("counts the spaces the AI left", () => {
    expect(photoSpacesIn(design)).toBe(3);
  });

  it("finds the space under a click", () => {
    expect(
      photoSpaceOf(
        element([
          { "data-item-photo": "comida-1" },
          { "data-block-id": "b-menu" },
        ]),
        design,
      ),
    ).toEqual({ kind: "item", itemId: "comida-1" });
    expect(
      photoSpaceOf(
        element([{ "data-gallery-slot": "2" }, { "data-block-id": "galeria" }]),
        design,
      ),
    ).toEqual({ kind: "gallery", blockId: "galeria", index: 2 });
    expect(
      photoSpaceOf(
        element([
          { "data-placeholder": "" },
          { "data-block-id": "foto-local" },
        ]),
        design,
      ),
    ).toEqual({ kind: "block", blockId: "foto-local" });
    expect(
      photoSpaceOf(element([{ "data-block-id": "b-menu" }]), design),
    ).toBeNull();
  });

  it("puts the uploaded photo in an image space and a gallery slot", () => {
    const withImage = fillBlockSpace(
      design,
      { kind: "block", blockId: "foto-local" },
      photo,
    );
    const withSlot = fillBlockSpace(
      withImage,
      { kind: "gallery", blockId: "galeria", index: 0 },
      photo,
    );
    expect(photoSpacesIn(withSlot)).toBe(1);
  });

  it("puts the uploaded photo on its dish", () => {
    const next = fillItemSpace(menu, "comida-1", photo);
    expect(itemsOf(next).map((item) => item.imageAssetId)).toEqual([
      photo,
      undefined,
      photo,
    ]);
  });
});

describe("background photo spaces (relevo 37, B3)", () => {
  const withBackgrounds = {
    ...design,
    style: {
      ...design.style,
      // The page's own background: a deliberate empty slot.
      background: { kind: "image", color: "#ffffff" },
    },
    sections: [
      { ...design.sections[0], background: { kind: "image" } },
      {
        id: "s-2",
        layout: "1",
        columns: [[]],
        paddingTop: 24,
        paddingBottom: 24,
        gap: 16,
        align: "start",
        // Already has a photo: not a space.
        background: { kind: "image", imageRef: photo },
      },
      {
        id: "s-3",
        layout: "1",
        columns: [[]],
        paddingTop: 24,
        paddingBottom: 24,
        gap: 16,
        align: "start",
        // A solid background is never a photo space.
        background: { kind: "solid", color: "#ffffff" },
      },
    ],
  } as unknown as PageDesign;

  it("counts the page's and each section's own open background", () => {
    // 3 block/gallery spaces (from "s-1", reused above) + the page + "s-1".
    expect(photoSpacesIn(withBackgrounds)).toBe(5);
  });

  it("finds a section's background under a click with no block ancestor", () => {
    expect(
      photoSpaceOf(element([{ "data-section-id": "s-1" }]), withBackgrounds),
    ).toEqual({ kind: "section-background", sectionId: "s-1" });
    // Already filled: not a space, even though it is a `[data-section-id]`.
    expect(
      photoSpaceOf(element([{ "data-section-id": "s-2" }]), withBackgrounds),
    ).toBeNull();
    // Solid background: never a space.
    expect(
      photoSpaceOf(element([{ "data-section-id": "s-3" }]), withBackgrounds),
    ).toBeNull();
  });

  it("finds the page's own background when no section claims the click", () => {
    expect(
      photoSpaceOf(element([{ class: "kd-page" }]), withBackgrounds),
    ).toEqual({ kind: "page-background" });
    // The ordinary page (solid background): never a space.
    expect(photoSpaceOf(element([{ class: "kd-page" }]), design)).toBeNull();
  });

  it("a block inside a section wins over the section's own background", () => {
    expect(
      photoSpaceOf(
        element([
          { "data-placeholder": "" },
          { "data-block-id": "foto-local" },
          { "data-section-id": "s-1" },
          { class: "kd-page" },
        ]),
        withBackgrounds,
      ),
    ).toEqual({ kind: "block", blockId: "foto-local" });
  });

  it("puts the uploaded photo as the page's background", () => {
    const next = fillPageBackgroundSpace(withBackgrounds, photo);
    expect(next.style.background).toEqual({
      kind: "image",
      color: "#ffffff",
      imageRef: photo,
    });
    // A background that is not an open space is left exactly as is.
    expect(fillPageBackgroundSpace(design, photo)).toBe(design);
  });

  it("puts the uploaded photo as a section's background", () => {
    const next = fillSectionBackgroundSpace(withBackgrounds, "s-1", photo);
    expect(next.sections[0]?.background).toEqual({
      kind: "image",
      imageRef: photo,
    });
    // "s-2" already has a photo: filling it again changes nothing.
    const unchanged = fillSectionBackgroundSpace(withBackgrounds, "s-2", photo);
    expect(unchanged.sections[1]).toBe(withBackgrounds.sections[1]);
  });
});

describe("the owner's photos matched by the AI", () => {
  it("fills only the dishes that still have no photo", () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const next = applyItemPhotos(menu, [
      { itemId: "comida-2", imageRef: other },
      { itemId: "comida-3", imageRef: other },
    ]);
    expect(itemsOf(next).map((item) => item.imageAssetId)).toEqual([
      undefined,
      other,
      photo,
    ]);
  });

  it("leaves the content alone without matches", () => {
    expect(applyItemPhotos(menu, undefined)).toBe(menu);
    expect(applyItemPhotos(menu, [])).toBe(menu);
  });
});
