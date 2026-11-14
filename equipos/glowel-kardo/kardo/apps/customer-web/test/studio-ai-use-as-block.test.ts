import { DESIGN_LIMITS } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { htmlBlockBlocker } from "../src/features/studio/html/use-as-block.js";

describe("htmlBlockBlocker", () => {
  it("allows html/css that fits within the block limits", () => {
    expect(htmlBlockBlocker("<p>hola</p>", ".x{color:red}", 0)).toBeNull();
  });

  it("refuses empty source", () => {
    expect(htmlBlockBlocker("   ", "\n", 0)).toMatch(/Escribe algo/);
  });

  it("refuses when the design already has the maximum html blocks", () => {
    const reason = htmlBlockBlocker(
      "<p>hola</p>",
      "",
      DESIGN_LIMITS.htmlBlocks,
    );
    expect(reason).toMatch(
      new RegExp(`${DESIGN_LIMITS.htmlBlocks}.*bloques HTML`),
    );
  });

  it("refuses html longer than a block allows", () => {
    const html = "a".repeat(DESIGN_LIMITS.htmlBlockHtml + 1);
    expect(htmlBlockBlocker(html, "", 0)).toMatch(/Tu HTML tiene/);
  });

  it("refuses css longer than a block allows", () => {
    const css = "a".repeat(DESIGN_LIMITS.htmlBlockCss + 1);
    expect(htmlBlockBlocker("<p>ok</p>", css, 0)).toMatch(/Tu CSS tiene/);
  });

  it("fits exactly at the limits", () => {
    const html = "a".repeat(DESIGN_LIMITS.htmlBlockHtml);
    const css = "a".repeat(DESIGN_LIMITS.htmlBlockCss);
    expect(
      htmlBlockBlocker(html, css, DESIGN_LIMITS.htmlBlocks - 1),
    ).toBeNull();
  });
});
