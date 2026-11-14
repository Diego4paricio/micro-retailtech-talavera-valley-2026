import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  footerToneForBackground,
  renderDesignedBody,
  renderKardoFooter,
} from "../src/index.js";
import { design, linksContent, section, testContext } from "./fixtures.js";

describe("renderKardoFooter", () => {
  it("uses the light logo for tone light, the dark logo for tone dark", () => {
    expect(renderKardoFooter("light")).toContain(
      'class="kd-footer kd-footer--light"',
    );
    expect(renderKardoFooter("light")).toContain('fill="#1A3E4A"');
    expect(renderKardoFooter("dark")).toContain(
      'class="kd-footer kd-footer--dark"',
    );
    expect(renderKardoFooter("dark")).toContain('fill="#EEEFEA"');
  });

  it("wraps the light logo in a translucent chip for tone chip", () => {
    const html = renderKardoFooter("chip");
    expect(html).toContain('class="kd-footer kd-footer--chip"');
    expect(html).toContain('<span class="kd-footer-chip">');
    expect(html).toContain('fill="#1A3E4A"');
  });

  it("never contains a script or a system-font <text> node", () => {
    for (const tone of ["light", "dark", "chip"] as const) {
      const html = renderKardoFooter(tone);
      expect(html.toLowerCase()).not.toContain("<script");
      expect(html).not.toContain("<text");
    }
  });
});

describe("footerToneForBackground", () => {
  it("picks dark for a light background and light for a dark background", () => {
    expect(footerToneForBackground("#ffffff")).toBe("light");
    expect(footerToneForBackground("#000000")).toBe("dark");
  });

  it("falls back to a safe default for a non-hex value", () => {
    expect(footerToneForBackground("not-a-color")).toBe("light");
  });
});

describe("renderDesignedBody: the Kardo footer", () => {
  const blocks: DesignBlock[] = [
    { id: "cl1", kind: "contentLinks", layout: "list" },
  ];

  it("is present by default, inside .kd-page after .kd-container", () => {
    const { html, css } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain('<footer class="kd-footer');
    expect(html.indexOf("</div></div></section></div>")).toBeLessThan(
      html.indexOf("<footer"),
    );
    expect(html.lastIndexOf("<footer")).toBeGreaterThan(
      html.indexOf('class="kd-container"'),
    );
    expect(css).toContain(".kd-footer{");
    expect(css).toContain("margin-top:auto");
  });

  it("is omitted with { footer: false }, and its CSS is not added either", () => {
    const { html, css } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
      { footer: false },
    );
    expect(html).not.toContain("<footer");
    expect(css).not.toContain(".kd-footer{");
  });

  it("picks its tone from the palette's background luminance", () => {
    const lightDesign = design([section("s1", [blocks])]);
    const { html: lightHtml } = renderDesignedBody(
      linksContent(),
      lightDesign,
      testContext(),
    );
    expect(lightHtml).toContain("kd-footer--light");

    const darkDesign = design([section("s1", [blocks])]);
    darkDesign.style.palette.background = "#0b0f12";
    const { html: darkHtml } = renderDesignedBody(
      linksContent(),
      darkDesign,
      testContext(),
    );
    expect(darkHtml).toContain("kd-footer--dark");
  });
});
