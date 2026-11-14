import { describe, expect, it } from "vitest";
import {
  localHourParts,
  resolveTimeZone,
  shiftDateKey,
} from "../src/timezone.js";

describe("resolveTimeZone", () => {
  it("defaults to UTC when no time zone is given", () => {
    expect(resolveTimeZone(undefined)).toBe("UTC");
  });

  it("accepts a real IANA time zone", () => {
    expect(resolveTimeZone("America/Mexico_City")).toBe("America/Mexico_City");
  });

  it("falls back to UTC for a bogus time zone instead of throwing", () => {
    expect(resolveTimeZone("Not/AZone")).toBe("UTC");
    expect(resolveTimeZone("'; DROP TABLE x; --")).toBe("UTC");
  });
});

describe("localHourParts", () => {
  it("keeps a UTC instant as-is when the time zone is UTC", () => {
    const parts = localHourParts(new Date("2026-09-24T15:00:00.000Z"), "UTC");
    expect(parts).toEqual({ dateKey: "2026-09-24", weekday: 3, hour: 15 });
  });

  it("shifts into a negative-offset time zone", () => {
    // 2026-09-24T02:00:00Z is 2026-09-23T20:00 in America/Mexico_City (UTC-6).
    const parts = localHourParts(
      new Date("2026-09-24T02:00:00.000Z"),
      "America/Mexico_City",
    );
    expect(parts.dateKey).toBe("2026-09-23");
    expect(parts.hour).toBe(20);
    expect(parts.weekday).toBe(2); // Wednesday
  });
});

describe("shiftDateKey", () => {
  it("shifts calendar dates across a month boundary", () => {
    expect(shiftDateKey("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDateKey("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("is a no-op for a zero shift", () => {
    expect(shiftDateKey("2026-09-24", 0)).toBe("2026-09-24");
  });
});
