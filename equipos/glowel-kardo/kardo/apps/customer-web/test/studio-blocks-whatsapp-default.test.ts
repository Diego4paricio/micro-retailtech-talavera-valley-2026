import { describe, expect, it } from "vitest";
import { createBlock } from "../src/features/studio/model/blocks.js";
import { createIdFactory } from "../src/features/studio/model/ids.js";

describe("createBlock brandButton (relevo 37, S7)", () => {
  it("starts empty with no business WhatsApp", () => {
    const block = createBlock("brandButton", createIdFactory([]));
    expect(block.kind).toBe("brandButton");
    if (block.kind !== "brandButton") throw new Error("unreachable");
    expect(block.brand).toBe("whatsapp");
    expect(block.href).toBe("");
  });

  it("starts filled with the business's own WhatsApp when it has one", () => {
    const block = createBlock(
      "brandButton",
      createIdFactory([]),
      "https://wa.me/525512345678",
    );
    if (block.kind !== "brandButton") throw new Error("unreachable");
    expect(block.href).toBe("https://wa.me/525512345678");
  });

  it("other block kinds ignore the WhatsApp number", () => {
    const block = createBlock(
      "button",
      createIdFactory([]),
      "https://wa.me/525512345678",
    );
    if (block.kind !== "button") throw new Error("unreachable");
    expect(block.href).toBe("");
  });
});
