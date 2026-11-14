import { sanitizeJpeg, sanitizePng, sanitizeWebp } from "./images.js";

type AssetWorkerEnv = Env & {
  ASSET_UPLOAD_SIGNING_KEY: string;
  CUSTOMER_APP_ORIGIN: string;
};

type ValidateCommand = {
  assetId: string;
  storageKey: string;
  expectedMediaType:
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "application/pdf";
  expectedByteSize: number;
};

type DeleteCommand = {
  assetId: string;
  storageKey: string;
  sha256: string | null;
  deleteDerivative: boolean;
};

const maxBytes = 5_242_880;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return preflight(request, env);
    // Liveness for the status Worker (ADR 022).
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "assets", status: "ok" });
    }
    if (
      request.method === "PUT" &&
      /^\/upload\/[0-9a-f-]{36}$/.test(url.pathname)
    ) {
      return upload(request, env, url);
    }
    if (
      request.method === "GET" &&
      /^\/content\/[0-9a-f-]{36}$/.test(url.pathname)
    ) {
      return readContent(request, env, url);
    }
    if (request.method === "POST" && url.pathname === "/internal/validate") {
      return validate(request, env);
    }
    if (request.method === "POST" && url.pathname === "/internal/delete") {
      return deleteAsset(request, env);
    }
    return new Response("Not found", {
      status: 404,
      headers: securityHeaders(),
    });
  },
} satisfies ExportedHandler<AssetWorkerEnv>;

async function upload(
  request: Request,
  env: AssetWorkerEnv,
  url: URL,
): Promise<Response> {
  const assetId = url.pathname.slice("/upload/".length);
  const key = url.searchParams.get("key");
  const expires = url.searchParams.get("expires");
  const signature = url.searchParams.get("signature");
  if (
    !key ||
    !expires ||
    !signature ||
    !validStorageKey(key, assetId) ||
    !Number.isSafeInteger(Number(expires)) ||
    Number(expires) * 1000 < Date.now()
  ) {
    return new Response("Upload authorization expired", {
      status: 401,
      headers: securityHeaders(),
    });
  }
  const expected = await hmac(
    env.ASSET_UPLOAD_SIGNING_KEY,
    `upload\n${assetId}\n${key}\n${expires}`,
  );
  if (!(await safeEqual(expected, signature)))
    return new Response("Unauthorized", {
      status: 401,
      headers: securityHeaders(),
    });
  const size = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes)
    return new Response("Invalid upload size", {
      status: 413,
      headers: securityHeaders(),
    });
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0];
  if (
    mediaType !== "image/png" &&
    mediaType !== "image/jpeg" &&
    mediaType !== "image/webp" &&
    mediaType !== "application/pdf"
  )
    return new Response("Unsupported media type", {
      status: 415,
      headers: securityHeaders(),
    });
  await env.ORIGINALS.put(key, request.body, {
    httpMetadata: { contentType: mediaType },
    customMetadata: { assetId },
  });
  return new Response(null, {
    status: 201,
    headers: { ...securityHeaders(), ...cors(request, env) },
  });
}

/** Longest lifetime a read capability may request (the API issues ~2 min). */
const maxReadLifetimeSeconds = 600;
const readableMediaTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * Signed, short-lived read of one sanitized image derivative (e.g. the
 * organization logo for the Estudio QR). The Customer API only signs
 * derivatives of validated images the requester can see; the capability is
 * bound to the asset and the exact content-addressed key.
 */
async function readContent(
  request: Request,
  env: AssetWorkerEnv,
  url: URL,
): Promise<Response> {
  const assetId = url.pathname.slice("/content/".length);
  const key = url.searchParams.get("key");
  const expires = url.searchParams.get("expires");
  const signature = url.searchParams.get("signature");
  const expiresAt = Number(expires);
  const now = Date.now() / 1000;
  if (
    !key ||
    !expires ||
    !signature ||
    !/^assets\/[a-f0-9]{64}$/.test(key) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < now ||
    expiresAt > now + maxReadLifetimeSeconds
  ) {
    return new Response("Read authorization expired", {
      status: 401,
      headers: { ...securityHeaders(), ...cors(request, env) },
    });
  }
  const expected = await hmac(
    env.ASSET_UPLOAD_SIGNING_KEY,
    `read\n${assetId}\n${key}\n${expires}`,
  );
  if (!(await safeEqual(expected, signature)))
    return new Response("Unauthorized", {
      status: 401,
      headers: { ...securityHeaders(), ...cors(request, env) },
    });
  const object = await env.PUBLISHED_SNAPSHOTS.get(key);
  const mediaType = object?.httpMetadata?.contentType ?? "";
  if (
    !object ||
    object.customMetadata?.sha256 !== key.slice("assets/".length) ||
    !readableMediaTypes.has(mediaType)
  ) {
    object?.body.cancel();
    return new Response("Not found", {
      status: 404,
      headers: { ...securityHeaders(), ...cors(request, env) },
    });
  }
  return new Response(object.body, {
    headers: {
      ...securityHeaders(),
      ...cors(request, env),
      "content-type": mediaType,
      "content-disposition": "inline",
    },
  });
}

async function validate(
  request: Request,
  env: AssetWorkerEnv,
): Promise<Response> {
  const body = await request.text();
  const expected = await hmac(env.ASSET_UPLOAD_SIGNING_KEY, body);
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!(await safeEqual(expected, supplied)))
    return new Response("Unauthorized", {
      status: 401,
      headers: securityHeaders(),
    });
  const command = parseCommand(body);
  if (!command || !validStorageKey(command.storageKey, command.assetId))
    return Response.json(
      { status: "rejected", reason: "Invalid validation command." },
      { status: 400, headers: securityHeaders() },
    );
  const object = await env.ORIGINALS.get(command.storageKey);
  if (
    !object ||
    object.size !== command.expectedByteSize ||
    object.size > maxBytes ||
    object.httpMetadata?.contentType !== command.expectedMediaType
  ) {
    return Response.json(
      {
        status: "rejected",
        reason: "The uploaded object does not match its authorization.",
      },
      { headers: securityHeaders() },
    );
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  const sanitized = await sanitizeForStorage(bytes, command.expectedMediaType);
  if (!sanitized.ok)
    return Response.json(
      { status: "rejected", reason: sanitized.reason },
      { headers: securityHeaders() },
    );
  const derivativeBytes = sanitized.bytes;
  const sha256 = await digest(derivativeBytes);
  const derivativeKey = `assets/${sha256}`;
  await env.PUBLISHED_SNAPSHOTS.put(derivativeKey, derivativeBytes, {
    httpMetadata: {
      contentType: command.expectedMediaType,
      contentDisposition:
        command.expectedMediaType === "application/pdf"
          ? "attachment"
          : "inline",
    },
    customMetadata: { assetId: command.assetId, sha256 },
  });
  const derivative = await env.PUBLISHED_SNAPSHOTS.head(derivativeKey);
  if (
    !derivative ||
    derivative.size !== derivativeBytes.byteLength ||
    derivative.customMetadata?.sha256 !== sha256
  ) {
    return new Response("Derivative verification failed", {
      status: 503,
      headers: securityHeaders(),
    });
  }
  return Response.json(
    {
      status: "validated",
      byteSize: derivativeBytes.byteLength,
      sha256,
      derivativeKey,
    },
    { headers: securityHeaders() },
  );
}

async function deleteAsset(
  request: Request,
  env: AssetWorkerEnv,
): Promise<Response> {
  const body = await request.text();
  const expected = await hmac(env.ASSET_UPLOAD_SIGNING_KEY, body);
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!(await safeEqual(expected, supplied)))
    return new Response("Unauthorized", {
      status: 401,
      headers: securityHeaders(),
    });
  const command = parseDeleteCommand(body);
  if (!command)
    return Response.json(
      { status: "rejected", reason: "Invalid delete command." },
      { status: 400, headers: securityHeaders() },
    );
  await env.ORIGINALS.delete(command.storageKey);
  if (command.deleteDerivative && command.sha256) {
    await env.PUBLISHED_SNAPSHOTS.delete(`assets/${command.sha256}`);
  }
  return Response.json({ status: "deleted" }, { headers: securityHeaders() });
}

const sha256Pattern = /^[a-f0-9]{64}$/;

function parseDeleteCommand(value: string): DeleteCommand | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const v = parsed as Record<string, unknown>;
    if (
      typeof v.assetId !== "string" ||
      typeof v.storageKey !== "string" ||
      typeof v.deleteDerivative !== "boolean" ||
      !(
        v.sha256 === null ||
        (typeof v.sha256 === "string" && sha256Pattern.test(v.sha256))
      )
    )
      return null;
    if (!validStorageKey(v.storageKey, v.assetId)) return null;
    // A derivative can only be deleted by the hash that names it.
    if (v.deleteDerivative && v.sha256 === null) return null;
    return {
      assetId: v.assetId,
      storageKey: v.storageKey,
      sha256: v.sha256 as string | null,
      deleteDerivative: v.deleteDerivative,
    };
  } catch {
    return null;
  }
}

function parseCommand(value: string): ValidateCommand | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const v = parsed as Record<string, unknown>;
    if (
      typeof v.assetId !== "string" ||
      typeof v.storageKey !== "string" ||
      typeof v.expectedByteSize !== "number" ||
      (v.expectedMediaType !== "image/png" &&
        v.expectedMediaType !== "image/jpeg" &&
        v.expectedMediaType !== "image/webp" &&
        v.expectedMediaType !== "application/pdf")
    )
      return null;
    return v as ValidateCommand;
  } catch {
    return null;
  }
}
// Defense in depth: `assetId` reaches here from a caller-controlled command, so
// it must be shape-checked before it can decide whether a storage key belongs
// to it. Never interpolate it into a RegExp: an assetId such as ".*" would
// turn the intended exact-match into a wildcard that accepts any key.
function validStorageKey(value: string, assetId: string): boolean {
  if (!/^[0-9a-f-]{36}$/.test(assetId)) return false;
  const match = /^originals\/[0-9a-f-]{36}\/([0-9a-f-]{36})$/.exec(value);
  return match !== null && match[1] === assetId;
}

type SanitizeOutcome =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: string };

// Sanitizes an accepted upload for storage: images are re-encoded as their
// own metadata-stripped bytes (see images.ts), while a PDF is scanned
// fail-closed and, if safe, stored unchanged.
async function sanitizeForStorage(
  bytes: Uint8Array,
  mediaType: ValidateCommand["expectedMediaType"],
): Promise<SanitizeOutcome> {
  switch (mediaType) {
    case "application/pdf": {
      const reason = await unsafePdf(bytes);
      return reason ? { ok: false, reason } : { ok: true, bytes };
    }
    case "image/png": {
      const result = sanitizePng(bytes);
      return result.ok ? { ok: true, bytes: result.sanitized } : result;
    }
    case "image/jpeg": {
      const result = sanitizeJpeg(bytes);
      return result.ok ? { ok: true, bytes: result.sanitized } : result;
    }
    case "image/webp": {
      const result = sanitizeWebp(bytes);
      return result.ok ? { ok: true, bytes: result.sanitized } : result;
    }
  }
}

// PDF is scanned fail-closed: active-content tokens are searched both in the
// raw file and inside every FlateDecode stream we can safely decompress
// (including compressed object streams, where a page could hide /JS or
// /OpenAction). A stream compressed with a filter we cannot inspect — other
// than the image codecs DCTDecode/JPXDecode — is rejected outright rather
// than assumed safe.
const maxInspectedStreams = 500;
const maxDecompressedBytesPerPdf = 20 * 1024 * 1024;
const dangerousPdfNames = [
  "JavaScript",
  "JS",
  "OpenAction",
  "AA",
  "EmbeddedFile",
  "RichMedia",
  "Launch",
  "XFA",
  "Encrypt",
  // Actions and annotations that reach outside the page or run media; a
  // business menu or document never needs them, and a "validated" PDF that
  // still carried them could open a remote/embedded file, submit a form or
  // import data when the recipient opens it (security review 2026-10-12).
  // Plain "GoTo" (internal links Chrome writes) is NOT listed, so ordinary
  // PDFs are unaffected — only the remote/embedded variants are blocked.
  "GoToR",
  "GoToE",
  "SubmitForm",
  "ImportData",
  "Rendition",
  "Movie",
  "Sound",
];
// A name only counts when it is complete: the next character is whitespace, a
// PDF delimiter or the end. Otherwise `/AA` would match inside the font subset
// name `/AAAAAA+HelveticaNeue-Bold` that Chrome writes in every PDF it saves.
const dangerousPdfName = new RegExp(
  `/(?:${dangerousPdfNames.join("|")})(?=[\\s\\0/<>\\[\\]()%{}]|$)`,
);

async function unsafePdf(bytes: Uint8Array): Promise<string | null> {
  const text = new TextDecoder("latin1").decode(bytes);
  if (!text.startsWith("%PDF-")) return "The file is not a valid PDF.";
  if (hasDangerousPdfContent(text)) return "The PDF includes active content.";

  let totalPages = countPdfPages(text);
  if (totalPages > 20) return "The PDF exceeds the 20 page limit.";

  const streams = extractPdfStreams(text, bytes);
  if (streams === null)
    return "The PDF includes a stream this scanner cannot inspect safely.";
  if (streams.length > maxInspectedStreams)
    return "The PDF includes too many streams to inspect safely.";

  for (const stream of streams) {
    const filters = pdfStreamFilters(stream.dictText);
    if (filters === null) continue; // Unfiltered: already present in `text`.
    if (filters === "ambiguous")
      return "The PDF includes a stream this scanner cannot inspect safely.";
    if (isImageOnlyPdfFilter(filters)) continue;
    if (filters.length !== 1 || filters[0] !== "FlateDecode")
      return "The PDF includes a stream this scanner cannot inspect safely.";

    let decompressed: Uint8Array;
    try {
      decompressed = await inflate(stream.data, maxDecompressedBytesPerPdf);
    } catch {
      return "The PDF includes a stream that could not be safely inspected.";
    }
    const decompressedText = new TextDecoder("latin1").decode(decompressed);
    if (hasDangerousPdfContent(decompressedText))
      return "The PDF includes active content.";
    totalPages += countPdfPages(decompressedText);
    if (totalPages > 20) return "The PDF exceeds the 20 page limit.";
  }
  return null;
}

/** PDF names may escape any character as `#xx` (`/J#61vaScript` is
 * `/JavaScript`), so names are decoded before they are compared. */
function decodePdfNames(text: string): string {
  return text.replace(
    /\/[^\s/<>[\]()%{}]*#[0-9A-Fa-f]{2}[^\s/<>[\]()%{}]*/g,
    (name) =>
      name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
  );
}

function hasDangerousPdfContent(raw: string): boolean {
  const text = decodePdfNames(raw);
  if (dangerousPdfName.test(text)) return true;
  return /\/URI\s*\(\s*javascript:/i.test(text);
}

function countPdfPages(text: string): number {
  return (text.match(/\/Type\s*\/Page\b/g) ?? []).length;
}

type PdfStream = { dictText: string; data: Uint8Array };

const pdfWhitespace = new Set(["\0", "\t", "\n", "\f", "\r", " "]);
const pdfDelimiters = new Set([
  "(",
  ")",
  "<",
  ">",
  "[",
  "]",
  "{",
  "}",
  "/",
  "%",
]);

/** Index just past the literal string that opens at `start` (nested
 * parentheses and backslash escapes, as PDF reads them). */
function skipPdfString(text: string, start: number): number {
  let level = 0;
  let i = start;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\") i += 2;
    else {
      if (char === "(") level += 1;
      else if (char === ")") level -= 1;
      i += 1;
      if (level === 0) return i;
    }
  }
  return text.length;
}

/** The dictionary with its strings and comments blanked, so a `/Filter`
 * written inside a string never counts. */
function pdfDictSyntax(dict: string): string {
  let out = "";
  let i = 0;
  while (i < dict.length) {
    const char = dict[i] ?? "";
    if (char === "(") {
      const end = skipPdfString(dict, i);
      out += " ".repeat(end - i);
      i = end;
    } else if (char === "%") {
      while (i < dict.length && dict[i] !== "\n" && dict[i] !== "\r") {
        out += " ";
        i += 1;
      }
    } else if (char === "<" && dict[i + 1] !== "<") {
      const end = dict.indexOf(">", i);
      const stop = end === -1 ? dict.length : end + 1;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (char === "<" || char === ">") {
      out += dict.slice(i, i + 2);
      i += 2;
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

/** Reads the file as PDF syntax: strings, hex strings and comments are
 * skipped whole, and a `stream` keyword only counts right after a dictionary.
 * Each stream keeps its own dictionary, never a neighbour's (Chrome writes
 * unfiltered pattern streams right after compressed images). Returns null
 * when the structure cannot be read, so the caller fails closed. */
function extractPdfStreams(
  text: string,
  bytes: Uint8Array,
): PdfStream[] | null {
  const streams: PdfStream[] = [];
  let depth = 0;
  let dictStart = -1;
  let lastDict: string | null = null;
  let i = 0;
  while (i < text.length) {
    const char = text[i] ?? "";
    if (pdfWhitespace.has(char)) {
      i += 1;
      continue;
    }
    if (char === "%") {
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i += 1;
      continue;
    }
    if (char === "(") {
      i = skipPdfString(text, i);
      if (depth === 0) lastDict = null;
      continue;
    }
    if (char === "<" && text[i + 1] === "<") {
      if (depth === 0) dictStart = i;
      depth += 1;
      i += 2;
      continue;
    }
    if (char === ">" && text[i + 1] === ">") {
      depth -= 1;
      i += 2;
      if (depth < 0) return null;
      if (depth === 0) lastDict = text.slice(dictStart, i);
      continue;
    }
    if (char === "<") {
      const end = text.indexOf(">", i);
      if (end === -1) return null;
      i = end + 1;
      if (depth === 0) lastDict = null;
      continue;
    }
    if (pdfDelimiters.has(char) && char !== "/") {
      i += 1;
      if (depth === 0) lastDict = null;
      continue;
    }
    let end = i + 1;
    while (
      end < text.length &&
      !pdfWhitespace.has(text[end] ?? "") &&
      !pdfDelimiters.has(text[end] ?? "")
    )
      end += 1;
    const token = text.slice(i, end);
    i = end;
    if (depth > 0) continue;
    if (token !== "stream") {
      lastDict = null;
      continue;
    }
    if (lastDict === null) return null;
    let dataStart = end;
    if (text[dataStart] === "\r") dataStart += 1;
    if (text[dataStart] === "\n") dataStart += 1;
    const endAt = text.indexOf("endstream", dataStart);
    if (endAt === -1) return null;
    let dataEnd = endAt;
    if (text[dataEnd - 1] === "\n") dataEnd -= 1;
    if (text[dataEnd - 1] === "\r") dataEnd -= 1;
    streams.push({
      dictText: pdfDictSyntax(lastDict),
      data: bytes.subarray(dataStart, Math.max(dataStart, dataEnd)),
    });
    lastDict = null;
    i = endAt + "endstream".length;
  }
  return streams;
}

/** The stream's filters, or null when it has none. A dictionary that names
 * /Filter more than once is ambiguous, so it reads as uninspectable. */
function pdfStreamFilters(dictText: string): string[] | null | "ambiguous" {
  const matches = [
    ...dictText.matchAll(
      /\/Filter(?=[\s\0/<>[\]()%{}])\s*(\/[A-Za-z0-9]+|\[[^\]]*\])?/g,
    ),
  ];
  if (matches.length === 0) return null;
  if (matches.length > 1) return "ambiguous";
  const value = matches[0]?.[1];
  if (!value) return "ambiguous";
  if (value.startsWith("["))
    return [...value.matchAll(/\/([A-Za-z0-9]+)/g)].map(
      (match) => match[1] ?? "",
    );
  return [value.slice(1)];
}
function isImageOnlyPdfFilter(filters: string[]): boolean {
  return (
    filters.length > 0 &&
    filters.every((filter) => filter === "DCTDecode" || filter === "JPXDecode")
  );
}

async function inflate(
  data: Uint8Array,
  maxBytes: number,
): Promise<Uint8Array> {
  const body: BodyInit = new Uint8Array(data);
  const stream = new Response(body).body?.pipeThrough(
    new DecompressionStream("deflate"),
  );
  if (!stream) throw new Error("Decompression is unavailable.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("Decompressed stream exceeds the safety limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
async function hmac(key: string, value: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
  return hex(new Uint8Array(signature));
}
async function digest(bytes: Uint8Array): Promise<string> {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
  );
}
function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function safeEqual(first: string, second: string): Promise<boolean> {
  if (first.length !== second.length) return false;
  const a = new TextEncoder().encode(first),
    b = new TextEncoder().encode(second);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}
function securityHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy":
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "DENY",
  };
}
/** `CUSTOMER_APP_ORIGIN` is a comma-separated allow-list of exact origins
 * (e.g. the local panel and the deployed one). Nothing else gets CORS. */
export function allowedOrigin(
  request: Request,
  env: Pick<AssetWorkerEnv, "CUSTOMER_APP_ORIGIN">,
): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = env.CUSTOMER_APP_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}
function cors(request: Request, env: AssetWorkerEnv): HeadersInit {
  const origin = allowedOrigin(request, env);
  return origin
    ? { "access-control-allow-origin": origin, vary: "origin" }
    : {};
}
function preflight(request: Request, env: AssetWorkerEnv): Response {
  if (!allowedOrigin(request, env))
    return new Response(null, { status: 403, headers: securityHeaders() });
  return new Response(null, {
    status: 204,
    headers: {
      ...securityHeaders(),
      ...cors(request, env),
      "access-control-allow-methods": "PUT",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "300",
    },
  });
}
