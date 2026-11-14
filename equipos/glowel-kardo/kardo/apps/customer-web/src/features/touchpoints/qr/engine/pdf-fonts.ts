import type { QrFrameFont } from "@kardo/contracts";

/**
 * Standard PDF Type1 fonts used by the vector PDF export, and their AFM
 * glyph metrics for the WinAnsiEncoding range (32–255). No embedding is
 * needed: every PDF viewer/printer ships these 14 fonts, so we only need
 * their advance widths (in 1000-unit em space) to center and shrink text
 * before drawing it with `Tf`/`Tj`.
 */
export type PdfStandardFont =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Times-Roman"
  | "Times-Bold"
  | "Courier"
  | "Courier-Bold";

/** Picks the standard font matching the scene's frame font + weight. */
export function fontForFrame(
  font: QrFrameFont,
  weight: 400 | 700,
): PdfStandardFont {
  const bold = weight >= 700;
  if (font === "serif") return bold ? "Times-Bold" : "Times-Roman";
  if (font === "mono") return bold ? "Courier-Bold" : "Courier";
  return bold ? "Helvetica-Bold" : "Helvetica";
}

export function isMonospacedFont(font: PdfStandardFont): boolean {
  return font === "Courier" || font === "Courier-Bold";
}

// ---------------------------------------------------------------------------
// WinAnsiEncoding
//
// Codes 32–126 match ASCII. Codes 160–255 coincide with the Unicode Latin-1
// Supplement block. Codes 128–159 are the Windows-1252 "smart punctuation"
// slots (curly quotes, dashes, ellipsis, …) whose Unicode code points live
// far outside that byte range, so they need an explicit lookup.
// ---------------------------------------------------------------------------

/** Unicode code point → WinAnsi byte, for the 128–159 slots we care about. */
const WIN_ANSI_SPECIALS: Readonly<Record<number, number>> = {
  8364: 0x80, // €
  402: 0x83, // ƒ
  8224: 0x86, // †
  8225: 0x87, // ‡
  710: 0x88, // ˆ
  8240: 0x89, // ‰
  352: 0x8a, // Š
  8249: 0x8b, // ‹
  338: 0x8c, // Œ
  381: 0x8e, // Ž
  8216: 0x91, // ‘
  8217: 0x92, // ’
  8220: 0x93, // “
  8221: 0x94, // ”
  8226: 0x95, // •
  8211: 0x96, // –
  8212: 0x97, // —
  732: 0x98, // ˜
  8482: 0x99, // ™
  353: 0x9a, // š
  8250: 0x9b, // ›
  339: 0x9c, // œ
  382: 0x9e, // ž
  376: 0x9f, // Ÿ
  8230: 0x85, // …
};

/** Resolves a Unicode code point to a WinAnsi byte, or `null` if unmapped. */
export function winAnsiCodeFor(codePoint: number): number | null {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return codePoint;
  const special = WIN_ANSI_SPECIALS[codePoint];
  if (special !== undefined) return special;
  // WinAnsi 0xA0–0xFF mirrors Unicode Latin-1 Supplement (0x00A0–0x00FF).
  if (codePoint >= 0xa0 && codePoint <= 0xff) return codePoint;
  return null;
}

/** Encodes text as WinAnsi byte codes; unmappable characters become "?". */
export function encodeWinAnsi(text: string): number[] {
  const codes: number[] = [];
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0x3f;
    codes.push(winAnsiCodeFor(codePoint) ?? 0x3f);
  }
  return codes;
}

/**
 * Renders text as a PDF literal-string body: `(`, `)` and `\` are escaped,
 * printable ASCII passes through, and every other WinAnsi byte becomes a
 * `\ddd` octal escape. The result only ever contains ASCII bytes, so it is
 * safe to append to a content stream built with a plain latin1 encoder.
 */
export function pdfEscapeText(text: string): string {
  let out = "";
  for (const code of encodeWinAnsi(text)) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += `\\${String.fromCharCode(code)}`;
    } else if (code >= 0x20 && code <= 0x7e) {
      out += String.fromCharCode(code);
    } else {
      out += `\\${code.toString(8).padStart(3, "0")}`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AFM widths (1000 units/em), Adobe's standard metrics for the 14 base fonts.
// ---------------------------------------------------------------------------

type WidthTable = Readonly<Record<number, number>>;

function widthsByChar(entries: Readonly<Record<string, number>>): WidthTable {
  const table: Record<number, number> = {};
  for (const [char, width] of Object.entries(entries)) {
    table[char.codePointAt(0) ?? 0] = width;
  }
  return table;
}

const HELVETICA_ASCII = widthsByChar({
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 222,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 556,
  "`": 222,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
});

const HELVETICA_BOLD_ASCII = widthsByChar({
  " ": 278,
  "!": 333,
  '"': 474,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 722,
  "'": 278,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 333,
  ";": 333,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 611,
  "@": 975,
  A: 722,
  B: 722,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 556,
  K: 722,
  L: 611,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 333,
  "\\": 278,
  "]": 333,
  "^": 584,
  _: 556,
  "`": 278,
  a: 556,
  b: 611,
  c: 556,
  d: 611,
  e: 556,
  f: 333,
  g: 611,
  h: 611,
  i: 278,
  j: 278,
  k: 556,
  l: 278,
  m: 889,
  n: 611,
  o: 611,
  p: 611,
  q: 611,
  r: 389,
  s: 556,
  t: 333,
  u: 611,
  v: 556,
  w: 778,
  x: 556,
  y: 556,
  z: 500,
  "{": 389,
  "|": 280,
  "}": 389,
  "~": 584,
});

const TIMES_ROMAN_ASCII = widthsByChar({
  " ": 250,
  "!": 333,
  '"': 408,
  "#": 500,
  $: 500,
  "%": 833,
  "&": 778,
  "'": 333,
  "(": 333,
  ")": 333,
  "*": 500,
  "+": 564,
  ",": 250,
  "-": 333,
  ".": 250,
  "/": 278,
  "0": 500,
  "1": 500,
  "2": 500,
  "3": 500,
  "4": 500,
  "5": 500,
  "6": 500,
  "7": 500,
  "8": 500,
  "9": 500,
  ":": 278,
  ";": 278,
  "<": 564,
  "=": 564,
  ">": 564,
  "?": 444,
  "@": 921,
  A: 722,
  B: 667,
  C: 667,
  D: 722,
  E: 611,
  F: 556,
  G: 722,
  H: 722,
  I: 333,
  J: 389,
  K: 722,
  L: 611,
  M: 889,
  N: 722,
  O: 722,
  P: 556,
  Q: 722,
  R: 667,
  S: 556,
  T: 611,
  U: 722,
  V: 722,
  W: 944,
  X: 722,
  Y: 722,
  Z: 611,
  "[": 333,
  "\\": 278,
  "]": 333,
  "^": 469,
  _: 500,
  "`": 333,
  a: 444,
  b: 500,
  c: 444,
  d: 500,
  e: 444,
  f: 333,
  g: 500,
  h: 500,
  i: 278,
  j: 278,
  k: 500,
  l: 278,
  m: 778,
  n: 500,
  o: 500,
  p: 500,
  q: 500,
  r: 333,
  s: 389,
  t: 278,
  u: 500,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
  "{": 480,
  "|": 200,
  "}": 480,
  "~": 541,
});

const TIMES_BOLD_ASCII = widthsByChar({
  " ": 250,
  "!": 333,
  '"': 555,
  "#": 500,
  $: 500,
  "%": 1000,
  "&": 833,
  "'": 333,
  "(": 333,
  ")": 333,
  "*": 500,
  "+": 570,
  ",": 250,
  "-": 333,
  ".": 250,
  "/": 278,
  "0": 500,
  "1": 500,
  "2": 500,
  "3": 500,
  "4": 500,
  "5": 500,
  "6": 500,
  "7": 500,
  "8": 500,
  "9": 500,
  ":": 333,
  ";": 333,
  "<": 570,
  "=": 570,
  ">": 570,
  "?": 500,
  "@": 930,
  A: 722,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 778,
  I: 389,
  J: 500,
  K: 778,
  L: 667,
  M: 944,
  N: 722,
  O: 778,
  P: 611,
  Q: 778,
  R: 722,
  S: 556,
  T: 667,
  U: 722,
  V: 722,
  W: 1000,
  X: 722,
  Y: 722,
  Z: 667,
  "[": 333,
  "\\": 278,
  "]": 333,
  "^": 581,
  _: 500,
  "`": 333,
  a: 500,
  b: 556,
  c: 444,
  d: 556,
  e: 444,
  f: 333,
  g: 500,
  h: 556,
  i: 278,
  j: 333,
  k: 556,
  l: 278,
  m: 833,
  n: 556,
  o: 500,
  p: 556,
  q: 556,
  r: 444,
  s: 389,
  t: 333,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
  "{": 394,
  "|": 220,
  "}": 394,
  "~": 520,
});

/** Extended (128–255) metrics that have no plain-ASCII base-letter analog. */
type ExtraSpecials = Readonly<Record<number, number>>;

const HELVETICA_SPECIALS: ExtraSpecials = {
  133: 1000,
  145: 222,
  146: 222,
  147: 333,
  148: 333,
  149: 350,
  150: 556,
  151: 1000,
  153: 1000,
  139: 333,
  155: 333,
  160: 278,
  161: 333,
  162: 556,
  163: 556,
  164: 556,
  165: 556,
  166: 260,
  167: 556,
  168: 333,
  169: 737,
  170: 370,
  171: 556,
  172: 584,
  173: 333,
  174: 737,
  175: 333,
  176: 400,
  177: 584,
  178: 333,
  179: 333,
  180: 333,
  181: 556,
  182: 537,
  183: 278,
  184: 333,
  185: 333,
  186: 365,
  187: 556,
  188: 834,
  189: 834,
  190: 834,
  191: 611,
  215: 584,
  247: 584,
  223: 611,
  208: 722,
  240: 556,
  222: 667,
  254: 556,
  198: 1000,
  230: 889,
};

const HELVETICA_BOLD_SPECIALS: ExtraSpecials = {
  133: 1000,
  145: 278,
  146: 278,
  147: 500,
  148: 500,
  149: 350,
  150: 556,
  151: 1000,
  153: 1000,
  139: 333,
  155: 333,
  160: 278,
  161: 333,
  162: 556,
  163: 556,
  164: 556,
  165: 556,
  166: 280,
  167: 556,
  168: 333,
  169: 737,
  170: 370,
  171: 556,
  172: 584,
  173: 333,
  174: 737,
  175: 333,
  176: 400,
  177: 584,
  178: 333,
  179: 333,
  180: 333,
  181: 611,
  182: 556,
  183: 278,
  184: 333,
  185: 333,
  186: 365,
  187: 556,
  188: 834,
  189: 834,
  190: 834,
  191: 611,
  215: 584,
  247: 584,
  223: 611,
  208: 722,
  240: 611,
  222: 667,
  254: 611,
  198: 1000,
  230: 889,
};

const TIMES_ROMAN_SPECIALS: ExtraSpecials = {
  133: 1000,
  145: 333,
  146: 333,
  147: 444,
  148: 444,
  149: 350,
  150: 500,
  151: 1000,
  153: 980,
  139: 333,
  155: 333,
  160: 250,
  161: 333,
  162: 500,
  163: 500,
  164: 500,
  165: 500,
  166: 200,
  167: 500,
  168: 333,
  169: 760,
  170: 276,
  171: 500,
  172: 564,
  173: 333,
  174: 760,
  175: 333,
  176: 400,
  177: 564,
  178: 300,
  179: 300,
  180: 333,
  181: 500,
  182: 453,
  183: 250,
  184: 333,
  185: 300,
  186: 310,
  187: 500,
  188: 750,
  189: 750,
  190: 750,
  191: 444,
  215: 564,
  247: 564,
  223: 500,
  208: 722,
  240: 500,
  222: 556,
  254: 500,
  198: 889,
  230: 667,
};

const TIMES_BOLD_SPECIALS: ExtraSpecials = {
  133: 1000,
  145: 333,
  146: 333,
  147: 500,
  148: 500,
  149: 350,
  150: 500,
  151: 1000,
  153: 1000,
  139: 333,
  155: 333,
  160: 250,
  161: 333,
  162: 500,
  163: 500,
  164: 500,
  165: 500,
  166: 280,
  167: 500,
  168: 333,
  169: 747,
  170: 300,
  171: 500,
  172: 570,
  173: 333,
  174: 747,
  175: 333,
  176: 400,
  177: 570,
  178: 300,
  179: 300,
  180: 333,
  181: 556,
  182: 540,
  183: 250,
  184: 333,
  185: 300,
  186: 330,
  187: 500,
  188: 750,
  189: 750,
  190: 750,
  191: 500,
  215: 570,
  247: 570,
  223: 556,
  208: 722,
  240: 556,
  222: 667,
  254: 556,
  198: 1000,
  230: 722,
};

/** code point (128–255) → the plain-ASCII letter whose width it reuses. */
const LATIN_BASE_LETTER: ExtraSpecials & Record<number, number> = {
  192: 0x41,
  193: 0x41,
  194: 0x41,
  195: 0x41,
  196: 0x41,
  197: 0x41, // À Á Â Ã Ä Å -> A
  199: 0x43, // Ç -> C
  200: 0x45,
  201: 0x45,
  202: 0x45,
  203: 0x45, // È É Ê Ë -> E
  204: 0x49,
  205: 0x49,
  206: 0x49,
  207: 0x49, // Ì Í Î Ï -> I
  209: 0x4e, // Ñ -> N
  210: 0x4f,
  211: 0x4f,
  212: 0x4f,
  213: 0x4f,
  214: 0x4f, // Ò Ó Ô Õ Ö -> O
  217: 0x55,
  218: 0x55,
  219: 0x55,
  220: 0x55, // Ù Ú Û Ü -> U
  221: 0x59, // Ý -> Y
  224: 0x61,
  225: 0x61,
  226: 0x61,
  227: 0x61,
  228: 0x61,
  229: 0x61, // à á â ã ä å -> a
  231: 0x63, // ç -> c
  232: 0x65,
  233: 0x65,
  234: 0x65,
  235: 0x65, // è é ê ë -> e
  236: 0x69,
  237: 0x69,
  238: 0x69,
  239: 0x69, // ì í î ï -> i (see override below)
  241: 0x6e, // ñ -> n
  242: 0x6f,
  243: 0x6f,
  244: 0x6f,
  245: 0x6f,
  246: 0x6f, // ò ó ô õ ö -> o
  249: 0x75,
  250: 0x75,
  251: 0x75,
  252: 0x75, // ù ú û ü -> u
  253: 0x79,
  255: 0x79, // ý ÿ -> y
};

/**
 * Helvetica's plain "i" (222) is too narrow to carry an acute/grave/dieresis;
 * its own AFM widens the accented lowercase-i forms to match "dotlessi".
 */
const HELVETICA_IACUTE_GROUP = new Set([0xec, 0xed, 0xee, 0xef]);

function buildTable(
  ascii: WidthTable,
  specials: ExtraSpecials,
  iacuteOverride: number | null,
): WidthTable {
  const table: Record<number, number> = { ...ascii, ...specials };
  for (const [code, baseChar] of Object.entries(LATIN_BASE_LETTER)) {
    const codeNumber = Number(code);
    if (iacuteOverride !== null && HELVETICA_IACUTE_GROUP.has(codeNumber)) {
      table[codeNumber] = iacuteOverride;
      continue;
    }
    table[codeNumber] = ascii[baseChar] ?? 500;
  }
  return table;
}

const WIDTH_TABLES: Record<PdfStandardFont, WidthTable> = {
  Helvetica: buildTable(HELVETICA_ASCII, HELVETICA_SPECIALS, 278),
  "Helvetica-Bold": buildTable(
    HELVETICA_BOLD_ASCII,
    HELVETICA_BOLD_SPECIALS,
    null,
  ),
  "Times-Roman": buildTable(TIMES_ROMAN_ASCII, TIMES_ROMAN_SPECIALS, null),
  "Times-Bold": buildTable(TIMES_BOLD_ASCII, TIMES_BOLD_SPECIALS, null),
  Courier: {},
  "Courier-Bold": {},
};

const DEFAULT_ADVANCE: Record<PdfStandardFont, number> = {
  Helvetica: 556,
  "Helvetica-Bold": 611,
  "Times-Roman": 500,
  "Times-Bold": 500,
  Courier: 600,
  "Courier-Bold": 600,
};

/** Advance width for one WinAnsi byte code, in 1000-unit em space. */
export function glyphAdvance(font: PdfStandardFont, code: number): number {
  if (isMonospacedFont(font)) return 600;
  return WIDTH_TABLES[font][code] ?? DEFAULT_ADVANCE[font];
}

/**
 * Visible width of a run of WinAnsi codes at `size`, including `Tc`
 * character spacing between glyphs (added once per gap, not after the
 * trailing glyph — matching how the run actually looks on the page).
 */
export function measureCodes(
  codes: readonly number[],
  font: PdfStandardFont,
  size: number,
  letterSpacing = 0,
): number {
  if (codes.length === 0) return 0;
  let sum = 0;
  for (const code of codes) sum += glyphAdvance(font, code);
  const glyphs = (sum / 1000) * size;
  const spacing = letterSpacing * Math.max(0, codes.length - 1);
  return glyphs + spacing;
}

/** Sum of raw (size = 1) glyph advances, used to solve for a fitting size. */
export function measureCodesAtUnitSize(
  codes: readonly number[],
  font: PdfStandardFont,
): number {
  let sum = 0;
  for (const code of codes) sum += glyphAdvance(font, code);
  return sum / 1000;
}
