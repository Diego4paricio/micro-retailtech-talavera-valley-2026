import { describe, expect, it } from "vitest";
import {
  RedirectDestinationError,
  validateRedirectDestination,
} from "../src/redirect.js";

describe("redirect validation", () => {
  it("accepts a credential-free HTTPS destination", () => {
    expect(validateRedirectDestination("https://kardo.example/welcome")).toBe(
      "https://kardo.example/welcome",
    );
  });

  it.each([
    "http://kardo.example",
    "javascript:alert(1)",
    "https://user:pass@kardo.example",
  ])("rejects an unsafe destination: %s", (destination) => {
    expect(() => validateRedirectDestination(destination)).toThrow(
      RedirectDestinationError,
    );
  });
});
