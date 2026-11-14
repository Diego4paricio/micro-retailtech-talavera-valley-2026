import type {
  Asset,
  ExperienceDetail,
  ExperienceSummary,
  ExperienceVersion,
  PageDesign,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { assetsApi } from "../../../api/assets.js";
import { designAiSessionApi } from "../../../api/design-ai.js";
import { experiencesApi } from "../../../api/experiences.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { Notice } from "../../../components/Notice.js";
import { Skeleton } from "../../../components/Skeleton.js";
import { useToast } from "../../../components/Toast.js";
import { errorMessage } from "../../../lib/api.js";
import { Link } from "../../../lib/router.js";
import { useResource } from "../../../lib/use-resource.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import {
  ExperienceWorkspaceProvider,
  useExperienceWorkspace,
} from "../../experiences/ExperienceWorkspaceContext.js";
import { experienceTypeLabels } from "../../experiences/labels.js";
import { PublishDialog } from "../../experiences/PublishDialog.js";
import { publicationProgressNote } from "../../experiences/workspace-model.js";
import { DesignStudio, type StudioSaveChanges } from "../DesignStudio.js";
import {
  contentCustomHtml,
  initialStudioMode,
  isCustomHtmlBlank,
  type StudioMode,
} from "../html/model.js";
import { contentDesign, isDesignableType } from "../model/content.js";
import { designFromContent } from "../model/from-content.js";
import { StartScreen } from "../StartScreen.js";
import { readStudioRail, requestStudioRail } from "../studio-entry-rail.js";
import {
  changedElsewhereMessage,
  isChangedElsewhere,
  savedContent,
  studioSavedMessage,
  studioUpdateBody,
} from "./save.js";

/**
 * `/experiences/:id/estudio`: the Estudio of any Experience with a page
 * (Enlaces, Perfil, Menú, Catálogo, Formulario, PDF and Imagen; a Página de
 * Link opens from its Link). Content and design are saved together into
 * the draft with one PATCH; "Publicar" reuses the workspace's own
 * PublishDialog (destinations, precedence and retries included).
 */
export function ExperienceStudioPage({
  experienceId,
}: {
  experienceId: string;
}) {
  const { workspace, experiences } = useWorkspace();
  const detail = useResource(
    `experience-studio:${workspace.id}:${experienceId}`,
    (signal) => experiencesApi.get(workspace.id, experienceId, signal),
  );

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
                onClick={() => void detail.reload()}
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
      <div className="page">
        <Skeleton label="Abriendo el Estudio…" lines={6} />
      </div>
    );

  if (!isDesignableType(summary.type))
    return (
      <div className="page">
        <EmptyState
          action={
            <Link
              className="button button-primary"
              to={{ name: "experience", id: experienceId }}
            >
              Volver a la página
            </Link>
          }
          icon="palette"
          title="Una redirección no tiene página"
        >
          Quien toca o escanea va directo a tu enlace, así que no hay nada que
          diseñar. Cambia el destino desde la página.
        </EmptyState>
      </div>
    );

  return (
    <ExperienceStudio
      detail={detail.data}
      key={summary.id}
      onDetail={detail.setData}
      reload={detail.reload}
      summary={summary}
    />
  );
}

function ExperienceStudio({
  summary,
  detail,
  onDetail,
  reload,
}: {
  summary: ExperienceSummary;
  detail: ExperienceDetail;
  onDetail: (
    update: (current: ExperienceDetail | null) => ExperienceDetail | null,
  ) => void;
  reload: () => Promise<void>;
}) {
  const { workspace, can, upsertExperience } = useWorkspace();
  const { notify } = useToast();
  const type = summary.type;
  const content = (detail.experience.content ??
    summary.content) as ExperienceSummary["content"];
  const saved = contentDesign(content);
  const savedCustomHtml = contentCustomHtml(content);
  const [started, setStarted] = useState<{
    design: PageDesign;
    mode: StudioMode;
  } | null>(null);
  const [isPublishOpen, setPublishOpen] = useState(false);
  // Someone else saved this page since it was opened (A2-22): nothing more
  // is saved from here until the person reloads; what is on screen stays.
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [studioEpoch, setStudioEpoch] = useState(0);
  const draftRevision =
    (detail.experience as { draftRevision?: number }).draftRevision ??
    summary.draftRevision;
  const draftRevisionRef = useRef(draftRevision);
  useEffect(() => {
    if (draftRevision !== undefined) draftRevisionRef.current = draftRevision;
  }, [draftRevision]);
  const [entryAi, setEntryAi] = useState(
    () => readStudioRail(summary.id) === "ai",
  );
  const closePublish = useCallback(() => setPublishOpen(false), []);
  const archived = Boolean(summary.archivedAt);
  const readOnly = !can("experiences.edit") || archived;
  // A design or ideas from the AI waiting on a page without a design yet
  // (the owner closed the Estudio while it worked): skip the start screen
  // and open the "IA" rail, where it waits (relevo 31, finding 2).
  useEffect(() => {
    if (saved || entryAi || readOnly) return;
    let live = true;
    void designAiSessionApi
      .get(workspace.id, summary.id)
      .then(({ session }) => {
        if (!live || !session) return;
        if (session.status === "running" || session.status === "ready") {
          requestStudioRail(summary.id, "ai");
          setEntryAi(true);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [saved, entryAi, readOnly, workspace.id, summary.id]);

  const assets = useResource(`assets:${workspace.id}`, (signal) =>
    assetsApi.list(workspace.id, signal),
  );
  const addAsset = useCallback(
    (asset: Asset) =>
      assets.setData((items) => (items ? [asset, ...items] : [asset])),
    [assets.setData],
  );

  const onSave = useCallback(
    async (changes: StudioSaveChanges) => {
      try {
        const next = savedContent(type, content, changes);
        const updated = await experiencesApi.update(
          workspace.id,
          summary.id,
          studioUpdateBody(summary.name, next, draftRevisionRef.current),
        );
        if (updated.draftRevision !== undefined)
          draftRevisionRef.current = updated.draftRevision;
        upsertExperience(updated);
        onDetail((current) =>
          current
            ? {
                ...current,
                experience: {
                  ...current.experience,
                  content: updated.content,
                  ...(updated.draftRevision !== undefined
                    ? { draftRevision: updated.draftRevision }
                    : {}),
                } as ExperienceDetail["experience"],
              }
            : current,
        );
        notify(
          `${studioSavedMessage(changes)} Lo publicado no cambia hasta que publiques.`,
        );
        return true;
      } catch (error) {
        if (isChangedElsewhere(error)) {
          setChangedElsewhere(true);
          notify(changedElsewhereMessage, "error");
          return false;
        }
        notify(errorMessage(error), "error");
        return false;
      }
    },
    [
      workspace.id,
      summary.id,
      summary.name,
      type,
      content,
      upsertExperience,
      onDetail,
      notify,
    ],
  );

  /** "Recargar": takes the latest version of the page; what was on screen
   * is replaced only now, because the person chose it. */
  const reloadLatest = useCallback(async () => {
    setReloading(true);
    try {
      await reload();
      setChangedElsewhere(false);
      setStudioEpoch((value) => value + 1);
    } finally {
      setReloading(false);
    }
  }, [reload]);

  if (!isDesignableType(type)) return null;
  const kicker = `Estudio · ${experienceTypeLabels[type]}`;
  const back = {
    to: { name: "experience" as const, id: summary.id },
    label: summary.name,
  };

  const hasHtml = !isCustomHtmlBlank(savedCustomHtml);
  // From Primeros pasos' «Pídeselo a la IA»: straight to the "IA" rail on
  // the page's current look, without the start screen in between.
  if (!saved && !hasHtml && !started && !readOnly && !entryAi)
    return (
      <StartScreen
        back={back}
        content={content}
        currentExperienceId={summary.id}
        kicker={kicker}
        onStart={(design, origin, message) => {
          setStarted({ design, mode: "blocks" });
          notify(
            message ??
              `Empezaste con ${origin.startsWith("tu ") ? origin : `«${origin}»`}. Guarda cuando te guste.`,
            "info",
          );
        }}
        onStartHtml={
          can("experiences.custom_html")
            ? () =>
                setStarted({
                  design: designFromContent(type, content),
                  mode: "html",
                })
            : undefined
        }
        title={summary.name}
        type={type}
      />
    );

  const initialDesign =
    saved ?? started?.design ?? designFromContent(type, content);
  const publicationInFlight =
    summary.publicationStatus === "pending" ||
    summary.publicationStatus === "processing";
  const publicationNote = publicationInFlight
    ? publicationProgressNote(detail.versions[0]?.publication, Date.now())
    : null;
  const publicationFailure =
    summary.publicationStatus === "failed"
      ? (detail.versions[0]?.publication?.failureReason ??
        "No pudimos completar la publicación.")
      : null;

  return (
    <>
      <DesignStudio
        host={{
          type,
          kicker,
          title: summary.name,
          back,
          contentRoute: { name: "experience", id: summary.id },
          links: [
            {
              label: "Dónde se ve",
              icon: "touchpoint",
              to: { name: "experience", id: summary.id, view: "destinos" },
            },
            {
              label: "Historial",
              icon: "history",
              to: { name: "experience", id: summary.id, view: "historial" },
            },
          ],
          content,
          experienceId: summary.id,
          initialDesign,
          savedDesign: saved,
          designPending: !saved && started?.mode === "blocks",
          savedCustomHtml,
          initialMode:
            started?.mode ?? initialStudioMode(savedCustomHtml, saved !== null),
          savedAt: summary.updatedAt ?? null,
          readOnly,
          readOnlyReason: archived
            ? "Esta página está archivada: puedes ver su diseño, pero no cambiarlo."
            : readOnly
              ? "Tu rol permite ver este diseño, pero no cambiarlo."
              : null,
          canPublish: can("experiences.publish") && !archived,
          publication: {
            publicationStatus: summary.publicationStatus,
            hasUnpublishedChanges: summary.hasUnpublishedChanges,
            liveTouchpointCount: summary.liveTouchpointCount,
          },
          isPublishing: publicationInFlight,
          assets: assets.data ?? [],
          addAsset,
          onSave,
          onPublish: () => setPublishOpen(true),
          notices: (
            <>
              {changedElsewhere ? (
                <Notice
                  action={
                    <button
                      className="text-action"
                      disabled={reloading}
                      onClick={() => void reloadLatest()}
                      type="button"
                    >
                      Recargar
                    </button>
                  }
                  tone="warning"
                >
                  {changedElsewhereMessage} Lo que ves aquí no se pierde hasta
                  que recargues.
                </Notice>
              ) : null}
              {publicationNote ? (
                <Notice title="Publicando" tone="info">
                  {publicationNote}
                </Notice>
              ) : null}
              {publicationFailure ? (
                <Notice title="La última publicación falló" tone="danger">
                  {publicationFailure} La versión anterior sigue funcionando.
                </Notice>
              ) : null}
              {readOnly && !saved ? (
                <Notice tone="info">
                  Esta página todavía no usa un diseño del Estudio. Así se vería
                  con su tema actual.
                </Notice>
              ) : null}
            </>
          ),
        }}
        key={`${summary.id}:${studioEpoch}`}
      />
      {isPublishOpen ? (
        <ExperienceWorkspaceProvider
          source={{
            kind: "existing",
            experience: { ...summary, content },
            versions: detail.versions,
            targetStatuses: detail.targets ?? [],
            reload,
            onVersionsReplaced: (versions: readonly ExperienceVersion[]) =>
              onDetail((current) =>
                current ? { ...current, versions: [...versions] } : current,
              ),
            onArchivedChange: () => undefined,
          }}
        >
          <PublishBridge onDone={closePublish} />
        </ExperienceWorkspaceProvider>
      ) : null}
    </>
  );
}

/** Opens the workspace's PublishDialog and reports when it closes. */
function PublishBridge({ onDone }: { onDone: () => void }) {
  const ws = useExperienceWorkspace();
  const opened = useRef(false);
  const { openPublish, isPublishOpen } = ws;
  useEffect(() => {
    openPublish();
  }, [openPublish]);
  useEffect(() => {
    if (isPublishOpen) opened.current = true;
    else if (opened.current) onDone();
  }, [isPublishOpen, onDone]);
  return <PublishDialog />;
}
