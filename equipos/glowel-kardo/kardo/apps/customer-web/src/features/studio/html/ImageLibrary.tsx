import { type Asset, isImageMediaType } from "@kardo/contracts";
import { useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { errorMessage } from "../../../lib/api.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { imageFileProblem, uploadImage } from "../../assets/upload.js";

/** The library images a page may show: validated, PNG, JPEG or WebP. */
export function libraryImages(assets: readonly Asset[]): Asset[] {
  return assets.filter(
    (asset) =>
      asset.status === "validated" && isImageMediaType(asset.mediaType),
  );
}

/**
 * Uploads one image to Assets (same authorize → PUT → finalize flow as the
 * Assets page), with the checks and the error to show.
 */
export function useImageUpload(onUploaded: (asset: Asset) => void) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { workspace } = useWorkspace();

  async function upload(file: File) {
    const problem = imageFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setIsUploading(true);
    try {
      onUploaded(await uploadImage(workspace.id, file));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsUploading(false);
    }
  }

  return { upload, isUploading, error };
}

/**
 * The library's validated images as a grid of thumbnails: pick several
 * (brand images of Tu concepto) or one (connecting an image of the code),
 * and upload a new one right there.
 */
export function ImageLibrary({
  workspaceId,
  assets,
  selected,
  onToggle,
  max,
  canUpload,
  onUploaded,
  disabled,
}: {
  workspaceId: string;
  assets: readonly Asset[];
  selected: readonly string[];
  onToggle: (assetId: string) => void;
  /** Most images that may be selected (1 = single choice). */
  max: number;
  canUpload: boolean;
  onUploaded: (asset: Asset) => void;
  disabled?: boolean | undefined;
}) {
  const images = libraryImages(assets);
  const full = max > 1 && selected.length >= max;
  return (
    <div className="esh-library">
      {images.length ? (
        <ul className="esh-library-grid">
          {images.map((asset) => {
            const isSelected = selected.includes(asset.id);
            return (
              <li key={asset.id}>
                <button
                  aria-pressed={isSelected}
                  className="esh-library-item"
                  data-selected={isSelected || undefined}
                  disabled={disabled || (!isSelected && full)}
                  onClick={() => onToggle(asset.id)}
                  title={asset.filename}
                  type="button"
                >
                  <AssetThumb assetId={asset.id} workspaceId={workspaceId} />
                  <span className="esh-library-name">{asset.filename}</span>
                  {isSelected ? (
                    <span aria-hidden="true" className="esh-library-check">
                      <Icon name="check" size={13} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="esh-library-empty">
          Aún no tienes imágenes validadas en tu biblioteca.
          {canUpload ? " Sube la primera aquí." : ""}
        </p>
      )}
      {canUpload && !disabled ? (
        <UploadControl onUploaded={onUploaded} />
      ) : null}
    </div>
  );
}

export function AssetThumb({
  workspaceId,
  assetId,
}: {
  workspaceId: string;
  assetId: string;
}) {
  const { url } = useAssetImage(workspaceId, assetId, "thumb");
  return (
    <span
      aria-hidden="true"
      className="esh-thumb"
      data-ready={url ? "" : undefined}
    >
      {url ? (
        <img alt="" decoding="async" src={url} />
      ) : (
        <Icon name="asset" size={18} />
      )}
    </span>
  );
}

function UploadControl({ onUploaded }: { onUploaded: (asset: Asset) => void }) {
  const { upload, isUploading, error } = useImageUpload(onUploaded);
  return (
    <div className="esh-upload">
      <label className="button button-secondary button-small esh-upload-button">
        {isUploading ? (
          <span aria-hidden="true" className="button-spinner" />
        ) : (
          <Icon name="upload" size={14} />
        )}
        {isUploading ? "Subiendo…" : "Subir una imagen"}
        <input
          accept="image/png,image/jpeg,image/webp"
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
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
