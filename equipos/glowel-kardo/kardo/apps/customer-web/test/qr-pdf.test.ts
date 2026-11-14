import zlib from "node:zlib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  scenesToSheetPdf,
  sceneToPdf,
} from "../src/features/touchpoints/qr/engine/pdf.js";
import {
  encodeWinAnsi,
  measureCodesAtUnitSize,
  pdfEscapeText,
} from "../src/features/touchpoints/qr/engine/pdf-fonts.js";
import type { DecodeImage } from "../src/features/touchpoints/qr/engine/pdf-image.js";
import { mmToPt } from "../src/features/touchpoints/qr/engine/pdf-writer.js";
import type {
  PathCommand,
  Scene,
  SceneNode,
  ScenePaint,
  SceneRole,
} from "../src/features/touchpoints/qr/engine/types.js";

// ---------------------------------------------------------------------------
// Scene fixtures — built by hand (path commands, no rendering engine) so this
// suite only exercises the PDF writer, never the (parallel, in-progress)
// scene-building code.
// ---------------------------------------------------------------------------

const M = (x: number, y: number): PathCommand => ["M", x, y];
const L = (x: number, y: number): PathCommand => ["L", x, y];
const C = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): PathCommand => ["C", x1, y1, x2, y2, x3, y3];
const Z = (): PathCommand => ["Z"];

function rectCommands(
  x: number,
  y: number,
  width: number,
  height: number,
): PathCommand[] {
  return [
    M(x, y),
    L(x + width, y),
    L(x + width, y + height),
    L(x, y + height),
    Z(),
  ];
}

function rectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: ScenePaint,
  role: SceneRole,
): SceneNode {
  return {
    type: "path",
    role,
    fillRule: "nonzero",
    fill,
    d: rectCommands(x, y, width, height),
  };
}

function circlePath(cx: number, cy: number, r: number): PathCommand[] {
  const k = 0.5522847498307936 * r;
  return [
    M(cx + r, cy),
    C(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    C(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    C(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    C(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    Z(),
  ];
}

/** QR modules + a Bézier eye, a linear gradient, a radial gradient, an
 * evenodd "donut" and Spanish CTA text that must shrink to fit. */
function buildKitchenSinkScene(): Scene {
  const qr = QRCode.create("https://kardo.app/t/estudio-qr-pdf-test", {
    errorCorrectionLevel: "H",
  });
  const size = qr.modules.size;
  const quietZone = 4;
  const total = size + quietZone * 2;
  const nodes: SceneNode[] = [];

  nodes.push(
    rectPath(
      0,
      0,
      total,
      total,
      { kind: "solid", color: "#ffffff" },
      "background",
    ),
  );

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.modules.get(row, col)) {
        nodes.push(
          rectPath(
            quietZone + col,
            quietZone + row,
            1,
            1,
            { kind: "solid", color: "#111111" },
            "module",
          ),
        );
      }
    }
  }

  nodes.push({
    type: "path",
    role: "eye-ball",
    fillRule: "nonzero",
    fill: { kind: "solid", color: "#1c2b3a" },
    d: circlePath(quietZone + 3.5, quietZone + 3.5, 1.5),
  });

  nodes.push({
    type: "path",
    role: "frame",
    fillRule: "nonzero",
    fill: {
      kind: "linear",
      from: "#ff6b6b",
      to: "#4d96ff",
      x1: quietZone,
      y1: total - 2,
      x2: total - quietZone,
      y2: total - 2,
    },
    opacity: 0.85,
    d: rectCommands(quietZone, total - 3, total - quietZone * 2, 2),
  });

  nodes.push({
    type: "path",
    role: "decoration",
    fillRule: "nonzero",
    fill: {
      kind: "radial",
      from: "#ffe66d",
      to: "#ff6b6b",
      cx: total / 2,
      cy: total / 2,
      r: 2,
    },
    d: circlePath(total / 2, total / 2, 2),
  });

  // Evenodd "donut": one node, two nested rectangles -> a hole in the middle.
  nodes.push({
    type: "path",
    role: "decoration",
    fillRule: "evenodd",
    fill: { kind: "solid", color: "#2ecc71" },
    d: [...rectCommands(1, 1, 3, 3), ...rectCommands(1.75, 1.75, 1.5, 1.5)],
  });

  nodes.push({
    type: "text",
    role: "cta",
    x: total / 2,
    y: total - 1,
    text: "Men\u00fa del d\u00eda \u00bfQu\u00e9 tal?",
    font: "sans",
    weight: 700,
    size: 3,
    color: "#16232e",
    letterSpacing: 0.02,
    maxWidth: total - 2 * quietZone,
  });

  return {
    width: total,
    height: total,
    nodes,
    symbol: { x: quietZone, y: quietZone, size, quietZone },
  };
}

function buildTextOnlyScene(text: string, maxWidth = 1000): Scene {
  return {
    width: 40,
    height: 20,
    nodes: [
      {
        type: "text",
        role: "cta",
        x: 20,
        y: 10,
        text,
        font: "mono",
        weight: 400,
        size: 4,
        color: "#000000",
        letterSpacing: 0,
        maxWidth,
      },
    ],
    symbol: { x: 0, y: 0, size: 20, quietZone: 0 },
  };
}

function buildImageScene(href: string): Scene {
  return {
    width: 10,
    height: 10,
    nodes: [
      rectPath(0, 0, 10, 10, { kind: "solid", color: "#ffffff" }, "background"),
      { type: "image", role: "logo", x: 3, y: 3, width: 4, height: 4, href },
    ],
    symbol: { x: 0, y: 0, size: 10, quietZone: 0 },
  };
}

function buildSimpleSquareScene(): Scene {
  return {
    width: 21,
    height: 21,
    nodes: [
      rectPath(0, 0, 21, 21, { kind: "solid", color: "#111111" }, "module"),
    ],
    symbol: { x: 0, y: 0, size: 21, quietZone: 0 },
  };
}

const fakeDecodeImage: DecodeImage = async (href) => {
  if (href.endsWith("fail")) return null;
  return {
    width: 2,
    height: 2,
    data: new Uint8Array([
      255,
      0,
      0,
      255,
      0,
      255,
      0,
      255, //
      0,
      0,
      255,
      128,
      255,
      255,
      255,
      0,
    ]),
  };
};

// ---------------------------------------------------------------------------
// Minimal PDF-1.4 reader — enough to check structure without a real parser.
// Uses latin1 throughout: it is a 1:1 mapping from bytes to code units, so
// text search on the latin1 string finds the exact byte offsets of binary
// stream data too.
// ---------------------------------------------------------------------------

type ParsedPdf = {
  text: string;
  count: number;
  offsets: number[];
  xrefOffset: number;
  sortedOffsets: number[];
};

async function toBuffer(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer());
}

function parsePdf(buffer: Buffer): ParsedPdf {
  const text = buffer.toString("latin1");
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);

  const startxrefMatch = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  expect(startxrefMatch).not.toBeNull();
  const xrefOffset = Number(startxrefMatch?.[1]);
  expect(text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");

  const headerMatch = /^xref\r?\n0 (\d+)\r?\n/.exec(text.slice(xrefOffset));
  expect(headerMatch).not.toBeNull();
  const count = Number(headerMatch?.[1]);
  let pos = xrefOffset + (headerMatch?.[0].length ?? 0) + 20; // skip the free (id 0) entry

  const offsets: number[] = [0];
  for (let id = 1; id < count; id += 1) {
    const entry = text.slice(pos, pos + 20);
    offsets.push(Number(entry.slice(0, 10)));
    pos += 20;
  }

  // Every xref offset must point exactly at "N 0 obj".
  for (let id = 1; id < count; id += 1) {
    const offset = offsets[id] ?? 0;
    expect(text.slice(offset, offset + `${id} 0 obj`.length)).toBe(
      `${id} 0 obj`,
    );
  }

  const sortedOffsets = offsets.slice(1).sort((a, b) => a - b);
  return { text, count, offsets, xrefOffset, sortedOffsets };
}

/**
 * Slices exactly one object's own bytes: from its offset up to the next
 * object's offset (or the xref table, for the physically-last object). A
 * fixed-size window would risk bleeding into the next object's dict for
 * short objects (e.g. a small content stream immediately followed by
 * `/Type /Page`), which is exactly the kind of false match this avoids.
 */
function objectHeader(parsed: ParsedPdf, id: number): string {
  const offset = parsed.offsets[id] ?? 0;
  const next =
    parsed.sortedOffsets.find((candidate) => candidate > offset) ??
    parsed.xrefOffset;
  return parsed.text.slice(offset, next);
}

function isContentStreamObject(parsed: ParsedPdf, id: number): boolean {
  const header = objectHeader(parsed, id);
  return header.includes("stream\n") && !header.includes("/Type");
}

function contentObjectIds(parsed: ParsedPdf): number[] {
  const ids: number[] = [];
  for (let id = 1; id < parsed.count; id += 1) {
    if (isContentStreamObject(parsed, id)) ids.push(id);
  }
  return ids;
}

function decompressStreamObject(
  parsed: ParsedPdf,
  buffer: Buffer,
  id: number,
): string {
  const offset = parsed.offsets[id] ?? 0;
  const header = objectHeader(parsed, id);
  const lengthMatch = /\/Length (\d+)/.exec(header);
  if (!lengthMatch?.[1]) throw new Error(`object ${id} has no /Length`);
  const length = Number(lengthMatch[1]);
  const streamIndex = header.indexOf("stream\n");
  if (streamIndex === -1) throw new Error(`object ${id} has no stream`);
  const dataStart = offset + streamIndex + "stream\n".length;
  const raw = buffer.subarray(dataStart, dataStart + length);
  const filtered = header.includes("/Filter /FlateDecode");
  return (filtered ? zlib.inflateSync(raw) : raw).toString("latin1");
}

function soleContent(parsed: ParsedPdf, buffer: Buffer): string {
  const ids = contentObjectIds(parsed);
  expect(ids.length).toBe(1);
  const id = ids[0];
  if (id === undefined) throw new Error("no content object found");
  return decompressStreamObject(parsed, buffer, id);
}

// ---------------------------------------------------------------------------

describe("sceneToPdf", () => {
  it("writes a well-formed single-page PDF with a valid xref table", async () => {
    const scene = buildKitchenSinkScene();
    const blob = await sceneToPdf(scene, {
      widthMm: 50,
      title: "Prueba Kardo",
    });
    const buffer = await toBuffer(blob);
    const parsed = parsePdf(buffer);

    const pageMatches = parsed.text.match(/\/Type\s*\/Page(?!s)/g) ?? [];
    expect(pageMatches.length).toBe(1);

    expect(parsed.text).toContain("/Producer (Kardo)");
    expect(parsed.text).toContain("/Title (Prueba Kardo)");
    expect(parsed.text).toMatch(/\/CreationDate \(D:\d{14}Z\)/);
  });

  it("sizes the page in points from widthMm (50mm -> 141.73pt, square design)", async () => {
    const scene = buildKitchenSinkScene(); // no frame -> square (width === height)
    const blob = await sceneToPdf(scene, { widthMm: 50 });
    const buffer = await toBuffer(blob);
    const text = buffer.toString("latin1");
    const mediaBox = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
    expect(mediaBox).not.toBeNull();
    expect(Number(mediaBox?.[1])).toBeCloseTo(141.73, 1);
    expect(Number(mediaBox?.[2])).toBeCloseTo(141.73, 1);
  });

  it("declares WinAnsi Type1 fonts, shading and ExtGState resources", async () => {
    const scene = buildKitchenSinkScene();
    const blob = await sceneToPdf(scene, { widthMm: 50 });
    const buffer = await toBuffer(blob);
    const text = buffer.toString("latin1");

    expect(text).toContain("/BaseFont /Helvetica-Bold");
    expect(text).toContain("/Encoding /WinAnsiEncoding");
    expect(text).toMatch(/\/ShadingType 2/); // linear
    expect(text).toMatch(/\/ShadingType 3/); // radial
    expect(text).toMatch(/\/FunctionType 2/);
    expect(text).toMatch(/\/Extend \[true true\]/);
    expect(text).toContain("/Type /ExtGState");
    expect(text).toMatch(/\/ca 0\.85 \/CA 0\.85/);
  });

  it("decompresses the content stream and emits the expected drawing operators", async () => {
    const scene = buildKitchenSinkScene();
    const blob = await sceneToPdf(scene, { widthMm: 50 });
    const buffer = await toBuffer(blob);
    const parsed = parsePdf(buffer);
    const content = soleContent(parsed, buffer);

    const tokens = new Set(content.split(/\s+/).filter(Boolean));
    for (const op of [
      "cm",
      "m",
      "l",
      "c",
      "h",
      "f",
      "f*",
      "W",
      "n",
      "sh",
      "rg",
      "gs",
      "Tf",
      "Tc",
      "Tm",
      "Tj",
      "BT",
      "ET",
    ]) {
      expect(tokens, `missing operator "${op}"`).toContain(op);
    }
  });

  it("encodes Spanish accents as WinAnsi octal escapes", async () => {
    const scene = buildKitchenSinkScene();
    const blob = await sceneToPdf(scene, { widthMm: 50 });
    const buffer = await toBuffer(blob);
    const parsed = parsePdf(buffer);
    const content = soleContent(parsed, buffer);

    expect(content).toContain("\\351"); // é (233 decimal)
    expect(content).toContain("\\277"); // ¿ (191 decimal)
    expect(content).toContain(
      pdfEscapeText("Men\u00fa del d\u00eda \u00bfQu\u00e9 tal?"),
    );
  });

  it('escapes parentheses/backslashes and maps out-of-WinAnsi characters to "?"', async () => {
    const scene = buildTextOnlyScene("(prueba) \\ \u65e5\u672c");
    const blob = await sceneToPdf(scene, { widthMm: 40 });
    const buffer = await toBuffer(blob);
    const parsed = parsePdf(buffer);
    const content = soleContent(parsed, buffer);

    expect(content).toContain(pdfEscapeText("(prueba) \\ \u65e5\u672c"));
    expect(content).toContain("\\(prueba\\)");
    expect(content).toContain("??"); // both CJK characters fell back to "?"
  });

  it("shrinks text proportionally so it never overflows maxWidth", async () => {
    const text = "Kardo Estudio QR";
    const wide = buildTextOnlyScene(text, 1000);
    const narrow = buildTextOnlyScene(text, 5);

    const [wideBuffer, narrowBuffer] = await Promise.all([
      sceneToPdf(wide, { widthMm: 40 }).then(toBuffer),
      sceneToPdf(narrow, { widthMm: 40 }).then(toBuffer),
    ]);

    const extractSize = (buffer: Buffer) => {
      const parsed = parsePdf(buffer);
      const content = soleContent(parsed, buffer);
      const match = /\/F\d+ ([\d.]+) Tf/.exec(content);
      expect(match).not.toBeNull();
      return Number(match?.[1]);
    };

    expect(extractSize(narrowBuffer)).toBeLessThan(extractSize(wideBuffer));
    // Sanity check against the raw metric: the unit-size glyph width times
    // the fitted size must stay within the requested budget.
    const unitWidth = measureCodesAtUnitSize(encodeWinAnsi(text), "Courier");
    const narrowSize = extractSize(narrowBuffer);
    expect(unitWidth * narrowSize).toBeLessThanOrEqual(5 + 1e-6);
  });

  it("embeds a decoded logo as a DeviceRGB Image XObject with a DeviceGray SMask", async () => {
    const scene = buildImageScene("data:image/png;base64,ok");
    const blob = await sceneToPdf(scene, {
      widthMm: 20,
      decodeImage: fakeDecodeImage,
    });
    const buffer = await toBuffer(blob);
    const text = buffer.toString("latin1");

    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/ColorSpace /DeviceRGB");
    expect(text).toContain("/ColorSpace /DeviceGray");
    expect(text).toMatch(/\/SMask \d+ 0 R/);
  });

  it("skips the logo (without throwing) when decoding fails or no decoder is given", async () => {
    const scene = buildImageScene("data:image/png;base64,fail");
    const blob = await sceneToPdf(scene, {
      widthMm: 20,
      decodeImage: fakeDecodeImage,
    });
    const buffer = await toBuffer(blob);
    const text = buffer.toString("latin1");
    expect(text).not.toContain("/Subtype /Image");

    // No decodeImage at all -> falls back to the (unavailable, in Node) browser
    // decoder, which returns null, so the image is skipped the same way.
    const blobNoDecoder = await sceneToPdf(scene, { widthMm: 20 });
    const textNoDecoder = (await toBuffer(blobNoDecoder)).toString("latin1");
    expect(textNoDecoder).not.toContain("/Subtype /Image");
  });
});

describe("scenesToSheetPdf", () => {
  it("lays out an A4 sheet of 50mm items across multiple pages, one caption each", async () => {
    const items = Array.from({ length: 13 }, (_, i) => ({
      scene: buildSimpleSquareScene(),
      caption: `Dise\u00f1o ${i + 1}`,
    }));
    const blob = await scenesToSheetPdf(items, {
      paper: "a4",
      widthMm: 50,
      title: "Hoja",
    });
    const buffer = await toBuffer(blob);
    const parsed = parsePdf(buffer);

    const pageMatches = parsed.text.match(/\/Type\s*\/Page(?!s)/g) ?? [];
    expect(pageMatches.length).toBeGreaterThan(1);

    let captionCount = 0;
    let sawCropMark = false;
    for (const id of contentObjectIds(parsed)) {
      const decompressed = decompressStreamObject(parsed, buffer, id);
      if (decompressed.includes("0.25 w")) sawCropMark = true;
      for (let i = 1; i <= 13; i += 1) {
        // Close the PDF literal string so "Dise\u00f1o 1" doesn't also match
        // inside "Dise\u00f1o 10"/"11"/"12"/"13".
        if (decompressed.includes(`${pdfEscapeText(`Dise\u00f1o ${i}`)})`))
          captionCount += 1;
      }
    }
    expect(captionCount).toBe(13);
    // Crop marks on by default.
    expect(sawCropMark).toBe(true);

    // Fonts are shared: one Helvetica object serves every page/caption.
    expect((parsed.text.match(/\/BaseFont \/Helvetica\b/g) ?? []).length).toBe(
      1,
    );
  });

  it("supports Letter paper, a custom margin, and disabling crop marks", async () => {
    const items = [{ scene: buildSimpleSquareScene(), caption: "Solo uno" }];
    const blob = await scenesToSheetPdf(items, {
      paper: "letter",
      widthMm: 60,
      marginMm: 15,
      cropMarks: false,
    });
    const buffer = await toBuffer(blob);
    const text = buffer.toString("latin1");

    const mediaBox = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
    expect(mediaBox).not.toBeNull();
    expect(Number(mediaBox?.[1])).toBeCloseTo(mmToPt(215.9), 1);
    expect(Number(mediaBox?.[2])).toBeCloseTo(mmToPt(279.4), 1);

    const parsed = parsePdf(buffer);
    const content = soleContent(parsed, buffer);
    expect(content).toContain(pdfEscapeText("Solo uno"));
    expect(content).not.toContain("0.25 w");
  });
});
