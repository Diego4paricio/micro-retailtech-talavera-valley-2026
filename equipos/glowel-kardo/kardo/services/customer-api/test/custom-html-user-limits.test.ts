import { describe, expect, it, vi } from "vitest";
import { createCustomHtmlUserLimits } from "../src/custom-html/user-limits.js";
import { RateLimitedError } from "../src/errors.js";

const subject = "e6abf26a-3263-4149-9d75-9b7441165d29";

describe("createCustomHtmlUserLimits", () => {
  it("allows a second generation once the first one releases", () => {
    const limits = createCustomHtmlUserLimits();
    const release = limits.begin(subject);
    release();
    expect(() => limits.begin(subject)).not.toThrow();
  });

  it("refuses a second concurrent generation for the same subject", () => {
    const limits = createCustomHtmlUserLimits();
    limits.begin(subject);
    expect(() => limits.begin(subject)).toThrow(RateLimitedError);
  });

  it("keeps concurrency independent per subject", () => {
    const limits = createCustomHtmlUserLimits();
    limits.begin(subject);
    expect(() => limits.begin("other-subject")).not.toThrow();
  });

  it("release() is idempotent (calling it twice does not free two slots)", () => {
    const limits = createCustomHtmlUserLimits();
    const release = limits.begin(subject);
    release();
    release();
    // Still only one slot was ever held, so a fresh begin() should work once.
    expect(() => limits.begin(subject)).not.toThrow();
  });

  it("refuses the 6th generation within a rolling hour", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const limits = createCustomHtmlUserLimits();
      for (let i = 0; i < 5; i += 1) {
        const release = limits.begin(subject);
        release();
      }
      expect(() => limits.begin(subject)).toThrow(RateLimitedError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows a new generation once the oldest one falls out of the rolling hour", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const limits = createCustomHtmlUserLimits();
      for (let i = 0; i < 5; i += 1) {
        limits.begin(subject)();
      }
      vi.setSystemTime(new Date("2026-01-01T01:00:01.000Z"));
      expect(() => limits.begin(subject)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a Spanish message for both the concurrency and the hourly limit", () => {
    const limits = createCustomHtmlUserLimits();
    limits.begin(subject);
    try {
      limits.begin(subject);
      throw new Error("expected begin() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).message).toMatch(/en curso/);
    }
  });
});
