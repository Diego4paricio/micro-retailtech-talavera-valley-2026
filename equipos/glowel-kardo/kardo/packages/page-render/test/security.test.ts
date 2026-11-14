import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { renderDesignedBody } from "../src/index.js";
import { safeHref } from "../src/url-safety.js";
import {
  design,
  linkPageContent,
  linksContent,
  section,
  testContext,
} from "./fixtures.js";

describe("escaping: text content never breaks out of its HTML context", () => {
  it("escapes <script> and quotes in a heading", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: '<script>alert("xss")</script>',
        level: 1,
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;xss&quot;");
  });

  it("escapes an attempted attribute breakout in a button label and href", () => {
    const blocks: DesignBlock[] = [
      {
        id: "b1",
        kind: "button",
        label: '" onmouseover="alert(1)',
        href: 'https://example.com/"><script>alert(1)</script>',
        variant: "primary",
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext({ linkHref: (_id, url) => url }),
    );
    expect(html).not.toMatch(/href="https:\/\/example\.com\/"><script>/);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot; onmouseover=&quot;alert(1)");
  });

  it("escapes a malicious image alt and id used in data attributes", () => {
    const blocks: DesignBlock[] = [
      {
        id: '"><img src=x onerror=alert(1)>',
        kind: "image",
        imageRef: "ref1",
        alt: '"><svg onload=alert(1)>',
        aspect: "auto",
        fit: "cover",
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<svg onload=alert(1)>");
    expect(html).toContain("&quot;&gt;");
  });

  it("escapes text run content, including a bold/italic/link combination", () => {
    const blocks: DesignBlock[] = [
      {
        id: "t1",
        kind: "text",
        runs: [{ text: '<b onclick="steal()">hola</b>', bold: true }],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain('<b onclick="steal()">hola</b>');
    expect(html).toContain(
      "&lt;b onclick=&quot;steal()&quot;&gt;hola&lt;/b&gt;",
    );
  });

  it("escapes a content link label and section id", () => {
    const blocks: DesignBlock[] = [
      { id: "ct1", kind: "contentLinks", layout: "list" },
    ];
    const { html } = renderDesignedBody(
      linksContent({
        links: [
          {
            id: "l1",
            label: "<img src=x onerror=alert(1)>",
            url: "https://example.com",
          },
        ],
      }),
      design([section('s"<script>1', [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain('data-section-id="s"<script>1"');
  });
});

describe("CSS is never built from a free string", () => {
  it("clamps an out-of-range fontSize/letterSpacing/opacity instead of injecting them", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: {
          fontSize: 999999 as unknown as number,
          letterSpacing: -999 as unknown as number,
          opacity: 5 as unknown as number,
        },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("font-size:72px");
    expect(html).toContain("letter-spacing:-0.05em");
    expect(html).toContain("opacity:0.20");
  });

  it("falls back to a safe default when a color/background token is not a real hex or token", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: {
          color:
            "red;}body{background:url(https://evil.test/x)" as unknown as "text",
          background: "javascript:alert(1)" as unknown as "text",
        },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("url(https://evil.test/x)");
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).toContain("color:inherit");
    expect(html).toContain("background:transparent");
  });

  it("rejects (never escapes) a resolved image URL that could break out of url(...)", () => {
    const blocks: DesignBlock[] = [];
    const d = design([
      section("s1", [blocks], {
        background: {
          kind: "image",
          imageRef: "img1",
          overlay: 10,
          color: "#f7f5f0",
        },
      }),
    ]);
    const { css } = renderDesignedBody(
      linksContent(),
      d,
      testContext({
        resolveImage: () => 'https://cdn.test/x.png") ; } body { color:red',
      }),
    );
    expect(css).not.toContain("cdn.test");
    expect(css).not.toContain("body { color:red");
    // Falls back to the section's solid color instead.
    expect(css).toContain(
      ".kd-sec-0{padding-top:32px;padding-bottom:32px;background:#f7f5f0;}",
    );
  });

  it("accepts a clean resolved image URL for a background", () => {
    const blocks: DesignBlock[] = [];
    const d = design([
      section("s1", [blocks], {
        background: { kind: "image", imageRef: "img1" },
      }),
    ]);
    const { css } = renderDesignedBody(
      linksContent(),
      d,
      testContext({ resolveImage: () => "https://cdn.test/clean.png" }),
    );
    expect(css).toContain('url("https://cdn.test/clean.png")');
  });

  it("clamps an invalid spacer height to its documented range", () => {
    const blocks: DesignBlock[] = [
      { id: "sp1", kind: "spacer", height: 99999 as unknown as number },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("height:160px");
  });

  it("falls back to a safe palette color when the accent is not #rrggbb", () => {
    const d = design([section("s1", [[{ id: "b1", kind: "divider" }]])]);
    (d.style.palette as unknown as Record<string, unknown>).accent =
      "}</style><script>alert(1)</script>";
    const { css } = renderDesignedBody(linksContent(), d, testContext());
    expect(css).not.toContain("<script>");
    expect(css).toContain("--kd-accent:#0a6c78");
  });
});

// ---------------------------------------------------------------------------
// `safeHref`: the panel renders unvalidated drafts (not yet checked by
// `parsePublishedDesign`/`validateExperienceContent`), so every href this
// package writes must defend itself against a dangerous scheme regardless of
// what the design's TypeScript type claims.
// ---------------------------------------------------------------------------

describe("safeHref", () => {
  const dangerous = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "  javascript:alert(1)",
    "javascript:alert(1)\t",
    "https://user:pass@evil.test/phish",
    "https://user@evil.test/phish",
    "not a url at all",
  ];

  it.each(dangerous)("rejects %s for https", (value) => {
    expect(safeHref(value, "https")).toBeNull();
  });

  it.each(dangerous)("rejects %s for social", (value) => {
    expect(safeHref(value, "social")).toBeNull();
  });

  it("accepts a clean https URL", () => {
    expect(safeHref("https://example.com/a", "https")).toBe(
      "https://example.com/a",
    );
  });

  it("accepts a same-origin relative path but not a protocol-relative one", () => {
    expect(safeHref("/go/abc123", "https")).toBe("/go/abc123");
    expect(safeHref("//evil.test/phish", "https")).toBeNull();
  });

  it("rejects a relative path that browsers would normalize off-origin", () => {
    expect(safeHref("/\\evil.example", "https")).toBeNull();
    expect(safeHref("/\t/evil.example", "https")).toBeNull();
    expect(safeHref("/ok/path", "https")).toBe("/ok/path");
  });

  it("accepts mailto:/tel: only under the social allowance", () => {
    expect(safeHref("mailto:person@example.com", "https")).toBeNull();
    expect(safeHref("mailto:person@example.com", "social")).toBe(
      "mailto:person@example.com",
    );
    expect(safeHref("tel:+15551234567", "social")).toBe("tel:+15551234567");
  });
});

describe("safeHref applied through the renderer", () => {
  it("renders a text run's dangerous href as plain text, not a link", () => {
    const blocks: DesignBlock[] = [
      {
        id: "t1",
        kind: "text",
        runs: [{ text: "click me", href: "javascript:alert(1)" }],
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("click me");
  });

  it("renders an image block's dangerous href without a wrapping link", () => {
    const blocks: DesignBlock[] = [
      {
        id: "i1",
        kind: "image",
        imageRef: "ref1",
        alt: "",
        aspect: "auto",
        fit: "cover",
        href: "data:text/html,evil",
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("kd-image-link");
  });

  it("renders a button as a span (never '#') when the panel's linkHref returns a dangerous URL", () => {
    const blocks: DesignBlock[] = [
      {
        id: "b1",
        kind: "button",
        label: "Ir",
        href: "https://example.com",
        variant: "primary",
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext({ linkHref: () => "javascript:alert(document.cookie)" }),
    );
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="#"');
    expect(html).toContain("<span");
    expect(html).toContain("Ir</span>");
  });

  it("renders a content link as a span when linkHref returns a dangerous URL", () => {
    const blocks: DesignBlock[] = [
      { id: "cl1", kind: "contentLinks", layout: "list" },
    ];
    const { html } = renderDesignedBody(
      linksContent({
        links: [{ id: "l1", label: "Ir", url: "https://example.com" }],
      }),
      design([section("s1", [blocks])]),
      testContext({ linkHref: () => "  javascript:alert(1)" }),
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<span");
  });

  it("renders a social icon as a span when linkHref returns a dangerous URL, but allows mailto: for email", () => {
    const blocks: DesignBlock[] = [
      { id: "cs1", kind: "contentSocials", size: "medium" },
    ];
    const { html: badHtml } = renderDesignedBody(
      linkPageContent(),
      design([section("s1", [blocks])]),
      testContext({ linkHref: () => "vbscript:msgbox(1)" }),
    );
    expect(badHtml).not.toContain("vbscript:");
    expect(badHtml).toContain("<span");

    const { html: goodHtml } = renderDesignedBody(
      linkPageContent({
        socials: [{ id: "s1", network: "email", value: "hola@example.com" }],
      }),
      design([section("s1", [blocks])]),
      testContext({ linkHref: () => "mailto:hola@example.com" }),
    );
    expect(goodHtml).toContain('href="mailto:hola@example.com"');
  });
});
