import { describe, expect, it } from "vitest";
import { InvalidCursorError } from "../src/errors.js";
import { decodeLeadCursor, encodeLeadCursor } from "../src/pagination.js";

describe("lead cursor", () => {
  it("round-trips through encode/decode", () => {
    const cursor = {
      createdAt: "2026-09-24T00:00:00.000Z",
      id: "3c4d5e6f-7081-492a-8c1d-2e3f4a5b6c7d",
    };
    const token = encodeLeadCursor(cursor);
    expect(decodeLeadCursor(token)).toEqual(cursor);
  });

  it.each(["not-base64!!!", "", "abc", "%%%invalid%%%"])(
    "rejects an invalid cursor token: %s",
    (token) => {
      expect(() => decodeLeadCursor(token)).toThrow(InvalidCursorError);
    },
  );

  it("rejects a well-formed but semantically invalid cursor", () => {
    const token = Buffer.from("not-a-date|not-a-uuid", "utf8").toString(
      "base64url",
    );
    expect(() => decodeLeadCursor(token)).toThrow(InvalidCursorError);
  });
});
