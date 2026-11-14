import type { Asset, DocumentPage } from "@kardo/contracts";
import { type CSSProperties, type DragEvent, useRef, useState } from "react";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { useAssetImage } from "../asset-images.js";
import { formatBytes } from "../format.js";
import {
  type PdfPagePreview,
  usePdfPagesPreparation,
} from "./use-pdf-pages.js";

/** Small thumbnails shown besides the big first-page preview. */
const thumbsShown = 7;

type ProgressVars = CSSProperties & { "--pdf-field-progress"?: number };

/**
 * Picks or drops a PDF, draws its pages (pdf.js, lazy-loaded) and uploads
 * each one to Assets, showing a real preview and clear progress the whole
 * way, letting the person cancel. Used both when creating a Documento PDF and
 * inside its editor ("Volver a preparar" just runs the same flow again — see
 * `pdf/prepare.ts` for why an existing library PDF can't be re-drawn without
 * a fresh upload, and for why the PDF itself is optional: the viewer only
 * needs `pages`, so a PDF that can't be offered for download never blocks
 * creating the Experience).
 */
export function PdfPagesField({
  workspaceId,
  assetId,
  pages,
  onChange,
  onAssetUploaded,
  readOnly,
  error,
  id = "pdf-pages",
  label = "Archivo PDF",
}: {
  workspaceId: string;
  assetId: string | undefined;
  pages: readonly DocumentPage[] | undefined;
  onChange: (next: {
    assetId: string | undefined;
    pages: DocumentPage[];
  }) => void;
  onAssetUploaded: (asset: Asset) => void;
  readOnly?: boolean | undefined;
  error?: string | undefined;
  id?: string | undefined;
  label?: string | undefined;
}) {
  const { status, prepare, cancel } = usePdfPagesPreparation(workspaceId);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const currentPages = pages ?? [];
  const hasPages = currentPages.length > 0;
  const preparing = status.phase === "preparing";

  function runFile(file: File) {
    setLocalError(null);
    if (file.type !== "application/pdf") {
      setLocalError("Elige un archivo PDF.");
      return;
    }
    lastFileRef.current = file;
    prepare(
      file,
      (result) => onChange({ assetId: result.assetId, pages: result.pages }),
      onAssetUploaded,
    );
  }

  function openPicker() {
    if (!preparing) inputRef.current?.click();
  }

  function retryLastFile() {
    if (lastFileRef.current) runFile(lastFileRef.current);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) runFile(file);
  }

  return (
    <Field error={error ?? localError} id={id} label={label}>
      <div className="pdf-field">
        {status.phase === "preparing" ? (
          <PdfPreparingView
            completed={status.completed}
            fileName={status.fileName}
            fileSize={status.fileSize}
            onCancel={cancel}
            previews={status.previews}
            total={status.total}
          />
        ) : status.phase === "error" ? (
          <PdfErrorView
            message={status.message}
            onChooseAnother={openPicker}
            onRetry={lastFileRef.current ? retryLastFile : undefined}
          />
        ) : status.phase === "done" ? (
          <PdfDoneView
            fileName={status.fileName}
            fileSize={status.fileSize}
            onReprepare={!readOnly ? openPicker : undefined}
            previews={status.previews}
            totalPages={status.totalPages}
          />
        ) : hasPages ? (
          <PdfLegacyReadyView
            onReprepare={!readOnly ? openPicker : undefined}
            pages={currentPages}
            workspaceId={workspaceId}
          />
        ) : readOnly ? (
          <p className="field-hint">Sin páginas preparadas.</p>
        ) : (
          <button
            className={
              isDragging
                ? "pdf-field-dropzone pdf-field-dropzone-active"
                : "pdf-field-dropzone"
            }
            onClick={openPicker}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDrop={onDrop}
            type="button"
          >
            <Icon name="upload" size={22} />
            <strong>Arrastra tu PDF aquí o elige un archivo</strong>
            <span>PDF de hasta 5 MB y 40 páginas.</span>
          </button>
        )}
        {!readOnly ? (
          <input
            accept="application/pdf"
            className="visually-hidden"
            disabled={preparing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) runFile(file);
            }}
            ref={inputRef}
            type="file"
          />
        ) : null}
      </div>
      {status.phase === "done" && status.truncated ? (
        <Notice tone="warning">
          Tu PDF tiene {status.totalPages} páginas; el visor muestra solo las
          primeras 40.
        </Notice>
      ) : null}
      {status.phase === "done" && status.downloadUnavailableNotice ? (
        <Notice tone="info">{status.downloadUnavailableNotice}</Notice>
      ) : null}
      {assetId && !hasPages && status.phase === "idle" && !error ? (
        <Notice tone="info">
          Prepara las páginas del PDF para mostrarlo en la página.
        </Notice>
      ) : null}
    </Field>
  );
}

/** "Leyendo tu PDF…", then "Preparando página X de Y" with a progress bar,
 * showing the first page (and any other already-drawn page) as soon as it's
 * ready, locally — no network round trip. */
function PdfPreparingView({
  fileName,
  fileSize,
  total,
  completed,
  previews,
  onCancel,
}: {
  fileName: string;
  fileSize: number;
  total: number;
  completed: number;
  previews: readonly PdfPagePreview[];
  onCancel: () => void;
}) {
  const first = previews.find((preview) => preview.pageNumber === 1);
  const rest = previews
    .filter((preview) => preview.pageNumber !== 1)
    .slice(0, thumbsShown);
  const label =
    total === 0
      ? "Leyendo tu PDF…"
      : completed < total
        ? `Preparando página ${Math.min(completed + 1, total)} de ${total}`
        : "Subiendo tu documento…";
  const fraction = total > 0 ? completed / total : 0;
  return (
    <div className="pdf-field-working">
      <div className="pdf-field-big-preview" aria-hidden="true">
        {first ? (
          <img alt="" decoding="async" src={first.url} />
        ) : (
          <Icon name="document" size={26} />
        )}
      </div>
      <div className="pdf-field-working-info">
        <p className="pdf-field-filename">{fileName}</p>
        <p className="field-hint">{formatBytes(fileSize)}</p>
        <div className="pdf-field-progress" role="status">
          <span
            aria-hidden="true"
            className="pdf-field-progress-track"
            style={{ "--pdf-field-progress": fraction } as ProgressVars}
          >
            <span className="pdf-field-progress-bar" />
          </span>
          <p>{label}</p>
        </div>
        {rest.length ? (
          <ul className="pdf-field-thumbs">
            {rest.map((preview) => (
              <li key={preview.pageNumber}>
                <span aria-hidden="true" className="pdf-field-thumb">
                  <img alt="" decoding="async" src={preview.url} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          className="button button-secondary button-small"
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Just finished in this session: the big first page, thumbnails of the rest
 * (all local previews, drawn moments ago), the file's name, size and page
 * count, and "Volver a preparar". */
function PdfDoneView({
  fileName,
  fileSize,
  totalPages,
  previews,
  onReprepare,
}: {
  fileName: string;
  fileSize: number;
  totalPages: number;
  previews: readonly PdfPagePreview[];
  onReprepare?: (() => void) | undefined;
}) {
  const first = previews.find((preview) => preview.pageNumber === 1);
  const rest = previews
    .filter((preview) => preview.pageNumber !== 1)
    .slice(0, thumbsShown);
  const extra = Math.max(0, previews.length - 1 - rest.length);
  const shownPages = Math.min(totalPages, previews.length || totalPages);
  return (
    <div className="pdf-field-ready">
      <div className="pdf-field-ready-main">
        <div className="pdf-field-big-preview" aria-hidden="true">
          {first ? (
            <img alt="" decoding="async" src={first.url} />
          ) : (
            <Icon name="document" size={26} />
          )}
        </div>
        <div className="pdf-field-ready-info">
          <p className="pdf-field-filename">{fileName}</p>
          <p className="field-hint">{formatBytes(fileSize)}</p>
          {rest.length || extra ? (
            <ul className="pdf-field-thumbs">
              {rest.map((preview) => (
                <li key={preview.pageNumber}>
                  <span aria-hidden="true" className="pdf-field-thumb">
                    <img alt="" decoding="async" src={preview.url} />
                  </span>
                </li>
              ))}
              {extra > 0 ? (
                <li className="pdf-field-thumb-more">+{extra}</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="pdf-field-ready-meta">
        <strong>
          {shownPages === 1
            ? "Listo: 1 página"
            : `Listo: ${shownPages} páginas`}
        </strong>
        {onReprepare ? (
          <button className="text-action" onClick={onReprepare} type="button">
            <Icon name="refresh" size={14} /> Volver a preparar
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Pages prepared in an earlier session: only `assetId`s are persisted, so
 * every thumbnail (including the big first one) reads from the library over
 * the network instead of a local preview. */
function PdfLegacyReadyView({
  workspaceId,
  pages,
  onReprepare,
}: {
  workspaceId: string;
  pages: readonly DocumentPage[];
  onReprepare?: (() => void) | undefined;
}) {
  const [first, ...others] = pages;
  const rest = others.slice(0, thumbsShown);
  const extra = Math.max(0, others.length - rest.length);
  return (
    <div className="pdf-field-ready">
      <div className="pdf-field-ready-main">
        <div className="pdf-field-big-preview" aria-hidden="true">
          {first ? (
            <PdfPageImage
              assetId={first.assetId}
              className="pdf-field-big-preview-image"
              size="full"
              workspaceId={workspaceId}
            />
          ) : (
            <Icon name="document" size={26} />
          )}
        </div>
        <div className="pdf-field-ready-info">
          {rest.length || extra ? (
            <ul className="pdf-field-thumbs">
              {rest.map((page) => (
                <li key={page.assetId}>
                  <PdfPageImage
                    assetId={page.assetId}
                    size="thumb"
                    workspaceId={workspaceId}
                  />
                </li>
              ))}
              {extra > 0 ? (
                <li className="pdf-field-thumb-more">+{extra}</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="pdf-field-ready-meta">
        <strong>
          {pages.length === 1
            ? "1 página lista"
            : `${pages.length} páginas listas`}
        </strong>
        {onReprepare ? (
          <button className="text-action" onClick={onReprepare} type="button">
            <Icon name="refresh" size={14} /> Volver a preparar
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** An error with a way out: choose a different file, or try the same one
 * again (shown only once a file has actually been attempted). */
function PdfErrorView({
  message,
  onChooseAnother,
  onRetry,
}: {
  message: string;
  onChooseAnother: () => void;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="pdf-field-error">
      <p className="field-error">
        <Icon name="circle-alert" size={14} />
        <span>{message}</span>
      </p>
      <div className="pdf-field-error-actions">
        <button
          className="button button-secondary button-small"
          onClick={onChooseAnother}
          type="button"
        >
          Elegir otro PDF
        </button>
        {onRetry ? (
          <button
            className="button button-secondary button-small"
            onClick={onRetry}
            type="button"
          >
            <Icon name="refresh" size={14} /> Reintentar
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** One page's small (or, for the big preview, large) picture read from the
 * library over the network, or the asset icon while it loads/fails. */
function PdfPageImage({
  workspaceId,
  assetId,
  size,
  className = "pdf-field-thumb",
}: {
  workspaceId: string;
  assetId: string;
  size: "thumb" | "full";
  className?: string;
}) {
  const { url } = useAssetImage(workspaceId, assetId, size);
  return (
    <span aria-hidden="true" className={className}>
      {url ? (
        <img alt="" decoding="async" src={url} />
      ) : (
        <Icon name="asset" size={16} />
      )}
    </span>
  );
}
