import QRCode from "qrcode";

/*
  SVG text does not wrap, so every line of a piece is measured here, with the
  same font the browser paints: the size shrinks until the text fits its
  box, and it breaks into lines by words. On the server there is no canvas,
  so widths are estimated; the browser measures again once the fonts load.
*/

export interface TextBox {
  text: string;
  /** CSS font-family list, already resolved (not a var()). */
  family: string;
  weight: 400 | 600;
  /** Largest and smallest size, in the drawing's units (mm). */
  size: number;
  minSize: number;
  maxWidth: number;
  maxLines: number;
  /** In em, like CSS letter-spacing. */
  letterSpacing?: number;
}

export interface FittedText {
  lines: string[];
  size: number;
}

let context: CanvasRenderingContext2D | null | undefined;

function canvas(): CanvasRenderingContext2D | null {
  if (context !== undefined) return context;
  context =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  return context;
}

/** Width of one line at `size`, letter spacing included. */
export function textWidth(
  text: string,
  size: number,
  weight: 400 | 600,
  family: string,
  letterSpacing = 0,
): number {
  const spacing = letterSpacing * size * Math.max(0, [...text].length - 1);
  const ctx = canvas();
  if (!ctx || family.includes("var(")) {
    return [...text].length * size * (weight === 600 ? 0.58 : 0.53) + spacing;
  }
  ctx.font = `${weight} 100px ${family}`;
  return (ctx.measureText(text).width / 100) * size + spacing;
}

function wrap(box: TextBox, size: number): string[] {
  const words = box.text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    const width = textWidth(
      next,
      size,
      box.weight,
      box.family,
      box.letterSpacing,
    );
    if (line && width > box.maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fits(box: TextBox, size: number, lines: string[]): boolean {
  return (
    lines.length <= box.maxLines &&
    lines.every(
      (line) =>
        textWidth(line, size, box.weight, box.family, box.letterSpacing) <=
        box.maxWidth,
    )
  );
}

/** The biggest size where the text fits, broken into lines. */
export function fitText(box: TextBox): FittedText {
  if (!box.text.trim()) return { lines: [], size: box.size };
  const step = Math.max(0.05, (box.size - box.minSize) / 24);
  for (let size = box.size; size >= box.minSize - 1e-6; size -= step) {
    const lines = wrap(box, size);
    if (fits(box, size, lines)) return { lines, size };
  }
  // Too long even at the smallest size: keep the first lines, and squeeze
  // the last one with an ellipsis so it stays inside the piece.
  const size = box.minSize;
  const lines = wrap(box, size).slice(0, box.maxLines);
  const last = lines.length - 1;
  if (last >= 0) {
    let text = lines[last] as string;
    while (
      text.length > 1 &&
      textWidth(`${text}…`, size, box.weight, box.family, box.letterSpacing) >
        box.maxWidth
    ) {
      text = text.slice(0, -1);
    }
    if (text !== lines[last] || wrap(box, size).length > box.maxLines) {
      lines[last] = `${text.trimEnd()}…`;
    }
  }
  return { lines, size };
}

// QR -------------------------------------------------------------------------

const qrCache = new Map<string, { d: string; modules: number }>();

/**
 * Plain square modules, as the workshop prints them: one path in module
 * units (0..modules), without the quiet zone (the tile gives the margin).
 */
export function qrPath(text: string): { d: string; modules: number } {
  const cached = qrCache.get(text);
  if (cached) return cached;
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const parts: string[] = [];
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (qr.modules.data[y * n + x] !== 1) {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < n && qr.modules.data[y * n + x + run] === 1) run += 1;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  const result = { d: parts.join(""), modules: n };
  qrCache.set(text, result);
  return result;
}
