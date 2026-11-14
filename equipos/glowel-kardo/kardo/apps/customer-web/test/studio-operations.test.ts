import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { createBlock } from "../src/features/studio/model/blocks.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";
import {
  addSection,
  canMoveBlockStep,
  createSection,
  duplicateBlock,
  duplicateSection,
  insertBlock,
  locateBlock,
  moveBlock,
  moveBlockNextTo,
  moveBlockStep,
  moveBlockToSection,
  moveSection,
  removeBlock,
  removeSection,
  setBlockStyle,
  setSectionLayout,
  targetNextTo,
} from "../src/features/studio/model/operations.js";

const heading = (id: string): DesignBlock => ({
  id,
  kind: "heading",
  text: id,
  level: 2,
});

function sample(): PageDesign {
  return {
    schema: 1,
    style: {
      palette: {
        background: "#f7f5f0",
        surface: "#fffdf8",
        text: "#16232e",
        muted: "#52646d",
        accent: "#0a6c78",
      },
      fonts: { heading: "geist", body: "dm-sans" },
      radius: 16,
      buttonStyle: "solid",
      buttonShape: "pill",
      shadow: "soft",
      background: { kind: "none" },
      maxWidth: 560,
    },
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [
          [heading("a"), { id: "title", kind: "contentTitle" }, heading("b")],
        ],
        paddingTop: 32,
        paddingBottom: 32,
        gap: 16,
        align: "start",
      },
      {
        id: "s2",
        layout: "1-1",
        columns: [[heading("c")], [heading("d"), heading("e")]],
        paddingTop: 32,
        paddingBottom: 32,
        gap: 16,
        align: "center",
      },
    ],
  };
}

const order = (design: PageDesign) =>
  design.sections.map((section) =>
    section.columns.map((column) => column.map((block) => block.id)),
  );

describe("studio design operations", () => {
  it("never mutates the design it receives", () => {
    const design = sample();
    const frozen = JSON.stringify(design);
    moveBlock(design, "a", { sectionId: "s2", columnIndex: 1, index: 0 });
    removeBlock(design, "b");
    setSectionLayout(design, "s2", "1");
    setBlockStyle(design, "a", { fontSize: 20 });
    expect(JSON.stringify(design)).toBe(frozen);
  });

  it("inserts blocks at a clamped index of a column", () => {
    const next = insertBlock(sample(), heading("new"), {
      sectionId: "s2",
      columnIndex: 1,
      index: 99,
    });
    expect(order(next)[1]).toEqual([["c"], ["d", "e", "new"]]);
  });

  it("moves within a column like arrayMove and across columns and sections", () => {
    const within = moveBlock(sample(), "a", {
      sectionId: "s1",
      columnIndex: 0,
      index: 2,
    });
    expect(order(within)[0]).toEqual([["title", "b", "a"]]);

    const across = moveBlock(sample(), "e", {
      sectionId: "s1",
      columnIndex: 0,
      index: 1,
    });
    expect(order(across)).toEqual([[["a", "e", "title", "b"]], [["c"], ["d"]]]);
  });

  it("drops a block before or after another one", () => {
    const before = moveBlockNextTo(sample(), "d", "a", "before");
    expect(order(before)[0]).toEqual([["d", "a", "title", "b"]]);
    const after = moveBlockNextTo(sample(), "a", "b", "after");
    expect(order(after)[0]).toEqual([["title", "b", "a"]]);
    expect(targetNextTo(sample(), "d", "after")).toEqual({
      sectionId: "s2",
      columnIndex: 1,
      index: 1,
    });
  });

  it("steps through columns and sections with the keyboard moves", () => {
    let design = sample();
    expect(canMoveBlockStep(design, "a", -1)).toBe(false);
    design = moveBlockStep(design, "b", 1);
    // Leaves section 1 for the first column of section 2.
    expect(order(design)[1]).toEqual([
      ["b", "c"],
      ["d", "e"],
    ]);
    design = moveBlockStep(design, "c", 1);
    // Next column of the same section.
    expect(order(design)[1]).toEqual([["b"], ["c", "d", "e"]]);
    expect(canMoveBlockStep(design, "e", 1)).toBe(false);
    design = moveBlockStep(design, "b", -1);
    expect(order(design)[0]).toEqual([["a", "title", "b"]]);
  });

  it("moves a block to the end of another section's first column", () => {
    const moved = moveBlockToSection(sample(), "a", "s2");
    expect(order(moved)[1]).toEqual([
      ["c", "a"],
      ["d", "e"],
    ]);
  });

  it("duplicates free blocks with a new id, never bound ones", () => {
    const newId = createIdFactory(["a", "b"], () => "copy");
    const result = duplicateBlock(sample(), "a", newId);
    expect(result?.id).toBe("b-copy");
    expect(order(result?.design ?? sample())[0]).toEqual([
      ["a", "b-copy", "title", "b"],
    ]);
    expect(duplicateBlock(sample(), "title", newId)).toBeNull();
  });

  it("removes blocks and sections, but always keeps one section", () => {
    expect(order(removeBlock(sample(), "b"))[0]).toEqual([["a", "title"]]);
    const one = removeSection(sample(), "s2");
    expect(one.sections.map((section) => section.id)).toEqual(["s1"]);
    expect(removeSection(one, "s1")).toBe(one);
  });

  it("reorders and duplicates sections without copying bound blocks", () => {
    expect(
      moveSection(sample(), "s2", 0).sections.map((section) => section.id),
    ).toEqual(["s2", "s1"]);
    let counter = 0;
    const newId = createIdFactory([], () => `n${++counter}`);
    const result = duplicateSection(sample(), "s1", newId);
    expect(result?.design.sections.map((section) => section.id)).toEqual([
      "s1",
      result?.id,
      "s2",
    ]);
    const copy = result?.design.sections[1];
    expect(copy?.columns[0]?.map((block) => block.kind)).toEqual([
      "heading",
      "heading",
    ]);
    expect(copy?.columns[0]?.some((block) => block.id === "a")).toBe(false);
  });

  it("changing the layout never loses blocks", () => {
    const merged = setSectionLayout(sample(), "s2", "1");
    expect(order(merged)[1]).toEqual([["c", "d", "e"]]);
    const widened = setSectionLayout(sample(), "s2", "1-1-1");
    expect(order(widened)[1]).toEqual([["c"], ["d", "e"], []]);
    expect(widened.sections[1]?.layout).toBe("1-1-1");
  });

  it("adds sections with the right number of columns", () => {
    const newId = createIdFactory([], () => "x");
    const section = createSection(newId, "2-1");
    expect(section.columns).toHaveLength(2);
    const next = addSection(sample(), section, 1);
    expect(next.sections.map((item) => item.id)).toEqual([
      "s1",
      section.id,
      "s2",
    ]);
  });

  it("sets and clears advanced style values without undefined keys", () => {
    const styled = setBlockStyle(sample(), "a", {
      fontSize: 24,
      align: "center",
    });
    expect(locateBlock(styled, "a")?.block.style).toEqual({
      fontSize: 24,
      align: "center",
    });
    const cleared = setBlockStyle(styled, "a", {
      fontSize: undefined,
      align: undefined,
    });
    const block = locateBlock(cleared, "a")?.block;
    expect(block && "style" in block).toBe(false);
  });

  it("creates blocks with valid starting values", () => {
    const newId = createIdFactory([]);
    for (const kind of ["heading", "text", "button", "spacer"] as const) {
      const block = createBlock(kind, newId);
      expect(block.kind).toBe(kind);
      expect(block.id).toMatch(/^b-[a-zA-Z0-9_-]+$/);
    }
  });
});
