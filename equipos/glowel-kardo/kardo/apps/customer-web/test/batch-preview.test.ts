import { describe, expect, it } from "vitest";
import {
  batchNames,
  batchPreviewSummary,
} from "../src/features/touchpoints/batch-preview.js";

describe("touchpoint batch preview", () => {
  it("names each touchpoint sequentially from the chosen start", () => {
    expect(batchNames("Mesa", 1, 3)).toEqual(["Mesa 1", "Mesa 2", "Mesa 3"]);
    expect(batchNames("Mesa", 5, 1)).toEqual(["Mesa 5"]);
  });

  it("trims the prefix and ignores an empty one", () => {
    expect(batchNames("  Mesa  ", 1, 2)).toEqual(["Mesa 1", "Mesa 2"]);
    expect(batchNames("   ", 1, 5)).toEqual([]);
    expect(batchNames("Mesa", 1, 0)).toEqual([]);
  });

  it("summarizes a single touchpoint plainly", () => {
    expect(batchPreviewSummary("Mesa", 1, 1)).toBe("Mesa 1");
  });

  it("summarizes several touchpoints as a range", () => {
    expect(batchPreviewSummary("Mesa", 1, 20)).toBe("Mesa 1 … Mesa 20");
    expect(batchPreviewSummary("Etiqueta", 10, 3)).toBe(
      "Etiqueta 10 … Etiqueta 12",
    );
  });

  it("is empty when there is nothing to preview yet", () => {
    expect(batchPreviewSummary("", 1, 10)).toBe("");
    expect(batchPreviewSummary("Mesa", 1, 0)).toBe("");
  });
});
