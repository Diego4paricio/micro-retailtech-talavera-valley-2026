import { describe, expect, it } from "vitest";
import {
  clampPageCount,
  PdfPrepareError,
  pageCanvasSize,
  pdfErrorMessage,
  pdfPageFileName,
  stripPdfExtension,
  truncatedPageCount,
} from "../src/lib/pdf/raster.js";

// Pure helpers only: opening a real PDF needs pdf.js and a canvas, exercised
// live in the browser instead (see the relevo report for the manual pass).

describe("clampPageCount / truncatedPageCount (Documento PDF, 40-page cap)", () => {
  it("never draws more than 40 pages", () => {
    expect(clampPageCount(3)).toBe(3);
    expect(clampPageCount(40)).toBe(40);
    expect(clampPageCount(41)).toBe(40);
    expect(clampPageCount(500)).toBe(40);
  });

  it("reports how many pages were left out", () => {
    expect(truncatedPageCount(3)).toBe(0);
    expect(truncatedPageCount(40)).toBe(0);
    expect(truncatedPageCount(45)).toBe(5);
  });

  it("never goes negative for an empty PDF", () => {
    expect(clampPageCount(0)).toBe(0);
    expect(truncatedPageCount(0)).toBe(0);
  });
});

describe("stripPdfExtension", () => {
  it("drops the .pdf extension, case-insensitively", () => {
    expect(stripPdfExtension("Menú de temporada.pdf")).toBe(
      "Menú de temporada",
    );
    expect(stripPdfExtension("carta.PDF")).toBe("carta");
  });

  it("falls back to a generic name for an empty or extension-only filename", () => {
    expect(stripPdfExtension("")).toBe("Documento");
    expect(stripPdfExtension(".pdf")).toBe("Documento");
    expect(stripPdfExtension("   ")).toBe("Documento");
  });
});

describe("pdfPageFileName", () => {
  it("names each page recognizably, in order", () => {
    expect(pdfPageFileName("Menú de temporada.pdf", 1, "webp")).toBe(
      "Menú de temporada pág 1.webp",
    );
    expect(pdfPageFileName("Carta.pdf", 12, "jpg")).toBe("Carta pág 12.jpg");
  });

  it("keeps the filename at or under 255 characters", () => {
    const longName = `${"a".repeat(300)}.pdf`;
    const name = pdfPageFileName(longName, 3, "webp");
    expect(name.length).toBeLessThanOrEqual(255);
    expect(name.endsWith(" pág 3.webp")).toBe(true);
  });
});

describe("pageCanvasSize", () => {
  it("scales to the 1,080 px target width, keeping the aspect ratio", () => {
    const size = pageCanvasSize(620, 877);
    expect(size.width).toBe(1080);
    expect(size.height).toBe(1528);
    expect(size.scale).toBeCloseTo(1080 / 620, 5);
  });

  it("uses a custom target width when given one", () => {
    const size = pageCanvasSize(100, 200, 500);
    expect(size.width).toBe(500);
    expect(size.height).toBe(1000);
  });

  it("never produces a zero-sized canvas", () => {
    const size = pageCanvasSize(0, 0);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });
});

describe("pdfErrorMessage", () => {
  it("keeps the friendly PdfPrepareError message", () => {
    const error = new PdfPrepareError(
      "password",
      "Este PDF necesita una contraseña.",
    );
    expect(pdfErrorMessage(error)).toBe("Este PDF necesita una contraseña.");
  });

  it("falls back to a generic message for anything else", () => {
    expect(pdfErrorMessage(new Error("boom"))).toContain("No pudimos preparar");
    expect(pdfErrorMessage("boom")).toContain("No pudimos preparar");
  });
});
