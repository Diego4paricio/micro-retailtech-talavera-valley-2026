import type { ExperienceContent } from "@kardo/contracts";
import { useState } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { Notice } from "../../components/Notice.js";
import { formatDateTime } from "../../lib/format.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useExperienceWorkspace } from "./ExperienceWorkspaceContext.js";
import { PagePreview } from "./PagePreview.js";
import { VersionHistory, type VersionSelection } from "./VersionHistory.js";

/**
 * Historial: the immutable versions next to a preview of the selected one,
 * so a version can be seen before restoring or publishing it again.
 */
export function HistoryView() {
  const ws = useExperienceWorkspace();
  const [selected, setSelected] = useState<VersionSelection>(
    () =>
      ws.versions.find((version) => version.publication?.status === "published")
        ?.id ?? null,
  );
  const { workspace } = useWorkspace();
  const version = ws.versions.find((item) => item.id === selected) ?? null;
  // Most versions come without their content (A2-30): the selected one is
  // read when it is opened, never shown with the draft's content meanwhile.
  const needsContent = Boolean(version && !version.content && ws.experience);
  const loaded = useResource(
    needsContent && version && ws.experience
      ? `experience-version:${ws.experience.id}:${version.id}`
      : null,
    (signal) =>
      experiencesApi.version(
        workspace.id,
        ws.experience?.id ?? "",
        version?.id ?? "",
        signal,
      ),
  );
  const versionContent = version
    ? (version.content ?? loaded.data?.content ?? null)
    : null;
  const content = (versionContent ?? ws.content) as ExperienceContent;

  const draftLabel = ws.isDirty
    ? "Con cambios sin guardar"
    : ws.experience?.hasUnpublishedChanges
      ? "Con cambios sin publicar"
      : ws.versions.length
        ? "Igual a lo último publicado"
        : "Aún sin publicar";

  return (
    <div className="xpw-history">
      <section
        aria-labelledby="xpw-history-title"
        className="panel xpw-history-main"
      >
        <div className="xpw-section-head">
          <h2 className="xpw-section-title" id="xpw-history-title">
            Versiones
          </h2>
          <p className="xpw-section-note">
            Cada publicación guarda una versión que ya no cambia. Restáurala al
            borrador para editarla o vuelve a publicarla tal cual.
          </p>
        </div>
        <VersionHistory
          canEdit={ws.canEdit && !ws.isArchived}
          canPublish={ws.canPublish && !ws.isArchived}
          draftLabel={draftLabel}
          hasUnsavedChanges={ws.isDirty}
          onPublishVersion={ws.publishVersion}
          onRestore={async (restored) => {
            await ws.restore(restored);
            setSelected(null);
          }}
          onSelect={setSelected}
          selected={selected}
          totalCount={ws.versionCount}
          versions={ws.versions}
        />
      </section>
      <aside aria-label="Vista previa de la versión" className="xpw-preview">
        <p className="xpw-preview-label">
          {version
            ? `Versión ${version.revision} · ${formatDateTime(version.publication?.publishedAt ?? version.createdAt)}`
            : "Borrador actual"}
        </p>
        {version && !versionContent ? (
          loaded.error ? (
            <Notice tone="danger">{loaded.error}</Notice>
          ) : (
            <p className="xpw-preview-label">Cargando la versión…</p>
          )
        ) : (
          <PagePreview content={content} type={ws.type} />
        )}
      </aside>
    </div>
  );
}
