import type { Asset } from "@kardo/contracts";
import { type CSSProperties, useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { SettingsRow } from "../../components/SettingsBlocks.js";
import { errorMessage } from "../../lib/api.js";
import { useAssetImage } from "../../lib/asset-images.js";
import { uploadImage } from "../assets/upload.js";
import { ImageLibrary, libraryImages } from "../studio/html/ImageLibrary.js";

/** Initials for the logo placeholder: the first letter of the first two
 * words of the organization's name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "K"
  );
}

/**
 * The organization's image as its pages will show it (2026-10-02): the
 * cover across the top, the logo in a circle over its lower edge, the name
 * and the giro underneath. Without a cover, the brand colors fill the band,
 * the same way the Estudio and Kardo's AI fall back to them.
 */
export function BrandIdentityPreview({
  workspaceId,
  name,
  detail,
  logoAssetId,
  coverAssetId,
  primary,
  accent,
}: {
  workspaceId: string;
  name: string;
  detail: string | null;
  logoAssetId: string;
  coverAssetId: string;
  primary: string;
  accent: string;
}) {
  const cover = useAssetImage(workspaceId, coverAssetId || undefined, "full");
  const logo = useAssetImage(workspaceId, logoAssetId || undefined, "thumb");
  // Brand colors are the customer's data, not design tokens: an inline
  // custom property is the correct way to hand them to the stylesheet.
  const colors = {
    "--brand-primary": primary,
    "--brand-accent": accent,
  } as CSSProperties;
  return (
    <figure className="brand-identity" style={colors}>
      <div
        className="brand-identity-cover"
        data-empty={!cover.url || undefined}
      >
        {cover.url ? <img alt="" decoding="async" src={cover.url} /> : null}
      </div>
      <div className="brand-identity-body">
        <span
          className="brand-identity-logo"
          data-empty={!logo.url || undefined}
        >
          {logo.url ? (
            <img alt="" decoding="async" src={logo.url} />
          ) : (
            <span aria-hidden="true">{initials(name)}</span>
          )}
        </span>
        <figcaption>
          <strong>{name}</strong>
          {detail ? <span>{detail}</span> : null}
        </figcaption>
      </div>
    </figure>
  );
}

/**
 * One brand image (logo or cover) as a settings row: its small thumbnail and
 * file name as the value, and the ways to set it: upload a new one, pick one
 * already in the library, or remove it. Every change is saved by the parent
 * through `onChange`.
 */
export function BrandImageRow({
  workspaceId,
  label,
  hint,
  emptyLabel,
  value,
  onChange,
  assets,
  onUploaded,
  shape,
  readOnly = false,
  busy = false,
}: {
  workspaceId: string;
  label: string;
  hint: string;
  emptyLabel: string;
  value: string;
  onChange: (assetId: string) => void;
  assets: readonly Asset[];
  onUploaded: (asset: Asset) => void;
  shape: "circle" | "wide";
  readOnly?: boolean;
  busy?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The same check and upload as every screen (A2-46, A2-6): type and size
  // before, Kardo's validation after, errors in Spanish.
  async function upload(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const asset = await uploadImage(workspaceId, file);
      onUploaded(asset);
      onChange(asset.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsUploading(false);
    }
  }
  const thumb = useAssetImage(workspaceId, value || undefined, "thumb");
  const filename = assets.find((asset) => asset.id === value)?.filename;
  const hasLibrary = libraryImages(assets).length > 0;
  const working = isUploading || busy;
  return (
    <>
      <SettingsRow
        action={
          readOnly ? undefined : (
            <>
              <label className="button button-secondary button-small">
                {isUploading ? (
                  <span aria-hidden="true" className="button-spinner" />
                ) : (
                  <Icon name="upload" size={14} />
                )}
                {isUploading ? "Subiendo…" : value ? "Cambiar" : "Subir"}
                <input
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={`Subir ${label.toLowerCase()}`}
                  className="visually-hidden"
                  disabled={working}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                  }}
                  type="file"
                />
              </label>
              {hasLibrary ? (
                <button
                  className="button button-ghost button-small"
                  disabled={working}
                  onClick={() => setPicking(true)}
                  type="button"
                >
                  De tu biblioteca
                </button>
              ) : null}
              {value ? (
                <button
                  className="button button-ghost button-small"
                  disabled={working}
                  onClick={() => onChange("")}
                  type="button"
                >
                  Quitar
                </button>
              ) : null}
            </>
          )
        }
        description={hint}
        label={label}
        value={
          <span className="brand-image-value">
            <span className="brand-image-thumb" data-shape={shape}>
              {thumb.url ? (
                <img alt="" decoding="async" src={thumb.url} />
              ) : (
                <Icon name="image-plus" size={16} />
              )}
            </span>
            <span className={value ? undefined : "muted"}>
              {value ? (filename ?? label) : emptyLabel}
            </span>
            {error ? <span className="field-error">{error}</span> : null}
          </span>
        }
      />
      <Dialog
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
        title={`Elige tu ${label.toLowerCase()}`}
      >
        <ImageLibrary
          assets={assets}
          canUpload
          max={1}
          onToggle={(assetId) => {
            onChange(assetId === value ? "" : assetId);
            setPicking(false);
          }}
          onUploaded={(asset) => {
            onUploaded(asset);
            onChange(asset.id);
            setPicking(false);
          }}
          selected={value ? [value] : []}
          workspaceId={workspaceId}
        />
      </Dialog>
    </>
  );
}
