import { type DragEvent, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { errorMessage } from "../../../lib/api.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { uploadImage } from "../../assets/upload.js";
import { saveWorkspaceProfile } from "../../business-profile/profile-store.js";
import type { FirstSteps } from "../use-first-steps.js";

const accepted = ["image/png", "image/jpeg", "image/webp"];

/**
 * The business's logo, offered right before the looks (owner, 2026-10-07:
 * «previo al pasar a las plantillas, que pueda subir su logo»). It goes to
 * Configuración → Marca, so every look, and the Estudio after, use it.
 */
export function LogoAsk({
  steps,
  onDone,
}: {
  steps: FirstSteps;
  onDone: () => void;
}) {
  const { workspace } = useWorkspace();
  const current = steps.profile.data?.logoAssetId;
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logo = useAssetImage(workspace.id, current || undefined, "thumb");

  async function upload(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const asset = await uploadImage(workspace.id, file);
      await saveWorkspaceProfile(workspace.id, { logoAssetId: asset.id });
      steps.markLogoAsked();
      onDone();
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

  return (
    <div className="fs-form fs-card fs-narrow fs-logo">
      <label
        className={
          isDragging ? "fs-logo-drop fs-logo-drop-active" : "fs-logo-drop"
        }
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={onDrop}
      >
        {logo.url ? (
          <img alt="Tu logo" className="fs-logo-image" src={logo.url} />
        ) : (
          <Icon name="upload" size={28} />
        )}
        <span>
          {isUploading
            ? "Subiendo…"
            : current
              ? "Cambiar tu logo"
              : "Sube tu logo"}
        </span>
        <small>PNG, JPG o WebP</small>
        <input
          accept={accepted.join(",")}
          aria-label="Sube tu logo"
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
      <button
        className="link-button fs-logo-skip"
        disabled={isUploading}
        onClick={() => {
          steps.markLogoAsked();
          onDone();
        }}
        type="button"
      >
        {current ? "Seguir con este logo" : "Ahora no"}
      </button>
    </div>
  );
}
