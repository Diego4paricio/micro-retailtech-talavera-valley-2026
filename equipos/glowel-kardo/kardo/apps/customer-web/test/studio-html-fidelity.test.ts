import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  fidelityIssues,
  fidelityKindOf,
  fidelityModuleLabel,
  fidelityModulesOf,
  sizesDiffer,
} from "../src/features/studio/html/fidelity.js";
import type { SyncPlan } from "../src/features/studio/html/to-design.js";

/**
 * "No llevar a bloques lo que no se interpreta bien" (addendum: the owner's
 * WhatsApp-logo-grows-huge complaint) — the pure parts: the size-difference
 * rule, friendly module names, and which "changed" units of a `SyncPlan`
 * need measuring. The DOM measurement itself (`use-fidelity-gate.ts`) is
 * browser-only and not covered here.
 */

const style: PageDesign["style"] = {
  palette: {
    background: "#f7f5f0",
    surface: "#fffdf8",
    text: "#16232e",
    muted: "#52646d",
    accent: "#0a6c78",
  },
  fonts: { heading: "geist", body: "dm-sans" },
  radius: 16,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "soft",
  background: { kind: "none" },
  maxWidth: 560,
};

function flowDesign(blocks: DesignBlock[]): PageDesign {
  return {
    schema: 1,
    style,
    sections: [
      {
        id: "s1",
        layout: "1",
        columns: [blocks],
        paddingTop: 32,
        paddingBottom: 32,
        gap: 16,
        align: "start",
      },
    ],
  };
}

describe("sizesDiffer", () => {
  it("is false when the isolated render is about the same size", () => {
    expect(
      sizesDiffer({ width: 100, height: 40 }, { width: 104, height: 42 }),
    ).toBe(false);
  });

  it("flags an absolute difference over 24 px in either dimension", () => {
    expect(
      sizesDiffer({ width: 100, height: 40 }, { width: 130, height: 40 }),
    ).toBe(true);
    expect(
      sizesDiffer({ width: 100, height: 40 }, { width: 100, height: 70 }),
    ).toBe(true);
  });

  it("flags a relative difference over 25 % even under 24 px", () => {
    // 80 → 101: 21 px (under 24), but 26 % (over 25 %).
    expect(
      sizesDiffer({ width: 80, height: 80 }, { width: 101, height: 80 }),
    ).toBe(true);
  });

  it("does not flag a modest, expected resize", () => {
    // A slightly narrower column: well under every threshold.
    expect(
      sizesDiffer({ width: 342, height: 52 }, { width: 330, height: 53 }),
    ).toBe(false);
  });

  it("flags the owner's WhatsApp-logo-grows-huge case as an icon", () => {
    // The glyph's sizing rule got deleted: it falls back to a plain <svg>'s
    // default render size (300×150) instead of the ~24 px icon it was.
    expect(
      sizesDiffer(
        { width: 24, height: 24 },
        { width: 300, height: 150 },
        "icon",
      ),
    ).toBe(true);
  });
});

describe("fidelityKindOf", () => {
  it("reads image blocks as 'image', brandButton as 'icon', the rest as generic", () => {
    expect(fidelityKindOf("image")).toBe("image");
    expect(fidelityKindOf("imageMain")).toBe("image");
    expect(fidelityKindOf("brandButton")).toBe("icon");
    expect(fidelityKindOf("heading")).toBe("generic");
    expect(fidelityKindOf("button")).toBe("generic");
  });
});

describe("fidelityModuleLabel", () => {
  it("names a brand button by its network", () => {
    const block: DesignBlock = {
      id: "bb",
      kind: "brandButton",
      brand: "whatsapp",
      label: "Escríbenos por WhatsApp",
      href: "https://wa.me/525555555555",
      look: "brand",
    };
    expect(fidelityModuleLabel(block)).toBe("Botón de WhatsApp");
  });

  it("names a heading or text block by a short snippet", () => {
    const heading: DesignBlock = {
      id: "h",
      kind: "heading",
      text: "Bienvenido a Café Luna",
      level: 2,
    };
    expect(fidelityModuleLabel(heading)).toBe("Texto: Bienvenido a Café Luna");

    const longText: DesignBlock = {
      id: "t",
      kind: "text",
      runs: [{ text: "Esto es un párrafo bastante largo que se corta" }],
    };
    const label = fidelityModuleLabel(longText);
    expect(label.startsWith("Texto: ")).toBe(true);
    expect(label.endsWith("…")).toBe(true);
    expect(label.length).toBeLessThan("Texto: ".length + 35);
  });

  it("falls back to the kind's own name for everything else", () => {
    const button: DesignBlock = {
      id: "b",
      kind: "button",
      label: "Ver menú",
      href: "https://example.com",
      variant: "primary",
    };
    expect(fidelityModuleLabel(button)).toBe("Botón");
  });
});

describe("fidelityModulesOf", () => {
  it("only measures 'changed' units, matched by id in the old design", () => {
    const brandButton: DesignBlock = {
      id: "bb",
      kind: "brandButton",
      brand: "whatsapp",
      label: "Escríbenos por WhatsApp",
      href: "https://wa.me/525555555555",
      look: "brand",
    };
    const heading: DesignBlock = {
      id: "h",
      kind: "heading",
      text: "Hola",
      level: 2,
    };
    const oldDesign = flowDesign([brandButton, heading]);

    const htmlBrandButton: DesignBlock = {
      id: "bb",
      kind: "html",
      html: '<a data-block-id="bb"><svg></svg></a>',
      css: "",
    };
    const newDesign = flowDesign([htmlBrandButton, heading]);
    const plan: SyncPlan = {
      design: newDesign,
      changedBlocks: [
        { blockId: "bb", action: "changed" },
        { blockId: "new-1", action: "added" },
        { blockId: "gone", action: "removed" },
      ],
      notes: [],
    };

    const modules = fidelityModulesOf(oldDesign, plan, "links");
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      blockId: "bb",
      label: "Botón de WhatsApp",
      kind: "icon",
      html: '<a data-block-id="bb"><svg></svg></a>',
    });
  });

  it("returns nothing when there is nothing 'changed'", () => {
    const heading: DesignBlock = {
      id: "h",
      kind: "heading",
      text: "Hola",
      level: 2,
    };
    const design = flowDesign([heading]);
    const plan: SyncPlan = {
      design,
      changedBlocks: [{ blockId: "new-1", action: "added" }],
      notes: [],
    };
    expect(fidelityModulesOf(design, plan, "links")).toEqual([]);
  });
});

describe("fidelityIssues", () => {
  it("lists only the measurements whose sizes differ", () => {
    const issues = fidelityIssues([
      {
        blockId: "bb",
        label: "Botón de WhatsApp",
        kind: "icon",
        html: "",
        css: "",
        live: { width: 24, height: 24 },
        isolated: { width: 300, height: 150 },
      },
      {
        blockId: "h",
        label: "Texto: Hola",
        kind: "generic",
        html: "",
        css: "",
        live: { width: 300, height: 40 },
        isolated: { width: 305, height: 41 },
      },
    ]);
    expect(issues).toEqual([{ blockId: "bb", label: "Botón de WhatsApp" }]);
  });

  it("is empty when every measurement matches", () => {
    const issues = fidelityIssues([
      {
        blockId: "h",
        label: "Texto: Hola",
        kind: "generic",
        html: "",
        css: "",
        live: { width: 300, height: 40 },
        isolated: { width: 300, height: 40 },
      },
    ]);
    expect(issues).toEqual([]);
  });
});
