// Pure, dependency-free parsers/sanitizers for the image formats the asset
// worker accepts. Each function walks the container/bitstream by hand with
// strict bounds checking, rejects anything it cannot fully account for, and
// returns either the sanitized (metadata-stripped) bytes plus decoded pixel
// dimensions, or a human-readable rejection reason. Nothing here trusts
// length fields without checking them against the buffer first.

export type ImageSanitizeResult =
  | {
      readonly ok: true;
      readonly sanitized: Uint8Array;
      readonly width: number;
      readonly height: number;
    }
  | { readonly ok: false; readonly reason: string };

const maxDimension = 12_000;
const maxPixels = 40_000_000;

function dimensionsInRange(width: number, height: number): boolean {
  return (
    width >= 1 &&
    height >= 1 &&
    width <= maxDimension &&
    height <= maxDimension &&
    width * height <= maxPixels
  );
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function asciiTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

// --- PNG ---------------------------------------------------------------

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
// Metadata chunks that can carry EXIF/GPS, IPTC/Photoshop or free-text
// authoring data. Each PNG chunk carries its own CRC, so dropping whole
// chunks leaves every remaining chunk (including IEND) byte-for-byte valid.
const pngChunksToStrip = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

export function sanitizePng(bytes: Uint8Array): ImageSanitizeResult {
  // Signature (8) + first chunk length/type (8) + IHDR data (13) + CRC (4).
  if (
    bytes.length < 33 ||
    !pngSignature.every((byte, index) => bytes[index] === byte)
  )
    return { ok: false, reason: "The file is not a valid PNG." };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstChunkLength = view.getUint32(8);
  const firstChunkType = asciiTag(bytes, 12);
  if (firstChunkType !== "IHDR" || firstChunkLength !== 13)
    return { ok: false, reason: "The PNG is missing a valid header chunk." };
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  // The same pixel budget as JPEG and WebP: a 10,000 × 10,000 PNG of a few
  // compressible bytes would otherwise decode to 400 MB in a browser.
  if (
    width < 1 ||
    height < 1 ||
    width > 10_000 ||
    height > 10_000 ||
    width * height > maxPixels
  )
    return { ok: false, reason: "The PNG dimensions are invalid." };

  // Existing behavior only ever inspected IHDR, so a file that ends before
  // IEND (or omits it) is not newly rejected here — only a chunk whose
  // declared length overruns the buffer is treated as truncated/malformed.
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let cursor = 8;
  while (cursor < bytes.length) {
    if (cursor + 8 > bytes.length)
      return { ok: false, reason: "The PNG is truncated or malformed." };
    const length = view.getUint32(cursor);
    const type = asciiTag(bytes, cursor + 4);
    const chunkEnd = cursor + 12 + length;
    if (chunkEnd > bytes.length)
      return { ok: false, reason: "The PNG is truncated or malformed." };
    if (!pngChunksToStrip.has(type))
      kept.push(bytes.subarray(cursor, chunkEnd));
    cursor = chunkEnd;
    if (type === "IEND") break; // Ignore any trailing bytes after IEND.
  }
  return { ok: true, sanitized: concat(kept), width, height };
}

// --- JPEG ----------------------------------------------------------------

// Markers with no length field / payload.
const jpegStandaloneMarkers = new Set([
  0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9,
]);
// APP1 (EXIF/XMP, carries GPS), APP12 and APP13 (IPTC/Photoshop) are
// metadata and get dropped. APP0/APP2/APP14 and everything else needed to
// decode are kept.
const jpegAppMarkersToStrip = new Set([0xe1, 0xec, 0xed]);
const jpegComMarker = 0xfe;
// Baseline (C0), extended sequential (C1) and progressive (C2) DCT frames.
const jpegSofMarkersAllowed = new Set([0xc0, 0xc1, 0xc2]);
// Lossless, differential and arithmetic-coded frames we do not support.
const jpegSofMarkersRejected = new Set([
  0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function sanitizeJpeg(bytes: Uint8Array): ImageSanitizeResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    return { ok: false, reason: "The file is not a valid JPEG." };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const malformed: ImageSanitizeResult = {
    ok: false,
    reason: "The JPEG is truncated or malformed.",
  };

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let cursor = 2;
  let width = 0;
  let height = 0;
  let sawSof = false;
  let sawSos = false;
  let sawEoi = false;

  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) return malformed;
    // Skip any fill bytes (extra 0xFF) preceding the real marker code.
    let markerPos = cursor;
    let marker = bytes[markerPos + 1];
    while (marker === 0xff) {
      markerPos += 1;
      marker = bytes[markerPos + 1];
    }
    if (marker === undefined) return malformed;

    if (jpegStandaloneMarkers.has(marker)) {
      const end = markerPos + 2;
      kept.push(bytes.subarray(cursor, end));
      if (marker === 0xd9) {
        sawEoi = true;
        cursor = end;
        break;
      }
      cursor = end;
      continue;
    }

    const lengthOffset = markerPos + 2;
    if (lengthOffset + 2 > bytes.length) return malformed;
    const length = view.getUint16(lengthOffset);
    if (length < 2) return malformed;
    const segmentEnd = lengthOffset + length;
    if (segmentEnd > bytes.length) return malformed;

    if (marker >= 0xe0 && marker <= 0xef) {
      if (!jpegAppMarkersToStrip.has(marker))
        kept.push(bytes.subarray(cursor, segmentEnd));
      cursor = segmentEnd;
      continue;
    }
    if (marker === jpegComMarker) {
      cursor = segmentEnd; // Drop the comment segment entirely.
      continue;
    }
    if (jpegSofMarkersRejected.has(marker))
      return {
        ok: false,
        reason: "The JPEG uses an unsupported encoding.",
      };
    if (jpegSofMarkersAllowed.has(marker)) {
      if (sawSof) return malformed;
      const dataStart = lengthOffset + 2;
      if (dataStart + 5 > segmentEnd) return malformed;
      height = view.getUint16(dataStart + 1);
      width = view.getUint16(dataStart + 3);
      if (!dimensionsInRange(width, height))
        return { ok: false, reason: "The JPEG dimensions are invalid." };
      sawSof = true;
      kept.push(bytes.subarray(cursor, segmentEnd));
      cursor = segmentEnd;
      continue;
    }
    if (marker === 0xda) {
      if (!sawSof) return malformed;
      sawSos = true;
      kept.push(bytes.subarray(cursor, segmentEnd));
      // Scan the entropy-coded scan data: 0xFF is only a real marker there
      // when not followed by a stuffed 0x00, a restart marker (RSTn) or
      // another fill 0xFF.
      let dataCursor = segmentEnd;
      for (;;) {
        if (dataCursor >= bytes.length) return malformed;
        if (bytes[dataCursor] !== 0xff) {
          dataCursor += 1;
          continue;
        }
        const next = bytes[dataCursor + 1];
        if (next === undefined) return malformed;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          dataCursor += 2;
          continue;
        }
        if (next === 0xff) {
          dataCursor += 1;
          continue;
        }
        break;
      }
      kept.push(bytes.subarray(segmentEnd, dataCursor));
      cursor = dataCursor;
      continue;
    }
    // Any other segment (DQT, DHT, DRI, DAC, DNL, ...) is kept unchanged;
    // it may be required to decode the image.
    kept.push(bytes.subarray(cursor, segmentEnd));
    cursor = segmentEnd;
  }

  if (!sawSof || !sawSos)
    return { ok: false, reason: "The JPEG is missing image data." };
  if (!sawEoi) return malformed;
  return { ok: true, sanitized: concat(kept), width, height };
}

// --- WebP ------------------------------------------------------------------

const webpVp8xFlags = { exif: 0x08, xmp: 0x04, anim: 0x02 } as const;

type WebpChunk = {
  readonly fourCC: string;
  readonly start: number;
  readonly dataStart: number;
  readonly dataEnd: number;
  readonly paddedEnd: number;
};

function readVp8Dimensions(
  bytes: Uint8Array,
  dataStart: number,
  dataEnd: number,
): { width: number; height: number } | null {
  if (dataEnd - dataStart < 10) return null;
  const frameTag = bytes[dataStart] ?? 0;
  const isKeyFrame = (frameTag & 0x01) === 0;
  if (!isKeyFrame) return null; // No inter frames in a still image.
  if (
    bytes[dataStart + 3] !== 0x9d ||
    bytes[dataStart + 4] !== 0x01 ||
    bytes[dataStart + 5] !== 0x2a
  )
    return null;
  const widthField =
    (bytes[dataStart + 6] ?? 0) | ((bytes[dataStart + 7] ?? 0) << 8);
  const heightField =
    (bytes[dataStart + 8] ?? 0) | ((bytes[dataStart + 9] ?? 0) << 8);
  return { width: widthField & 0x3fff, height: heightField & 0x3fff };
}

function readVp8lDimensions(
  bytes: Uint8Array,
  dataStart: number,
  dataEnd: number,
): { width: number; height: number } | null {
  if (dataEnd - dataStart < 5) return null;
  if (bytes[dataStart] !== 0x2f) return null; // VP8L signature byte.
  const bits =
    (bytes[dataStart + 1] ?? 0) |
    ((bytes[dataStart + 2] ?? 0) << 8) |
    ((bytes[dataStart + 3] ?? 0) << 16) |
    ((bytes[dataStart + 4] ?? 0) << 24);
  const width = (bits & 0x3fff) + 1;
  const height = ((bits >>> 14) & 0x3fff) + 1;
  return { width, height };
}

function read24Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

export function sanitizeWebp(bytes: Uint8Array): ImageSanitizeResult {
  const malformed: ImageSanitizeResult = {
    ok: false,
    reason: "The WebP is truncated or malformed.",
  };
  if (
    bytes.length < 12 ||
    asciiTag(bytes, 0) !== "RIFF" ||
    asciiTag(bytes, 8) !== "WEBP"
  )
    return { ok: false, reason: "The file is not a valid WebP." };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = view.getUint32(4, true);
  if (riffSize + 8 !== bytes.length)
    return { ok: false, reason: "The WebP RIFF size does not match the file." };

  const chunks: WebpChunk[] = [];
  let cursor = 12;
  while (cursor < bytes.length) {
    if (cursor + 8 > bytes.length) return malformed;
    const fourCC = asciiTag(bytes, cursor);
    const size = view.getUint32(cursor + 4, true);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) return malformed;
    const paddedEnd = dataEnd + (size % 2); // Chunks are padded to even length.
    if (paddedEnd > bytes.length) return malformed;
    chunks.push({ fourCC, start: cursor, dataStart, dataEnd, paddedEnd });
    cursor = paddedEnd;
  }
  const first = chunks[0];
  if (!first) return malformed;

  let width: number;
  let height: number;
  let vp8xChunk: WebpChunk | null = null;
  let vp8xFlags = 0;

  if (first.fourCC === "VP8X") {
    if (first.dataEnd - first.dataStart !== 10)
      return { ok: false, reason: "The WebP header is invalid." };
    vp8xChunk = first;
    vp8xFlags = bytes[first.dataStart] ?? 0;
    width = read24Le(bytes, first.dataStart + 4) + 1;
    height = read24Le(bytes, first.dataStart + 7) + 1;
    const hasImageChunk = chunks.some(
      (chunk) => chunk.fourCC === "VP8 " || chunk.fourCC === "VP8L",
    );
    if (!hasImageChunk)
      return { ok: false, reason: "The WebP is missing image data." };
  } else if (first.fourCC === "VP8 ") {
    const dims = readVp8Dimensions(bytes, first.dataStart, first.dataEnd);
    if (!dims) return { ok: false, reason: "The WebP header is invalid." };
    width = dims.width;
    height = dims.height;
  } else if (first.fourCC === "VP8L") {
    const dims = readVp8lDimensions(bytes, first.dataStart, first.dataEnd);
    if (!dims) return { ok: false, reason: "The WebP header is invalid." };
    width = dims.width;
    height = dims.height;
  } else {
    return { ok: false, reason: "The WebP is missing image data." };
  }

  const hasAnimationChunk = chunks.some(
    (chunk) => chunk.fourCC === "ANIM" || chunk.fourCC === "ANMF",
  );
  if (hasAnimationChunk || (vp8xFlags & webpVp8xFlags.anim) !== 0)
    return { ok: false, reason: "Animated WebP files are not supported." };

  if (!dimensionsInRange(width, height))
    return { ok: false, reason: "The WebP dimensions are invalid." };

  // Drop EXIF/XMP chunks, clear the matching VP8X flag bits and rewrite the
  // RIFF size to match the sanitized payload.
  const keptChunks = chunks.filter(
    (chunk) => chunk.fourCC !== "EXIF" && chunk.fourCC !== "XMP ",
  );
  const parts: Uint8Array[] = [];
  for (const chunk of keptChunks) {
    if (chunk === vp8xChunk) {
      const rewritten = bytes.slice(chunk.start, chunk.paddedEnd);
      const clearedFlags =
        vp8xFlags & ~(webpVp8xFlags.exif | webpVp8xFlags.xmp);
      rewritten[8] = clearedFlags; // Flags byte: 4 (fourCC) + 4 (size).
      parts.push(rewritten);
    } else {
      parts.push(bytes.subarray(chunk.start, chunk.paddedEnd));
    }
  }
  const payload = concat(parts);
  const header = new Uint8Array(12);
  header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  new DataView(header.buffer).setUint32(4, 4 + payload.byteLength, true);
  header.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  return { ok: true, sanitized: concat([header, payload]), width, height };
}
