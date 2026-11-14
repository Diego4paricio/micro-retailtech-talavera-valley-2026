import { describe, expect, it } from "vitest";
import { prepareCustomHtml } from "../src/index.js";

describe("prepareCustomHtml: XSS corpus (OWASP filter-evasion style)", () => {
  const cases: { name: string; html: string }[] = [
    { name: "img onerror", html: "<img src=x onerror=alert(1)>" },
    { name: "svg script", html: "<svg><script>alert(1)</script></svg>" },
    {
      name: "tab-obfuscated javascript: href",
      html: '<a href="jav&#x09;ascript:alert(1)">x</a>',
    },
    {
      name: "newline-obfuscated javascript: href",
      html: '<a href="java&#10;script:alert(1)">x</a>',
    },
    {
      name: "style breakout into script",
      html: "<style>body{color:red}</style><script>alert(1)</script>",
    },
    {
      name: "iframe srcdoc",
      html: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    },
    {
      name: "meta refresh",
      html: '<meta http-equiv="refresh" content="0;url=https://evil.test">',
    },
    { name: "base href", html: '<base href="https://evil.test/">' },
    {
      name: "form action",
      html: '<form action="https://evil.test"><input name="x"></form>',
    },
    { name: "nested unclosed tags", html: "<div><span><b>hi</div>" },
    {
      name: "uppercase tag/attr",
      html: '<IMG SRC="kardo-asset:11111111-1111-1111-1111-111111111111" ONERROR="alert(1)">',
    },
    { name: "data: image", html: '<img src="data:image/png;base64,aaaa">' },
    {
      name: "svg use external ref",
      html: '<svg><use href="https://evil.test/x.svg#y"></use></svg>',
    },
    {
      name: "svg foreignObject",
      html: '<svg><foreignObject><div onclick="alert(1)">hi</div></foreignObject></svg>',
    },
    {
      name: "object/embed",
      html: '<object data="https://evil.test/x.swf"></object><embed src="https://evil.test/x.swf">',
    },
    {
      name: "javascript href plain",
      html: '<a href="javascript:alert(1)">x</a>',
    },
    {
      name: "on* handler on allowed tag",
      html: '<div onclick="alert(1)" onmouseover="alert(2)">hi</div>',
    },
    {
      name: "comment-hidden payload",
      html: "<div><!-- <script>alert(1)</script> --></div>",
    },
    {
      name: "template dropped with content",
      html: "<template><script>alert(1)</script><b>x</b></template>",
    },
    {
      name: "svg animate",
      html: '<svg><rect><animate attributeName="x" to="0" /></rect></svg>',
    },
  ];

  for (const { name, html } of cases) {
    it(`neutralizes: ${name}`, () => {
      const prepared = prepareCustomHtml({ html, css: "" });
      const lower = prepared.html.toLowerCase();
      expect(lower).not.toContain("<script");
      expect(lower).not.toContain("onerror");
      expect(lower).not.toContain("onclick");
      expect(lower).not.toContain("onmouseover");
      expect(lower).not.toContain("javascript:");
      expect(lower).not.toContain("<iframe");
      expect(lower).not.toContain("<object");
      expect(lower).not.toContain("<embed");
      expect(lower).not.toContain("<form");
      expect(lower).not.toContain("<input");
      expect(lower).not.toContain("<meta");
      expect(lower).not.toContain("<base");
      expect(lower).not.toContain("<style");
      expect(lower).not.toContain("<template");
      expect(lower).not.toContain("<use");
      expect(lower).not.toContain("foreignobject");
      expect(lower).not.toContain("<animate");
      expect(lower).not.toContain("data:image");
    });
  }

  it("never emits a data: image src (the attribute is dropped, kardo-asset: is the only allowed src)", () => {
    const prepared = prepareCustomHtml({
      html: '<img src="data:image/png;base64,aaaa" alt="x">',
      css: "",
    });
    expect(prepared.html).not.toContain("data:image");
    expect(prepared.html).not.toContain("src=");
    expect(prepared.report.removedAttributes.src).toBe(1);
  });

  it("drops disallowed href schemes but keeps the anchor text", () => {
    const prepared = prepareCustomHtml({
      html: '<a href="javascript:alert(1)">click me</a>',
      css: "",
    });
    expect(prepared.html).not.toContain("href=");
    expect(prepared.html).toContain("click me");
    expect(prepared.report.blockedLinks).toBeGreaterThan(0);
  });
});

describe("prepareCustomHtml: CSS forbidden rules", () => {
  it("strips @import", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: '@import url("https://evil.test/x.css"); .a{color:red}',
    });
    expect(prepared.css).not.toContain("@import");
    expect(prepared.css).toContain("color:red");
  });

  it("strips @font-face", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: '@font-face{font-family:"Evil";src:url(https://evil.test/x.woff2)} .a{color:red}',
    });
    expect(prepared.css).not.toContain("@font-face");
  });

  it("strips @namespace", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: "@namespace url(http://www.w3.org/1999/xhtml); .a{color:red}",
    });
    expect(prepared.css).not.toContain("@namespace");
  });

  it("rejects url() other than kardo-asset:, dropping only that declaration", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{background:url(https://evil.test/x.png);color:red}",
    });
    expect(prepared.css).not.toContain("url(");
    expect(prepared.css).not.toContain("background");
    expect(prepared.css).toContain("color:red");
  });

  it("keeps a valid kardo-asset: background url", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{background:url(kardo-asset:11111111-1111-1111-1111-111111111111);color:red}",
    });
    expect(prepared.css).toContain(
      "url(kardo-asset:11111111-1111-1111-1111-111111111111)",
    );
    expect(prepared.css).toContain("color:red");
  });

  it("strips expression()", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{width:expression(alert(1));color:red}",
    });
    expect(prepared.css).not.toContain("expression");
  });

  it("strips behavior and -moz-binding", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{behavior:url(x.htc);-moz-binding:url(x.xml);color:red}",
    });
    expect(prepared.css).not.toContain("behavior");
    expect(prepared.css).not.toContain("-moz-binding");
    expect(prepared.css).toContain("color:red");
  });

  it("strips position: fixed and position: sticky", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{position:fixed;top:0;color:red}.b{position:sticky;top:0}",
    });
    expect(prepared.css).not.toContain("position:fixed");
    expect(prepared.css).not.toContain("position:sticky");
    expect(prepared.css).toContain("color:red");
  });

  it("keeps ordinary position values", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ".a{position:relative;color:red}",
    });
    expect(prepared.css).toContain("position:relative");
  });

  it("drops a rule using :host-context but keeps a plain :host rule", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: ":host-context(.dark){color:white} :host{color:black}",
    });
    expect(prepared.css).not.toContain("host-context");
    expect(prepared.css).toContain(":host{color:black}");
  });

  it("rejects a </style> breakout sequence anywhere in the css", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: '.a::before{content:"</style><script>alert(1)</script>"}',
    });
    expect(prepared.css.toLowerCase()).not.toContain("</style");
  });

  it("never lets an image outside the library through, however it is written", () => {
    const asset = "kardo-asset:11111111-1111-1111-1111-111111111111";
    const cases = [
      // A ")" inside the quoted url used to hide it from the text check.
      '.a{--x:url("https://evil.test/a)b.png")} .b{background:var(--x)}',
      // image-set loads an image without url().
      '.a{background:image-set("https://evil.test/a.png" 1x)}',
      '.a{--x:image-set("https://evil.test/a.png" 1x)}',
      // CSS escapes in a function or at-rule name decode to url / import.
      String.raw`.a{--x:u\72l(https://evil.test/a.png)}`,
      String.raw`@\69mport "https://evil.test/x.css"; .a{color:red}`,
    ];
    for (const css of cases) {
      const prepared = prepareCustomHtml({ html: "<div>x</div>", css });
      expect(prepared.css, css).not.toContain("evil.test");
    }
    // The library form keeps working, quoted or not, with other CSS around.
    const kept = prepareCustomHtml({
      html: "<div>x</div>",
      css: `.a{background:url("${asset}") center/cover;color:red} .b::before{content:"\\201C"}`,
    });
    expect(kept.css).toContain(asset);
    expect(kept.css).toContain("color:red");
    // Escapes inside strings are fine (css-tree writes the character itself).
    expect(kept.css).toMatch(/content:"(\\201C|\u201C)"/);
  });

  it("rejects css over the contract size limit", () => {
    const bigCss = `.a{color:red}${"/* pad */".repeat(1)}`.padEnd(30_001, "a");
    const prepared = prepareCustomHtml({ html: "<div>x</div>", css: bigCss });
    expect(prepared.html).toBe("");
    expect(prepared.css).toBe("");
  });
});

describe("prepareCustomHtml: link tokenization and dedupe", () => {
  it("tokenizes distinct https links with sequential ids", () => {
    const prepared = prepareCustomHtml({
      html: '<a href="https://a.example.com">A</a><a href="https://b.example.com">B</a>',
      css: "",
    });
    expect(prepared.links).toEqual([
      { id: "h1", url: "https://a.example.com" },
      { id: "h2", url: "https://b.example.com" },
    ]);
    expect(prepared.html).toContain('href="kardo-link:h1"');
    expect(prepared.html).toContain('href="kardo-link:h2"');
  });

  it("assigns the same id to the same URL used twice", () => {
    const prepared = prepareCustomHtml({
      html: '<a href="https://a.example.com/">A</a><a href="https://a.example.com/">A again</a>',
      css: "",
    });
    expect(prepared.links).toHaveLength(1);
    expect(prepared.html.match(/kardo-link:h1/g)).toHaveLength(2);
  });

  it("keeps mailto:, tel: and #fragment hrefs literal, untracked", () => {
    const prepared = prepareCustomHtml({
      html:
        '<a href="mailto:hi@example.com">mail</a>' +
        '<a href="tel:+15555550100">tel</a>' +
        '<a href="#section-1">jump</a>',
      css: "",
    });
    expect(prepared.links).toHaveLength(0);
    expect(prepared.html).toContain('href="mailto:hi@example.com"');
    expect(prepared.html).toContain('href="tel:+15555550100"');
    expect(prepared.html).toContain('href="#section-1"');
  });

  it("forces rel on target=_blank and drops any other target value", () => {
    const prepared = prepareCustomHtml({
      html:
        '<a href="https://a.example.com" target="_blank">A</a>' +
        '<a href="https://b.example.com" target="_top">B</a>',
      css: "",
    });
    expect(prepared.html).toContain(
      'target="_blank" rel="noopener noreferrer nofollow ugc"',
    );
    expect(prepared.html).not.toContain("_top");
  });
});

describe("prepareCustomHtml: idempotency", () => {
  it("prepare(prepare(x)) leaves html/css unchanged", () => {
    const source = {
      html:
        '<div class="Card"><a href="https://example.com/a" target="_blank">Go</a>' +
        '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="x">' +
        "<script>alert(1)</script><unknown-tag>kept text</unknown-tag></div>",
      css: '.a{color:red;background:url(kardo-asset:11111111-1111-1111-1111-111111111111)}@import "x";',
    };
    const first = prepareCustomHtml(source);
    const second = prepareCustomHtml({ html: first.html, css: first.css });
    expect(second.html).toBe(first.html);
    expect(second.css).toBe(first.css);
  });

  it("is idempotent over the XSS corpus", () => {
    const source = {
      html:
        "<img src=x onerror=alert(1)><svg><script>alert(1)</script></svg>" +
        '<a href="jav&#x09;ascript:alert(1)">x</a>',
      css: "",
    };
    const first = prepareCustomHtml(source);
    const second = prepareCustomHtml({ html: first.html, css: first.css });
    expect(second.html).toBe(first.html);
    expect(second.css).toBe(first.css);
  });
});

describe("prepareCustomHtml: unknown tags unwrap, disallowed content is dropped", () => {
  it("unwraps an unknown tag but keeps its sanitized text/children", () => {
    const prepared = prepareCustomHtml({
      html: "<marquee>keep me</marquee><div>ok</div>",
      css: "",
    });
    expect(prepared.html).not.toContain("<marquee");
    expect(prepared.html).toContain("keep me");
    expect(prepared.html).toContain("<div>ok</div>");
    expect(prepared.report.removedTags.marquee).toBe(1);
  });

  it("restricts id/class to [A-Za-z0-9_-] tokens", () => {
    const prepared = prepareCustomHtml({
      html: '<div id="a b" class="ok! good_one -bad-">x</div>',
      css: "",
    });
    // "a b" is not a single valid token → id dropped entirely.
    expect(prepared.html).not.toContain(' id="');
    expect(prepared.html).toContain('class="good_one -bad-"');
  });

  it("keeps allowed widget tags", () => {
    const prepared = prepareCustomHtml({
      html: "<kardo-links></kardo-links><kardo-socials></kardo-socials><kardo-profile></kardo-profile>",
      css: "",
    });
    expect(prepared.html).toContain("<kardo-links>");
    expect(prepared.html).toContain("<kardo-socials>");
    expect(prepared.html).toContain("<kardo-profile>");
  });

  it("keeps a real kardo-asset image src and collects its ref", () => {
    const prepared = prepareCustomHtml({
      html: '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="Foto">',
      css: "",
    });
    expect(prepared.html).toContain(
      'src="kardo-asset:11111111-1111-1111-1111-111111111111"',
    );
    expect(prepared.imageRefs).toEqual([
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("reports counts for removed tags and attributes", () => {
    const prepared = prepareCustomHtml({
      html: '<script>x</script><div onclick="x()">hi</div>',
      css: "",
    });
    expect(prepared.report.removedTags.script).toBe(1);
    expect(prepared.report.removedAttributes.onclick).toBe(1);
  });
});

describe("prepareCustomHtml: report explains CSS removals", () => {
  it("counts each removal by reason, including style attributes", () => {
    const prepared = prepareCustomHtml({
      html: '<div style="position:fixed;color:red">x</div>',
      css: '@import "x.css"; .a{position:sticky;color:red} .b{background:url(https://evil.test/a.png)} :host-context(.x){color:blue}',
    });
    expect(prepared.report.removedCss).toEqual({
      import: 1,
      position: 2,
      "external-url": 1,
      "host-context": 1,
    });
    expect(prepared.css).toContain("color:red");
  });

  it("says so when the whole stylesheet had to be refused", () => {
    const prepared = prepareCustomHtml({
      html: "<div>x</div>",
      css: String.raw`.a{color:red} .b{--x:u\72l(https://evil.test/a.png)}`,
    });
    expect(prepared.css).toBe("");
    expect(prepared.report.removedCss).toEqual({ stylesheet: 1 });
  });
});

describe("prepareCustomHtml: images without a library source", () => {
  it("drops the whole img instead of leaving a broken icon", () => {
    const prepared = prepareCustomHtml({
      html: '<p>a</p><img src="https://evil.test/x.jpg" alt="x"><img alt="sin fuente"><img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="ok">',
      css: "",
    });
    expect(prepared.html).not.toContain('alt="x"');
    expect(prepared.html).not.toContain("sin fuente");
    expect(prepared.html).toContain('alt="ok"');
    expect(prepared.report.blockedImages).toBe(1);
    expect(prepared.report.removedTags.img).toBe(1);
    // Still idempotent.
    expect(prepareCustomHtml(prepared).html).toBe(prepared.html);
  });
});

describe("prepareCustomHtml: alt text", () => {
  it("keeps an empty alt for decorative images", () => {
    const prepared = prepareCustomHtml({
      html: '<img src="kardo-asset:11111111-1111-1111-1111-111111111111" alt="">',
      css: "",
    });
    expect(prepared.html).toContain('alt=""');
    expect(prepared.report.removedAttributes).toEqual({});
    expect(prepareCustomHtml(prepared).html).toBe(prepared.html);
  });
});

describe("prepareCustomHtml: document roots become the page's own root", () => {
  const css = (source: string) =>
    prepareCustomHtml({ html: "<p>Hola</p>", css: source }).css;

  it("reads :root, html and body as :host, where they actually apply", () => {
    expect(css(":root{--a:#123456}body{background:var(--a)}")).toBe(
      ":host{--a:#123456}:host{background:var(--a)}",
    );
    expect(css("html body .card{color:red}")).toBe(":host .card{color:red}");
    expect(css("html > body > main{padding:0}")).toBe(":host>main{padding:0}");
    expect(css("@media (min-width:600px){body{font-size:18px}}")).toBe(
      "@media (min-width:600px){:host{font-size:18px}}",
    );
  });

  it("leaves a compound that adds to them, and later positions, alone", () => {
    expect(css("body.dark{color:#fff}")).toBe("body.dark{color:#fff}");
    expect(css(".k-link body{color:red}")).toBe(".k-link body{color:red}");
  });

  it("does not report the rewrite as a removal", () => {
    const { report } = prepareCustomHtml({
      html: "<p>Hola</p>",
      css: ":root{--a:#123456}",
    });
    expect(report.removedCssRules).toBe(0);
  });
});
