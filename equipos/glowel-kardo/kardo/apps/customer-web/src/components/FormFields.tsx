/**
 * Form fields shared across the panel (domain audit A2-34): they lived inside
 * Páginas' editors, and Configuración, the Estudio, Primeros pasos and Links
 * all imported them from there.
 */
import { type Asset, isImageMediaType } from "@kardo/contracts";
import { type DragEvent, useState } from "react";
import {
  assetFileProblem,
  imageFileProblem,
  uploadAsset,
} from "../features/assets/upload.js";
import { errorMessage } from "../lib/api.js";
import { useAssetImage } from "../lib/asset-images.js";
import { Link } from "../lib/router.js";
import { useWorkspace } from "../workspace/WorkspaceContext.js";
import { Field } from "./Field.js";
import { Icon } from "./Icon.js";

export function TextInput({
  id,
  label,
  value,
  onChange,
  error,
  max,
  optional,
  placeholder,
  hint,
  type = "text",
  readOnly,
  multiline,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string | undefined;
  max: number;
  optional?: boolean | undefined;
  placeholder?: string | undefined;
  hint?: string | undefined;
  type?: "text" | "url" | undefined;
  readOnly?: boolean | undefined;
  multiline?: boolean | undefined;
}) {
  const current = value ?? "";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <Field
      counter={
        max >= 160 || current.length > max * 0.8
          ? { value: current.length, max }
          : undefined
      }
      error={error}
      hint={hint}
      id={id}
      label={label}
      optional={optional}
    >
      {multiline ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          id={id}
          maxLength={max}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          value={current}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          autoComplete="off"
          id={id}
          inputMode={type === "url" ? "url" : undefined}
          maxLength={type === "url" ? 2048 : max}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          spellCheck={type === "url" ? false : undefined}
          type={type}
          value={current}
        />
      )}
    </Field>
  );
}

export function PriceInput({
  id,
  label,
  value,
  onChange,
  error,
  readOnly,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  error?: string | undefined;
  readOnly?: boolean | undefined;
}) {
  return (
    <Field error={error} id={id} label={label} optional>
      <input
        aria-invalid={Boolean(error)}
        id={id}
        inputMode="decimal"
        max={10_000_000}
        min={0}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : event.target.valueAsNumber,
          )
        }
        placeholder="0.00"
        readOnly={readOnly}
        step="0.01"
        type="number"
        value={value ?? ""}
      />
    </Field>
  );
}

/** «Foto de «Concha»», or with a verb, «Subir foto de «Concha»»; just
 * «Foto» while the product has no name. Every photo field says whose it is
 * (relevo 37, round 3: photos went to the wrong bread twice). */
export function photoLabel(name: string, verb?: string): string {
  const what = name.trim() ? `foto de «${name.trim()}»` : "foto";
  return verb
    ? `${verb} ${what}`
    : what.charAt(0).toUpperCase() + what.slice(1);
}

export function AssetSelect({
  id,
  label,
  value,
  onChange,
  assets,
  kind: assetKind,
  error,
  optional,
  readOnly,
  onAssetUploaded,
  uploadLabel,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  assets: readonly Asset[];
  /** "image" accepts any validated PNG/JPEG/WebP; "pdf" only validated PDFs. */
  kind: "image" | "pdf";
  error?: string | undefined;
  optional?: boolean | undefined;
  readOnly?: boolean | undefined;
  /** Omit to hide the inline upload dropzone (e.g. a fully read-only view). */
  onAssetUploaded?: ((asset: Asset) => void) | undefined;
  /** The dropzone's words, naming what the file is for («Subir foto de
   * «Bolillo»»); a generic one when absent. */
  uploadLabel?: string | undefined;
}) {
  const { workspace } = useWorkspace();
  const options = assets.filter(
    (asset) =>
      asset.status === "validated" &&
      (assetKind === "image"
        ? isImageMediaType(asset.mediaType)
        : asset.mediaType === "application/pdf"),
  );
  const placeholder =
    assetKind === "image" ? "Selecciona una imagen" : "Selecciona un PDF";
  return (
    <Field
      error={error}
      hint={
        options.length ? (
          assetKind === "image" ? (
            "Solo aparecen imágenes (PNG, JPEG o WebP) ya validadas."
          ) : (
            "Solo aparecen archivos PDF ya validados."
          )
        ) : (
          <>
            {assetKind === "image"
              ? "Aún no hay imágenes validadas."
              : "Aún no hay archivos PDF validados."}{" "}
            <Link to={{ name: "assets" }}>Súbelos en Archivos</Link>.
          </>
        )
      }
      id={id}
      label={label}
      optional={optional}
    >
      <div className="asset-select-control">
        {assetKind === "image" && value ? (
          <AssetSelectThumbnail assetId={value} workspaceId={workspace.id} />
        ) : null}
        <select
          aria-invalid={Boolean(error)}
          disabled={readOnly}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={value ?? ""}
        >
          <option value="">
            {optional
              ? assetKind === "image"
                ? "Sin imagen"
                : "Sin archivo"
              : placeholder}
          </option>
          {options.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.filename}
            </option>
          ))}
          {value && !options.some((asset) => asset.id === value) ? (
            <option value={value}>Archivo no disponible</option>
          ) : null}
        </select>
      </div>
      {!readOnly && onAssetUploaded ? (
        <InlineAssetUpload
          kind={assetKind}
          label={uploadLabel}
          onUploaded={(asset) => {
            onAssetUploaded(asset);
            onChange(asset.id);
          }}
        />
      ) : null}
    </Field>
  );
}

/** A small preview of the selected image, or the asset icon while it loads/fails. */
function AssetSelectThumbnail({
  workspaceId,
  assetId,
}: {
  workspaceId: string;
  assetId: string;
}) {
  const { url } = useAssetImage(workspaceId, assetId, "thumb");
  return (
    <span aria-hidden="true" className="asset-select-thumb">
      {url ? (
        <img alt="" decoding="async" src={url} />
      ) : (
        <Icon name="asset" size={16} />
      )}
    </span>
  );
}

/**
 * A compact drop zone inside the picker itself: when the library is empty (or
 * anytime), the person can upload right there instead of leaving to Assets.
 * Uses `uploadAsset`, the same flow as `AssetUploadZone`, scoped to the media
 * types this picker accepts.
 */
function InlineAssetUpload({
  kind,
  label,
  onUploaded,
}: {
  kind: "image" | "pdf";
  label?: string | undefined;
  onUploaded: (asset: Asset) => void;
}) {
  const { workspace } = useWorkspace();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept =
    kind === "image" ? "image/png,image/jpeg,image/webp" : "application/pdf";

  async function handleFile(file: File) {
    // Type, size and Kardo's own check come from the one upload helper
    // (domain audit A2-46); a PDF-only picker rejects images here.
    const problem =
      kind === "pdf" && file.type !== "application/pdf"
        ? "Usa un archivo PDF."
        : kind === "image"
          ? imageFileProblem(file)
          : assetFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      const asset = await uploadAsset(workspace.id, file, {
        imagesOnly: kind === "image",
      });
      onUploaded(asset);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="asset-select-upload">
      <label
        className={
          isDragging
            ? "asset-select-dropzone asset-select-dropzone-active"
            : "asset-select-dropzone"
        }
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={onDrop}
      >
        <Icon name="upload" size={14} />
        <span>
          {isUploading
            ? "Subiendo…"
            : (label ??
              (kind === "image"
                ? "Arrastra o sube una imagen nueva"
                : "Arrastra o sube un PDF nuevo"))}
        </span>
        <input
          accept={accept}
          className="visually-hidden"
          disabled={isUploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
          type="file"
        />
      </label>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

/** Reorder/remove controls shared by every repeatable list. */
export function ItemControls({
  label,
  index,
  count,
  onMove,
  onRemove,
  minItems = 0,
  readOnly,
}: {
  label: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  minItems?: number | undefined;
  readOnly?: boolean | undefined;
}) {
  if (readOnly) return null;
  return (
    <div className="item-controls">
      <button
        aria-label={`Mover arriba ${label}`}
        className="icon-button"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        title="Mover arriba"
        type="button"
      >
        <Icon name="arrow-up" size={16} />
      </button>
      <button
        aria-label={`Mover abajo ${label}`}
        className="icon-button"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        title="Mover abajo"
        type="button"
      >
        <Icon name="arrow-down" size={16} />
      </button>
      <button
        aria-label={`Eliminar ${label}`}
        className="icon-button icon-button-danger"
        disabled={count <= minItems}
        onClick={() => onRemove(index)}
        title="Eliminar"
        type="button"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** A patch whose optional fields may be cleared by passing `undefined`. */
export type Loose<T> = { [K in keyof T]?: T[K] | undefined };

/** Merges a patch and drops cleared keys (the API rejects explicit undefined). */
export function merge<T extends object>(value: T, patch: Loose<T>): T {
  const next = { ...value, ...patch } as Record<string, unknown>;
  for (const key of Object.keys(next))
    if (next[key] === undefined) delete next[key];
  return next as T;
}

export function moveItem<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function replaceAt<T>(
  items: readonly T[],
  index: number,
  value: T,
): T[] {
  const next = items.slice();
  next[index] = value;
  return next;
}
