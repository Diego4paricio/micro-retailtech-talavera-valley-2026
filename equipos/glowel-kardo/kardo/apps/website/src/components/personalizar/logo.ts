/*
  The visitor's logo, prepared in the browser (nothing is uploaded): read as
  a data URL (the CSP allows data: images, not blob:), drawn at most 1200 px
  on its long side, optionally without the white background around it, and
  trimmed to its content so it sits centered on the piece.
*/

export const maxLogoBytes = 5 * 1024 * 1024;
const maxSide = 1200;

export interface PreparedLogo {
  /** PNG data URL, trimmed. */
  dataUrl: string;
  ratio: number;
  /** Mostly dark artwork: on a dark piece it needs the light plate. */
  dark: boolean;
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = src;
  });
}

/**
 * The file as a PNG data URL of at most 1200 px, before any change. It is
 * what gets saved, so the white background can be removed or put back.
 */
export async function logoSource(file: File): Promise<string> {
  const image = await loadImage(await readFile(file));
  // An SVG without width and height reports 0 or 150: draw it big.
  const w = image.naturalWidth || 1000;
  const h = image.naturalHeight || 1000;
  const isSvg = file.type === "image/svg+xml";
  const scale = isSvg
    ? maxSide / Math.max(w, h)
    : Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

const isNearWhite = (r: number, g: number, b: number) =>
  Math.min(r, g, b) > 226 && Math.max(r, g, b) - Math.min(r, g, b) < 24;

/** Removes the background, trims and measures a logo from logoSource. */
export async function prepareLogo(
  source: string,
  removeWhite: boolean,
): Promise<PreparedLogo> {
  const image = await loadImage(source);
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h);
  const data = pixels.data;

  // The white that touches the edges is background; white inside the logo
  // (a letter's counter, a white stroke) stays.
  const background = new Uint8Array(w * h);
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    const i = y * w + x;
    if (background[i]) return;
    const o = i * 4;
    const transparent = (data[o + 3] as number) < 12;
    const white = isNearWhite(
      data[o] as number,
      data[o + 1] as number,
      data[o + 2] as number,
    );
    if (!transparent && !white) return;
    background[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x += 1) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    visit(0, y);
    visit(w - 1, y);
  }
  while (queue.length) {
    const i = queue.pop() as number;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) visit(x - 1, y);
    if (x < w - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < h - 1) visit(x, y + 1);
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let light = 0;
  let count = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const o = i * 4;
      if (background[i]) {
        if (removeWhite) data[o + 3] = 0;
        continue;
      }
      if ((data[o + 3] as number) < 12) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      light +=
        (0.2126 * (data[o] as number) +
          0.7152 * (data[o + 1] as number) +
          0.0722 * (data[o + 2] as number)) /
        255;
      count += 1;
    }
  }
  if (maxX < 0) {
    // Nothing but background: keep the image as it came.
    return { dataUrl: source, ratio: w / h, dark: false };
  }
  ctx.putImageData(pixels, 0, 0);
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("canvas");
  // Without removeWhite the white inside the trimmed box stays as it was.
  octx.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return {
    dataUrl: out.toDataURL("image/png"),
    ratio: tw / th,
    dark: count > 0 && light / count < 0.35,
  };
}
