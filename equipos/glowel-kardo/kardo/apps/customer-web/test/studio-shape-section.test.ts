import type { DesignBlock } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { blockHasShapeControls } from "../src/features/studio/inspector/ShapeSection.js";
import {
  buttonShapePreset,
  buttonShapeRadius,
} from "../src/features/studio/model/shape-presets.js";

/**
 * "Forma" (addendum: dónde cambiar la forma de un elemento), the pure parts:
 * which blocks show the section/toolbar button, and the button/brandButton
 * corner presets. `ShapeSection.tsx`'s rendering and `canvas.ts`'s
 * `setBrandButtonLook` are covered elsewhere (studio-canvas.test.ts).
 */

const heading: DesignBlock = {
  id: "h",
  kind: "heading",
  text: "Hola",
  level: 2,
};
const image: DesignBlock = {
  id: "i",
  kind: "image",
  imageRef: "",
  alt: "",
  aspect: "1:1",
  fit: "cover",
};
const shape: DesignBlock = {
  id: "s",
  kind: "shape",
  shape: "rect",
  fill: "accent",
};
const button: DesignBlock = {
  id: "b",
  kind: "button",
  label: "Ver más",
  href: "https://example.com",
  variant: "primary",
};
const brandButton: DesignBlock = {
  id: "bb",
  kind: "brandButton",
  brand: "whatsapp",
  label: "Escríbenos por WhatsApp",
  href: "https://wa.me/525555555555",
  look: "brand",
};

describe("blockHasShapeControls", () => {
  it("is true for image, shape, button and brandButton regardless of style", () => {
    expect(blockHasShapeControls(image)).toBe(true);
    expect(blockHasShapeControls(shape)).toBe(true);
    expect(blockHasShapeControls(button)).toBe(true);
    expect(blockHasShapeControls(brandButton)).toBe(true);
  });

  it("is false for a plain block with no background of its own", () => {
    expect(blockHasShapeControls(heading)).toBe(false);
    expect(blockHasShapeControls({ ...heading, style: {} })).toBe(false);
  });

  it("is false when the block's own background is explicitly 'none'", () => {
    expect(
      blockHasShapeControls({ ...heading, style: { background: "none" } }),
    ).toBe(false);
  });

  it("is true for a plain block that paints its own background", () => {
    expect(
      blockHasShapeControls({ ...heading, style: { background: "accent" } }),
    ).toBe(true);
    expect(
      blockHasShapeControls({ ...heading, style: { background: "#ff0000" } }),
    ).toBe(true);
  });
});

describe("buttonShapeRadius / buttonShapePreset", () => {
  it("maps each preset to its exact radius", () => {
    expect(buttonShapeRadius("pill")).toBe(999);
    expect(buttonShapeRadius("rounded")).toBe(14);
    expect(buttonShapeRadius("square")).toBe(0);
  });

  it("round-trips every preset through its radius", () => {
    for (const preset of ["pill", "rounded", "square"] as const)
      expect(buttonShapePreset(buttonShapeRadius(preset))).toBe(preset);
  });

  it("reads an unset or unrecognized radius as 'pill' (never unselected)", () => {
    expect(buttonShapePreset(undefined)).toBe("pill");
    expect(buttonShapePreset(8)).toBe("pill");
    expect(buttonShapePreset(48)).toBe("pill");
  });
});
