import { describe, expect, it } from "vitest";
import { ContentValidationError } from "../src/errors.js";
import { validateWebhookUrl } from "../src/webhook-url.js";

describe("validateWebhookUrl", () => {
  it("accepts a normal HTTPS hostname on the default port", () => {
    expect(validateWebhookUrl("https://hooks.example.com/kardo")).toBe(
      "https://hooks.example.com/kardo",
    );
  });

  it.each([
    ["http scheme", "http://hooks.example.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["embedded credentials", "https://user:pass@hooks.example.com"],
    ["literal IPv4", "https://93.184.216.34/webhook"],
    ["literal IPv6", "https://[2606:2800:220:1:248:1893:25c8:1946]/"],
    ["localhost", "https://localhost/webhook"],
    [".local suffix", "https://printer.local/webhook"],
    [".internal suffix", "https://service.internal/webhook"],
    ["non-default port", "https://hooks.example.com:8443/webhook"],
  ])("rejects an unsafe webhook URL: %s", (_label, url) => {
    expect(() => validateWebhookUrl(url)).toThrow(ContentValidationError);
  });
});
