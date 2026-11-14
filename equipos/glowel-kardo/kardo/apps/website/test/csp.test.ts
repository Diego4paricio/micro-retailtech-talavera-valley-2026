import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  contentSecurityPolicy,
  findUnsafeMarkup,
  headersFile,
  injectPolicy,
  inlineScriptHashes,
} from "../scripts/csp.mjs";

const sha = (body: string) =>
  `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

describe("inline script hashes", () => {
  it("hashes inline scripts and skips external or empty ones", () => {
    const html = `<head><script src="/_next/a.js" async=""></script><script>self.__next_f.push([1,"a"])</script><script></script><script>self.__next_f.push([1,"a"])</script></head>`;
    expect(inlineScriptHashes(html)).toEqual([
      sha('self.__next_f.push([1,"a"])'),
    ]);
  });

  it("builds a policy that only allows those scripts", () => {
    const policy = contentSecurityPolicy(["'sha256-abc='"]);
    expect(policy).toContain("script-src 'self' 'sha256-abc='");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).not.toContain("unsafe-eval");
  });
});

describe("injectPolicy", () => {
  it("places the policy right after the charset and before any script", () => {
    const html =
      '<html><head><meta charSet="utf-8"/><script>x()</script></head></html>';
    const out = injectPolicy(html, "default-src 'self'");
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(
      out.indexOf("<script>"),
    );
    expect(out.indexOf('charSet="utf-8"')).toBeLessThan(
      out.indexOf("Content-Security-Policy"),
    );
  });

  it("refuses to run twice on the same page", () => {
    const once = injectPolicy(
      '<head><meta charset="utf-8"></head>',
      "default-src 'self'",
    );
    expect(() => injectPolicy(once, "default-src 'self'")).toThrow(
      /ya tiene una CSP/,
    );
  });
});

describe("findUnsafeMarkup", () => {
  it("reports inline handlers and javascript: links", () => {
    expect(findUnsafeMarkup('<img src="x" onerror="alert(1)">')).toHaveLength(
      1,
    );
    expect(
      findUnsafeMarkup('<a href="javascript:alert(1)">x</a>'),
    ).toHaveLength(1);
    expect(
      findUnsafeMarkup('<a href="/plataforma/">Plataforma</a>'),
    ).toHaveLength(0);
  });
});

describe("headersFile", () => {
  it("sends what a meta policy cannot", () => {
    const headers = headersFile();
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("Strict-Transport-Security");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toMatch(/\/opengraph-image\n\s+Content-Type: image\/png/);
  });
});
