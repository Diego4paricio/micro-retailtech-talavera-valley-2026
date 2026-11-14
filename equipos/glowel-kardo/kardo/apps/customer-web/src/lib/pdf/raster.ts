import { DOCUMENT_VIEWER_MAX_PAGES } from "@kardo/contracts";
import { ApiRequestError } from "../api.js";

/**
 * Documento PDF (ADR 018, addendum 3): the panel never shows the browser's own
 * PDF plugin (Chrome for Android doesn't even embed one) — instead it draws
 * every page to a canvas once, at upload time, and uploads each page as a
 * still image through the same Assets flow every other picture in the panel
 * uses. `prepare.ts` orchestrates the network side; this module only touches
 * pdf.js and the canvas.
 *
 * pdf.js is never in the initial bundle: `loadPdfJs` dynamically imports it
 * (and its worker, as a same-origin, hashed asset via Vite's `?url`) only
 * when a PDF is actually being processed. The panel's CSP has no
 * `worker-src`, so it falls back to `script-src 'self'`, which a same-origin
 * bundled worker satisfies.
 */

// 1,080 px keeps pages comfortably readable while cutting draw and upload
// time versus the previous 1,240 px target (relevo: measured on a 5-page PDF).
export const PDF_PAGE_TARGET_WIDTH = 1_080;
const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.85;
/** One retry at a lower quality before giving up on an oversized page. */
const JPEG_RETRY_QUALITY = 0.6;

export type PdfPrepareErrorCode =
  | "password"
  | "corrupt"
  | "empty"
  | "too-large"
  | "unknown";

export class PdfPrepareError extends Error {
  code: PdfPrepareErrorCode;
  constructor(code: PdfPrepareErrorCode, message: string) {
    super(message);
    this.name = "PdfPrepareError";
    this.code = code;
  }
}

/** The page count this PDF will actually draw (the viewer's hard cap). */
export function clampPageCount(totalPages: number): number {
  return Math.min(Math.max(totalPages, 0), DOCUMENT_VIEWER_MAX_PAGES);
}

/** A PDF longer than the cap: how many pages are left out. */
export function truncatedPageCount(totalPages: number): number {
  return Math.max(0, totalPages - DOCUMENT_VIEWER_MAX_PAGES);
}

/** "Menú de temporada.pdf" → "Menú de temporada". */
export function stripPdfExtension(filename: string): string {
  const trimmed = filename.trim();
  const withoutExtension = trimmed.replace(/\.pdf$/i, "").trim();
  return withoutExtension || "Documento";
}

/**
 * A recognizable, stable name for the page image asset: "<pdf name> pág
 * 3.webp". Kept at or under the library's 255-character filename limit.
 */
export function pdfPageFileName(
  pdfFilename: string,
  pageNumber: number,
  extension: "webp" | "jpg",
): string {
  const base = stripPdfExtension(pdfFilename);
  const suffix = ` pág ${pageNumber}.${extension}`;
  const maxBase = 255 - suffix.length;
  const safeBase = maxBase > 0 ? base.slice(0, maxBase) : base.slice(0, 1);
  return `${safeBase}${suffix}`;
}

/** The canvas width/height a page renders at, given its native size. */
export function pageCanvasSize(
  nativeWidth: number,
  nativeHeight: number,
  targetWidth: number = PDF_PAGE_TARGET_WIDTH,
): { width: number; height: number; scale: number } {
  const scale = nativeWidth > 0 ? targetWidth / nativeWidth : 1;
  return {
    width: Math.max(1, Math.round(nativeWidth * scale)),
    height: Math.max(1, Math.round(nativeHeight * scale)),
    scale,
  };
}

// ---------------------------------------------------------------------------
// pdf.js integration (only touched once a PDF is actually being processed)
// ---------------------------------------------------------------------------

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise)
    pdfjsPromise = (async () => {
      const [pdfjsLib, workerUrl] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url").then(
          (mod) => mod.default,
        ),
      ]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    })().catch((error: unknown) => {
      // A failed load must not "stick": the next attempt tries again.
      pdfjsPromise = null;
      throw error;
    });
  return pdfjsPromise;
}

function classifyLoadError(
  error: unknown,
  pdfjsLib: PdfJsModule,
): PdfPrepareError {
  if (error instanceof pdfjsLib.PasswordException)
    return new PdfPrepareError(
      "password",
      "Este PDF está protegido con contraseña. Quítasela e inténtalo de nuevo.",
    );
  if (error instanceof pdfjsLib.InvalidPDFException)
    return new PdfPrepareError(
      "corrupt",
      "No pudimos leer este archivo. Puede estar dañado; prueba con otro PDF.",
    );
  return new PdfPrepareError(
    "unknown",
    "No pudimos abrir el PDF. Inténtalo de nuevo.",
  );
}

/** Opens a PDF from its bytes; throws a `PdfPrepareError` on anything the
 * customer can act on (password, corrupt file, no pages). `destroy` releases
 * the worker (it lives on the loading task, not the resolved document). */
export async function openPdfDocument(data: ArrayBuffer): Promise<{
  pdf: PdfDocument;
  totalPages: number;
  destroy: () => Promise<void>;
}> {
  const pdfjsLib = await loadPdfJs();
  // A private copy per call: pdf.js detaches/transfers the buffer.
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  let pdf: PdfDocument;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    throw classifyLoadError(error, pdfjsLib);
  }
  const destroy = () => loadingTask.destroy();
  if (pdf.numPages < 1) {
    await destroy();
    throw new PdfPrepareError("empty", "Este PDF no tiene páginas.");
  }
  return { pdf, totalPages: pdf.numPages, destroy };
}

/** `errorMessage` (lib/api.ts) only special-cases `ApiRequestError`; this
 * keeps the friendly `PdfPrepareError` text too (an upload failure still
 * reads its `ApiRequestError` message, already in Spanish). */
export function pdfErrorMessage(error: unknown): string {
  if (error instanceof PdfPrepareError) return error.message;
  if (error instanceof ApiRequestError) return error.message;
  return "No pudimos preparar las páginas del PDF. Inténtalo de nuevo.";
}

export type RasterizedPage = {
  blob: Blob;
  mediaType: "image/webp" | "image/jpeg";
  width: number;
  height: number;
};

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Canvas → the smallest widely supported still image: WebP first, falling
 * back to JPEG when the browser can't encode WebP (or the page is too big
 * for the 5 MB asset limit, retried once at a lower quality). */
async function encodePage(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<{ blob: Blob; mediaType: "image/webp" | "image/jpeg" }> {
  const webp = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
  if (webp && webp.type === "image/webp" && webp.size <= maxBytes)
    return { blob: webp, mediaType: "image/webp" };
  const jpeg = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (jpeg && jpeg.size <= maxBytes)
    return { blob: jpeg, mediaType: "image/jpeg" };
  const smaller = await canvasToBlob(canvas, "image/jpeg", JPEG_RETRY_QUALITY);
  if (smaller && smaller.size <= maxBytes)
    return { blob: smaller, mediaType: "image/jpeg" };
  throw new PdfPrepareError(
    "too-large",
    "Una página del PDF es demasiado grande para procesarla.",
  );
}

/** Draws one page to a canvas at `targetWidth` and encodes it. */
export async function renderPageToImage(
  pdf: PdfDocument,
  pageNumber: number,
  maxBytes: number,
  targetWidth: number = PDF_PAGE_TARGET_WIDTH,
): Promise<RasterizedPage> {
  const page = await pdf.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const { scale } = pageCanvasSize(base.width, base.height, targetWidth);
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d");
    if (!context)
      throw new PdfPrepareError(
        "unknown",
        "Tu navegador no puede dibujar el PDF.",
      );
    await page.render({ canvas, viewport }).promise;
    const { blob, mediaType } = await encodePage(canvas, maxBytes);
    return { blob, mediaType, width: canvas.width, height: canvas.height };
  } finally {
    page.cleanup();
  }
}
