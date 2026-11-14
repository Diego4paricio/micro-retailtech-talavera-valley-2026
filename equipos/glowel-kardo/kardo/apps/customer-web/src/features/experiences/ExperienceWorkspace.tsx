import { DropdownMenu } from "radix-ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageTypeIcon } from "../../components/PageTypeIcon.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { UnsavedChangesBar } from "../../components/UnsavedChangesBar.js";
import { errorMessage } from "../../lib/api.js";
import { formatRelative } from "../../lib/format.js";
import { Link, type Route, useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { DesignView } from "./DesignView.js";
import { useExperienceWorkspace } from "./ExperienceWorkspaceContext.js";
import { HistoryView } from "./HistoryView.js";
import { experienceTypeLabels } from "./labels.js";
import { PublishDialog } from "./PublishDialog.js";
import { TargetsView } from "./TargetsView.js";
import {
  experienceListStatus,
  experienceViewRoute,
  listStatusViews,
  livePlacesOf,
  placesLabel,
  type WorkspaceView,
  workspaceViews,
} from "./workspace-model.js";

/**
 * One Experience, in three clearly separated views: Diseño (content and live
 * preview), Destinos (where it is published) and Historial (versions). The
 * header carries the name, type, status and the actions that apply to the
 * whole Experience; "Publicar" is always the primary one.
 */
export function ExperienceWorkspace({ view }: { view: WorkspaceView }) {
  const ws = useExperienceWorkspace();
  const { experience } = ws;

  const status = experienceListStatus(experience);
  const statusView = listStatusViews[status];
  const liveCount = experience.liveTouchpointCount ?? 0;
  const hasPending = !ws.readOnly && (ws.isDirty || ws.targetsChanged);
  // Named by what they are: QR, etiqueta or link (domain audit A2-27).
  const { touchpoints } = useWorkspace();
  const livePlaces = placesLabel(
    livePlacesOf(experience.id, liveCount, touchpoints.data ?? []),
  );

  // "Back" returns to the Touchpoint when the Experience lives on just one
  // (e.g. it was created from that Touchpoint), otherwise to the list.
  const single =
    ws.resolvedTargets.length === 1 ? ws.resolvedTargets[0] : undefined;
  const back: { to: Route; label: string } = single
    ? {
        to: { name: "touchpoint", id: single.id },
        label: single.operationalName,
      }
    : { to: { name: "experiences" }, label: "Páginas" };

  const saveState = ws.isDirty
    ? "Cambios sin guardar"
    : experience.updatedAt
      ? `Guardado ${formatRelative(experience.updatedAt)}`
      : "Guardado";

  const pendingMessage =
    ws.isDirty && ws.targetsChanged
      ? "Cambios sin guardar en el diseño y en dónde se ve"
      : ws.targetsChanged
        ? "Dónde se ve, sin guardar"
        : "Cambios sin guardar";
  const saveLabel =
    !ws.isDirty && ws.targetsChanged
      ? "Guardar dónde se ve"
      : "Guardar borrador";

  return (
    <div className="page xpw" data-view={view}>
      <header className="xpw-header">
        <Link
          ariaLabel={`Volver a ${back.label}`}
          className="icon-button xpw-back"
          to={back.to}
        >
          <Icon name="arrow-left" size={18} />
        </Link>
        <div className="xpw-heading">
          <p className="xpw-kicker">
            <PageTypeIcon size={14} type={ws.type} />
            {experienceTypeLabels[ws.type]}
          </p>
          <ExperienceName />
          <p className="xpw-meta">
            <StatusBadge tone={statusView.tone}>{statusView.label}</StatusBadge>
            <span aria-live="polite" className="xpw-meta-item">
              {saveState}
            </span>
            {liveCount > 0 && !ws.isArchived ? (
              <span className="xpw-meta-item xpw-meta-live">
                <Icon name="touchpoint" size={14} />
                En vivo en {livePlaces}
              </span>
            ) : null}
          </p>
        </div>
        <HeaderActions />
      </header>

      <ViewTabs current={view} />

      {ws.readOnly && !ws.isArchived ? (
        <Notice>
          Tu rol permite consultar esta página, pero no modificarla.
        </Notice>
      ) : null}
      {ws.isArchived ? <ArchivedNotice /> : null}
      {ws.hasConflict ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={ws.reloadLatest}
              type="button"
            >
              Recargar
            </button>
          }
          title="Esta página cambió"
          tone="danger"
        >
          Alguien más guardó cambios en esta página. Recarga para ver la versión
          más reciente. Mientras no recargues, lo que ves aquí sigue en
          pantalla, pero no se puede guardar.
        </Notice>
      ) : ws.serverError ? (
        <Notice onDismiss={ws.dismissServerError} tone="danger">
          {ws.serverError}
        </Notice>
      ) : null}
      {ws.publicationNote && !ws.isArchived ? (
        <Notice title="Publicando" tone="info">
          {ws.publicationNote}
        </Notice>
      ) : null}
      {ws.latestFailure && !ws.isArchived ? (
        <Notice
          action={
            ws.canPublish ? (
              <button
                className="text-action"
                onClick={ws.openPublish}
                type="button"
              >
                Reintentar
              </button>
            ) : null
          }
          title="La última publicación falló"
          tone="danger"
        >
          {ws.latestFailure} La versión anterior sigue funcionando.
        </Notice>
      ) : null}

      <div className="xpw-view" key={view}>
        {view === "destinos" ? (
          <TargetsView />
        ) : view === "historial" ? (
          <HistoryView />
        ) : (
          <DesignView />
        )}
      </div>

      {hasPending ? (
        <UnsavedChangesBar
          discardLabel="Descartar"
          isSaving={ws.isSaving}
          message={pendingMessage}
          onDiscard={ws.discard}
          onSave={() => void ws.save()}
          saveLabel={saveLabel}
        />
      ) : null}

      <PublishDialog />
    </div>
  );
}

/** The name, renamed in place: it is part of the draft like the content. */
function ExperienceName() {
  const ws = useExperienceWorkspace();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(ws.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape cancels; the blur that follows must not apply the value.
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  function start() {
    cancelledRef.current = false;
    setValue(ws.name);
    setIsEditing(true);
  }
  function commit(event?: FormEvent) {
    event?.preventDefault();
    if (cancelledRef.current) return;
    const next = value.trim().slice(0, 120);
    if (next) ws.setName(next);
    setIsEditing(false);
  }

  if (isEditing)
    return (
      <form className="xpw-rename" onSubmit={commit}>
        <label className="visually-hidden" htmlFor="experience-name">
          Nombre interno
        </label>
        <input
          className="xpw-rename-input"
          id="experience-name"
          maxLength={120}
          onBlur={() => commit()}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelledRef.current = true;
              setIsEditing(false);
            }
          }}
          ref={inputRef}
          value={value}
        />
        <button className="icon-button xpw-rename-done" type="submit">
          <Icon name="check" size={18} />
          <span className="visually-hidden">Aplicar nombre</span>
        </button>
      </form>
    );

  return (
    <div className="xpw-title-row">
      <h1 title={ws.name}>{ws.name.trim() || "Nueva página"}</h1>
      {!ws.readOnly ? (
        <button
          aria-label="Cambiar el nombre"
          className="icon-button xpw-rename-trigger"
          onClick={start}
          title="Cambiar el nombre (solo lo ve tu equipo)"
          type="button"
        >
          <Icon name="edit" size={16} />
        </button>
      ) : null}
    </div>
  );
}

function HeaderActions() {
  const ws = useExperienceWorkspace();
  const { navigate } = useRouter();
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const { experience } = ws;
  const hasAvailability =
    Boolean(experience) &&
    !ws.isArchived &&
    (ws.type === "menu" || ws.type === "catalog");
  const canArchive = ws.canEdit && Boolean(experience);
  const hasMenu = hasAvailability || canArchive;

  async function confirmArchive() {
    setIsArchiving(true);
    setArchiveError(null);
    try {
      await ws.archive();
      setIsConfirmingArchive(false);
    } catch (error) {
      setArchiveError(errorMessage(error));
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <div className="xpw-actions">
      {ws.canPublish && !ws.isArchived ? (
        <button
          aria-busy={ws.isPublicationInFlight || undefined}
          className="button button-primary xpw-publish"
          disabled={ws.isPublicationInFlight}
          onClick={ws.openPublish}
          type="button"
        >
          {ws.isPublicationInFlight ? (
            <>
              <span aria-hidden="true" className="button-spinner" />
              Publicando…
            </>
          ) : (
            <>
              <Icon name="send" size={16} />
              Publicar
            </>
          )}
        </button>
      ) : null}
      {hasMenu ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label="Más acciones"
              className="icon-button xpw-more"
              disabled={ws.isDuplicating}
              type="button"
            >
              <Icon name="more" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="kd-dropdown-content"
              sideOffset={6}
            >
              {hasAvailability && experience ? (
                <DropdownMenu.Item
                  className="kd-dropdown-item"
                  onSelect={() =>
                    navigate({
                      name: "availability",
                      experienceId: experience.id,
                    })
                  }
                >
                  <Icon name="availability" size={16} /> Disponibilidad en vivo
                </DropdownMenu.Item>
              ) : null}
              {canArchive ? (
                <>
                  <DropdownMenu.Item
                    className="kd-dropdown-item"
                    onSelect={() => void ws.duplicate()}
                  >
                    <Icon name="duplicate" size={16} /> Duplicar
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="kd-dropdown-separator" />
                  {ws.isArchived ? (
                    <DropdownMenu.Item
                      className="kd-dropdown-item"
                      onSelect={() => void ws.unarchive()}
                    >
                      <Icon name="reset" size={16} /> Restaurar
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item
                      className="kd-dropdown-item kd-dropdown-item-danger"
                      onSelect={() => setIsConfirmingArchive(true)}
                    >
                      <Icon name="trash" size={16} /> Archivar
                    </DropdownMenu.Item>
                  )}
                </>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}

      <ConfirmDialog
        confirmLabel="Archivar"
        description={
          <>
            «{ws.name}» se ocultará del espacio. Los QR y etiquetas que la
            muestran por un grupo pasarán a la página de ese grupo, si tiene
            una.
            {ws.isDirty || ws.targetsChanged
              ? " Los cambios sin guardar se descartarán."
              : ""}
            {archiveError ? (
              <Notice tone="danger">{archiveError}</Notice>
            ) : null}
          </>
        }
        isBusy={isArchiving}
        onClose={() => {
          setIsConfirmingArchive(false);
          setArchiveError(null);
        }}
        onConfirm={() => void confirmArchive()}
        open={isConfirmingArchive}
        title="¿Archivar esta página?"
        tone="danger"
      />
    </div>
  );
}

function ArchivedNotice() {
  const ws = useExperienceWorkspace();
  return (
    <Notice
      action={
        ws.canEdit ? (
          <button
            className="text-action"
            onClick={() => void ws.unarchive()}
            type="button"
          >
            Restaurar
          </button>
        ) : null
      }
      title="Esta página está archivada"
    >
      Está oculta del espacio y no se puede editar ni publicar. Restáurala para
      volver a trabajar en ella.
    </Notice>
  );
}

/** The three views, each with its own URL. */
function ViewTabs({ current }: { current: WorkspaceView }) {
  const ws = useExperienceWorkspace();
  const counts: Partial<Record<WorkspaceView, number>> = {
    destinos: ws.resolvedTargets.length,
    historial: ws.versionCount,
  };
  return (
    <nav aria-label="Secciones de la página" className="xpw-tabs">
      {workspaceViews.map(({ view, label }) => {
        const count = counts[view];
        const content = (
          <>
            {label}
            {count !== undefined ? (
              <span className="xpw-tab-count">{count}</span>
            ) : null}
            {view === "destinos" && ws.targetsChanged ? (
              <span aria-hidden="true" className="xpw-tab-dot" />
            ) : null}
          </>
        );
        return (
          <Link
            ariaCurrent={view === current ? "page" : undefined}
            className="xpw-tab"
            key={view}
            to={experienceViewRoute(ws.experienceId, view)}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
