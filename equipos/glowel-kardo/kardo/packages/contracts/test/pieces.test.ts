import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatPieceCode,
  isPieceCodeShape,
  isPieceModel,
  isPiecePublicId,
  KIT_CODE_LENGTH,
  normalizePieceCode,
  PIECE_CODE_ALPHABET,
  PIECE_CODE_LENGTH,
  pieceModels,
  touchpointKinds,
} from "../src/index.js";

type KitsCatalog = {
  panelDays: number;
  kits: { code: string; items: { piece: string; quantity: number }[] }[];
};

const catalog = JSON.parse(
  readFileSync(
    new URL(
      "../../../Docs/engineering/config/kits-catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as KitsCatalog;

describe("Kardo pieces (ADR 026)", () => {
  it("knows a piece as its own Touchpoint kind", () => {
    expect(touchpointKinds).toContain("kardo");
    expect(pieceModels).toEqual(["stand", "card", "magnet", "sticker"]);
    expect(isPieceModel("magnet")).toBe(true);
    expect(isPieceModel("qr")).toBe(false);
  });

  it("every kit of the catalog is made of the four pieces, at most 100", () => {
    for (const kit of catalog.kits) {
      for (const item of kit.items) expect(isPieceModel(item.piece)).toBe(true);
      const total = kit.items.reduce((sum, item) => sum + item.quantity, 0);
      expect(total).toBeLessThanOrEqual(100);
    }
  });

  it("reads a piece address by its shape and nothing else", () => {
    expect(isPiecePublicId("kp_Ab3dEf6hIj9kLm2nOp4q")).toBe(true);
    // The panel's own Touchpoints are 32 hex characters.
    expect(isPiecePublicId("0f3c2d1e4b5a69788796a5b4c3d2e1f0")).toBe(false);
    expect(isPiecePublicId("kp_short")).toBe(false);
    expect(isPiecePublicId("kp_Ab3dEf6hIj9kLm2nOp4q-")).toBe(false);
  });

  it("reads a typed code the way the database does", () => {
    // Lowercase, spaces and dashes; I and L are 1, O is 0 (Crockford).
    expect(normalizePieceCode(" abcd-eFgh ")).toBe("ABCDEFGH");
    expect(normalizePieceCode("ILO0-1234")).toBe("11001234");
    expect(isPieceCodeShape("abcd-2345")).toBe(true);
    expect(isPieceCodeShape("ABCDE-23456")).toBe(true);
    // U is not a Crockford letter; 9 characters is neither length.
    expect(isPieceCodeShape("ABCU-2345")).toBe(false);
    expect(isPieceCodeShape("ABCD-23456")).toBe(false);
    expect(PIECE_CODE_ALPHABET).toHaveLength(32);
    expect(PIECE_CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it("prints a kit's code in fives and a piece's in fours", () => {
    expect(formatPieceCode("abcde23456")).toBe("ABCDE-23456");
    expect(formatPieceCode("abcd2345")).toBe("ABCD-2345");
    expect(KIT_CODE_LENGTH).toBe(10);
    expect(PIECE_CODE_LENGTH).toBe(8);
  });
});
