import type { Asset } from "@kardo/contracts";
import { useState } from "react";
import { assetsApi } from "../../api/assets.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { HelpButton } from "../help/index.js";
import { AssetLibrary } from "./AssetLibrary.js";
import { AssetUploadZone } from "./AssetUploadZone.js";

export function AssetsPage() {
  const { workspace, can } = useWorkspace();
  const canManage = can("assets.manage");
  const assets = useResource(`assets:${workspace.id}`, (signal) =>
    assetsApi.list(workspace.id, signal),
  );
  const [openId, setOpenId] = useState<string | null>(null);

  function handleUploaded(asset: Asset) {
    assets.setData((items) => (items ? [asset, ...items] : [asset]));
    // A file the security review rejected opens straight away, with why.
    if (asset.status === "rejected") setOpenId(asset.id);
  }

  function handleDeleted(assetId: string) {
    assets.setData((items) =>
      items ? items.filter((item) => item.id !== assetId) : items,
    );
  }

  function handleRenamed(asset: Asset) {
    assets.setData((items) =>
      items
        ? items.map((item) => (item.id === asset.id ? asset : item))
        : items,
    );
  }

  /** A new upload replaced a rejected (or stuck) file: same place in the list. */
  function handleReplaced(previousId: string, asset: Asset) {
    assets.setData((items) =>
      items
        ? [asset, ...items.filter((item) => item.id !== previousId)]
        : [asset],
    );
  }

  const items = assets.data ?? [];

  return (
    <div className="page">
      <PageHeader
        actions={<HelpButton section="assets" />}
        description="La biblioteca del espacio para las imágenes y documentos que usan tus páginas."
        eyebrow="Biblioteca"
        title="Archivos"
      />

      {canManage ? <AssetUploadZone onUploaded={handleUploaded} /> : null}

      {assets.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void assets.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {assets.error}
        </Notice>
      ) : null}

      {assets.isLoading && !assets.data ? (
        <Skeleton lines={4} />
      ) : items.length ? (
        <AssetLibrary
          assets={items}
          canManage={canManage}
          onDeleted={handleDeleted}
          onOpen={setOpenId}
          openId={openId}
          onRenamed={handleRenamed}
          onReplaced={handleReplaced}
        />
      ) : !assets.error ? (
        <EmptyState icon="asset" title="Aún no hay archivos en la biblioteca">
          {canManage
            ? "Sube una imagen (PNG, JPEG, WebP) o PDF para usarlo en tus páginas."
            : "Cuando alguien del equipo suba un archivo, aparecerá aquí."}
        </EmptyState>
      ) : null}
    </div>
  );
}
