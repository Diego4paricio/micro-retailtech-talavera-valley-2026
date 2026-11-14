import { describe, expect, it } from "vitest";
import { isAuthorized } from "../src/worker.js";

describe("publisher /internal/run-once authorization", () => {
  const request = (authorization?: string) =>
    new Request("https://publisher.test/internal/run-once", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });

  it("fails closed without a configured key (security review 2026-10)", () => {
    for (const key of ["", undefined]) {
      expect(isAuthorized(request("Bearer "), key)).toBe(false);
      expect(isAuthorized(request("Bearer x"), key)).toBe(false);
    }
  });

  it("accepts only the exact key", () => {
    expect(isAuthorized(request("Bearer the-key"), "the-key")).toBe(true);
    expect(isAuthorized(request("Bearer the-kez"), "the-key")).toBe(false);
    expect(isAuthorized(request(), "the-key")).toBe(false);
  });
});
