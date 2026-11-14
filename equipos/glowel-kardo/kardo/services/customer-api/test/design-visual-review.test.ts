import type { PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import type {
  CustomHtmlModel,
  CustomHtmlModelCompleteInput,
} from "../src/custom-html/model.js";
import { runDesignReview } from "../src/design-ai/design-generate.js";
import {
  applyDesignPatch,
  parseVisualReview,
} from "../src/design-ai/design-visual-review.js";

// ---------------------------------------------------------------------------
// Visual review (relevo 29, 2026-10-03): the AI sees its page and answers
// "ok" or a few changes; only the test bench passes a renderer today.
// ---------------------------------------------------------------------------

const design = {
  schema: 2,
  style: {
    palette: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#555555",
      accent: "#1d4ed8",
    },
    fonts: { heading: "manrope", body: "dm-sans" },
    radius: 12,
    buttonStyle: "solid",
    buttonShape: "pill",
    shadow: "none",
    background: { kind: "solid", color: "#ffffff" },
    maxWidth: 480,
  },
  sections: [
    {
      id: "portada",
      kind: "canvas",
      height: 300,
      items: [
        {
          block: { id: "h", kind: "heading", level: 1, text: "Hola" },
          x: 24,
          y: 40,
          w: 342,
        },
      ],
    },
    {
      id: "s-1",
      layout: "1",
      columns: [[{ id: "b-2", kind: "contentLinks", layout: "list" }]],
      paddingTop: 32,
      paddingBottom: 16,
      gap: 16,
      align: "center",
    },
  ],
} as unknown as PageDesign;

describe("parseVisualReview", () => {
  it("reads ok, fixes and nothing", () => {
    expect(parseVisualReview('{"ok": true}')).toEqual({ ok: true });
    expect(
      parseVisualReview(
        'Listo: {"fixes":[{"op":"set","path":"/sections/0/items/0/y","value":60}],"notes":"Bajé el título"}',
      ),
    ).toEqual({
      ok: false,
      fixes: [{ op: "set", path: "/sections/0/items/0/y", value: 60 }],
      notes: "Bajé el título",
    });
    expect(parseVisualReview("no")).toBeUndefined();
  });
});

describe("applyDesignPatch", () => {
  it("sets and removes inside sections and style only", () => {
    const { design: next, applied } = applyDesignPatch(design, [
      { op: "set", path: "/sections/0/items/0/y", value: 64 },
      { op: "set", path: "/style/radius", value: 20 },
      { op: "remove", path: "/sections/1" },
      { op: "set", path: "/schema", value: 1 },
      { op: "set", path: "/sections/9/height", value: 10 },
    ]);
    const value = next as PageDesign;
    expect(applied).toBe(3);
    expect(value.style.radius).toBe(20);
    expect(value.sections).toHaveLength(1);
    expect(value.schema).toBe(2);
    // The original is untouched.
    expect(design.sections).toHaveLength(2);
  });
});

function scripted(answers: string[]) {
  const calls: CustomHtmlModelCompleteInput[] = [];
  const model: CustomHtmlModel = {
    provider: "anthropic",
    model: "claude-sonnet-5",
    complete: async (input) => {
      calls.push(input);
      return {
        text: answers[calls.length - 1] ?? "",
        usage: {
          inputTokens: 10,
          outputTokens: 10,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "end_turn",
      };
    },
  };
  return { model, calls };
}

const renderer = {
  render: async () => [
    { mediaType: "image/png" as const, base64: "iVBORw0KGgo=" },
  ],
};

const base = {
  type: "links" as const,
  system: "sistema",
  userMessage: "datos",
  images: [],
  contentItemIds: [],
  allowedImageRefs: new Set<string>(),
  allowHtmlBlocks: false,
  visualReviewer: renderer,
};

describe("runDesignReview with a visual review", () => {
  it("keeps the AI's changes when the design still validates", async () => {
    const { model, calls } = scripted([
      JSON.stringify({ design, notes: "Listo." }),
      JSON.stringify({
        fixes: [{ op: "set", path: "/sections/0/items/0/y", value: 80 }],
        notes: "Más aire arriba",
      }),
    ]);
    const result = await runDesignReview({ ...base, model });
    expect(calls.map((call) => call.responseContract)).toEqual([
      "design",
      "design-review",
    ]);
    // The screenshot goes in, right before the rubric.
    const last = calls[1]?.messages.at(-1);
    expect(last?.content[0]?.type).toBe("image");
    expect(result.visualReview).toEqual({
      ok: false,
      applied: 1,
      notes: "Más aire arriba",
    });
    const cover = result.design.sections[0] as { items: { y: number }[] };
    expect(cover.items[0]?.y).toBe(80);
    expect(result.audit.turns).toBe(2);
  });

  it("keeps the design it had when the changes break it", async () => {
    const { model } = scripted([
      JSON.stringify({ design, notes: "Listo." }),
      JSON.stringify({
        fixes: [{ op: "remove", path: "/sections/1" }],
      }),
    ]);
    const result = await runDesignReview({ ...base, model });
    expect(result.visualReview?.applied).toBe(0);
    expect(result.design.sections).toHaveLength(2);
  });

  it("stops after ok", async () => {
    const { model } = scripted([
      JSON.stringify({ design, notes: "Listo." }),
      '{"ok": true}',
    ]);
    const result = await runDesignReview({ ...base, model });
    expect(result.visualReview).toEqual({ ok: true, applied: 0, notes: "" });
  });
});
