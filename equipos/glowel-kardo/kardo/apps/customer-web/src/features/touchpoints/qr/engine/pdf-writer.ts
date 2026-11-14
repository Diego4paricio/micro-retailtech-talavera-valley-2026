/**
 * Low-level, scene-agnostic PDF 1.4 assembly: byte buffer, object/xref/
 * trailer bookkeeping and a couple of generic helpers (number formatting,
 * color parsing, Flate compression). Nothing here knows about `Scene`.
 */

/** Object number inside the file (used as an indirect reference target). */
export type PdfRef = number;

/**
 * Every byte buffer here is always freshly allocated (`new Uint8Array(n)`,
 * never a view over someone else's `SharedArrayBuffer`), so we pin the
 * generic to plain `ArrayBuffer` — that is what `Blob` and
 * `WritableStreamDefaultWriter.write` (`BufferSource`) require.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * Encodes a string one byte per UTF-16 code unit (never UTF-8). Every string
 * that reaches this function must already be pure ASCII/latin1 — PDF literal
 * strings escape non-ASCII WinAnsi bytes as `\ddd` octal (see pdf-fonts.ts),
 * and the only genuinely raw high bytes are the header's binary marker,
 * which is written through the same path on purpose.
 */
export function latin1Bytes(text: string): Bytes {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    bytes[i] = code <= 0xff ? code : 0x3f;
  }
  return bytes;
}

/** Formats a number for PDF syntax: fixed-point, no exponent, trimmed. */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10000) / 10000;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  let text = normalized.toFixed(4);
  if (text.includes(".")) {
    text = text.replace(/0+$/, "").replace(/\.$/, "");
  }
  return text.length === 0 || text === "-" ? "0" : text;
}

/** Parses `#rgb` / `#rrggbb` into 0..1 components; falls back to black. */
export function hexToRgb01(hex: string): readonly [number, number, number] {
  const value = hex.trim().replace(/^#/, "");
  if (value.length === 3) {
    const [c0, c1, c2] = [value.charAt(0), value.charAt(1), value.charAt(2)];
    const r = Number.parseInt(c0 + c0, 16);
    const g = Number.parseInt(c1 + c1, 16);
    const b = Number.parseInt(c2 + c2, 16);
    if ([r, g, b].every((n) => Number.isFinite(n)))
      return [r / 255, g / 255, b / 255];
  }
  if (value.length === 6) {
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n)))
      return [r / 255, g / 255, b / 255];
  }
  return [0, 0, 0];
}

/** Millimeters to PDF points (1 mm = 72/25.4 pt). */
export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

/**
 * Deflates `data` into a zlib stream (valid `/FlateDecode` payload) using the
 * platform's `CompressionStream`. Returns `null` when unavailable or when
 * compression fails, so the caller can fall back to storing bytes raw.
 */
export async function deflateOrNull(data: Bytes): Promise<Bytes | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new CompressionStream("deflate");
    const writer = stream.writable.getWriter();
    const bodyPromise = (async () => {
      const chunks: Uint8Array[] = [];
      const reader = stream.readable.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      let total = 0;
      for (const chunk of chunks) total += chunk.length;
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    })();
    await writer.write(data);
    await writer.close();
    return await bodyPromise;
  } catch {
    return null;
  }
}

/** A stream object's bytes plus whether they ended up Flate-compressed. */
export type StreamPayload = { bytes: Bytes; filter: "FlateDecode" | null };

export async function compressStream(data: Bytes): Promise<StreamPayload> {
  const compressed = await deflateOrNull(data);
  if (compressed && compressed.length < data.length) {
    return { bytes: compressed, filter: "FlateDecode" };
  }
  return { bytes: data, filter: null };
}

function concatBytes(chunks: readonly Bytes[], total: number): Bytes {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Appends PDF objects to a growing byte buffer while tracking each object's
 * byte offset (needed for the xref table). Objects may be written in any
 * order — the xref table, not stream order, is what readers use to find
 * them — so callers can allocate a number up front and write the body later.
 */
export class PdfDocumentWriter {
  private readonly chunks: Bytes[] = [];
  private length = 0;
  private readonly offsets: number[] = [];
  private nextObjectNumber = 1;

  constructor() {
    this.pushText("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  }

  /** Reserves the next free object number without writing anything yet. */
  allocate(): PdfRef {
    return this.nextObjectNumber++;
  }

  private pushBytes(bytes: Bytes): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  private pushText(text: string): void {
    this.pushBytes(latin1Bytes(text));
  }

  /** Writes a plain (non-stream) indirect object: `id 0 obj <dict> endobj`. */
  writeObject(id: PdfRef, body: string): void {
    this.offsets[id - 1] = this.length;
    this.pushText(`${id} 0 obj\n${body}\nendobj\n`);
  }

  /** Writes an indirect object carrying a stream; `dict` must omit `/Length`. */
  writeStreamObject(id: PdfRef, dict: string, payload: StreamPayload): void {
    this.offsets[id - 1] = this.length;
    const parts = [
      dict.trim(),
      payload.filter ? `/Filter /${payload.filter}` : "",
      `/Length ${payload.bytes.length}`,
    ].filter((part) => part.length > 0);
    this.pushText(`${id} 0 obj\n<< ${parts.join(" ")} >>\nstream\n`);
    this.pushBytes(payload.bytes);
    this.pushText("\nendstream\nendobj\n");
  }

  /** Finalizes the file: xref table, trailer, `startxref`, `%%EOF`. */
  finish(rootId: PdfRef, infoId: PdfRef): Bytes {
    const xrefOffset = this.length;
    const count = this.nextObjectNumber; // object numbers 1..count-1, plus free entry 0
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let id = 1; id < count; id += 1) {
      const offset = this.offsets[id - 1] ?? 0;
      xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${count} /Root ${rootId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    this.pushText(xref);
    return concatBytes(this.chunks, this.length);
  }
}

/** `D:YYYYMMDDHHmmssZ` — the PDF date form, in UTC. */
export function pdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}
