import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { chromePdfBase64 } from "./fixtures/chrome-pdf";

const assetId = "00000000-0000-4000-8000-000000000123";
const storageKey = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;

/** Minimal but structurally valid 1x1 PNG: signature + a well-formed IHDR chunk. */
function validPng(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12); // "IHDR"
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

/** Builds a PNG chunk: length + type + data + a (deliberately fake) CRC. */
function pngChunk(type: string, data: number[]): number[] {
  const length = data.length;
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...[...type].map((char) => char.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0, // The sanitizer never validates the CRC, so any 4 bytes are accepted.
  ];
}

/** A full PNG: signature, IHDR, arbitrary chunks in the middle, then IEND. */
function pngFile(
  width: number,
  height: number,
  middleChunks: number[][],
): Uint8Array {
  const ihdr = pngChunk("IHDR", [
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8,
    6,
    0,
    0,
    0, // bit depth, color type, compression, filter, interlace
  ]);
  const iend = pngChunk("IEND", []);
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...ihdr,
    ...middleChunks.flat(),
    ...iend,
  ]);
}

/**
 * Minimal but structurally valid JPEG: SOI, an APP0/JFIF segment, an
 * APP1/EXIF segment (to exercise metadata stripping), a single-component SOF
 * frame, an SOS header, two bytes of fake entropy-coded scan data, and EOI.
 */
function validJpeg({
  width = 1,
  height = 1,
  sofMarker = 0xc0,
}: {
  width?: number;
  height?: number;
  sofMarker?: number;
} = {}): Uint8Array {
  const segment = (marker: number, payload: number[]): number[] => {
    const length = payload.length + 2;
    return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
  };
  const app0 = segment(0xe0, [
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00, // "JFIF\0"
    0x01,
    0x01, // version
    0x00, // units
    0x00,
    0x01, // Xdensity
    0x00,
    0x01, // Ydensity
    0x00,
    0x00, // thumbnail width/height
  ]);
  const app1Exif = segment(0xe1, [
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00, // "Exif\0\0"
    0xaa,
    0xbb,
    0xcc,
    0xdd, // stand-in for GPS/EXIF tag data
  ]);
  const sof = segment(sofMarker, [
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01, // one component
    0x01,
    0x11,
    0x00,
  ]);
  const sos = segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    ...app0,
    ...app1Exif,
    ...sof,
    ...sos,
    0xaa,
    0xbb, // fake entropy-coded scan data
    0xff,
    0xd9, // EOI
  ]);
}

/** Builds a RIFF chunk (fourCC + size + payload), padded to an even length. */
function riffChunk(fourCC: string, payload: number[]): number[] {
  const size = payload.length;
  const bytes = [
    ...[...fourCC].map((char) => char.charCodeAt(0)),
    size & 0xff,
    (size >> 8) & 0xff,
    (size >> 16) & 0xff,
    (size >> 24) & 0xff,
    ...payload,
  ];
  if (size % 2 === 1) bytes.push(0x00);
  return bytes;
}

/** Assembles a full WebP file (RIFF header + WEBP + chunks). */
function webpFile(chunks: number[][]): Uint8Array {
  const body = chunks.flat();
  const riffSize = 4 + body.length; // "WEBP" + all chunks
  return new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    riffSize & 0xff,
    (riffSize >> 8) & 0xff,
    (riffSize >> 16) & 0xff,
    (riffSize >> 24) & 0xff,
    0x57,
    0x45,
    0x42,
    0x50, // "WEBP"
    ...body,
  ]);
}

/** Minimal lossy VP8 key-frame header: frame tag + start code + dimensions. */
function vp8KeyFramePayload(width: number, height: number): number[] {
  return [
    0x10,
    0x00,
    0x00, // frame tag: bit 0 clear => key frame
    0x9d,
    0x01,
    0x2a, // start code
    width & 0xff,
    (width >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ];
}

/** Minimal lossless VP8L header: signature byte + packed width-1/height-1. */
function vp8lPayload(width: number, height: number): number[] {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return [
    0x2f,
    bits & 0xff,
    (bits >> 8) & 0xff,
    (bits >> 16) & 0xff,
    (bits >> 24) & 0xff,
  ];
}

/** VP8X extended-format payload: flags + reserved + 24-bit width-1/height-1. */
function vp8xPayload(flags: number, width: number, height: number): number[] {
  const w = width - 1;
  const h = height - 1;
  return [
    flags,
    0x00,
    0x00,
    0x00,
    w & 0xff,
    (w >> 8) & 0xff,
    (w >> 16) & 0xff,
    h & 0xff,
    (h >> 8) & 0xff,
    (h >> 16) & 0xff,
  ];
}

function validWebpLossy(width = 1, height = 1): Uint8Array {
  return webpFile([riffChunk("VP8 ", vp8KeyFramePayload(width, height))]);
}

function validWebpLossless(width = 1, height = 1): Uint8Array {
  return webpFile([riffChunk("VP8L", vp8lPayload(width, height))]);
}

/** Extended WebP (VP8X + VP8) carrying an EXIF chunk that should be stripped. */
function extendedWebpWithExif(): Uint8Array {
  return webpFile([
    riffChunk("VP8X", vp8xPayload(0x08, 1, 1)), // EXIF flag set
    riffChunk("VP8 ", vp8KeyFramePayload(1, 1)),
    riffChunk("EXIF", [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]),
  ]);
}

/** Extended WebP advertising animation via both the flag and an ANIM chunk. */
function animatedWebp(): Uint8Array {
  return webpFile([
    riffChunk("VP8X", vp8xPayload(0x02, 1, 1)), // ANIM flag set
    riffChunk("ANIM", [0, 0, 0, 0, 0, 0]),
    riffChunk("VP8 ", vp8KeyFramePayload(1, 1)),
  ]);
}

type ValidateResult = {
  status: string;
  reason?: string;
  sha256?: string;
  derivativeKey?: string;
  byteSize?: number;
};

/** Signs and performs the upload + validate round trip, returning the parsed body. */
async function uploadAndValidate(
  testAssetId: string,
  testStorageKey: string,
  bytes: Uint8Array,
  mediaType: string,
): Promise<ValidateResult> {
  const expires = String(Math.floor(Date.now() / 1000) + 120);
  const uploadSignature = await sign(
    `upload\n${testAssetId}\n${testStorageKey}\n${expires}`,
  );
  const upload = await SELF.fetch(
    `https://assets.test/upload/${testAssetId}?key=${encodeURIComponent(testStorageKey)}&expires=${expires}&signature=${uploadSignature}`,
    {
      method: "PUT",
      headers: {
        "content-type": mediaType,
        "content-length": String(bytes.byteLength),
        origin: "http://localhost:5173",
      },
      body: bytes,
    },
  );
  expect(upload.status).toBe(201);
  const payload = JSON.stringify({
    assetId: testAssetId,
    storageKey: testStorageKey,
    expectedMediaType: mediaType,
    expectedByteSize: bytes.byteLength,
  });
  const validation = await SELF.fetch("https://assets.test/internal/validate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${await sign(payload)}`,
      "content-type": "application/json",
    },
    body: payload,
  });
  return validation.json<ValidateResult>();
}

async function readDerivative(key: string): Promise<Uint8Array> {
  const object = await env.PUBLISHED_SNAPSHOTS.get(key);
  if (!object) throw new Error(`Missing derivative at ${key}`);
  return new Uint8Array(await object.arrayBuffer());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("private asset worker", () => {
  it("accepts only a scoped upload and derives a verified PNG", async () => {
    const expires = String(Math.floor(Date.now() / 1000) + 120);
    const signature = await sign(
      `upload\n${assetId}\n${storageKey}\n${expires}`,
    );
    const png = validPng();
    const upload = await SELF.fetch(
      `https://assets.test/upload/${assetId}?key=${encodeURIComponent(storageKey)}&expires=${expires}&signature=${signature}`,
      {
        method: "PUT",
        headers: {
          "content-type": "image/png",
          "content-length": String(png.byteLength),
          origin: "http://localhost:5173",
        },
        body: png,
      },
    );
    expect(upload.status).toBe(201);
    const payload = JSON.stringify({
      assetId,
      storageKey,
      expectedMediaType: "image/png",
      expectedByteSize: png.byteLength,
    });
    const validation = await SELF.fetch(
      "https://assets.test/internal/validate",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await sign(payload)}`,
          "content-type": "application/json",
        },
        body: payload,
      },
    );
    expect(validation.status).toBe(200);
    const result = await validation.json<{
      status: string;
      derivativeKey: string;
    }>();
    expect(result.status).toBe("validated");
    expect(
      await env.PUBLISHED_SNAPSHOTS.head(result.derivativeKey),
    ).toMatchObject({ size: png.byteLength });
  });

  it("rejects an unsigned upload and an active PDF", async () => {
    const unsigned = await SELF.fetch(`https://assets.test/upload/${assetId}`, {
      method: "PUT",
      body: "no",
    });
    expect(unsigned.status).toBe(401);
    const pdf = new TextEncoder().encode("%PDF-1.7\n/JavaScript (alert(1))");
    await env.ORIGINALS.put(storageKey, pdf, {
      httpMetadata: { contentType: "application/pdf" },
    });
    const payload = JSON.stringify({
      assetId,
      storageKey,
      expectedMediaType: "application/pdf",
      expectedByteSize: pdf.byteLength,
    });
    const response = await SELF.fetch("https://assets.test/internal/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(payload)}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(await response.json()).toMatchObject({ status: "rejected" });
  });

  it("rejects a PDF that hides /OpenAction and /JS inside a compressed object stream", async () => {
    const hiddenObjects =
      "5 0 obj\n<< /Type /Catalog /OpenAction 6 0 R >>\nendobj\n" +
      "6 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj\n";
    const compressed = await deflate(new TextEncoder().encode(hiddenObjects));
    const pdf = concatBytes(
      new TextEncoder().encode(
        `%PDF-1.7\n1 0 obj\n<< /Type /ObjStm /N 2 /First 20 /Filter /FlateDecode /Length ${compressed.byteLength} >>\nstream\n`,
      ),
      compressed,
      new TextEncoder().encode("\nendstream\nendobj\n%%EOF"),
    );
    const assetId = "00000000-0000-4000-8000-000000000789";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    await env.ORIGINALS.put(key, pdf, {
      httpMetadata: { contentType: "application/pdf" },
    });
    const payload = JSON.stringify({
      assetId,
      storageKey: key,
      expectedMediaType: "application/pdf",
      expectedByteSize: pdf.byteLength,
    });
    const response = await SELF.fetch("https://assets.test/internal/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(payload)}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(await response.json()).toMatchObject({
      status: "rejected",
      reason: "The PDF includes active content.",
    });
  });

  it("rejects a PDF that escapes /JavaScript and /OpenAction as #xx names", async () => {
    const assetId = "00000000-0000-4000-8000-00000000078a";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    for (const body of [
      "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Open#41ction 2 0 R >>\nendobj\n%%EOF",
      "%PDF-1.7\n2 0 obj\n<< /S /J#61vaScript /#4AS (app.alert(1)) >>\nendobj\n%%EOF",
    ]) {
      const pdf = new TextEncoder().encode(body);
      await env.ORIGINALS.put(key, pdf, {
        httpMetadata: { contentType: "application/pdf" },
      });
      const payload = JSON.stringify({
        assetId,
        storageKey: key,
        expectedMediaType: "application/pdf",
        expectedByteSize: pdf.byteLength,
      });
      const response = await SELF.fetch(
        "https://assets.test/internal/validate",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${await sign(payload)}`,
            "content-type": "application/json",
          },
          body: payload,
        },
      );
      expect(await response.json()).toMatchObject({
        status: "rejected",
        reason: "The PDF includes active content.",
      });
    }
  });

  it("accepts a font subset name that starts with /AA, as Chrome writes it", async () => {
    const assetId = "00000000-0000-4000-8000-00000000078b";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    const minimal =
      "%PDF-1.4\n1 0 obj\n<< /Type /Font /BaseFont /AAAAAA+HelveticaNeue-Bold >>\nendobj\n%%EOF";
    const chrome = Uint8Array.from(atob(chromePdfBase64), (char) =>
      char.charCodeAt(0),
    );
    for (const pdf of [new TextEncoder().encode(minimal), chrome]) {
      await env.ORIGINALS.put(key, pdf, {
        httpMetadata: { contentType: "application/pdf" },
      });
      const payload = JSON.stringify({
        assetId,
        storageKey: key,
        expectedMediaType: "application/pdf",
        expectedByteSize: pdf.byteLength,
      });
      const response = await SELF.fetch(
        "https://assets.test/internal/validate",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${await sign(payload)}`,
            "content-type": "application/json",
          },
          body: payload,
        },
      );
      expect(await response.json()).toMatchObject({ status: "validated" });
    }
  });

  it("reads each stream's own filter, never a neighbour's or one inside a string", async () => {
    const assetId = "00000000-0000-4000-8000-00000000078d";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    const encoder = new TextEncoder();
    const image = await deflate(new Uint8Array(64));
    const hidden = await deflate(
      encoder.encode("<< /S /JavaScript /JS (x) >>"),
    );
    async function validate(pdf: Uint8Array) {
      await env.ORIGINALS.put(key, pdf, {
        httpMetadata: { contentType: "application/pdf" },
      });
      const payload = JSON.stringify({
        assetId,
        storageKey: key,
        expectedMediaType: "application/pdf",
        expectedByteSize: pdf.byteLength,
      });
      const response = await SELF.fetch(
        "https://assets.test/internal/validate",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${await sign(payload)}`,
            "content-type": "application/json",
          },
          body: payload,
        },
      );
      return response.json<{ status: string; reason?: string }>();
    }
    // Chrome: a compressed image, then a pattern stream with no filter.
    const chromeLike = concatBytes(
      encoder.encode(
        `%PDF-1.4\n1 0 obj\n<</Subtype /Image /Filter /FlateDecode /Length ${image.byteLength}>> stream\n`,
      ),
      image,
      encoder.encode(
        "\nendstream\nendobj\n2 0 obj\n<</PatternType 1 /Length 9>> stream\nq 1 0 0 1\nendstream\nendobj\n%%EOF",
      ),
    );
    expect(await validate(chromeLike)).toMatchObject({ status: "validated" });
    // A filter name written inside a string does not hide the real one.
    const disguised = concatBytes(
      encoder.encode(
        `%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode /T (/Filter /DCTDecode) /Length ${hidden.byteLength} >>\nstream\n`,
      ),
      hidden,
      encoder.encode("\nendstream\nendobj\n%%EOF"),
    );
    expect(await validate(disguised)).toMatchObject({
      status: "rejected",
      reason: "The PDF includes active content.",
    });
    // Two /Filter keys in one dictionary are ambiguous.
    const twice = concatBytes(
      encoder.encode(
        `%PDF-1.7\n1 0 obj\n<< /Filter /DCTDecode /Filter /FlateDecode /Length ${hidden.byteLength} >>\nstream\n`,
      ),
      hidden,
      encoder.encode("\nendstream\nendobj\n%%EOF"),
    );
    expect(await validate(twice)).toMatchObject({ status: "rejected" });
    // The word "stream" inside a string is not a stream.
    const title = encoder.encode(
      "%PDF-1.4\n1 0 obj\n<< /Title (Mainstream bakery) >>\nendobj\n%%EOF",
    );
    expect(await validate(title)).toMatchObject({ status: "validated" });
  });

  it("still rejects every complete active-content name", async () => {
    const assetId = "00000000-0000-4000-8000-00000000078c";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    for (const body of [
      "%PDF-1.7\n1 0 obj\n<< /AA << /O 2 0 R >> >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /AA<</O 2 0 R>> >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /S /JavaScript >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /JS (app.alert(1)) >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /JS(app.alert(1)) >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 2 0 R >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /S /Launch /F (calc.exe) >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /S /J#61vaScript >>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /Names << /EmbeddedFiles 2 0 R >> /EmbeddedFile>>\nendobj\n%%EOF",
      "%PDF-1.7\n1 0 obj\n<< /S /JavaScript",
    ]) {
      const pdf = new TextEncoder().encode(body);
      await env.ORIGINALS.put(key, pdf, {
        httpMetadata: { contentType: "application/pdf" },
      });
      const payload = JSON.stringify({
        assetId,
        storageKey: key,
        expectedMediaType: "application/pdf",
        expectedByteSize: pdf.byteLength,
      });
      const response = await SELF.fetch(
        "https://assets.test/internal/validate",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${await sign(payload)}`,
            "content-type": "application/json",
          },
          body: payload,
        },
      );
      expect(await response.json(), body).toMatchObject({
        status: "rejected",
        reason: "The PDF includes active content.",
      });
    }
  });

  it("rejects a PNG over the 40 megapixel budget", async () => {
    const assetId = "00000000-0000-4000-8000-000000000abd";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    const huge = validPng(10_000, 10_000);
    await env.ORIGINALS.put(key, huge, {
      httpMetadata: { contentType: "image/png" },
    });
    const payload = JSON.stringify({
      assetId,
      storageKey: key,
      expectedMediaType: "image/png",
      expectedByteSize: huge.byteLength,
    });
    const response = await SELF.fetch("https://assets.test/internal/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(payload)}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(await response.json()).toMatchObject({
      status: "rejected",
      reason: "The PNG dimensions are invalid.",
    });
  });

  it("rejects a PNG with an invalid or oversized header", async () => {
    const assetId = "00000000-0000-4000-8000-000000000abc";
    const key = `originals/00000000-0000-4000-8000-000000000456/${assetId}`;
    // Valid signature and IHDR framing, but a width of 0.
    const bogus = validPng(0, 1);
    await env.ORIGINALS.put(key, bogus, {
      httpMetadata: { contentType: "image/png" },
    });
    const payload = JSON.stringify({
      assetId,
      storageKey: key,
      expectedMediaType: "image/png",
      expectedByteSize: bogus.byteLength,
    });
    const response = await SELF.fetch("https://assets.test/internal/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(payload)}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(await response.json()).toMatchObject({
      status: "rejected",
      reason: "The PNG dimensions are invalid.",
    });
  });

  it("never lets a crafted assetId turn the storage key check into a wildcard", async () => {
    const wildcardAssetId = ".*";
    const realKey =
      "originals/00000000-0000-4000-8000-000000000456/00000000-0000-4000-8000-000000000fff";
    const png = validPng();
    await env.ORIGINALS.put(realKey, png, {
      httpMetadata: { contentType: "image/png" },
    });
    const payload = JSON.stringify({
      assetId: wildcardAssetId,
      storageKey: realKey,
      expectedMediaType: "image/png",
      expectedByteSize: png.byteLength,
    });
    const response = await SELF.fetch("https://assets.test/internal/validate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(payload)}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(await response.json()).toMatchObject({
      status: "rejected",
      reason: "Invalid validation command.",
    });
  });

  it("sends the same hardening headers on every response", async () => {
    const response = await SELF.fetch(`https://assets.test/upload/${assetId}`, {
      method: "PUT",
      body: "no",
    });
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("accepts a JPEG upload and strips its EXIF segment", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000201";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const jpeg = validJpeg();
    const result = await uploadAndValidate(
      testAssetId,
      key,
      jpeg,
      "image/jpeg",
    );
    expect(result.status).toBe("validated");
    const derivativeBytes = await readDerivative(result.derivativeKey ?? "");
    // The 14-byte APP1/EXIF segment must not survive sanitization.
    expect(derivativeBytes.byteLength).toBe(jpeg.byteLength - 14);
    expect(result.byteSize).toBe(derivativeBytes.byteLength);
    const derivativeText = new TextDecoder("latin1").decode(derivativeBytes);
    expect(derivativeText).not.toContain("Exif");
    expect(await sha256Hex(derivativeBytes)).toBe(result.sha256);
  });

  it("accepts lossy (VP8) and lossless (VP8L) WebP uploads", async () => {
    const lossyId = "00000000-0000-4000-8000-000000000202";
    const lossyKey = `originals/00000000-0000-4000-8000-000000000456/${lossyId}`;
    const lossyResult = await uploadAndValidate(
      lossyId,
      lossyKey,
      validWebpLossy(),
      "image/webp",
    );
    expect(lossyResult.status).toBe("validated");

    const losslessId = "00000000-0000-4000-8000-000000000203";
    const losslessKey = `originals/00000000-0000-4000-8000-000000000456/${losslessId}`;
    const losslessResult = await uploadAndValidate(
      losslessId,
      losslessKey,
      validWebpLossless(),
      "image/webp",
    );
    expect(losslessResult.status).toBe("validated");
  });

  it("accepts an extended WebP and strips its EXIF chunk and flag", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000204";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const webp = extendedWebpWithExif();
    const result = await uploadAndValidate(
      testAssetId,
      key,
      webp,
      "image/webp",
    );
    expect(result.status).toBe("validated");
    const derivativeBytes = await readDerivative(result.derivativeKey ?? "");
    const derivativeText = new TextDecoder("latin1").decode(derivativeBytes);
    expect(derivativeText).not.toContain("EXIF");
    // VP8X flags byte: 12-byte RIFF header + 8-byte chunk header = offset 20.
    expect(derivativeBytes[20]).toBe(0);
    expect(await sha256Hex(derivativeBytes)).toBe(result.sha256);
  });

  it("rejects an animated WebP", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000205";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const result = await uploadAndValidate(
      testAssetId,
      key,
      animatedWebp(),
      "image/webp",
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "Animated WebP files are not supported.",
    });
  });

  it("rejects a truncated WebP", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000206";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const webp = validWebpLossy().slice(0, 20);
    const result = await uploadAndValidate(
      testAssetId,
      key,
      webp,
      "image/webp",
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "The WebP RIFF size does not match the file.",
    });
  });

  it("rejects a truncated JPEG", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000207";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const jpeg = validJpeg().slice(0, 50);
    const result = await uploadAndValidate(
      testAssetId,
      key,
      jpeg,
      "image/jpeg",
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "The JPEG is truncated or malformed.",
    });
  });

  it("rejects a JPEG with oversized dimensions", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000208";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const jpeg = validJpeg({ width: 20_000, height: 1 });
    const result = await uploadAndValidate(
      testAssetId,
      key,
      jpeg,
      "image/jpeg",
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "The JPEG dimensions are invalid.",
    });
  });

  it("rejects a JPEG with an unsupported (lossless) SOF marker", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000209";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const jpeg = validJpeg({ sofMarker: 0xc3 }); // SOF3: lossless, unsupported.
    const result = await uploadAndValidate(
      testAssetId,
      key,
      jpeg,
      "image/jpeg",
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "The JPEG uses an unsupported encoding.",
    });
  });

  it("strips PNG text/EXIF/time metadata chunks and preserves the rest", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000210";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const textData = [...new TextEncoder().encode("Comment\u0000hello world")];
    const png = pngFile(1, 1, [
      pngChunk("tEXt", textData),
      pngChunk("IDAT", [1, 2, 3, 4]),
    ]);
    const result = await uploadAndValidate(testAssetId, key, png, "image/png");
    expect(result.status).toBe("validated");
    const derivativeBytes = await readDerivative(result.derivativeKey ?? "");
    const derivativeText = new TextDecoder("latin1").decode(derivativeBytes);
    expect(derivativeText).not.toContain("tEXt");
    expect(derivativeText).not.toContain("hello world");
    expect(derivativeText).toContain("IDAT");
    expect(await sha256Hex(derivativeBytes)).toBe(result.sha256);
  });
});

describe("POST /internal/delete", () => {
  it("rejects a delete command with a bad signature", async () => {
    const payload = JSON.stringify({
      assetId,
      storageKey,
      sha256: null,
      deleteDerivative: false,
    });
    const response = await SELF.fetch("https://assets.test/internal/delete", {
      method: "POST",
      headers: {
        authorization: "Bearer not-the-right-signature",
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(response.status).toBe(401);
  });

  it("rejects invalid delete commands", async () => {
    const commands = [
      // storageKey does not belong to assetId.
      {
        assetId,
        storageKey:
          "originals/00000000-0000-4000-8000-000000000456/00000000-0000-4000-8000-000000000999",
        sha256: null,
        deleteDerivative: false,
      },
      // Malformed sha256.
      { assetId, storageKey, sha256: "not-a-hash", deleteDerivative: false },
      // A derivative delete was requested without a hash to name it.
      { assetId, storageKey, sha256: null, deleteDerivative: true },
    ];
    for (const command of commands) {
      const payload = JSON.stringify(command);
      const response = await SELF.fetch("https://assets.test/internal/delete", {
        method: "POST",
        headers: {
          authorization: `Bearer ${await sign(payload)}`,
          "content-type": "application/json",
        },
        body: payload,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ status: "rejected" });
    }
  });

  it("deletes the original and the derivative, idempotently", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000301";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const png = validPng();
    await env.ORIGINALS.put(key, png, {
      httpMetadata: { contentType: "image/png" },
    });
    const sha256 = await sha256Hex(png);
    const derivativeKey = `assets/${sha256}`;
    await env.PUBLISHED_SNAPSHOTS.put(derivativeKey, png, {
      customMetadata: { sha256 },
    });

    const payload = JSON.stringify({
      assetId: testAssetId,
      storageKey: key,
      sha256,
      deleteDerivative: true,
    });
    const signature = await sign(payload);
    const response = await SELF.fetch("https://assets.test/internal/delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${signature}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "deleted" });
    expect(await env.ORIGINALS.head(key)).toBeNull();
    expect(await env.PUBLISHED_SNAPSHOTS.head(derivativeKey)).toBeNull();

    // Deleting again is a no-op, not an error.
    const secondResponse = await SELF.fetch(
      "https://assets.test/internal/delete",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${signature}`,
          "content-type": "application/json",
        },
        body: payload,
      },
    );
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toMatchObject({ status: "deleted" });
  });

  it("leaves the derivative in place when deleteDerivative is false", async () => {
    const testAssetId = "00000000-0000-4000-8000-000000000302";
    const key = `originals/00000000-0000-4000-8000-000000000456/${testAssetId}`;
    const png = validPng();
    await env.ORIGINALS.put(key, png, {
      httpMetadata: { contentType: "image/png" },
    });
    const sha256 = await sha256Hex(png);
    const derivativeKey = `assets/${sha256}`;
    await env.PUBLISHED_SNAPSHOTS.put(derivativeKey, png, {
      customMetadata: { sha256 },
    });

    const payload = JSON.stringify({
      assetId: testAssetId,
      storageKey: key,
      sha256,
      deleteDerivative: false,
    });
    const response = await SELF.fetch("https://assets.test/internal/delete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${await sign(payload)}`,
        "content-type": "application/json",
      },
      body: payload,
    });
    expect(response.status).toBe(200);
    expect(await env.ORIGINALS.head(key)).toBeNull();
    expect(await env.PUBLISHED_SNAPSHOTS.head(derivativeKey)).not.toBeNull();
  });
});

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Response(bytes).body?.pipeThrough(
    new CompressionStream("deflate"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("asset-test-command-key-that-is-long-enough"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return [...signature]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("CORS allow-list", () => {
  it("accepts only exact origins from the comma-separated list", async () => {
    const { allowedOrigin } = await import("../src/index.js");
    const env = {
      CUSTOMER_APP_ORIGIN:
        "http://localhost:5173, https://kardo-app-dev.pages.dev",
    };
    const from = (origin: string) =>
      new Request("https://assets.test/upload/x", { headers: { origin } });
    expect(allowedOrigin(from("https://kardo-app-dev.pages.dev"), env)).toBe(
      "https://kardo-app-dev.pages.dev",
    );
    expect(allowedOrigin(from("http://localhost:5173"), env)).toBe(
      "http://localhost:5173",
    );
    expect(
      allowedOrigin(from("https://kardo-app-dev.pages.dev.evil.example"), env),
    ).toBeNull();
    expect(allowedOrigin(new Request("https://assets.test/"), env)).toBeNull();
  });
});

describe("GET /content/:assetId (signed read of a sanitized image)", () => {
  const readAssetId = "00000000-0000-4000-8000-000000000777";
  const readStorageKey = `originals/00000000-0000-4000-8000-000000000456/${readAssetId}`;

  async function readUrl(
    key: string,
    options: { assetId?: string; expires?: number; signAs?: string } = {},
  ): Promise<string> {
    const target = options.assetId ?? readAssetId;
    const expires = String(
      options.expires ?? Math.floor(Date.now() / 1000) + 120,
    );
    const signature = await sign(
      options.signAs ?? `read\n${target}\n${key}\n${expires}`,
    );
    return `https://assets.test/content/${target}?key=${encodeURIComponent(key)}&expires=${expires}&signature=${signature}`;
  }

  it("serves a validated image derivative with CORS for the panel", async () => {
    const png = validPng(4, 4);
    const result = await uploadAndValidate(
      readAssetId,
      readStorageKey,
      png,
      "image/png",
    );
    expect(result.status).toBe("validated");
    const key = result.derivativeKey ?? "";
    const response = await SELF.fetch(await readUrl(key), {
      headers: { origin: "http://localhost:5175" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5175",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      await readDerivative(key),
    );
  });

  it("rejects forged, expired, over-long and cross-purpose capabilities", async () => {
    const png = validPng(3, 3);
    const result = await uploadAndValidate(
      readAssetId,
      readStorageKey,
      png,
      "image/png",
    );
    const key = result.derivativeKey ?? "";
    const now = Math.floor(Date.now() / 1000);
    // Signed for a different asset id.
    const otherAsset = await readUrl(key, {
      signAs: `read\n00000000-0000-4000-8000-000000000999\n${key}\n${now + 60}`,
      expires: now + 60,
    });
    // An upload signature must never work as a read capability.
    const uploadStyle = await readUrl(key, {
      signAs: `upload\n${readAssetId}\n${key}\n${now + 60}`,
      expires: now + 60,
    });
    const expired = await readUrl(key, { expires: now - 5 });
    const tooLong = await readUrl(key, { expires: now + 3600 });
    const originalKey = await readUrl(readStorageKey);
    for (const url of [
      otherAsset,
      uploadStyle,
      expired,
      tooLong,
      originalKey,
    ]) {
      const response = await SELF.fetch(url);
      expect(response.status).toBe(401);
      await response.arrayBuffer();
    }
  });

  it("never serves PDFs or missing objects", async () => {
    const pdfKey = `assets/${"a".repeat(64)}`;
    await env.PUBLISHED_SNAPSHOTS.put(
      pdfKey,
      new Uint8Array([37, 80, 68, 70]),
      {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { assetId: readAssetId, sha256: "a".repeat(64) },
      },
    );
    const pdf = await SELF.fetch(await readUrl(pdfKey));
    expect(pdf.status).toBe(404);
    await pdf.arrayBuffer();
    const missing = await SELF.fetch(await readUrl(`assets/${"b".repeat(64)}`));
    expect(missing.status).toBe(404);
    await missing.arrayBuffer();
  });
});
