import { describe, expect, it } from "vitest";
import type {
  CustomHtmlModel,
  CustomHtmlModelCompleteInput,
} from "../src/custom-html/model.js";
import { runDesignReview } from "../src/design-ai/design-generate.js";
import { contrastRatio } from "../src/design-ai/readable-palette.js";

// ---------------------------------------------------------------------------
// The block-design review loop after the AI test bench (2026-10-02): a
// schema mistake is named field by field, and a palette that does not read
// is fixed without spending another turn.
// ---------------------------------------------------------------------------

function design(overrides: { palette?: object; fonts?: object } = {}) {
  return {
    schema: 1,
    style: {
      palette: {
        background: "#f7f5f0",
        surface: "#ffffff",
        text: "#1f2a27",
        muted: "#5b6b66",
        accent: "#2f5d50",
        ...overrides.palette,
      },
      fonts: { heading: "playfair", body: "dm-sans", ...overrides.fonts },
      radius: 16,
      buttonStyle: "solid",
      buttonShape: "pill",
      shadow: "soft",
      background: { kind: "solid", color: "#f7f5f0" },
      maxWidth: 480,
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
        paddingTop: 32,
        paddingBottom: 32,
        gap: 16,
        align: "center",
      },
    ],
  };
}

function scripted(answers: unknown[]): CustomHtmlModel & {
  calls: CustomHtmlModelCompleteInput[];
} {
  const calls: CustomHtmlModelCompleteInput[] = [];
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    calls,
    async complete(input) {
      calls.push(input);
      const answer = answers[calls.length - 1];
      return {
        text: JSON.stringify({ design: answer, notes: "Listo." }),
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "end_turn",
      };
    },
  };
}

const review = (model: CustomHtmlModel) =>
  runDesignReview({
    model,
    type: "links",
    system: "SYSTEM",
    userMessage: "USER",
    images: [],
    contentItemIds: ["link-1"],
    allowedImageRefs: new Set(),
    allowHtmlBlocks: false,
  });

describe("runDesignReview after the test bench", () => {
  it("names the field and the value when the schema fails", async () => {
    const model = scripted([
      design({ fonts: { heading: "Playfair Display" } }),
      design(),
    ]);
    const result = await review(model);
    expect(result.audit.turns).toBe(2);
    const feedback = model.calls[1]?.messages.at(-1)?.content[0];
    const text = feedback?.type === "text" ? feedback.text : "";
    expect(text).toContain("/style/fonts/heading");
    expect(text).toContain('"Playfair Display"');
  });

  it("names the field inside a section, not just the section", async () => {
    const withCanvas = {
      ...design(),
      schema: 2,
      sections: [
        {
          id: "portada",
          kind: "canvas",
          height: 300,
          background: { kind: "foto" },
          items: [],
        },
        ...design().sections,
      ],
    };
    const model = scripted([withCanvas, design()]);
    await review(model);
    const feedback = model.calls[1]?.messages.at(-1)?.content[0];
    const text = feedback?.type === "text" ? feedback.text : "";
    expect(text).toContain("/sections/0/background/kind");
  });

  it("repairs a token background, an rgba overlay and CSS style names without another turn", async () => {
    const base = design();
    const sloppy = {
      ...base,
      style: {
        ...base.style,
        background: { kind: "solid", color: "background" },
      },
      sections: [
        {
          ...base.sections[0],
          background: { kind: "solid", color: "surface" },
          columns: [
            [
              {
                id: "h1",
                kind: "heading",
                text: "Hola",
                level: 1,
                style: { textAlign: "center", weight: 600, maxWidth: "80px" },
              },
              ...(base.sections[0]?.columns[0] ?? []),
            ],
          ],
        },
      ],
    };
    const model = scripted([sloppy]);
    const result = await review(model);
    expect(result.audit.turns).toBe(1);
    expect(result.design.style.background).toEqual({
      kind: "solid",
      color: "#f7f5f0",
    });
  });

  it("says which field of a block is wrong, not just 'Invalid block'", async () => {
    const base = design();
    const withCssStyle = {
      ...base,
      sections: [
        {
          ...base.sections[0],
          columns: [
            [
              {
                id: "h1",
                kind: "heading",
                text: "Hola",
                level: 1,
                style: { color: "rosa mexicano" },
              },
              ...(base.sections[0]?.columns[0] ?? []),
            ],
          ],
        },
      ],
    };
    const model = scripted([withCssStyle, design()]);
    await review(model);
    const feedback = model.calls[1]?.messages.at(-1)?.content[0];
    const text = feedback?.type === "text" ? feedback.text : "";
    expect(text).toContain("sections[0].columns[0][0]/style/color");
    expect(text).toContain('"rosa mexicano"');
  });

  it("makes a weak palette readable without another turn", async () => {
    const model = scripted([
      design({ palette: { muted: "#b5bdb9", accent: "#e7b7c8" } }),
    ]);
    const result = await review(model);
    expect(result.audit.turns).toBe(1);
    const palette = result.design.style.palette;
    expect(
      contrastRatio(palette.muted, palette.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(palette.accent, palette.surface),
    ).toBeGreaterThanOrEqual(3);
  });

  it("'sin banco de fotos': strips an invented imageRef instead of dropping the whole image block", async () => {
    const withBadImage = {
      ...design(),
      sections: [
        {
          ...design().sections[0],
          columns: [
            [
              {
                id: "img1",
                kind: "image",
                imageRef: "11111111-1111-4111-8111-111111111111",
                alt: "Espacio para la foto del local",
                aspect: "4:3",
                fit: "cover",
              },
              ...(design().sections[0]?.columns[0] ?? []),
            ],
          ],
        },
      ],
    };
    const model = scripted([withBadImage]);
    const result = await review(model);
    expect(result.audit.turns).toBe(1);
    const imageBlock = (
      (result.design.sections[0]?.columns[0] ?? []) as { kind: string }[]
    ).find((b) => b.kind === "image") as { imageRef?: string } | undefined;
    expect(imageBlock).toBeDefined();
    expect(imageBlock?.imageRef).toBeUndefined();
  });
});

describe("runDesignReview: featuredItems (motor de 3 bloques)", () => {
  function menuDesign(itemIds: string[]) {
    return {
      schema: 1,
      style: design().style,
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [
            [
              { id: "ct1", kind: "contentTitle" },
              { id: "mn1", kind: "menu", layout: "list", photos: "none" },
              { id: "fi1", kind: "featuredItems", layout: "cards", itemIds },
            ],
          ],
          paddingTop: 32,
          paddingBottom: 32,
          gap: 16,
          align: "center",
        },
      ],
    };
  }

  const reviewMenu = (model: CustomHtmlModel) =>
    runDesignReview({
      model,
      type: "menu",
      system: "SYSTEM",
      userMessage: "USER",
      images: [],
      contentItemIds: ["sec1", "d1"],
      checkContext: { menuSectionIds: ["sec1"], featurableItemIds: ["d1"] },
      allowedImageRefs: new Set(),
      allowHtmlBlocks: false,
    });

  it("accepts a featuredItems block naming a real dish", async () => {
    const model = scripted([menuDesign(["d1"])]);
    const result = await reviewMenu(model);
    expect(result.audit.turns).toBe(1);
  });

  it("asks for a correction, naming the issue, when an itemId does not exist", async () => {
    const model = scripted([menuDesign(["ghost"]), menuDesign(["d1"])]);
    const result = await reviewMenu(model);
    expect(result.audit.turns).toBe(2);
    const feedback = model.calls[1]?.messages.at(-1)?.content[0];
    const text = feedback?.type === "text" ? feedback.text : "";
    expect(text).toContain("featuredItems");
  });
});
