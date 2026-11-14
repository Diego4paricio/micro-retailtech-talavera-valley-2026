import {
  encodeWinAnsi,
  fontForFrame,
  measureCodes,
  measureCodesAtUnitSize,
  type PdfStandardFont,
  pdfEscapeText,
} from "./pdf-fonts.js";
import {
  type DecodeImage,
  decodeImageInBrowser,
  splitRgba,
} from "./pdf-image.js";
import {
  compressStream,
  fmt,
  hexToRgb01,
  latin1Bytes,
  mmToPt,
  PdfDocumentWriter,
  type PdfRef,
  pdfDate,
  type StreamPayload,
} from "./pdf-writer.js";
import type {
  PathCommand,
  PrintPaper,
  Scene,
  SceneImageNode,
  ScenePaint,
  ScenePathNode,
  SceneTextNode,
} from "./types.js";

/**
 * Vector PDF export for Estudio QR — a pure PDF 1.4 writer, no dependencies.
 *
 * Scenes are laid out in module units (see types.ts); a single `cm` per
 * design maps that space (y grows down) onto the page (points, y grows up):
 * `factor 0 0 -factor x0 ytop`. Everything drawn inside stays in raw scene
 * coordinates — paths, image placement `cm`s and shading `Coords` all ride
 * that same transform. Text needs one extra trick: `Tf` keeps the plain
 * (positive) size, and `Tm` carries a `1 0 0 -1 x y` flip that cancels the
 * page transform's vertical flip so glyphs come out upright — scaling the
 * size again in `Tm` would double it.
 */

type GradientPaint = Extract<
  ScenePaint,
  { kind: "linear" } | { kind: "radial" }
>;

const PAPER_SIZES_MM: Record<PrintPaper, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

/** Shares font, ExtGState, shading and image objects across every page. */
class ResourcePool {
  private readonly writer: PdfDocumentWriter;
  private readonly decodeImage: DecodeImage;
  private readonly fonts = new Map<
    PdfStandardFont,
    { id: PdfRef; name: string }
  >();
  private readonly extGStates = new Map<string, { id: PdfRef; name: string }>();
  private readonly shadings = new Map<string, { id: PdfRef; name: string }>();
  private readonly images = new Map<string, { id: PdfRef; name: string }>();
  private fontCounter = 0;
  private gsCounter = 0;
  private shadingCounter = 0;
  private imageCounter = 0;

  constructor(writer: PdfDocumentWriter, decodeImage: DecodeImage) {
    this.writer = writer;
    this.decodeImage = decodeImage;
  }

  font(font: PdfStandardFont): { id: PdfRef; name: string } {
    const existing = this.fonts.get(font);
    if (existing) return existing;
    this.fontCounter += 1;
    const id = this.writer.allocate();
    const entry = { id, name: `F${this.fontCounter}` };
    this.writer.writeObject(
      id,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`,
    );
    this.fonts.set(font, entry);
    return entry;
  }

  extGState(opacity: number): { id: PdfRef; name: string } {
    const clamped = Math.max(0, Math.min(1, opacity));
    const key = fmt(clamped);
    const existing = this.extGStates.get(key);
    if (existing) return existing;
    this.gsCounter += 1;
    const id = this.writer.allocate();
    const entry = { id, name: `G${this.gsCounter}` };
    this.writer.writeObject(id, `<< /Type /ExtGState /ca ${key} /CA ${key} >>`);
    this.extGStates.set(key, entry);
    return entry;
  }

  shading(paint: GradientPaint): { id: PdfRef; name: string } {
    const key = JSON.stringify(paint, (_key, value) =>
      typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
    );
    const existing = this.shadings.get(key);
    if (existing) return existing;

    const [r0, g0, b0] = hexToRgb01(paint.from);
    const [r1, g1, b1] = hexToRgb01(paint.to);
    const functionId = this.writer.allocate();
    this.writer.writeObject(
      functionId,
      `<< /FunctionType 2 /Domain [0 1] /C0 [${fmt(r0)} ${fmt(g0)} ${fmt(b0)}] /C1 [${fmt(r1)} ${fmt(g1)} ${fmt(b1)}] /N 1 >>`,
    );

    const coords =
      paint.kind === "linear"
        ? `[${fmt(paint.x1)} ${fmt(paint.y1)} ${fmt(paint.x2)} ${fmt(paint.y2)}]`
        : `[${fmt(paint.cx)} ${fmt(paint.cy)} 0 ${fmt(paint.cx)} ${fmt(paint.cy)} ${fmt(paint.r)}]`;
    const shadingType = paint.kind === "linear" ? 2 : 3;

    this.shadingCounter += 1;
    const id = this.writer.allocate();
    const entry = { id, name: `Sh${this.shadingCounter}` };
    this.writer.writeObject(
      id,
      `<< /ShadingType ${shadingType} /ColorSpace /DeviceRGB /Coords ${coords} /Function ${functionId} 0 R /Extend [true true] >>`,
    );
    this.shadings.set(key, entry);
    return entry;
  }

  async image(
    node: SceneImageNode,
  ): Promise<{ id: PdfRef; name: string } | null> {
    const existing = this.images.get(node.href);
    if (existing) return existing;

    const decoded = await this.decodeImage(node.href);
    if (!decoded || decoded.width <= 0 || decoded.height <= 0) return null;

    const { rgb, alpha } = splitRgba(
      decoded.data,
      decoded.width,
      decoded.height,
    );
    const rgbPayload = await compressStream(rgb);
    const alphaPayload = await compressStream(alpha);

    const smaskId = this.writer.allocate();
    this.writer.writeStreamObject(
      smaskId,
      `/Type /XObject /Subtype /Image /Width ${decoded.width} /Height ${decoded.height} /ColorSpace /DeviceGray /BitsPerComponent 8`,
      alphaPayload,
    );
    const imageId = this.writer.allocate();
    this.writer.writeStreamObject(
      imageId,
      `/Type /XObject /Subtype /Image /Width ${decoded.width} /Height ${decoded.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${smaskId} 0 R`,
      rgbPayload,
    );

    this.imageCounter += 1;
    const entry = { id: imageId, name: `Im${this.imageCounter}` };
    this.images.set(node.href, entry);
    return entry;
  }

  resourcesDict(): string {
    const sections: string[] = [];
    if (this.fonts.size > 0) {
      const entries = [...this.fonts.values()]
        .map((f) => `/${f.name} ${f.id} 0 R`)
        .join(" ");
      sections.push(`/Font << ${entries} >>`);
    }
    if (this.extGStates.size > 0) {
      const entries = [...this.extGStates.values()]
        .map((g) => `/${g.name} ${g.id} 0 R`)
        .join(" ");
      sections.push(`/ExtGState << ${entries} >>`);
    }
    if (this.shadings.size > 0) {
      const entries = [...this.shadings.values()]
        .map((s) => `/${s.name} ${s.id} 0 R`)
        .join(" ");
      sections.push(`/Shading << ${entries} >>`);
    }
    if (this.images.size > 0) {
      const entries = [...this.images.values()]
        .map((i) => `/${i.name} ${i.id} 0 R`)
        .join(" ");
      sections.push(`/XObject << ${entries} >>`);
    }
    return `<< ${sections.join(" ")} >>`;
  }
}

function pathOps(commands: readonly PathCommand[]): string {
  const ops: string[] = [];
  for (const command of commands) {
    switch (command[0]) {
      case "M":
        ops.push(`${fmt(command[1])} ${fmt(command[2])} m`);
        break;
      case "L":
        ops.push(`${fmt(command[1])} ${fmt(command[2])} l`);
        break;
      case "C":
        ops.push(
          `${fmt(command[1])} ${fmt(command[2])} ${fmt(command[3])} ${fmt(command[4])} ${fmt(command[5])} ${fmt(command[6])} c`,
        );
        break;
      case "Z":
        ops.push("h");
        break;
    }
  }
  return ops.join("\n");
}

function renderPathNode(node: ScenePathNode, pool: ResourcePool): string {
  const opacity = node.opacity ?? 1;
  const gs = opacity < 1 ? pool.extGState(opacity) : null;
  const gsOp = gs ? `/${gs.name} gs` : null;
  const ops = pathOps(node.d);
  const paintOp = node.fillRule === "evenodd" ? "f*" : "f";

  if (node.fill.kind === "solid") {
    const [r, g, b] = hexToRgb01(node.fill.color);
    return ["q", gsOp, `${fmt(r)} ${fmt(g)} ${fmt(b)} rg`, ops, paintOp, "Q"]
      .filter((line): line is string => line !== null)
      .join("\n");
  }

  // Gradients: clip to the path, then paint the shading across the clip.
  const clipOp = node.fillRule === "evenodd" ? "W* n" : "W n";
  const shading = pool.shading(node.fill);
  return ["q", ops, clipOp, gsOp, `/${shading.name} sh`, "Q"]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function renderTextNode(node: SceneTextNode, pool: ResourcePool): string {
  const fontName = fontForFrame(node.font, node.weight);
  const font = pool.font(fontName);
  const codes = encodeWinAnsi(node.text);
  const unitWidth = measureCodesAtUnitSize(codes, fontName);
  const spacingTotal = node.letterSpacing * Math.max(0, codes.length - 1);

  let size = node.size;
  const naturalWidth = unitWidth * size + spacingTotal;
  if (unitWidth > 0 && naturalWidth > node.maxWidth) {
    const available = node.maxWidth - spacingTotal;
    size = available > 0 ? available / unitWidth : node.size * 0.01;
  }
  const finalWidth = unitWidth * size + spacingTotal;

  const startX = node.x - finalWidth / 2;
  const baselineY = node.y + 0.35 * node.size;
  const [r, g, b] = hexToRgb01(node.color);

  return [
    "BT",
    `/${font.name} ${fmt(size)} Tf`,
    `${fmt(r)} ${fmt(g)} ${fmt(b)} rg`,
    `${fmt(node.letterSpacing)} Tc`,
    `1 0 0 -1 ${fmt(startX)} ${fmt(baselineY)} Tm`,
    `(${pdfEscapeText(node.text)}) Tj`,
    "ET",
  ].join("\n");
}

async function renderImageNode(
  node: SceneImageNode,
  pool: ResourcePool,
): Promise<string> {
  const image = await pool.image(node);
  if (!image) return ""; // No decoder, or the logo failed to decode: skip it.
  return [
    "q",
    `${fmt(node.width)} 0 0 ${fmt(-node.height)} ${fmt(node.x)} ${fmt(node.y + node.height)} cm`,
    `/${image.name} Do`,
    "Q",
  ].join("\n");
}

/** Places `scene` (module units, y down) at `x0Pt`/`ytopPt` (page points, y up). */
async function renderSceneContent(
  scene: Scene,
  transform: { factor: number; x0Pt: number; ytopPt: number },
  pool: ResourcePool,
): Promise<string> {
  const lines: string[] = [
    "q",
    `${fmt(transform.factor)} 0 0 ${fmt(-transform.factor)} ${fmt(transform.x0Pt)} ${fmt(transform.ytopPt)} cm`,
  ];
  for (const node of scene.nodes) {
    if (node.type === "path") lines.push(renderPathNode(node, pool));
    else if (node.type === "text") lines.push(renderTextNode(node, pool));
    else lines.push(await renderImageNode(node, pool));
  }
  lines.push("Q");
  return lines.join("\n");
}

function infoDict(title: string | undefined): string {
  const parts = [`/Producer (${pdfEscapeText("Kardo")})`];
  if (title) parts.push(`/Title (${pdfEscapeText(title)})`);
  parts.push(`/CreationDate (${pdfDate(new Date())})`);
  return `<< ${parts.join(" ")} >>`;
}

/** Vector PDF of one design at `widthMm` wide (height keeps the ratio). */
export async function sceneToPdf(
  scene: Scene,
  options: { widthMm: number; title?: string; decodeImage?: DecodeImage },
): Promise<Blob> {
  const widthPt = mmToPt(options.widthMm);
  const factor = scene.width > 0 ? widthPt / scene.width : 1;
  const heightPt = scene.height * factor;

  const writer = new PdfDocumentWriter();
  const pool = new ResourcePool(
    writer,
    options.decodeImage ?? decodeImageInBrowser,
  );

  const content = await renderSceneContent(
    scene,
    { factor, x0Pt: 0, ytopPt: heightPt },
    pool,
  );
  const contentPayload = await compressStream(latin1Bytes(content));

  const contentId = writer.allocate();
  writer.writeStreamObject(contentId, "", contentPayload);

  const resourcesId = writer.allocate();
  const pageId = writer.allocate();
  const pagesId = writer.allocate();
  const catalogId = writer.allocate();
  const infoId = writer.allocate();

  writer.writeObject(resourcesId, pool.resourcesDict());
  writer.writeObject(
    pageId,
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(widthPt)} ${fmt(heightPt)}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
  );
  writer.writeObject(
    pagesId,
    `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`,
  );
  writer.writeObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  writer.writeObject(infoId, infoDict(options.title));

  const bytes = writer.finish(catalogId, infoId);
  return new Blob([bytes], { type: "application/pdf" });
}

function truncateToFit(
  text: string,
  font: PdfStandardFont,
  sizePt: number,
  maxWidthPt: number,
): string {
  if (measureCodes(encodeWinAnsi(text), font, sizePt, 0) <= maxWidthPt)
    return text;
  const chars = Array.from(text);
  for (let end = chars.length - 1; end > 0; end -= 1) {
    const candidate = `${chars.slice(0, end).join("")}…`;
    if (measureCodes(encodeWinAnsi(candidate), font, sizePt, 0) <= maxWidthPt) {
      return candidate;
    }
  }
  return "…";
}

function cropMarksOps(
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  pageHeightPt: number,
): string {
  const gapPt = mmToPt(1);
  const lenPt = mmToPt(3);
  const toDevice = (fromTopMm: number, fromLeftMm: number) => ({
    x: mmToPt(fromLeftMm),
    y: pageHeightPt - mmToPt(fromTopMm),
  });
  const corners: { x: number; y: number; outX: 1 | -1; outY: 1 | -1 }[] = [
    { ...toDevice(yMm, xMm), outX: -1, outY: 1 },
    { ...toDevice(yMm, xMm + widthMm), outX: 1, outY: 1 },
    { ...toDevice(yMm + heightMm, xMm), outX: -1, outY: -1 },
    { ...toDevice(yMm + heightMm, xMm + widthMm), outX: 1, outY: -1 },
  ];

  const lines = ["q", "0.25 w", "0 0 0 RG"];
  for (const corner of corners) {
    const hx1 = corner.x + corner.outX * gapPt;
    const hx2 = corner.x + corner.outX * (gapPt + lenPt);
    lines.push(
      `${fmt(hx1)} ${fmt(corner.y)} m ${fmt(hx2)} ${fmt(corner.y)} l S`,
    );
    const vy1 = corner.y + corner.outY * gapPt;
    const vy2 = corner.y + corner.outY * (gapPt + lenPt);
    lines.push(
      `${fmt(corner.x)} ${fmt(vy1)} m ${fmt(corner.x)} ${fmt(vy2)} l S`,
    );
  }
  lines.push("Q");
  return lines.join("\n");
}

const CAPTION_FONT: PdfStandardFont = "Helvetica";
const CAPTION_SIZE_PT = 8.5;
const CAPTION_GAP_MM = 1.5;
const CAPTION_BAND_MM = 4.5;
const CELL_GAP_MM = 6;

/** Print sheet: many designs on A4/Letter pages with captions and crop marks. */
export async function scenesToSheetPdf(
  items: readonly { scene: Scene; caption: string }[],
  options: {
    paper: PrintPaper;
    widthMm: number;
    marginMm?: number;
    cropMarks?: boolean;
    title?: string;
    decodeImage?: DecodeImage;
  },
): Promise<Blob> {
  const marginMm = options.marginMm ?? 10;
  const cropMarks = options.cropMarks ?? true;
  const paper = PAPER_SIZES_MM[options.paper];
  const pageWidthPt = mmToPt(paper.width);
  const pageHeightPt = mmToPt(paper.height);
  const cellWidthMm = options.widthMm;

  const designHeightsMm = items.map(
    (item) => cellWidthMm * (item.scene.height / Math.max(1, item.scene.width)),
  );
  const maxDesignHeightMm =
    designHeightsMm.length > 0 ? Math.max(...designHeightsMm) : cellWidthMm;
  const cellHeightMm = maxDesignHeightMm + CAPTION_GAP_MM + CAPTION_BAND_MM;

  const usableWidthMm = Math.max(paper.width - 2 * marginMm, cellWidthMm);
  const usableHeightMm = Math.max(paper.height - 2 * marginMm, cellHeightMm);
  const cols = Math.max(
    1,
    Math.floor((usableWidthMm + CELL_GAP_MM) / (cellWidthMm + CELL_GAP_MM)),
  );
  const rows = Math.max(
    1,
    Math.floor((usableHeightMm + CELL_GAP_MM) / (cellHeightMm + CELL_GAP_MM)),
  );
  const perPage = Math.max(1, cols * rows);
  const pageCount = items.length === 0 ? 1 : Math.ceil(items.length / perPage);

  const writer = new PdfDocumentWriter();
  const pool = new ResourcePool(
    writer,
    options.decodeImage ?? decodeImageInBrowser,
  );

  const resourcesId = writer.allocate();
  const pagesId = writer.allocate();
  const catalogId = writer.allocate();
  const infoId = writer.allocate();
  const pageIds: PdfRef[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageItems = items.slice(
      pageIndex * perPage,
      pageIndex * perPage + perPage,
    );
    const lines: string[] = [];

    for (let i = 0; i < pageItems.length; i += 1) {
      const item = pageItems[i];
      if (!item) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const xMm = marginMm + col * (cellWidthMm + CELL_GAP_MM);
      const yMm = marginMm + row * (cellHeightMm + CELL_GAP_MM);
      const designHeightMm =
        cellWidthMm * (item.scene.height / Math.max(1, item.scene.width));

      const x0Pt = mmToPt(xMm);
      const ytopPt = pageHeightPt - mmToPt(yMm);
      const factor =
        item.scene.width > 0 ? mmToPt(cellWidthMm) / item.scene.width : 1;
      lines.push(
        await renderSceneContent(item.scene, { factor, x0Pt, ytopPt }, pool),
      );

      const font = pool.font(CAPTION_FONT);
      const captionMaxWidthPt = mmToPt(cellWidthMm);
      const captionText = truncateToFit(
        item.caption,
        CAPTION_FONT,
        CAPTION_SIZE_PT,
        captionMaxWidthPt,
      );
      const captionWidthPt = measureCodes(
        encodeWinAnsi(captionText),
        CAPTION_FONT,
        CAPTION_SIZE_PT,
        0,
      );
      const captionCenterXPt = x0Pt + mmToPt(cellWidthMm) / 2;
      const captionBandTopPt =
        pageHeightPt - mmToPt(yMm + maxDesignHeightMm + CAPTION_GAP_MM);
      const captionBaselineYPt = captionBandTopPt - CAPTION_SIZE_PT * 0.8;
      lines.push(
        [
          "BT",
          `/${font.name} ${fmt(CAPTION_SIZE_PT)} Tf`,
          "0.35 0.35 0.35 rg",
          `1 0 0 1 ${fmt(captionCenterXPt - captionWidthPt / 2)} ${fmt(captionBaselineYPt)} Tm`,
          `(${pdfEscapeText(captionText)}) Tj`,
          "ET",
        ].join("\n"),
      );

      if (cropMarks) {
        lines.push(
          cropMarksOps(xMm, yMm, cellWidthMm, designHeightMm, pageHeightPt),
        );
      }
    }

    const contentPayload: StreamPayload = await compressStream(
      latin1Bytes(`${lines.join("\n")}\n`),
    );
    const contentId = writer.allocate();
    writer.writeStreamObject(contentId, "", contentPayload);

    const pageId = writer.allocate();
    pageIds.push(pageId);
    writer.writeObject(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${fmt(pageWidthPt)} ${fmt(pageHeightPt)}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
    );
  }

  writer.writeObject(
    pagesId,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );
  writer.writeObject(resourcesId, pool.resourcesDict());
  writer.writeObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  writer.writeObject(infoId, infoDict(options.title));

  const bytes = writer.finish(catalogId, infoId);
  return new Blob([bytes], { type: "application/pdf" });
}
