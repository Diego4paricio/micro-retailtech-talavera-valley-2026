import { useCallback, useEffect } from "react";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { ExperienceBoard } from "./ExperienceBoard.js";
import { ExperienceRail } from "./ExperiencePicker.js";
import { useAvailabilityStore } from "./hooks.js";

/** Teammates change availability too: pick up their changes while open. */
const REFRESH_MS = 60_000;

/**
 * Disponibilidad: the live state of every Menu and Catalog item (available,
 * sold out or hidden, and units left). Changes save on their own and never
 * need publishing.
 */
export function AvailabilityPage({
  experienceId,
}: {
  experienceId: string | null;
}) {
  const { workspace, can } = useWorkspace();
  const { navigate } = useRouter();
  const { store, snapshot } = useAvailabilityStore(workspace.id);
  const canChange = can("experiences.publish");

  useEffect(() => {
    void store.refresh();
    const onVisibility = () => {
      // A phone locked mid-service: send what is waiting before it sleeps.
      if (document.visibilityState === "hidden") store.flushAll();
      else void store.refresh();
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void store.refresh();
    };
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (store.hasUnsaved()) event.preventDefault();
    };
    const timer = window.setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", warnIfUnsaved);
      store.flushAll();
    };
  }, [store]);

  const entries = snapshot.experiences;
  const selected =
    entries.find((entry) => entry.experience.experienceId === experienceId) ??
    entries[0] ??
    null;
  const selectedId = selected?.experience.experienceId ?? null;

  // The address always names the Menu or Catalog on screen.
  useEffect(() => {
    if (selectedId && selectedId !== experienceId)
      navigate(
        { name: "availability", experienceId: selectedId },
        { replace: true },
      );
  }, [selectedId, experienceId, navigate]);

  const select = useCallback(
    (id: string) =>
      navigate({ name: "availability", experienceId: id }, { replace: true }),
    [navigate],
  );

  return (
    <div className="page av">
      <PageHeader
        description="Qué hay hoy: marca lo que se acabó y lo que volvió. Tus clientes lo ven al instante, sin publicar nada."
        help="availability"
        title="Disponibilidad"
      />

      {snapshot.status === "error" ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void store.refresh()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {snapshot.error}
        </Notice>
      ) : null}

      {snapshot.status === "loading" && !entries.length ? (
        <AvailabilitySkeleton />
      ) : snapshot.status === "ready" && !entries.length ? (
        <EmptyState
          action={
            can("experiences.edit") ? (
              <button
                className="button button-primary"
                onClick={() =>
                  navigate({ name: "experience-new", touchpointId: null })
                }
                type="button"
              >
                <Icon name="plus" size={16} />
                Crear un Menú o Catálogo
              </button>
            ) : null
          }
          headingLevel={2}
          icon="availability"
          title="Aún no tienes Menús ni Catálogos"
        >
          Aquí marcas en vivo lo que se agota y cuántas piezas quedan de los
          artículos de tus Menús y Catálogos. Crea uno, publícalo y vuelve para
          llevar su disponibilidad.
        </EmptyState>
      ) : selected && selectedId ? (
        <>
          {canChange ? null : (
            <Notice icon="lock">
              Tu rol permite consultar la disponibilidad, pero no cambiarla. Si
              necesitas marcar algo, pídeselo a un Owner, Admin o Editor.
            </Notice>
          )}
          <div
            className="av-layout"
            data-rail={entries.length > 1 ? "" : undefined}
          >
            {entries.length > 1 ? (
              <ExperienceRail
                entries={entries}
                onSelect={select}
                selectedId={selectedId}
              />
            ) : null}
            <ExperienceBoard
              canChange={canChange}
              entries={entries}
              entry={selected}
              onSelect={select}
              store={store}
              workspaceId={workspace.id}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** The shape of the page while the list loads (appears after 300 ms). */
function AvailabilitySkeleton() {
  return (
    <div aria-busy="true" className="av-board av-skeleton" role="status">
      <span className="visually-hidden">Cargando disponibilidad…</span>
      <div aria-hidden="true" className="av-skeleton-head">
        <span className="skeleton-line av-skeleton-tile" />
        <span className="av-skeleton-lines">
          <span className="skeleton-line" />
          <span className="skeleton-line" />
        </span>
      </div>
      <span aria-hidden="true" className="skeleton-line av-skeleton-bar" />
      {[0, 1, 2, 3, 4].map((row) => (
        <div aria-hidden="true" className="av-skeleton-row" key={row}>
          <span className="skeleton-line av-skeleton-thumb" />
          <span className="av-skeleton-lines">
            <span className="skeleton-line" />
            <span className="skeleton-line" />
          </span>
          <span className="skeleton-line av-skeleton-control" />
        </div>
      ))}
    </div>
  );
}
