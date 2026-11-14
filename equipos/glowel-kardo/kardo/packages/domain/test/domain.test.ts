import { describe, expect, it } from "vitest";
import { canCustomer, isSafeRedirect } from "../src/index.js";

describe("customer permissions", () => {
  it("does not grant a viewer write access", () => {
    expect(canCustomer("viewer", "touchpoints.manage")).toBe(false);
  });

  it("allows only web redirects", () => {
    expect(isSafeRedirect("https://example.com")).toBe(true);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
  });
});
