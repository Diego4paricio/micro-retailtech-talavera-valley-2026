import { glyphWidths } from "./glyph-widths.js";

/**
 * Text measuring for canvas covers. A canvas places every block at a fixed
 * y, so a title's height has to be known before the phrase under it is
 * placed: these wrap the text the way the browser does, with the real
 * glyph widths of its font (`glyphWidths`).
 */

const FALLBACK_EM = 0.56;

function wordWidth(word: string, table: Record<string, number>, size: number) {
  let width = 0;
  for (const char of word) width += table[char] ?? FALLBACK_EM;
  return width * size;
}

/** `font` is a key of `glyphWidths` ("cormorant-600"). `letterSpacing` in
 * hundredths of an em, as the design's style writes it. */
export function wrapLines(
  text: string,
  font: string,
  size: number,
  width: number,
  letterSpacing = 0,
): number {
  const table = glyphWidths[font] ?? {};
  const spacing = (letterSpacing / 100) * size;
  const space = (table[" "] ?? 0.25) * size + spacing;
  let lines = 1;
  let line = 0;
  for (const word of text.trim().split(/\s+/)) {
    const next = wordWidth(word, table, size) + spacing * [...word].length;
    if (line > 0 && line + space + next > width) {
      lines++;
      line = next;
    } else line += (line > 0 ? space : 0) + next;
  }
  return lines;
}

/** The widest single word, so a box is never narrower than it. */
export function longestWord(text: string, font: string, size: number): number {
  const table = glyphWidths[font] ?? {};
  return Math.max(
    0,
    ...text
      .trim()
      .split(/\s+/)
      .map((word) => wordWidth(word, table, size)),
  );
}

/**
 * The narrowest width that keeps the same number of lines, so a title in
 * two lines breaks evenly («Taquería / Don Beto», never «Taquería Don /
 * Beto»).
 */
export function balancedWidth(
  text: string,
  font: string,
  size: number,
  width: number,
  letterSpacing = 0,
): number {
  const lines = wrapLines(text, font, size, width, letterSpacing);
  if (lines < 2) return width;
  let low = Math.max(
    Math.round(width / lines),
    Math.ceil(longestWord(text, font, size)),
  );
  let high = width;
  while (high - low > 2) {
    const middle = Math.round((low + high) / 2);
    if (wrapLines(text, font, size, middle, letterSpacing) <= lines)
      high = middle;
    else low = middle;
  }
  return Math.min(width, high + 8);
}

/** The largest size, from `sizes`, that keeps the text within `maxLines`
 * (the last one otherwise). */
export function fitSize(
  text: string,
  font: string,
  sizes: readonly number[],
  width: number,
  maxLines: number,
  letterSpacing = 0,
): number {
  return (
    sizes.find(
      (size) => wrapLines(text, font, size, width, letterSpacing) <= maxLines,
    ) ??
    sizes[sizes.length - 1] ??
    32
  );
}

/** The first letter of a business's name, for a monogram ("La Esquina" →
 * "E"). */
export function initialOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(la|el|los|las|de|del|y|the)$/i.test(word));
  return (words[0]?.[0] ?? name.trim()[0] ?? "K").toLocaleUpperCase("es-MX");
}
