import { describe, expect, it } from "vitest";
import {
  marginGuides,
  snapMove,
  snapResize,
  snapValue,
} from "../src/features/studio/model/guides.js";

const canvas = { x: 0, y: 0, w: 390, h: 640 };

describe("canvas guides", () => {
  it("snaps to the canvas center lines and edges", () => {
    const result = snapMove({ x: 93, y: 12, w: 200, h: 50 }, [], canvas, 6);
    expect(result.x).toBe(95);
    expect(result.y).toBe(12);
    expect(result.guides).toEqual([{ axis: "x", at: 195, from: 0, to: 640 }]);

    const edge = snapMove({ x: 4, y: 297, w: 100, h: 50 }, [], canvas, 6);
    expect(edge).toMatchObject({ x: 0, y: 295 });
    expect(edge.guides).toEqual(
      expect.arrayContaining([
        { axis: "x", at: 0, from: 0, to: 640 },
        { axis: "y", at: 320, from: 0, to: 390 },
      ]),
    );
  });

  it("snaps to the edges and centers of other boxes, and draws the guide between them", () => {
    const other = { x: 50, y: 100, w: 100, h: 40 };
    const result = snapMove(
      { x: 153, y: 204, w: 60, h: 30 },
      [other],
      canvas,
      6,
    );
    expect(result.x).toBe(150);
    expect(result.guides).toContainEqual({
      axis: "x",
      at: 150,
      from: 100,
      to: 234,
    });

    const centered = snapMove(
      { x: 62, y: 400, w: 80, h: 30 },
      [other],
      canvas,
      6,
    );
    // Centers line up: 62 + 40 = 102 → 100.
    expect(centered.x).toBe(60);
    expect(centered.guides).toContainEqual({
      axis: "x",
      at: 100,
      from: 100,
      to: 430,
    });
  });

  it("leaves the box alone when nothing is within the threshold", () => {
    const result = snapMove({ x: 240, y: 470, w: 60, h: 40 }, [], canvas, 6);
    expect(result).toEqual({ x: 240, y: 470, guides: [], gaps: [] });
    const rounded = snapMove(
      { x: 240.4, y: 470.6, w: 60, h: 40 },
      [],
      canvas,
      0,
    );
    expect(rounded).toMatchObject({ x: 240, y: 471 });
  });

  it("snaps to equal spacing after, before and between two boxes in a row", () => {
    const a = { x: 20, y: 100, w: 60, h: 40 };
    const b = { x: 120, y: 100, w: 60, h: 40 };
    const after = snapMove({ x: 217, y: 100, w: 60, h: 40 }, [a, b], canvas, 6);
    expect(after.x).toBe(220);
    expect(after.gaps).toEqual([
      { axis: "x", from: 80, to: 120, at: 120 },
      { axis: "x", from: 180, to: 220, at: 120 },
    ]);

    const c = { x: 300, y: 100, w: 60, h: 40 };
    const between = snapMove(
      { x: 158, y: 104, w: 60, h: 30 },
      [a, c],
      canvas,
      6,
    );
    expect(between.x).toBe(160);
    expect(between.gaps).toEqual([
      { axis: "x", from: 80, to: 160, at: 120 },
      { axis: "x", from: 220, to: 300, at: 120 },
    ]);

    const before = snapMove(
      { x: 250, y: 300, w: 40, h: 40 },
      [
        { x: 330, y: 300, w: 20, h: 40 },
        { x: 360, y: 300, w: 20, h: 40 },
      ],
      canvas,
      6,
    );
    // Gap 10: 330 - 10 - 40 = 280, too far; nothing else in reach.
    expect(before.gaps).toEqual([]);
  });

  it("snaps to equal spacing in a column", () => {
    const top = { x: 100, y: 20, w: 100, h: 50 };
    const middle = { x: 100, y: 100, w: 100, h: 50 };
    const result = snapMove(
      { x: 257, y: 176, w: 100, h: 50 },
      [top, middle],
      canvas,
      6,
    );
    // Only boxes that share the column count; this one is off to the side.
    expect(result.gaps).toEqual([]);
    const below = snapMove(
      { x: 100, y: 176, w: 100, h: 50 },
      [top, middle],
      canvas,
      6,
    );
    expect(below.y).toBe(180);
    expect(below.gaps).toEqual([
      { axis: "y", from: 70, to: 100, at: 150 },
      { axis: "y", from: 150, to: 180, at: 150 },
    ]);
  });

  it("snaps the edges a resize handle moves, keeping the others", () => {
    const right = snapResize(
      { x: 50, y: 50, w: 143, h: 100 },
      { right: true },
      [],
      canvas,
      6,
    );
    expect(right.box).toEqual({ x: 50, y: 50, w: 145, h: 100 });
    expect(right.guides).toEqual([{ axis: "x", at: 195, from: 0, to: 640 }]);

    const left = snapResize(
      { x: 4, y: 50, w: 100, h: 100 },
      { left: true },
      [],
      canvas,
      6,
    );
    expect(left.box).toEqual({ x: 0, y: 50, w: 104, h: 100 });

    const other = { x: 200, y: 300, w: 100, h: 100 };
    const corner = snapResize(
      { x: 50, y: 50, w: 146, h: 247 },
      { right: true, bottom: true },
      [other],
      canvas,
      6,
    );
    expect(corner.box).toEqual({ x: 50, y: 50, w: 145, h: 250 });

    const tiny = snapResize(
      { x: 50, y: 50, w: 2, h: 100 },
      { right: true },
      [],
      canvas,
      0,
    );
    expect(tiny.box.w).toBe(8);
  });

  it("snaps a single value, like a canvas height", () => {
    expect(snapValue(637, [640, 500], 6)).toBe(640);
    expect(snapValue(620, [640], 6)).toBe(620);
    expect(snapValue(620.4, [], 6)).toBe(620);
  });

  it("does not snap to the page margin unless asked to", () => {
    // Near x = 20 but no margin option: only the canvas edges are targets.
    const result = snapMove({ x: 22, y: 12, w: 100, h: 50 }, [], canvas, 6);
    expect(result).toMatchObject({ x: 22, guides: [] });
  });

  it("snaps a box's left, center or right edge to the page margin", () => {
    const left = snapMove({ x: 22, y: 12, w: 100, h: 50 }, [], canvas, 6, {
      margin: 20,
    });
    expect(left.x).toBe(20);
    expect(left.guides).toContainEqual({ axis: "x", at: 20, from: 0, to: 640 });

    const right = snapMove({ x: 268, y: 12, w: 100, h: 50 }, [], canvas, 6, {
      margin: 20,
    });
    expect(right.x).toBe(270);
    expect(right.guides).toContainEqual({
      axis: "x",
      at: 370,
      from: 0,
      to: 640,
    });

    const centered = snapMove({ x: -33, y: 12, w: 100, h: 50 }, [], canvas, 6, {
      margin: 20,
    });
    expect(centered.x).toBe(-30);
    expect(centered.guides).toContainEqual({
      axis: "x",
      at: 20,
      from: 0,
      to: 640,
    });
  });

  it("snaps a resize handle to the page margin too", () => {
    const right = snapResize(
      { x: 270, y: 50, w: 98, h: 100 },
      { right: true },
      [],
      canvas,
      6,
      8,
      { margin: 20 },
    );
    expect(right.box).toMatchObject({ x: 270, w: 100 });
    expect(right.guides).toContainEqual({
      axis: "x",
      at: 370,
      from: 0,
      to: 640,
    });
  });

  it("gives the two margin guide lines, spanning the canvas height", () => {
    expect(marginGuides(canvas, 20)).toEqual([
      { axis: "x", at: 20, from: 0, to: 640 },
      { axis: "x", at: 370, from: 0, to: 640 },
    ]);
    expect(marginGuides(canvas, 0)).toEqual([]);
    expect(marginGuides(canvas, -5)).toEqual([]);
    // 2 * 200 >= 390: no room for both lines.
    expect(marginGuides(canvas, 200)).toEqual([]);
  });
});
