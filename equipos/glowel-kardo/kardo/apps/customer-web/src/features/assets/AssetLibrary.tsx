import { type Asset, assetMediaTypes } from "@kardo/contracts";
import { useMemo, useState } from "react";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatBytes, formatDate } from "../../lib/format.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { AssetDetailDialog } from "./AssetDetailDialog.js";
import { AssetPreview } from "./AssetPreview.js";
import { assetStatusExplanation } from "./asset-status.js";
import { assetMediaTypeLabels } from "./labels.js";

type TypeFilter = "all" | Asset["mediaType"];
type AssetStatusFilter = "all" | Asset["status"];

/** The library as a grid of real thumbnails; a card opens the file's detail
 * (preview, why it was rejected, where it is used, rename, replace, delete). */
export function AssetLibrary({
  assets,
  canManage,
  openId,
  onOpen,
  onRenamed,
  onReplaced,
  onDeleted,
}: {
  assets: Asset[];
  canManage: boolean;
  /** The file whose detail is open, if any. */
  openId: string | null;
  onOpen: (assetId: string | null) => void;
  onRenamed: (asset: Asset) => void;
  onReplaced: (previousId: string, asset: Asset) => void;
  onDeleted: (assetId: string) => void;
}) {
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<AssetStatusFilter>("all");
  const openAsset = assets.find((asset) => asset.id === openId) ?? null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter(
      (asset) =>
        (type === "all" || asset.mediaType === type) &&
        (status === "all" || asset.status === status) &&
        (!needle || asset.filename.toLowerCase().includes(needle)),
    );
  }, [assets, query, type, status]);

  const rejectedCount = assets.filter(
    (asset) => asset.status === "rejected",
  ).length;

  return (
    <section aria-label="Archivos de la biblioteca" className="panel">
      <div className="toolbar">
        <label className="search-field">
          <span className="visually-hidden">Buscar por nombre</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="visually-hidden">Filtrar por tipo</span>
          <select
            onChange={(event) => setType(event.target.value as TypeFilter)}
            value={type}
          >
            <option value="all">Todos los tipos</option>
            {assetMediaTypes.map((mediaType) => (
              <option key={mediaType} value={mediaType}>
                {assetMediaTypeLabels[mediaType]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="segmented">
          <legend className="visually-hidden">Filtrar por estado</legend>
          {(
            [
              ["all", "Todos"],
              ["validated", "Validados"],
              ["quarantined", "En revisión"],
              ["rejected", "Rechazados"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={status === value}
              className={
                status === value ? "segment segment-current" : "segment"
              }
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {label}
              {value === "rejected" && rejectedCount
                ? ` (${rejectedCount})`
                : ""}
            </button>
          ))}
        </fieldset>
      </div>
      {filtered.length ? (
        <ul className="asset-grid">
          {filtered.map((asset) => {
            const view = assetStatusExplanation(asset);
            return (
              <li key={asset.id}>
                <button
                  aria-label={`Ver detalle de ${asset.filename}`}
                  className={`asset-card asset-card-${asset.status}`}
                  onClick={() => onOpen(asset.id)}
                  type="button"
                >
                  <AssetPreview
                    asset={asset}
                    size="thumb"
                    workspaceId={workspace.id}
                  />
                  <span className="asset-card-body">
                    <strong title={asset.filename}>{asset.filename}</strong>
                    <small>
                      {assetMediaTypeLabels[asset.mediaType]}
                      {asset.byteSize
                        ? ` · ${formatBytes(asset.byteSize)}`
                        : ""}
                      {asset.createdAt
                        ? ` · ${formatDate(asset.createdAt)}`
                        : ""}
                    </small>
                  </span>
                  <span className="asset-card-status">
                    <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Ningún archivo coincide con el filtro.</p>
      )}

      <AssetDetailDialog
        asset={openAsset}
        canManage={canManage}
        onClose={() => onOpen(null)}
        onDeleted={(assetId) => {
          onOpen(null);
          onDeleted(assetId);
        }}
        onRenamed={onRenamed}
        onReplaced={(previousId, asset) => {
          onReplaced(previousId, asset);
          onOpen(asset.id);
        }}
      />
    </section>
  );
}
