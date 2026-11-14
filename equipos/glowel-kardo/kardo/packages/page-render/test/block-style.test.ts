import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { renderDesignedBody } from "../src/index.js";
import { design, linksContent, section, testContext } from "./fixtures.js";

describe("BlockStyle: background gradient (backgroundTo/backgroundAngle)", () => {
  it("draws a linear-gradient when backgroundTo is set", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: {
          background: "#ff0000",
          backgroundTo: "#0000ff",
          backgroundAngle: 90,
        },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain(
      "background:linear-gradient(90deg, #ff0000, #0000ff)",
    );
  });

  it("draws a plain background when backgroundTo is absent", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: { background: "accent" },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("background:var(--kd-accent)");
    expect(html).not.toContain("linear-gradient");
  });

  it("still resolves 'none' to transparent, ignoring backgroundTo", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: { background: "none", backgroundTo: "#0000ff" },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("background:transparent");
    expect(html).not.toContain("linear-gradient");
  });

  it("uses token colors (not raw text) in the gradient", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: { background: "surface", backgroundTo: "muted" },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain(
      "background:linear-gradient(180deg, var(--kd-surface), var(--kd-muted))",
    );
  });
});

describe("BlockStyle: solid border (borderWidth/borderColor)", () => {
  it("draws a border with the given width and color token", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: { borderWidth: 3, borderColor: "accent" },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("border:3px solid var(--kd-accent)");
  });

  it("clamps an out-of-range width instead of injecting it raw", () => {
    const blocks: DesignBlock[] = [
      {
        id: "h1",
        kind: "heading",
        text: "Hola",
        level: 1,
        style: { borderWidth: 999 },
      },
    ];
    const { html } = renderDesignedBody(
      linksContent(),
      design([section("s1", [blocks])]),
      testContext(),
    );
    expect(html).toContain("border:12px solid currentColor");
  });
});
