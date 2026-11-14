import type { Asset } from "@kardo/contracts";
import { type DragEvent, useEffect, useId, useState } from "react";
import { maxAssetBytes } from "../../../api/assets.js";
import { Dialog } from "../../../components/Dialog.js";
import { Icon, type IconName } from "../../../components/Icon.js";
import { formatBytes } from "../../../lib/format.js";
import {
  AssetThumb,
  ImageLibrary,
  libraryImages,
  useImageUpload,
} from "./ImageLibrary.js";
import {
  type ImageSlot,
  type ImageSlotKind,
  imageSlotKindCopy,
} from "./images.js";

const slotIcon: Record<ImageSlotKind, IconName> = {
  placeholder: "sparkles",
  file: "file-image",
  external: "globe",
  embedded: "code",
  broken: "link-off",
  empty: "empty",
};

/**
 * The Imágenes tab of the code: how images work (they live in Assets and
 * are written into the code as kardo-asset:), upload or pick one, and the
 * images the code uses that are not connected yet.
 */
export function ImagesPanel({
  workspaceId,
  assets,
  slots,
  slotLabels,
  canEdit,
  canUpload,
  onUploaded,
  onInsertHtml,
  onUseBackground,
  onCopy,
  onConnect,
}: {
  workspaceId: string;
  assets: readonly Asset[];
  slots: readonly ImageSlot[];
  slotLabels: ReadonlyMap<string, string>;
  canEdit: boolean;
  /** Upload to Assets (the `assets.manage` permission and an editable page). */
  canUpload: boolean;
  onUploaded: (asset: Asset) => void;
  onInsertHtml: (asset: Asset) => void;
  onUseBackground: (asset: Asset) => void;
  onCopy: (asset: Asset) => void;
  onConnect: (slot: ImageSlot) => void;
}) {
  const images = libraryImages(assets);
  const slotsTitle = useId();
  const libraryTitle = useId();
  return (
    <div className="esh-images">
      <div className="esh-images-intro">
        <Icon name="asset" size={18} />
        <p>
          Tus imágenes viven en <strong>Archivos</strong>. Aquí las subes o las
          eliges y, con <strong>Insertar</strong>, se escriben solas en tu
          código. Kardo las muestra en la vista previa y al publicar.
        </p>
      </div>

      {slots.length ? (
        <section aria-labelledby={slotsTitle} className="esh-slots">
          <div className="esh-images-head">
            <h3 id={slotsTitle}>
              Imágenes por conectar{" "}
              <span className="esh-count">{slots.length}</span>
            </h3>
            <p>
              Tu código las usa, pero no están en Archivos y no se ven.
              Conéctalas con una imagen de tu biblioteca.
            </p>
          </div>
          <ul className="esh-slot-list">
            {slots.map((slot) => {
              const label = slotLabels.get(slot.value) ?? slot.value;
              return (
                <li className="esh-slot" key={slot.value}>
                  <span aria-hidden="true" className="esh-slot-icon">
                    <Icon name={slotIcon[slot.kind]} size={16} />
                  </span>
                  <div className="esh-slot-text">
                    <strong className="esh-slot-name" title={label}>
                      {label}
                    </strong>
                    <small className="esh-slot-meta">
                      {imageSlotKindCopy[slot.kind]} ·{" "}
                      {slot.count === 1 ? "1 vez" : `${slot.count} veces`}
                    </small>
                    {slot.alt ? (
                      <small className="esh-slot-alt">«{slot.alt}»</small>
                    ) : null}
                  </div>
                  <button
                    aria-label={`Conectar ${label}`}
                    className="button button-primary button-small"
                    disabled={!canEdit}
                    onClick={() => onConnect(slot)}
                    type="button"
                  >
                    <Icon name="link-on" size={15} />
                    Conectar
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {canUpload ? <UploadDrop onUploaded={onUploaded} /> : null}

      <section aria-labelledby={libraryTitle} className="esh-library-section">
        <div className="esh-images-head">
          <h3 id={libraryTitle}>
            Tu biblioteca <span className="esh-count">{images.length}</span>
          </h3>
        </div>
        {images.length ? (
          <ul className="esh-image-grid">
            {images.map((asset) => (
              <li className="esh-image" key={asset.id}>
                <AssetThumb assetId={asset.id} workspaceId={workspaceId} />
                <span className="esh-image-name" title={asset.filename}>
                  {asset.filename}
                </span>
                <button
                  aria-label={`Insertar ${asset.filename} en HTML`}
                  className="button button-secondary button-small esh-image-insert"
                  disabled={!canEdit}
                  onClick={() => onInsertHtml(asset)}
                  type="button"
                >
                  <Icon name="code" size={14} />
                  Insertar en HTML
                </button>
                <span className="esh-image-more">
                  <button
                    aria-label={`Usar ${asset.filename} de fondo en el CSS`}
                    className="link-button"
                    disabled={!canEdit}
                    onClick={() => onUseBackground(asset)}
                    type="button"
                  >
                    Usar de fondo
                  </button>
                  <button
                    aria-label={`Copiar el código de ${asset.filename}`}
                    className="link-button"
                    onClick={() => onCopy(asset)}
                    type="button"
                  >
                    Copiar código
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="esh-library-empty">
            Aún no tienes imágenes en Archivos.
            {canUpload ? " Sube la primera aquí arriba." : ""}
          </p>
        )}
      </section>
    </div>
  );
}

function UploadDrop({ onUploaded }: { onUploaded: (asset: Asset) => void }) {
  const { upload, isUploading, error } = useImageUpload(onUploaded);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !isUploading) void upload(file);
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping is a pointer convenience; "elige un archivo" is the keyboard path
    <div
      className="esh-drop"
      data-dragging={dragging || undefined}
      onDragLeave={(event) => {
        // Moving over the zone's own children is not leaving it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={onDrop}
    >
      <span aria-hidden="true" className="esh-drop-icon">
        {isUploading ? (
          <span className="button-spinner" />
        ) : (
          <Icon name="upload" size={18} />
        )}
      </span>
      <div className="esh-drop-text">
        <p aria-live="polite">
          {isUploading ? (
            "Subiendo a Archivos…"
          ) : (
            <>
              Arrastra una imagen aquí o{" "}
              <label className="esh-drop-pick">
                elige un archivo
                <input
                  accept="image/png,image/jpeg,image/webp"
                  aria-describedby={hintId}
                  className="visually-hidden"
                  disabled={isUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                  }}
                  type="file"
                />
              </label>
            </>
          )}
        </p>
        <small id={hintId}>
          PNG, JPEG o WebP hasta {formatBytes(maxAssetBytes)}. Se guarda en
          Archivos.
        </small>
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    </div>
  );
}

/** Picks the library image that takes a slot's place (or uploads one). */
export function ConnectImageDialog({
  slot,
  label,
  onClose,
  onConnect,
  workspaceId,
  assets,
  canUpload,
  onUploaded,
}: {
  slot: ImageSlot | null;
  label: string;
  onClose: () => void;
  onConnect: (asset: Asset) => void;
  workspaceId: string;
  assets: readonly Asset[];
  canUpload: boolean;
  onUploaded: (asset: Asset) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const value = slot?.value ?? null;
  // A new slot starts with nothing chosen.
  useEffect(() => {
    if (value !== null) setChoice(null);
  }, [value]);
  const chosen = assets.find((asset) => asset.id === choice) ?? null;
  const count = slot?.count ?? 1;
  return (
    <Dialog
      description={
        count > 1
          ? `Elige la imagen de tu biblioteca que va en su lugar. La cambiamos en las ${count} partes de tu código donde aparece.`
          : "Elige la imagen de tu biblioteca que va en su lugar."
      }
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            disabled={!chosen}
            onClick={() => {
              if (chosen) onConnect(chosen);
            }}
            type="button"
          >
            <Icon name="link-on" size={16} /> Conectar imagen
          </button>
        </>
      }
      onClose={onClose}
      open={slot !== null}
      size="large"
      title={`Conectar ${label}`}
    >
      {slot?.alt ? (
        <p className="esh-connect-alt">
          <Icon name="info" size={15} />
          <span>
            Aquí va: <strong>«{slot.alt}»</strong>
          </span>
        </p>
      ) : null}
      <ImageLibrary
        assets={assets}
        canUpload={canUpload}
        max={1}
        onToggle={(assetId) =>
          setChoice((current) => (current === assetId ? null : assetId))
        }
        onUploaded={(asset) => {
          onUploaded(asset);
          if (asset.status === "validated") setChoice(asset.id);
        }}
        selected={choice ? [choice] : []}
        workspaceId={workspaceId}
      />
    </Dialog>
  );
}
