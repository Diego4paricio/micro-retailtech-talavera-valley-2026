import type { ExperienceVersion } from "@kardo/contracts";
import { useState } from "react";
import { ConfirmDialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime } from "../../lib/format.js";
import { publicationStatusView } from "./labels.js";

type PendingAction = {
  kind: "restore" | "publish";
  version: ExperienceVersion;
};

/** `null` selects the current draft. */
export type VersionSelection = string | null;

/**
 * Timeline of immutable versions, newest first, headed by the current draft.
 * Selecting an entry previews it; each version can be restored into the
 * draft or published again (rollback).
 */
export function VersionHistory({
  versions,
  canEdit,
  canPublish,
  hasUnsavedChanges,
  draftLabel,
  totalCount,
  selected,
  onSelect,
  onRestore,
  onPublishVersion,
}: {
  versions: readonly ExperienceVersion[];
  canEdit: boolean;
  canPublish: boolean;
  hasUnsavedChanges: boolean;
  /** How the draft compares to the versions ("Con cambios sin publicar"…). */
  draftLabel: string;
  /** Every version the page has; the list holds the 50 most recent. */
  totalCount?: number | undefined;
  selected: VersionSelection;
  onSelect: (selection: VersionSelection) => void;
  onRestore: (version: ExperienceVersion) => Promise<void>;
  onPublishVersion: (version: ExperienceVersion) => Promise<void>;
}) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function confirm() {
    if (!pending) return;
    setIsBusy(true);
    try {
      if (pending.kind === "restore") await onRestore(pending.version);
      else await onPublishVersion(pending.version);
      setPending(null);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <ol className="version-list xpw-versions">
        <li
          className={
            selected === null
              ? "version version-draft version-selected"
              : "version version-draft"
          }
        >
          <button
            aria-pressed={selected === null}
            className="version-select"
            onClick={() => onSelect(null)}
            type="button"
          >
            <span className="version-header">
              <strong>Borrador actual</strong>
              <StatusBadge tone="neutral">Editable</StatusBadge>
            </span>
            <small>{draftLabel}</small>
          </button>
        </li>
        {versions.map((version) => {
          const publication = version.publication;
          const view = publication
            ? publicationStatusView(publication.status)
            : null;
          // Publishing a newer version supersedes older publications, so a
          // version whose latest publication is still "published" is live.
          const isLive = publication?.status === "published";
          const places = versionPlaces(version, isLive);
          const isSelected = selected === version.id;
          return (
            <li
              className={[
                "version",
                isLive ? "version-live" : "",
                isSelected ? "version-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={version.id}
            >
              <button
                aria-pressed={isSelected}
                className="version-select"
                onClick={() => onSelect(version.id)}
                type="button"
              >
                <span className="version-header">
                  <strong>Versión {version.revision}</strong>
                  {places.map((place) => (
                    <StatusBadge key={place.label} tone={place.tone}>
                      {place.label}
                    </StatusBadge>
                  ))}
                  {!places.length && view ? (
                    <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                  ) : null}
                </span>
                <small>
                  {publication?.publishedAt
                    ? `Publicada ${formatDateTime(publication.publishedAt)}`
                    : `Creada ${formatDateTime(version.createdAt)}`}
                </small>
              </button>
              {publication?.failureReason ? (
                <p className="version-failure">
                  <Icon name="alert" size={14} /> {publication.failureReason}
                </p>
              ) : null}
              {canEdit || (canPublish && !isLive) ? (
                <div className="version-actions">
                  {canEdit ? (
                    <button
                      className="link-button"
                      onClick={() => setPending({ kind: "restore", version })}
                      type="button"
                    >
                      <Icon name="history" size={14} /> Restaurar al borrador
                    </button>
                  ) : null}
                  {canPublish && !isLive ? (
                    <button
                      className="link-button"
                      onClick={() => setPending({ kind: "publish", version })}
                      type="button"
                    >
                      <Icon name="refresh" size={14} /> Publicar esta versión
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {totalCount !== undefined && totalCount > versions.length ? (
        <p className="muted version-empty">
          Mostrando las {versions.length} más recientes de {totalCount}.
        </p>
      ) : null}
      {!versions.length ? (
        <p className="muted version-empty">
          Cada vez que publiques se guardará una versión inmutable a la que
          podrás volver.
        </p>
      ) : null}
      <ConfirmDialog
        confirmLabel={
          pending?.kind === "restore" ? "Restaurar" : "Publicar versión"
        }
        description={
          pending?.kind === "restore"
            ? `El borrador tomará el contenido de la versión ${pending.version.revision}.${hasUnsavedChanges ? " Perderás los cambios sin guardar." : ""} Lo publicado no cambia hasta que publiques.`
            : `Los QR y etiquetas volverán a mostrar la versión ${pending?.version.revision ?? ""} en cuanto termine la publicación. Tu borrador actual no se modifica.`
        }
        isBusy={isBusy}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
        open={pending !== null}
        title={
          pending?.kind === "restore"
            ? `¿Restaurar la versión ${pending.version.revision}?`
            : `¿Volver a publicar la versión ${pending?.version.revision ?? ""}?`
        }
      />
    </>
  );
}

/**
 * Where a version is live or failed (domain audit A2-24): with several QR
 * and links one version can be live in some and failed in others, so the
 * badge counts both («En vivo en 2», «Falló en 1»). Without the counts
 * (an older answer) it falls back to the single latest publication.
 */
export function versionPlaces(
  version: Pick<
    ExperienceVersion,
    "liveTouchpointCount" | "failedTouchpointCount"
  >,
  isLive: boolean,
): { label: string; tone: "success" | "danger" }[] {
  if (
    version.liveTouchpointCount === undefined &&
    version.failedTouchpointCount === undefined
  )
    return isLive ? [{ label: "En vivo", tone: "success" }] : [];
  const places: { label: string; tone: "success" | "danger" }[] = [];
  const live = version.liveTouchpointCount ?? 0;
  const failed = version.failedTouchpointCount ?? 0;
  if (live > 0) places.push({ label: `En vivo en ${live}`, tone: "success" });
  if (failed > 0) places.push({ label: `Falló en ${failed}`, tone: "danger" });
  return places;
}
