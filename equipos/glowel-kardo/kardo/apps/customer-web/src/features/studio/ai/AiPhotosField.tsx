import {
  type ConceptBrief,
  CUSTOM_HTML_LIMITS,
  type DesignableExperienceType,
} from "@kardo/contracts";
import { useState } from "react";
import { Dialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import { AssetThumb, ImageLibrary } from "../html/ImageLibrary.js";
import { useStudio } from "../StudioContext.js";

/** How the AI uses the owner's photos on each type of page. */
export function photosHintFor(type: DesignableExperienceType): string {
  if (type === "menu")
    return "Sube fotos de tus platillos o del lugar. La IA pone cada foto de platillo en su platillo y deja un espacio en los que no tengan, para que subas su foto después.";
  if (type === "catalog")
    return "Sube fotos de tus productos o del lugar. La IA pone cada foto en su producto y deja un espacio en los que no tengan.";
  return "Fotos del lugar o de lo que vendes. Donde falte una foto, la IA deja un espacio para que la subas después.";
}

/**
 * "Tus fotos" in the AI-in-blocks form (2026-10-03, owner's request): the
 * owner uploads or picks photos right there; the AI looks at them, puts
 * dish and product photos on their own dish or product and the rest in
 * the design, and leaves a photo space wherever one is still missing. The
 * logo and the cover come from Configuración, Marca on their own.
 */
export function AiPhotosField({
  brief,
  onChange,
  disabled,
}: {
  brief: ConceptBrief;
  onChange: (recipe: (current: ConceptBrief) => ConceptBrief) => void;
  disabled: boolean;
}) {
  const { type, workspaceId, assets, addAsset, canUploadAssets } = useStudio();
  const [picking, setPicking] = useState(false);
  const max = CUSTOM_HTML_LIMITS.briefImages;
  const toggle = (assetId: string) =>
    onChange((current) => ({
      ...current,
      imageRefs: current.imageRefs.includes(assetId)
        ? current.imageRefs.filter((item) => item !== assetId)
        : [...current.imageRefs, assetId].slice(0, max),
    }));

  return (
    <fieldset className="es-ai-photos">
      <legend>
        Tus fotos{" "}
        <span className="field-counter">
          {brief.imageRefs.length}/{max}
        </span>
      </legend>
      <div className="es-ai-photos-list">
        {brief.imageRefs.map((ref) => (
          <span className="es-ai-photo" key={ref}>
            <AssetThumb assetId={ref} workspaceId={workspaceId} />
            {!disabled ? (
              <button
                aria-label="Quitar esta foto"
                className="esh-chip-remove"
                onClick={() => toggle(ref)}
                type="button"
              >
                <Icon name="close" size={12} />
              </button>
            ) : null}
          </span>
        ))}
        {!disabled && brief.imageRefs.length < max ? (
          <button
            className="es-ai-photo-add"
            onClick={() => setPicking(true)}
            type="button"
          >
            <Icon name="image-plus" size={16} />
            {brief.imageRefs.length ? "Agregar" : "Agregar fotos"}
          </button>
        ) : null}
      </div>
      <p className="field-hint">{photosHintFor(type)}</p>
      <Dialog
        description={`Sube o elige hasta ${max}. ${photosHintFor(type)}`}
        footer={
          <button
            className="button button-primary"
            onClick={() => setPicking(false)}
            type="button"
          >
            Listo
          </button>
        }
        onClose={() => setPicking(false)}
        open={picking}
        size="large"
        title="Tus fotos para la IA"
      >
        <ImageLibrary
          assets={assets}
          canUpload={canUploadAssets}
          max={max}
          onToggle={toggle}
          onUploaded={(asset) => {
            addAsset(asset);
            onChange((current) =>
              current.imageRefs.length < max
                ? { ...current, imageRefs: [...current.imageRefs, asset.id] }
                : current,
            );
          }}
          selected={brief.imageRefs}
          workspaceId={workspaceId}
        />
      </Dialog>
    </fieldset>
  );
}
