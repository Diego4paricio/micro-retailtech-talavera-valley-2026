import { describe, expect, it } from "vitest";
import {
  coalesceMs,
  createHistory,
  type History,
  historyLimit,
  historyReducer,
  stableKey,
} from "../src/features/touchpoints/qr/studio/history.js";
import {
  isLogoRaster,
  legacyLogoHref,
  readCachedLogo,
} from "../src/features/touchpoints/qr/studio/logo-cache.js";

type Doc = { color: string; size: number };

const set =
  (patch: Partial<Doc>) =>
  (current: Doc): Doc => ({ ...current, ...patch });

function apply(
  state: History<Doc>,
  patch: Partial<Doc>,
  at: number,
  key?: string,
): History<Doc> {
  return historyReducer(state, { type: "update", recipe: set(patch), key, at });
}

describe("Estudio QR history", () => {
  const start = createHistory<Doc>({ color: "#16232e", size: 0.2 });

  it("undoes and redoes discrete changes in order", () => {
    let state = apply(start, { color: "#0a6c78" }, 1_000);
    state = apply(state, { size: 0.25 }, 5_000);
    expect(state.present).toEqual({ color: "#0a6c78", size: 0.25 });

    state = historyReducer(state, { type: "undo" });
    expect(state.present).toEqual({ color: "#0a6c78", size: 0.2 });
    state = historyReducer(state, { type: "undo" });
    expect(state.present).toEqual(start.present);
    expect(historyReducer(state, { type: "undo" })).toBe(state);

    state = historyReducer(state, { type: "redo" });
    state = historyReducer(state, { type: "redo" });
    expect(state.present).toEqual({ color: "#0a6c78", size: 0.25 });
    expect(historyReducer(state, { type: "redo" })).toBe(state);
  });

  it("coalesces a continuous gesture (same key) into one step", () => {
    let state = apply(start, { size: 0.21 }, 1_000, "logo.size");
    state = apply(state, { size: 0.22 }, 1_100, "logo.size");
    state = apply(state, { size: 0.23 }, 1_200, "logo.size");
    expect(state.past).toHaveLength(1);
    state = historyReducer(state, { type: "undo" });
    expect(state.present).toEqual(start.present);
  });

  it("starts a new step after a pause or with another key", () => {
    let state = apply(start, { size: 0.21 }, 1_000, "logo.size");
    state = apply(state, { size: 0.22 }, 1_000 + coalesceMs + 1, "logo.size");
    expect(state.past).toHaveLength(2);
    state = apply(state, { color: "#000000" }, 1_000 + coalesceMs + 2, "paint");
    expect(state.past).toHaveLength(3);
  });

  it("ignores updates that change nothing and clears redo on new edits", () => {
    const same = apply(start, { color: "#16232e" }, 1_000);
    expect(same).toBe(start);

    let state = apply(start, { size: 0.3 }, 1_000);
    state = historyReducer(state, { type: "undo" });
    expect(state.future).toHaveLength(1);
    state = apply(state, { color: "#ffffff" }, 3_000);
    expect(state.future).toHaveLength(0);
  });

  it("keeps at most the configured number of steps", () => {
    let state = start;
    for (let index = 0; index < historyLimit + 20; index += 1)
      state = apply(state, { size: index / 1_000 }, index * 10_000);
    expect(state.past).toHaveLength(historyLimit);
  });

  it("reset drops every step", () => {
    const state = historyReducer(apply(start, { size: 0.3 }, 1), {
      type: "reset",
      value: { color: "#ffffff", size: 0.1 },
    });
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(state.present.size).toBe(0.1);
  });
});

describe("stableKey", () => {
  it("ignores key order and undefined values", () => {
    expect(stableKey({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableKey({ b: { d: 3, c: 2 }, a: 1, e: undefined }),
    );
    expect(stableKey({ a: [1, 2] })).not.toBe(stableKey({ a: [2, 1] }));
  });
});

describe("logo cache", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";

  it("only accepts rasterized PNG data URLs with a size", () => {
    expect(isLogoRaster({ href: png, width: 10, height: 20 })).toBe(true);
    expect(
      isLogoRaster({
        href: "data:image/svg+xml;base64,PHN2Zz4=",
        width: 1,
        height: 1,
      }),
    ).toBe(false);
    expect(isLogoRaster({ href: png, width: 0, height: 20 })).toBe(false);
    expect(isLogoRaster("nope")).toBe(false);
  });

  it("reads legacy v1 logos as data URLs or rasters", () => {
    expect(legacyLogoHref(png)).toBe(png);
    expect(legacyLogoHref({ href: png, width: 4, height: 4 })).toBe(png);
    expect(legacyLogoHref("https://example.com/logo.png")).toBeNull();
    expect(legacyLogoHref(null)).toBeNull();
  });

  it("degrades to no cache without storage", () => {
    expect(readCachedLogo("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
