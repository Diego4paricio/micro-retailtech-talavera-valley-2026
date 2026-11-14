import type { CustomHtml, ExperienceContent } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  canSaveCustomHtml,
  contentCustomHtml,
  customHtmlChanged,
  emptyBrief,
  emptyCustomHtml,
  imageSnippet,
  initialStudioMode,
  isCustomHtmlBlank,
  prepareCustomHtml,
  setCustomHtmlActive,
  validateCustomHtml,
  widgetsFor,
  withCustomHtml,
} from "../src/features/studio/html/model.js";
import {
  normalizeReport,
  reportGroups,
  reportSummary,
} from "../src/features/studio/html/report.js";

const source: CustomHtml = {
  schema: 1,
  active: true,
  html: "<h1>Hola</h1>",
  css: "h1{color:red}",
};

describe("customHtml in the content", () => {
  it("starts empty and inactive on first use", () => {
    expect(emptyCustomHtml()).toEqual({
      schema: 1,
      active: false,
      html: "",
      css: "",
    });
  });

  it("is set and removed without an explicit undefined", () => {
    const content = { title: "T", links: [] } as unknown as ExperienceContent;
    const withIt = withCustomHtml(content, source);
    expect(contentCustomHtml(withIt)).toEqual(source);
    const without = withCustomHtml(withIt, null);
    expect("customHtml" in without).toBe(false);
    expect(contentCustomHtml(without)).toBeNull();
  });
});

describe("mode and active transitions", () => {
  it("opens in blocks without HTML, in HTML when it is active", () => {
    expect(initialStudioMode(null, true)).toBe("blocks");
    expect(initialStudioMode(emptyCustomHtml(), false)).toBe("blocks");
    expect(initialStudioMode(source, true)).toBe("html");
  });

  it("opens inactive HTML only when there is no blocks design", () => {
    const inactive = setCustomHtmlActive(source, false);
    expect(initialStudioMode(inactive, true)).toBe("blocks");
    expect(initialStudioMode(inactive, false)).toBe("html");
  });

  it("turning HTML off keeps the code", () => {
    const off = setCustomHtmlActive(source, false);
    expect(off).toEqual({ ...source, active: false });
    expect(setCustomHtmlActive(off, true)).toEqual(source);
  });

  it("treats untouched source as no source", () => {
    expect(isCustomHtmlBlank(null)).toBe(true);
    expect(isCustomHtmlBlank(emptyCustomHtml())).toBe(true);
    expect(
      isCustomHtmlBlank({ ...emptyCustomHtml(), brief: emptyBrief() }),
    ).toBe(true);
    expect(isCustomHtmlBlank({ ...emptyCustomHtml(), active: true })).toBe(
      false,
    );
  });
});

describe("dirty checks and who may save", () => {
  it("opening HTML mode is not a change; typing or activating is", () => {
    expect(customHtmlChanged(null, emptyCustomHtml())).toBe(false);
    expect(
      customHtmlChanged(null, { ...emptyCustomHtml(), html: "<p>x</p>" }),
    ).toBe(true);
    expect(customHtmlChanged(source, setCustomHtmlActive(source, false))).toBe(
      true,
    );
    expect(customHtmlChanged(source, { ...source })).toBe(false);
  });

  it("an empty concept equals no concept", () => {
    expect(customHtmlChanged(source, { ...source, brief: emptyBrief() })).toBe(
      false,
    );
    expect(
      customHtmlChanged(source, {
        ...source,
        brief: { ...emptyBrief(), description: "Cálida" },
      }),
    ).toBe(true);
  });

  it("editors may save only when the HTML did not change", () => {
    expect(canSaveCustomHtml(false, source, source)).toBe(true);
    expect(canSaveCustomHtml(false, source, { ...source, html: "<p/>" })).toBe(
      false,
    );
    expect(canSaveCustomHtml(true, source, { ...source, html: "<p/>" })).toBe(
      true,
    );
  });
});

describe("prepare and validate before saving", () => {
  it("drops an empty concept and trims a filled one", () => {
    expect(prepareCustomHtml({ ...source, brief: emptyBrief() })).toEqual(
      source,
    );
    expect(
      prepareCustomHtml({
        ...source,
        brief: {
          description: "  Cálida  ",
          tone: "   ",
          colors: ["#AABBCC"],
          imageRefs: ["a", "a"],
          fonts: ["lora", "lora"],
        },
      }).brief,
    ).toEqual({
      description: "Cálida",
      colors: ["#aabbcc"],
      imageRefs: ["a"],
      fonts: ["lora"],
    });
  });

  it("refuses active HTML that is empty", () => {
    const issues = validateCustomHtml({ ...emptyCustomHtml(), active: true });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.area).toBe("code");
  });

  it("refuses code over the limits", () => {
    const issues = validateCustomHtml({
      ...source,
      html: "x".repeat(60_001),
      css: "y".repeat(30_001),
    });
    expect(issues.map((issue) => issue.area)).toEqual(["code", "code"]);
  });

  it("asks for a description when the concept has other choices", () => {
    const issues = validateCustomHtml({
      ...source,
      brief: { ...emptyBrief(), colors: ["#112233"] },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.area).toBe("concept");
  });

  it("accepts inactive empty source and a complete concept", () => {
    expect(validateCustomHtml(emptyCustomHtml())).toEqual([]);
    expect(
      validateCustomHtml({
        ...source,
        brief: { ...emptyBrief(), description: "Cálida", fonts: ["lora"] },
      }),
    ).toEqual([]);
  });
});

describe("inserts", () => {
  it("offers socials and profile only to a Página de Link", () => {
    expect(widgetsFor("links")).toEqual(["kardo-links"]);
    expect(widgetsFor("profile")).toEqual(["kardo-links"]);
    expect(widgetsFor("linkpage")).toEqual([
      "kardo-profile",
      "kardo-links",
      "kardo-socials",
    ]);
  });

  it("writes library images as kardo-asset tokens", () => {
    expect(imageSnippet("abc", "html")).toBe(
      '<img src="kardo-asset:abc" alt="">',
    );
    expect(imageSnippet("abc", "css")).toBe("url(kardo-asset:abc)");
    // The alt starts as the readable file name, escaped.
    expect(imageSnippet("abc", "html", 'Logo "Café" <1>')).toBe(
      '<img src="kardo-asset:abc" alt="Logo &quot;Café&quot; &lt;1>">',
    );
  });
});

describe("the sanitizer report, in words", () => {
  const clean = {
    removedTags: {},
    removedAttributes: {},
    removedCssRules: 0,
    removedCss: {},
    blockedLinks: 0,
    blockedImages: 0,
  };

  it("summarizes removed things in one sentence", () => {
    const report = normalizeReport({
      ...clean,
      removedTags: { script: 2 },
      removedAttributes: { onclick: 3, src: 1 },
      blockedImages: 1,
    });
    expect(reportSummary(report)).toBe(
      "Quitamos lo que no se puede publicar: 2 scripts, 3 atributos onclick y 1 imagen externa.",
    );
    expect(reportGroups(report).map((group) => group.reason)).toEqual([
      "javascript",
      "images",
    ]);
  });

  it("has nothing to say about clean code", () => {
    expect(reportSummary(normalizeReport(clean))).toBeNull();
    expect(reportSummary(normalizeReport(undefined))).toBeNull();
  });

  it("counts a blocked link once and names embeds, forms and unknown tags", () => {
    expect(
      normalizeReport({
        ...clean,
        removedTags: { iframe: 1, input: 2, marquee: 1, link: 1 },
        removedAttributes: { href: 1, width: 1 },
        blockedLinks: 1,
      }).items,
    ).toEqual([
      { kind: "embed", count: 1, examples: ["iframe"] },
      { kind: "form", count: 2, examples: ["input"] },
      { kind: "element", count: 2, examples: ["marquee", "link"] },
      { kind: "attribute", count: 1, examples: ["width"] },
      { kind: "unsafe-link", count: 1 },
    ]);
  });

  it("explains CSS removals by reason, and a refused stylesheet as such", () => {
    const report = normalizeReport({
      ...clean,
      removedCssRules: 3,
      removedCss: { import: 1, position: 1, "external-url": 1 },
    });
    expect(reportSummary(report)).toBe(
      "Quitamos lo que no se puede publicar: 1 @import, 1 url() externa en CSS y 1 posición fija.",
    );
    const refused = normalizeReport({
      ...clean,
      removedCssRules: 4,
      removedCss: { stylesheet: 1 },
    });
    expect(refused.items).toEqual([{ kind: "css-rejected", count: 1 }]);
    expect(reportGroups(refused)[0]?.reason).toBe("css");
  });
});

// Kardo's AI state machine (kardoAiFailure, kardoAiStageLabel, …) now has
// its own file: test/studio-html-kardo-ai.test.ts.
