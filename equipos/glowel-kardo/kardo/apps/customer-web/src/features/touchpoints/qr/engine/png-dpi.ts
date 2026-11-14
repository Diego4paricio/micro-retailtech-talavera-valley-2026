/**
 * Pure PNG-chunk helpers (no `canvas`/`Image`), so DPI tagging is checkable
 * in Node. `addPhysicalPixelDimensions` inserts a `pHYs` chunk right after
 * IHDR (always the first chunk) with a correct CRC-32, per the PNG spec.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CRC32_POLYNOMIAL = 0xedb88320;

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1)
      c = c & 1 ? CRC32_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** Standard zlib/PNG CRC-32. */
export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    const tableValue = table[(crc ^ byte) & 0xff] ?? 0;
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function writeUInt32BE(value: number, target: Uint8Array, offset: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

/**
 * Returns `png` with a `pHYs` chunk stating `dpi` pixels per inch
 * (converted to pixels per metre, 1 in = 0.0254 m), so print software opens
 * the file at its intended physical size.
 */
export function addPhysicalPixelDimensions(
  png: Uint8Array,
  dpi: number,
): Uint8Array {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (png[i] !== PNG_SIGNATURE[i]) throw new Error("El PNG no es válido.");
  }
  // IHDR is always the very first chunk.
  const ihdrDataLength = readUInt32BE(png, 8);
  const ihdrEnd = 8 + 4 + 4 + ihdrDataLength + 4;
  if (ihdrEnd > png.length) throw new Error("El PNG no es válido.");

  const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
  const data = new Uint8Array(9);
  writeUInt32BE(pixelsPerMeter, data, 0);
  writeUInt32BE(pixelsPerMeter, data, 4);
  data[8] = 1; // unit specifier: metre

  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); // "pHYs"
  const crcInput = new Uint8Array(type.length + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, type.length);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(4 + type.length + data.length + 4);
  writeUInt32BE(data.length, chunk, 0);
  chunk.set(type, 4);
  chunk.set(data, 8);
  writeUInt32BE(crc, chunk, 8 + data.length);

  const result = new Uint8Array(png.length + chunk.length);
  result.set(png.subarray(0, ihdrEnd), 0);
  result.set(chunk, ihdrEnd);
  result.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return result;
}
