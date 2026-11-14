import { type Asset, isImageMediaType } from "@kardo/contracts";
import { Icon } from "../../components/Icon.js";
import { useAssetImage } from "../../lib/asset-images.js";
import { assetMediaTypeLabels } from "./labels.js";

/**
 * The picture of a library file: the image itself once it passed the
 * security review, otherwise a tile with its type. A rejected or quarantined
 * file is never shown (its bytes never left quarantine), and a PDF has no
 * readable preview: both get the tile.
 */
export function AssetPreview({
  asset,
  workspaceId,
  size,
}: {
  asset: Pick<Asset, "id" | "status" | "mediaType" | "filename">;
  workspaceId: string;
  size: "thumb" | "full";
}) {
  const readable =
    asset.status === "validated" && isImageMediaType(asset.mediaType);
  const image = useAssetImage(
    workspaceId,
    readable ? asset.id : undefined,
    size,
  );
  const className = `asset-preview asset-preview-${size} asset-preview-${asset.status}`;

  if (readable && image.url) {
    return (
      <div className={className}>
        <img alt={size === "full" ? asset.filename : ""} src={image.url} />
      </div>
    );
  }

  const icon =
    asset.status === "rejected"
      ? "octagon-alert"
      : asset.status === "quarantined"
        ? "loader"
        : asset.mediaType === "application/pdf"
          ? "document"
          : "file-image";
  return (
    <div
      className={`${className} asset-preview-tile${readable && image.status === "loading" ? " asset-preview-loading" : ""}`}
    >
      <Icon name={icon} size={size === "full" ? 40 : 24} />
      <span>{assetMediaTypeLabels[asset.mediaType]}</span>
    </div>
  );
}
