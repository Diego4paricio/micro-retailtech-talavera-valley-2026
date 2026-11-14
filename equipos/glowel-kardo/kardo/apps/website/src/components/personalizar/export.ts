import type { PieceId } from "@/content/pieces";
import { pieceById } from "@/content/pieces";
import { logoSvgMarkup } from "../Logo";
import { type Design, fontById, uiFont } from "./design";
import { pieceSize, type Side } from "./PieceArt";

/*
  The downloaded image: one sheet with every face of the chosen pieces and
  what Kardo needs to make them (colors, type, texts). Each face is the same
  SVG as the preview, with its two fonts embedded (an SVG drawn as an image
  cannot use the page's fonts), drawn on a canvas. Everything stays in the
  browser and uses data: URLs, which the site's CSP allows.
*/

const fontCache = new Map<string, Promise<string>>();

function fontData(file: string): Promise<string> {
  let pending = fontCache.get(file);
  if (!pending) {
    pending = fetch(`/media/personalizar/fonts/${file}`)
      .then((response) => {
        if (!response.ok) throw new Error(file);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return `data:font/woff2;base64,${btoa(binary)}`;
      });
    fontCache.set(file, pending);
  }
  return pending;
}

async function fontFaces(design: Design): Promise<string> {
  const brand = fontById(design.brand.font);
  const faces = await Promise.all(
    brand.files.map(
      async ({ weight, file }) =>
        `@font-face{font-family:KardoBrand;font-weight:${weight};src:url(${await fontData(file)}) format("woff2")}`,
    ),
  );
  const ui = await fontData(uiFont.file);
  faces.push(
    `@font-face{font-family:KardoUi;font-weight:100 1000;src:url(${ui}) format("woff2")}`,
  );
  return faces.join("");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("svg"));
    image.src = src;
  });
}

function svgToDataUrl(markup: string): string {
  const bytes = new TextEncoder().encode(markup);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** One face as an image, from the drawing already on the page. */
async function faceImage(
  svg: SVGSVGElement,
  faces: string,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");
  for (const text of clone.querySelectorAll<SVGTextElement>("[data-font]")) {
    text.style.fontFamily =
      text.dataset.font === "brand" ? "KardoBrand" : "KardoUi";
  }
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = faces;
  clone.insertBefore(style, clone.firstChild);
  const markup = new XMLSerializer().serializeToString(clone);
  const image = await loadImage(svgToDataUrl(markup));
  // Safari paints an SVG image's fonts a moment after onload.
  if (typeof image.decode === "function") await image.decode().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 60));
  return image;
}

export interface SheetFace {
  piece: PieceId;
  side: Side;
  svg: SVGSVGElement;
}

export interface SheetInfo {
  design: Design;
  title: string;
  subtitle: string;
  /** Label and value rows under the pieces. */
  rows: [string, string][];
  footer: string;
  families: { display: string; ui: string };
}

function wrapCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The whole sheet as a PNG blob. */
export async function renderSheet(
  facesToDraw: SheetFace[],
  info: SheetInfo,
): Promise<Blob> {
  const faces = await fontFaces(info.design);
  const W = 2400;
  const margin = 140;
  const gap = 90;
  const totalMm = facesToDraw.reduce(
    (sum, face) => sum + pieceSize[face.piece].width,
    0,
  );
  const tallestMm = Math.max(
    ...facesToDraw.map((face) => pieceSize[face.piece].height),
  );
  const available = W - margin * 2 - gap * (facesToDraw.length - 1);
  // Pixels per millimeter: as big as the row allows, at most ~300 dpi.
  const scale = Math.min(11.8, available / totalMm, 1500 / tallestMm);

  const images = await Promise.all(
    facesToDraw.map((face) => {
      const size = pieceSize[face.piece];
      return faceImage(
        face.svg,
        faces,
        Math.round(size.width * scale),
        Math.round(size.height * scale),
      );
    }),
  );

  // Measure the text block first to size the canvas.
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("canvas");
  probe.font = `400 34px ${info.families.ui}`;
  const valueWidth = W - margin * 2 - 420;
  const rowLines = info.rows.map(([, value]) =>
    wrapCanvas(probe, value, valueWidth),
  );
  const rowsHeight = rowLines.reduce(
    (sum, lines) => sum + lines.length * 48 + 26,
    0,
  );
  const headerH = 360;
  const piecesH = Math.round(tallestMm * scale) + 120;
  const H = headerH + piecesH + 80 + rowsHeight + 200;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#F7F5F0";
  ctx.fillRect(0, 0, W, H);

  // Header: Kardo, the business and what it is for.
  const logo = await loadImage(svgToDataUrl(logoSvgMarkup("light")));
  ctx.drawImage(logo, margin, 110, 190, 190 * (68 / 202.56));
  ctx.fillStyle = "#16232E";
  ctx.font = `600 64px ${info.families.display}`;
  ctx.textAlign = "right";
  ctx.fillText(info.title, W - margin, 150);
  ctx.font = `400 34px ${info.families.ui}`;
  ctx.fillStyle = "#52646D";
  ctx.fillText(info.subtitle, W - margin, 205);
  ctx.textAlign = "left";
  ctx.fillStyle = "#E2E0D8";
  ctx.fillRect(margin, headerH - 60, W - margin * 2, 2);

  // The faces, bottom aligned, with their name under each one.
  const rowWidth =
    images.reduce((sum, image) => sum + image.width, 0) +
    gap * (images.length - 1);
  let x = (W - rowWidth) / 2;
  const baseline = headerH + Math.round(tallestMm * scale);
  images.forEach((image, index) => {
    const face = facesToDraw[index] as SheetFace;
    const y = baseline - image.height;
    // WebKit casts a canvas shadow under every shape inside an SVG image, so
    // the face goes to a bitmap first and only its outline gets the shadow.
    const flat = document.createElement("canvas");
    flat.width = image.width;
    flat.height = image.height;
    flat.getContext("2d")?.drawImage(image, 0, 0, image.width, image.height);
    ctx.save();
    ctx.shadowColor = "rgba(22, 35, 46, 0.18)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.drawImage(flat, x, y, image.width, image.height);
    ctx.restore();
    const piece = pieceById(face.piece);
    ctx.fillStyle = "#16232E";
    ctx.font = `600 32px ${info.families.ui}`;
    ctx.textAlign = "center";
    const label =
      face.piece === "card"
        ? `${piece?.name ?? ""}, ${face.side === "front" ? "frente" : "reverso"}`
        : (piece?.name ?? "");
    ctx.fillText(label, x + image.width / 2, baseline + 62);
    ctx.font = `400 28px ${info.families.ui}`;
    ctx.fillStyle = "#52646D";
    ctx.fillText(piece?.measure ?? "", x + image.width / 2, baseline + 102);
    ctx.textAlign = "left";
    x += image.width + gap;
  });

  // Details.
  let y = headerH + piecesH + 80;
  ctx.fillStyle = "#E2E0D8";
  ctx.fillRect(margin, y - 50, W - margin * 2, 2);
  info.rows.forEach(([label, value], index) => {
    ctx.font = `600 34px ${info.families.ui}`;
    ctx.fillStyle = "#16232E";
    ctx.fillText(label, margin, y);
    ctx.font = `400 34px ${info.families.ui}`;
    ctx.fillStyle = "#33444D";
    const lines = rowLines[index] ?? [];
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, margin + 420, y + lineIndex * 48);
    });
    // Color swatches next to the hex values.
    const hexes = value.match(/#[0-9A-F]{6}/gi);
    if (label === "Colores" && hexes) {
      ctx.font = `400 34px ${info.families.ui}`;
      const textWidth = ctx.measureText(lines[0] ?? "").width;
      hexes.forEach((hex, hexIndex) => {
        const cx = margin + 420 + textWidth + 50 + hexIndex * 64;
        ctx.beginPath();
        ctx.arc(cx, y - 12, 22, 0, Math.PI * 2);
        ctx.fillStyle = hex;
        ctx.fill();
        ctx.strokeStyle = "rgba(22, 35, 46, 0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
    y += lines.length * 48 + 26;
  });

  ctx.font = `400 28px ${info.families.ui}`;
  ctx.fillStyle = "#6B7B83";
  ctx.fillText(info.footer, margin, H - 110);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("png"))),
      "image/png",
    );
  });
}

/** Saves a blob through a data: link (the CSP does not allow blob: URLs). */
export async function downloadBlob(blob: Blob, name: string): Promise<void> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** File name from the business name: "kardo-cafe-central.png". */
export function fileName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `kardo-${slug || "diseno"}.png`;
}
