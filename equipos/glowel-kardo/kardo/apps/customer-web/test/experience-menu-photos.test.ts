import { describe, expect, it } from "vitest";
import { cleanContent } from "../src/features/experiences/content.js";

/**
 * Menu items can now carry an optional `imageAssetId` (a validated image
 * from the workspace asset library), exactly like catalog items already do.
 * These tests cover `cleanContent`'s normalization of that field, since it
 * is what builds the exact payload sent to the API.
 */
describe("menu item photos", () => {
  const uuid = "3fbd5c2e-8f7a-4c8e-9e9a-2d3a1b7c4e10";

  it("keeps a valid imageAssetId on a menu item", () => {
    const cleaned = cleanContent("menu", {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "s",
          name: "Sección",
          items: [{ id: "i", name: "Latte", imageAssetId: uuid }],
        },
      ],
    }) as {
      sections: { items: { id: string; imageAssetId?: string }[] }[];
    };
    expect(cleaned.sections[0]?.items[0]?.imageAssetId).toBe(uuid);
  });

  it("drops an empty imageAssetId instead of sending an empty string", () => {
    const cleaned = cleanContent("menu", {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "s",
          name: "Sección",
          items: [{ id: "i", name: "Latte", imageAssetId: "" }],
        },
      ],
    });
    expect(JSON.stringify(cleaned)).not.toContain("imageAssetId");
    expect(JSON.stringify(cleaned)).not.toContain("undefined");
  });

  it("omits imageAssetId entirely for items that never set one", () => {
    const cleaned = cleanContent("menu", {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "s",
          name: "Sección",
          items: [{ id: "i", name: " Café ", description: "  " }],
        },
      ],
    });
    expect(cleaned).toEqual({
      title: "Menú",
      currency: "MXN",
      sections: [
        { id: "s", name: "Sección", items: [{ id: "i", name: "Café" }] },
      ],
    });
  });

  it("normalizes photos independently per item within a section", () => {
    const otherUuid = "9a1b2c3d-4e5f-4061-8a9b-0c1d2e3f4a5b";
    const cleaned = cleanContent("menu", {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "s",
          name: "Sección",
          items: [
            { id: "i1", name: "Latte", imageAssetId: uuid },
            { id: "i2", name: "Té", imageAssetId: "" },
            { id: "i3", name: "Agua", imageAssetId: otherUuid },
          ],
        },
      ],
    }) as {
      sections: { items: { id: string; imageAssetId?: string }[] }[];
    };
    const items = cleaned.sections[0]?.items ?? [];
    expect(items[0]?.imageAssetId).toBe(uuid);
    expect(items[1]).not.toHaveProperty("imageAssetId");
    expect(items[2]?.imageAssetId).toBe(otherUuid);
  });
});
