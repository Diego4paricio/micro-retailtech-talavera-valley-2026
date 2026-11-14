import { describe, expect, it } from "vitest";
import type { CustomHtmlModel } from "../src/custom-html/model.js";
import {
  pickItemPhotos,
  runDesignReview,
} from "../src/design-ai/design-generate.js";

// ---------------------------------------------------------------------------
// The owner's photos matched to dishes (2026-10-03): a menu with Comida 1,
// 2 and 3 where only a photo of Comida 2 was uploaded gets that photo on
// Comida 2; 1 and 3 keep their photo space in the Estudio.
// ---------------------------------------------------------------------------

const photo2 = "22222222-2222-4222-8222-222222222222";
const logo = "11111111-1111-4111-8111-111111111111";
const targets = {
  itemIds: new Set(["comida-1", "comida-2", "comida-3"]),
  imageRefs: new Set([photo2]),
};

describe("pickItemPhotos", () => {
  it("keeps a real dish without photo and one of the owner's photos", () => {
    expect(
      pickItemPhotos([{ itemId: "comida-2", imageRef: photo2 }], targets),
    ).toEqual([{ itemId: "comida-2", imageRef: photo2 }]);
  });

  it("drops unknown dishes, the logo, repeats and junk", () => {
    expect(
      pickItemPhotos(
        [
          { itemId: "comida-9", imageRef: photo2 },
          { itemId: "comida-1", imageRef: logo },
          { itemId: "comida-2", imageRef: photo2 },
          { itemId: "comida-3", imageRef: photo2 },
          "comida-1",
          { itemId: 3, imageRef: photo2 },
        ],
        targets,
      ),
    ).toEqual([{ itemId: "comida-2", imageRef: photo2 }]);
  });

  it("gives nothing without targets or with a non-list", () => {
    expect(
      pickItemPhotos([{ itemId: "comida-2", imageRef: photo2 }], undefined),
    ).toEqual([]);
    expect(pickItemPhotos({ itemId: "comida-2" }, targets)).toEqual([]);
  });
});

const menuDesign = {
  schema: 1,
  style: {
    palette: {
      background: "#fbf5ec",
      surface: "#ffffff",
      text: "#2b1d14",
      muted: "#6e5646",
      accent: "#b4471f",
    },
    fonts: { heading: "bricolage", body: "dm-sans" },
    radius: 16,
    buttonStyle: "solid",
    buttonShape: "pill",
    shadow: "soft",
    background: { kind: "solid", color: "#fbf5ec" },
    maxWidth: 480,
  },
  sections: [
    {
      id: "s-1",
      layout: "1",
      columns: [
        [{ id: "b-menu", kind: "menu", layout: "cards", photos: "large" }],
      ],
      paddingTop: 24,
      paddingBottom: 24,
      gap: 16,
      align: "start",
    },
  ],
};

describe("design review with the owner's photos", () => {
  it("returns the matched photo next to the design", async () => {
    const model: CustomHtmlModel = {
      provider: "anthropic",
      model: "claude-sonnet-5",
      complete: async () => ({
        text: JSON.stringify({
          design: menuDesign,
          notes: "Listo.",
          itemPhotos: [
            { itemId: "comida-2", imageRef: photo2 },
            { itemId: "comida-1", imageRef: logo },
          ],
        }),
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "end_turn",
      }),
    };
    const review = await runDesignReview({
      model,
      type: "menu",
      system: "sistema",
      userMessage: "datos",
      images: [],
      contentItemIds: [],
      allowedImageRefs: new Set([photo2, logo]),
      itemPhotoTargets: targets,
      allowHtmlBlocks: false,
    });
    expect(review.itemPhotos).toEqual([
      { itemId: "comida-2", imageRef: photo2 },
    ]);
  });
});
