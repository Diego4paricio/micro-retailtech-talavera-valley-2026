import { type DragEvent, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { errorMessage } from "../../../lib/api.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { uploadImage } from "../../assets/upload.js";

const accepted = ["image/png", "image/jpeg", "image/webp"];

/**
 * One big box to drop or pick the photo of the menu (or any image) the
 * page shows, and the photo itself once it is up. No library picker: a new
 * owner has nothing in it yet (owner, 2026-10-07: less text).
 */
export function ImageDrop({
  value,
  onChange,
}: {
  value: string;
  onChange: (assetId: string) => void;
}) {
  const { workspace } = useWorkspace();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = useAssetImage(workspace.id, value || undefined, "full");

  async function upload(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      // Type, size and Kardo's own check, with Spanish messages (A2-46).
      const asset = await uploadImage(workspace.id, file);
      onChange(asset.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  }

  const shown = value && image.url;
  return (
    <>
      <label
        className={[
          "fs-image-drop",
          shown ? "fs-image-drop-filled" : "",
          isDragging ? "fs-image-drop-active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={onDrop}
      >
        {shown ? (
          <img alt="" className="fs-image-drop-image" src={image.url ?? ""} />
        ) : (
          <Icon name="upload" size={28} />
        )}
        <span className="fs-image-drop-action">
          {isUploading
            ? "Subiendo…"
            : value
              ? "Cambiar imagen"
              : "Sube tu imagen"}
        </span>
        {value ? null : <small>PNG, JPG o WebP</small>}
        <input
          accept={accepted.join(",")}
          aria-label={value ? "Cambiar imagen" : "Sube tu imagen"}
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
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </>
  );
}
