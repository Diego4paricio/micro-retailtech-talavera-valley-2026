import { describe, expect, it } from "vitest";
import { appendPage, buildQuery, hasMore } from "../src/lib/pagination.js";

describe("buildQuery", () => {
  it("serializes primitive params and skips null/undefined/empty ones", () => {
    expect(
      buildQuery({ query: "café", limit: 20, suspended: true, cursor: null }),
    ).toBe("?query=caf%C3%A9&limit=20&suspended=true");
    expect(buildQuery({ query: "" })).toBe("");
    expect(buildQuery({})).toBe("");
  });
});

describe("appendPage", () => {
  it("appends new items and de-duplicates by id", () => {
    const existing = [{ id: "a" }, { id: "b" }];
    const merged = appendPage(existing, {
      items: [{ id: "b" }, { id: "c" }],
      nextCursor: null,
    });
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the existing array", () => {
    const existing = [{ id: "a" }];
    appendPage(existing, { items: [{ id: "b" }], nextCursor: null });
    expect(existing).toHaveLength(1);
  });
});

describe("hasMore", () => {
  it("is true only when a page exists with a non-null cursor", () => {
    expect(hasMore(null)).toBe(false);
    expect(hasMore({ items: [], nextCursor: null })).toBe(false);
    expect(hasMore({ items: [], nextCursor: "42" })).toBe(true);
  });
});
