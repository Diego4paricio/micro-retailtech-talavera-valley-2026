import type { PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import {
  setBlockStyle,
  updateStyle,
} from "../src/features/studio/model/operations.js";
import {
  createHistory,
  type History,
  historyReducer,
  stableKey,
} from "../src/lib/history.js";

/** The Estudio reuses the Estudio QR history with page designs. */
const start = designFromContent("links", {
  title: "Café",
  links: [{ id: "l1", label: "Menú", url: "https://cafe.example" }],
});
const blockId = start.sections[0]?.columns[0]?.[0]?.id ?? "missing-block";

function apply(
  state: History<PageDesign>,
  recipe: (design: PageDesign) => PageDesign,
  key: string | undefined,
  at: number,
) {
  return historyReducer(state, { type: "update", recipe, key, at });
}

describe("studio history", () => {
  it("coalesces a slider drag into one undo step", () => {
    let state = createHistory(start);
    for (let size = 13; size <= 40; size += 1)
      state = apply(
        state,
        (design) => setBlockStyle(design, blockId, { fontSize: size }),
        `${blockId}:fontSize`,
        1_000 + size * 10,
      );
    expect(state.past).toHaveLength(1);
    state = historyReducer(state, { type: "undo" });
    expect(stableKey(state.present)).toBe(stableKey(start));
  });

  it("keeps separate steps for separate controls and redoes them", () => {
    let state = createHistory(start);
    state = apply(
      state,
      (design) => updateStyle(design, (style) => ({ ...style, radius: 4 })),
      "style:radius",
      10,
    );
    state = apply(
      state,
      (design) =>
        updateStyle(design, (style) => ({ ...style, shadow: "strong" })),
      undefined,
      20,
    );
    expect(state.past).toHaveLength(2);
    state = historyReducer(state, { type: "undo" });
    expect(state.present.style.shadow).toBe(start.style.shadow);
    expect(state.present.style.radius).toBe(4);
    state = historyReducer(state, { type: "redo" });
    expect(state.present.style.shadow).toBe("strong");
  });

  it("ignores edits that change nothing (no empty undo steps)", () => {
    const state = createHistory(start);
    const next = apply(
      state,
      (design) => setBlockStyle(design, blockId, {}),
      undefined,
      5,
    );
    expect(next).toBe(state);
  });
});
