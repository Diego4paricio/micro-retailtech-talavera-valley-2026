import type { Asset, AssetUsage } from "@kardo/contracts";
import { isImageMediaType } from "@kardo/contracts";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { acceptedAssetTypes, assetsApi } from "../../api/assets.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatBytes, formatDateTime } from "../../lib/format.js";
import { Link, useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { AssetPreview } from "./AssetPreview.js";
import { assetStatusExplanation } from "./asset-status.js";
import { summarizeAssetUsage } from "./asset-usage.js";
import { assetMediaTypeLabels } from "./labels.js";
import { assetFileProblem, uploadAsset } from "./upload.js";

type Busy = "rename" | "replace" | "delete" | null;

/**
 * One library file in detail: its preview, what its state means (and, if the
 * security review rejected it, why and what to do), where it is used, and the
 * actions on it: rename, upload a new version (rejected or stuck files) and
 * delete (only when nothing uses it).
 */
export function AssetDetailDialog({
  asset,
  canManage,
  onClose,
  onRenamed,
  onReplaced,
  onDeleted,
}: {
  asset: Asset | null;
  canManage: boolean;
  onClose: () => void;
  onRenamed: (asset: Asset) => void;
  /** A new upload took the place of `previousId` (which was removed). */
  onReplaced: (previousId: string, asset: Asset) => void;
  onDeleted: (assetId: string) => void;
}) {
  const { workspace, can } = useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const [name, setName] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const usage = useResource(
    asset ? `asset-usage:${workspace.id}:${asset.id}` : null,
    (signal) =>
      asset
        ? assetsApi.usage(workspace.id, asset.id, signal)
        : Promise.resolve<AssetUsage>({ experiences: [] }),
  );

  function close() {
    setName(null);
    setConfirmingDelete(false);
    setError(null);
    onClose();
  }

  if (!asset) {
    return (
      <Dialog onClose={close} open={false} title="Archivo">
        {null}
      </Dialog>
    );
  }

  const current = asset;
  const status = assetStatusExplanation(current);
  const usedBy = usage.data?.experiences ?? [];
  // Pages, but also the business profile and QR logos (A2-45).
  const usageSummary = summarizeAssetUsage(usage.data ?? { experiences: [] });
  const inUse = usageSummary.blocksDelete;
  const startKind = isImageMediaType(current.mediaType)
    ? "image"
    : current.mediaType === "application/pdf"
      ? "document"
      : null;
  const canStartPage =
    current.status === "validated" &&
    startKind !== null &&
    can("experiences.edit");
  const canReplace = canManage && current.status !== "validated";

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = (name ?? "").trim();
    if (!next || next === current.filename) {
      setName(null);
      return;
    }
    setBusy("rename");
    setError(null);
    try {
      const renamed = await assetsApi.rename(workspace.id, current.id, next);
      onRenamed(renamed);
      setName(null);
      notify("Nombre actualizado.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function replace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = assetFileProblem(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("replace");
    setError(null);
    try {
      const uploaded = await uploadAsset(workspace.id, file, {
        allowUnvalidated: true,
      });
      // The rejected (or stuck) file is replaced: nothing can use it.
      await assetsApi.remove(workspace.id, current.id).catch(() => undefined);
      onReplaced(current.id, uploaded);
      notify(
        uploaded.status === "validated"
          ? "La nueva versión pasó la revisión y ya se puede usar."
          : uploaded.status === "rejected"
            ? "La nueva versión tampoco pasó la revisión. Revisa el motivo."
            : "Subimos la nueva versión; la estamos revisando.",
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await assetsApi.remove(workspace.id, current.id);
      onDeleted(current.id);
      notify(`«${current.filename}» se eliminó de la biblioteca.`);
      close();
    } catch (requestError) {
      // `ASSET_IN_USE` carries the server's own message, naming what still
      // uses the file (A2-45): it is shown as is.
      setError(errorMessage(requestError));
      setConfirmingDelete(false);
      void usage.reload();
    } finally {
      setBusy(null);
    }
  }

  const footer = confirmingDelete ? (
    <div className="asset-detail-confirm">
      <p>
        ¿Eliminar «{current.filename}»? Se borra de la biblioteca y no se puede
        deshacer.
      </p>
      <div className="asset-detail-confirm-actions">
        <button
          className="button button-secondary"
          disabled={busy === "delete"}
          onClick={() => setConfirmingDelete(false)}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="button button-danger"
          disabled={busy === "delete"}
          onClick={() => void remove()}
          type="button"
        >
          {busy === "delete" ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </div>
  ) : (
    <>
      {canManage ? (
        <button
          className="button button-ghost asset-detail-delete"
          disabled={busy !== null || usage.isLoading || inUse}
          onClick={() => setConfirmingDelete(true)}
          title={
            inUse ? "Quítalo de donde se usa para poder eliminarlo." : undefined
          }
          type="button"
        >
          <Icon name="trash" size={16} /> Eliminar
        </button>
      ) : null}
      {canReplace ? (
        <button
          className="button button-primary"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
          type="button"
        >
          <Icon name="upload" size={16} />{" "}
          {busy === "replace" ? "Subiendo…" : "Subir otra versión"}
        </button>
      ) : (
        <button
          className="button button-secondary"
          onClick={close}
          type="button"
        >
          Cerrar
        </button>
      )}
    </>
  );

  return (
    <Dialog
      description={`${assetMediaTypeLabels[current.mediaType]} · ${
        current.byteSize ? formatBytes(current.byteSize) : "tamaño pendiente"
      }`}
      footer={footer}
      onClose={close}
      open
      size="large"
      title={current.filename}
    >
      <div className="asset-detail">
        <AssetPreview asset={current} size="full" workspaceId={workspace.id} />

        <div className="asset-detail-info">
          <section
            className={`asset-detail-status asset-detail-status-${current.status}`}
          >
            <header>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <strong>{status.title}</strong>
            </header>
            <p>{status.body}</p>
            {status.fix ? (
              <p className="asset-detail-fix">
                <Icon name="idea" size={16} />
                <span>{status.fix}</span>
              </p>
            ) : null}
          </section>

          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}

          <dl className="asset-detail-facts">
            <div>
              <dt>Nombre</dt>
              <dd>
                {name !== null ? (
                  <form className="asset-detail-rename" onSubmit={rename}>
                    <label className="visually-hidden" htmlFor="asset-name">
                      Nombre del archivo
                    </label>
                    <input
                      autoFocus
                      id="asset-name"
                      maxLength={255}
                      onChange={(event) => setName(event.target.value)}
                      value={name}
                    />
                    <button
                      className="button button-primary button-small"
                      disabled={busy === "rename" || !name.trim()}
                      type="submit"
                    >
                      {busy === "rename" ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => setName(null)}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <span className="asset-detail-name">
                    <span>{current.filename}</span>
                    {canManage ? (
                      <button
                        className="link-button"
                        onClick={() => setName(current.filename)}
                        type="button"
                      >
                        Renombrar
                      </button>
                    ) : null}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{assetMediaTypeLabels[current.mediaType]}</dd>
            </div>
            <div>
              <dt>Tamaño</dt>
              <dd>
                {current.byteSize
                  ? formatBytes(current.byteSize)
                  : "Se mide al terminar la revisión"}
              </dd>
            </div>
            <div>
              <dt>Subido</dt>
              <dd>
                {current.createdAt ? formatDateTime(current.createdAt) : "—"}
              </dd>
            </div>
          </dl>

          <section className="asset-detail-usage">
            <h3>Dónde se usa</h3>
            {usage.isLoading && !usage.data ? (
              <p className="muted">Buscando…</p>
            ) : usage.error ? (
              <p className="muted">No pudimos revisar dónde se usa.</p>
            ) : !usageSummary.isUnused ? (
              <>
                <ul>
                  {usageSummary.extras.map((extra) => (
                    <li key={extra.key}>
                      <span className="asset-detail-usage-link">
                        <Icon name="organization" size={16} />
                        <span>{extra.text}</span>
                      </span>
                    </li>
                  ))}
                  {usedBy.map((experience) => (
                    <li key={experience.id}>
                      <Link
                        className="asset-detail-usage-link"
                        to={{ name: "experience", id: experience.id }}
                      >
                        <Icon name="experience" size={16} />
                        <span>{experience.name}</span>
                      </Link>
                      {experience.live ? (
                        <StatusBadge tone="success">Publicada</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Borrador</StatusBadge>
                      )}
                    </li>
                  ))}
                </ul>
                {canManage && inUse ? (
                  <p className="muted">
                    Para eliminarlo, primero quítalo de donde se usa.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted">
                {current.status === "validated"
                  ? "Ninguna página lo usa todavía."
                  : "Ninguna página lo usa."}
              </p>
            )}
            {canStartPage && startKind ? (
              <button
                className="button button-secondary button-small"
                onClick={() => {
                  close();
                  navigate({
                    name: "experience-new",
                    touchpointId: null,
                    type: startKind,
                    assetId: current.id,
                  });
                }}
                type="button"
              >
                <Icon name="experience" size={16} /> Crear página con este
                archivo
              </button>
            ) : null}
          </section>
        </div>
      </div>
      <input
        accept={acceptedAssetTypes.join(",")}
        hidden
        onChange={(event) => void replace(event)}
        ref={fileInput}
        type="file"
      />
    </Dialog>
  );
}
