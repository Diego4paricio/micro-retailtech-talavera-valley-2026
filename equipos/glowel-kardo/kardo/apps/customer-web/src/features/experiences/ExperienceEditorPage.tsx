import type { ExperienceSummary, ExperienceVersion } from "@kardo/contracts";
import { useCallback } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { Skeleton } from "../../components/Skeleton.js";
import type { ExperienceView } from "../../lib/router.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { ExperienceWorkspace } from "./ExperienceWorkspace.js";
import { ExperienceWorkspaceProvider } from "./ExperienceWorkspaceContext.js";
import { workspaceViewOf } from "./workspace-model.js";

/**
 * `/experiences/:id` and its views. The page stays mounted while the person
 * moves between Diseño, Destinos and Historial, so the draft held by the
 * workspace provider survives the switch.
 */
export function ExperienceEditorPage({
  experienceId,
  view,
}: {
  experienceId: string;
  view: ExperienceView | null;
}) {
  const { workspace, experiences } = useWorkspace();
  const detail = useResource(
    `experience:${workspace.id}:${experienceId}`,
    (signal) => experiencesApi.get(workspace.id, experienceId, signal),
  );
  const { reload, setData } = detail;
  const onVersionsReplaced = useCallback(
    (versions: readonly ExperienceVersion[]) =>
      setData((current) =>
        current ? { ...current, versions: [...versions] } : current,
      ),
    [setData],
  );
  const onArchivedChange = useCallback(
    (archivedAt: string | null) =>
      setData((current) =>
        current
          ? { ...current, experience: { ...current.experience, archivedAt } }
          : current,
      ),
    [setData],
  );

  // The workspace list is the live source for status (it is polled while
  // publishing); the detail request supplies content, versions and the
  // per-Touchpoint status. Archived Experiences only come from the detail.
  const summary =
    (experiences.data?.find((item) => item.id === experienceId) as
      | ExperienceSummary
      | undefined) ??
    (detail.data?.experience as unknown as ExperienceSummary | undefined);

  if (detail.error && !detail.data)
    return (
      <div className="page">
        {detail.error.includes("No encontramos") ? (
          <EmptyState
            action={
              <Link
                className="button button-primary"
                to={{ name: "experiences" }}
              >
                Ver páginas
              </Link>
            }
            icon="experience"
            title="No encontramos esta página"
          />
        ) : (
          <Notice
            action={
              <button
                className="text-action"
                onClick={() => void reload()}
                type="button"
              >
                Reintentar
              </button>
            }
            tone="danger"
          >
            {detail.error}
          </Notice>
        )}
      </div>
    );
  if (!detail.data || !summary)
    return (
      <div className="page xpw-loading">
        <Skeleton label="Abriendo la página…" lines={6} />
      </div>
    );

  return (
    <ExperienceWorkspaceProvider
      source={{
        kind: "existing",
        experience: {
          ...summary,
          content: (detail.data.experience.content ??
            summary.content) as ExperienceSummary["content"],
          // The revision of the content just loaded (not the list's, which
          // may be newer): the next save is checked against it (A2-22).
          ...(detail.data.experience.draftRevision !== undefined
            ? { draftRevision: detail.data.experience.draftRevision }
            : {}),
        },
        versions: detail.data.versions,
        versionCount: detail.data.versionCount,
        targetStatuses: detail.data.targets ?? [],
        reload,
        onVersionsReplaced,
        onArchivedChange,
      }}
    >
      <ExperienceWorkspace view={workspaceViewOf(view)} />
    </ExperienceWorkspaceProvider>
  );
}
