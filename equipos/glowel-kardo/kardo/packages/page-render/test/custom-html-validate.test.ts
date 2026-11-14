import { describe, expect, it } from "vitest";
import { parsePublishedCustomHtml, prepareCustomHtml } from "../src/index.js";

const imageHash = "a".repeat(64); // stand-in 64-hex sha256

describe("parsePublishedCustomHtml", () => {
  it("accepts a value that is exactly prepareCustomHtml's own output", () => {
    const prepared = prepareCustomHtml({
      html: '<a href="https://example.com/a">Go</a>',
      css: "",
    });
    const result = parsePublishedCustomHtml(
      { html: prepared.html, css: prepared.css, links: prepared.links },
      new Set<string>(),
    );
    expect(result).not.toBeNull();
    expect(result?.links).toEqual(prepared.links);
  });

  it("accepts a kardo-asset image ref present in imageHashes", () => {
    const prepared = prepareCustomHtml({
      html: `<img src="kardo-asset:${imageHash}" alt="Foto">`,
      css: "",
    });
    const result = parsePublishedCustomHtml(
      { html: prepared.html, css: prepared.css, links: prepared.links },
      new Set([imageHash]),
    );
    expect(result).not.toBeNull();
  });

  it("rejects a kardo-asset image ref absent from imageHashes", () => {
    const prepared = prepareCustomHtml({
      html: `<img src="kardo-asset:${imageHash}" alt="Foto">`,
      css: "",
    });
    const result = parsePublishedCustomHtml(
      { html: prepared.html, css: prepared.css, links: prepared.links },
      new Set<string>(),
    );
    expect(result).toBeNull();
  });

  it("rejects when html/css are not sanitizer-clean (idempotency check fails)", () => {
    const result = parsePublishedCustomHtml(
      { html: "<script>alert(1)</script>", css: "", links: [] },
      new Set<string>(),
    );
    expect(result).toBeNull();
  });

  it("rejects when a kardo-link: id in html has no matching links[] entry", () => {
    const result = parsePublishedCustomHtml(
      { html: '<a href="kardo-link:h1">Go</a>', css: "", links: [] },
      new Set<string>(),
    );
    expect(result).toBeNull();
  });

  it("rejects when links[] has an entry never referenced in html", () => {
    const prepared = prepareCustomHtml({
      html: '<a href="https://example.com/a">Go</a>',
      css: "",
    });
    const result = parsePublishedCustomHtml(
      {
        html: prepared.html,
        css: prepared.css,
        links: [...prepared.links, { id: "h9", url: "https://example.com/b" }],
      },
      new Set<string>(),
    );
    expect(result).toBeNull();
  });

  it("rejects a non-https link url", () => {
    const result = parsePublishedCustomHtml(
      {
        html: '<a href="kardo-link:h1">Go</a>',
        css: "",
        links: [{ id: "h1", url: "javascript:alert(1)" }],
      },
      new Set<string>(),
    );
    expect(result).toBeNull();
  });

  it("rejects malformed shapes", () => {
    expect(parsePublishedCustomHtml(null, new Set())).toBeNull();
    expect(parsePublishedCustomHtml({}, new Set())).toBeNull();
    expect(
      parsePublishedCustomHtml({ html: 1, css: "", links: [] }, new Set()),
    ).toBeNull();
    expect(
      parsePublishedCustomHtml(
        { html: "<div></div>", css: "", links: "nope" },
        new Set(),
      ),
    ).toBeNull();
  });

  it("rejects html over the contract size limit", () => {
    const result = parsePublishedCustomHtml(
      { html: "a".repeat(60_001), css: "", links: [] },
      new Set<string>(),
    );
    expect(result).toBeNull();
  });
});
