import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StaffValidationError } from "../src/http/errors.js";
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  resolveLimit,
} from "../src/http/pagination.js";

describe("keyset cursor", () => {
  it("round-trips a timestamp and id", () => {
    const cursor = { timestamp: new Date().toISOString(), id: randomUUID() };
    const token = encodeKeysetCursor(cursor);
    expect(decodeKeysetCursor(token)).toEqual(cursor);
  });

  it("produces an opaque, url-safe token", () => {
    const token = encodeKeysetCursor({
      timestamp: new Date().toISOString(),
      id: randomUUID(),
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects a token that is not base64url of the expected shape", () => {
    expect(() => decodeKeysetCursor("not-a-real-cursor")).toThrow(
      StaffValidationError,
    );
  });

  it("rejects a token missing the id segment", () => {
    const malformed = Buffer.from("2024-01-01T00:00:00.000Z", "utf8").toString(
      "base64url",
    );
    expect(() => decodeKeysetCursor(malformed)).toThrow(StaffValidationError);
  });

  it("rejects a token whose id is not a uuid", () => {
    const malformed = Buffer.from(
      `${new Date().toISOString()}|not-a-uuid`,
      "utf8",
    ).toString("base64url");
    expect(() => decodeKeysetCursor(malformed)).toThrow(StaffValidationError);
  });
});

describe("resolveLimit", () => {
  it("defaults to 20 when omitted", () => {
    expect(resolveLimit(undefined)).toBe(20);
  });

  it("clamps to the 1..100 range", () => {
    expect(resolveLimit(0)).toBe(1);
    expect(resolveLimit(500)).toBe(100);
    expect(resolveLimit(50)).toBe(50);
  });
});
