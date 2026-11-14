import type { Asset, DocumentPage } from "@kardo/contracts";
import { assetsApi, maxAssetBytes } from "../../api/assets.js";
import { assetFileProblem, uploadImage } from "../../features/assets/upload.js";
import {
  clampPageCount,
  openPdfDocument,
  PdfPrepareError,
  pdfPageFileName,
  renderPageToImage,
  truncatedPageCount,
} from "./raster.js";

/**
 * Documento PDF (ADR 018, addendum 3): draws every page of a freshly chosen
 * PDF File and uploads each as a still image, exactly like any other picture
 * in the library (`api/assets.ts`, 5 MB limit, PNG/JPEG/WebP). The original
 * PDF is uploaded too, in parallel with drawing the pages, so "Permitir
 * descargar el PDF" and the Resolver's snapshot have a real file to point at
 * — but the viewer only ever needs `pages`, so a PDF that can't be offered
 * for download (too big, or rejected by the Assets Worker for active
 * content: forms, scripts) never blocks creating the Experience. Pages
 * upload with limited concurrency so the first one is ready to preview as
 * soon as possible, instead of waiting for every page to finish in order.
 *
 * There is no way to re-read an already-uploaded PDF's bytes from the panel
 * (the library's read-authorization endpoint only serves images — see
 * `services/customer-api/src/assets.ts#lookupReadableImage`), so "preparing
 * pages" always starts from a File the person just picked or dropped, never
 * from an existing library entry. "Volver a preparar" simply opens the file
 * picker again.
 */

/** Up to this many pages draw and upload at the same time. */
const PAGE_UPLOAD_CONCURRENCY = 3;

export type PreparePdfPagesProgress = (
  completed: number,
  total: number,
) => void;

/** Fires as soon as a page is drawn locally, before it finishes uploading —
 * `previewUrl` is a local object URL (the canvas's own bytes), so the first
 * page can show up without waiting on the network. Callers must revoke it
 * once they stop needing it. */
export type PreparePdfPagePreview = (
  pageNumber: number,
  total: number,
  previewUrl: string,
) => void;

export type PreparePdfPagesResult = {
  /** Absent when the original PDF can't be offered for download (too large,
   * or rejected). The viewer still works: it only needs `pages`. */
  assetId: string | undefined;
  pages: DocumentPage[];
  totalPages: number;
  truncated: boolean;
  /** Set when `assetId` is absent, explaining why in words the customer can
   * act on (shown next to "Permitir descargar el PDF"). */
  downloadUnavailableNotice: string | undefined;
};

function isAbort(signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted);
}

function abortError(): DOMException {
  return new DOMException("Se canceló la preparación del PDF.", "AbortError");
}

const pdfTooLargeNotice =
  "Tu PDF pesa más de 5 MB, así que no se puede ofrecer para descargar. Se verá en la página igual.";

const pdfUploadFailedNotice =
  "No pudimos subir tu PDF original para poder descargarlo. Se verá en la página igual.";

const activeContentNotice =
  "Tu PDF trae formularios para llenar, botones que hacen algo solos o archivos pegados, así que no se puede descargar. Se verá en la página igual.";

const genericRejectionNotice =
  "Tu PDF no pasó nuestra revisión de seguridad, así que no se puede ofrecer para descargar. Se verá en la página igual.";

const complexPdfNotice =
  "No pudimos revisar todo tu PDF, así que no se puede descargar. Se verá en la página igual.";

/**
 * The Assets Worker (services/assets-worker) rejects a PDF with one of a
 * small, fixed set of English reasons. Reads an optional `rejectedReason` the
 * Asset response may carry (not in today's `Asset` contract yet) without
 * requiring it — this degrades gracefully to a generic, still-correct notice
 * until that field ships.
 */
export function rejectedReasonOf(asset: Asset): string | undefined {
  const widened = asset as unknown as { rejectedReason?: unknown };
  const reason = widened.rejectedReason;
  return typeof reason === "string" && reason.trim() ? reason : undefined;
}

/** Translates a worker rejection reason into a clear, customer-facing
 * explanation. Unknown or missing reasons still get an honest, generic one —
 * creating the Experience is never blocked either way. */
export function pdfRejectionNotice(reason: string | undefined): string {
  if (!reason) return genericRejectionNotice;
  const normalized = reason.toLowerCase();
  if (normalized.includes("active content")) return activeContentNotice;
  if (normalized.includes("stream")) return complexPdfNotice;
  return genericRejectionNotice;
}

/**
 * Validates, rasterizes and uploads every page of `file`. The original PDF
 * uploads in parallel (unless it's over the 5 MB asset limit, in which case
 * it's skipped entirely): `onProgress` reports pages completed, regardless of
 * the original PDF's own upload. Cooperative cancellation: checked between
 * steps, so an in-flight upload is allowed to finish before stopping.
 */
export async function preparePdfPages(params: {
  workspaceId: string;
  file: File;
  signal?: AbortSignal;
  onProgress?: PreparePdfPagesProgress;
  onPagePreview?: PreparePdfPagePreview;
  onAssetUploaded?: (asset: Asset) => void;
}): Promise<PreparePdfPagesResult> {
  const {
    workspaceId,
    file,
    signal,
    onProgress,
    onPagePreview,
    onAssetUploaded,
  } = params;
  if (file.type !== "application/pdf")
    throw new PdfPrepareError("corrupt", "Elige un archivo PDF.");

  const bytes = await file.arrayBuffer();
  const { pdf, totalPages, destroy } = await openPdfDocument(bytes);
  try {
    const pageCount = clampPageCount(totalPages);
    if (isAbort(signal)) throw abortError();
    onProgress?.(0, pageCount);

    // Too big to ever download: skip the original upload outright instead of
    // letting it fail against the 5 MB asset limit. The pages still draw.
    // The one size rule (`features/assets/upload.ts`, A2-46).
    const tooLargeForDownload = assetFileProblem(file) !== null;
    const pdfUploadTask: Promise<Asset | null> = tooLargeForDownload
      ? Promise.resolve(null)
      : // Not `uploadAsset`: a PDF Kardo rejects (active content) must not
        // stop the pages, so its status is read below instead of thrown.
        assetsApi.upload(workspaceId, file).then((asset) => {
          onAssetUploaded?.(asset);
          return asset;
        });
    // Settled independently from the page pipeline below; errors are read
    // once we await it, never left unhandled while pages are still drawing.
    pdfUploadTask.catch(() => {});

    const pages: (DocumentPage | undefined)[] = new Array(pageCount);
    let completed = 0;
    let nextPageNumber = 1;
    async function drawAndUploadPages(): Promise<void> {
      for (;;) {
        if (isAbort(signal)) throw abortError();
        const pageNumber = nextPageNumber;
        if (pageNumber > pageCount) return;
        nextPageNumber += 1;
        const rendered = await renderPageToImage(
          pdf,
          pageNumber,
          maxAssetBytes,
        );
        if (isAbort(signal)) throw abortError();
        onPagePreview?.(
          pageNumber,
          pageCount,
          URL.createObjectURL(rendered.blob),
        );
        const extension = rendered.mediaType === "image/webp" ? "webp" : "jpg";
        const pageFile = new File(
          [rendered.blob],
          pdfPageFileName(file.name, pageNumber, extension),
          { type: rendered.mediaType },
        );
        // Validated or it throws: a page Kardo rejected cannot be shown.
        const pageAsset = await uploadImage(workspaceId, pageFile);
        onAssetUploaded?.(pageAsset);
        pages[pageNumber - 1] = {
          assetId: pageAsset.id,
          width: rendered.width,
          height: rendered.height,
        };
        completed += 1;
        onProgress?.(completed, pageCount);
      }
    }
    const poolSize = Math.max(1, Math.min(PAGE_UPLOAD_CONCURRENCY, pageCount));
    await Promise.all(
      Array.from({ length: poolSize }, () => drawAndUploadPages()),
    );
    if (isAbort(signal)) throw abortError();

    let pdfAsset: Asset | null = null;
    let downloadUnavailableNotice: string | undefined;
    if (tooLargeForDownload) {
      downloadUnavailableNotice = pdfTooLargeNotice;
    } else {
      try {
        pdfAsset = await pdfUploadTask;
      } catch {
        downloadUnavailableNotice = pdfUploadFailedNotice;
      }
      if (pdfAsset?.status === "rejected")
        downloadUnavailableNotice = pdfRejectionNotice(
          rejectedReasonOf(pdfAsset),
        );
    }

    return {
      assetId:
        pdfAsset && pdfAsset.status !== "rejected" ? pdfAsset.id : undefined,
      pages: pages as DocumentPage[],
      totalPages,
      truncated: truncatedPageCount(totalPages) > 0,
      downloadUnavailableNotice,
    };
  } finally {
    await destroy();
  }
}
