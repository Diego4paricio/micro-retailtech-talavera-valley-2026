import type { AvailabilityItem } from "@kardo/contracts";
import { useCallback, useId, useMemo, useState } from "react";
import { ConfirmDialog } from "../../components/Dialog.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  EditItemsDialog,
  useItemsNoun,
} from "../experiences/EditItemsDialog.js";
import { isItemsPage } from "../experiences/edit-items.js";
import { ExperienceSwitcher, typeIcon } from "./ExperiencePicker.js";
import { useNow } from "./hooks.js";
import { ItemRow } from "./ItemRow.js";
import {
  type AvailabilityFilter,
  allAvailableChanges,
  availabilityFilters,
  countItems,
  filterLabels,
  filterSections,
  groupItems,
  hasItemPhotos,
  type ItemState,
  normalizeSearch,
  relativeTime,
  searchEmptyState,
  sectionSummary,
  showsListTools,
  snapshotChanges,
  touchpointsLabel,
} from "./model.js";
import { SaveStatus } from "./SaveStatus.js";
import type { QueueSnapshot } from "./save-queue.js";
import type { AvailabilityStore } from "./store.js";

const noItems: ReadonlySet<string> = new Set();

/** One Menu or Catalog: its live status, filters and every item. */
export function ExperienceBoard({
  entry,
  entries,
  store,
  workspaceId,
  canChange,
  onSelect,
}: {
  entry: QueueSnapshot;
  entries: readonly QueueSnapshot[];
  store: AvailabilityStore;
  workspaceId: string;
  canChange: boolean;
  onSelect: (experienceId: string) => void;
}) {
  const { experience, phase, error, failedIds } = entry;
  const id = experience.experienceId;
  const { can, experiences } = useWorkspace();
  const { notify } = useToast();
  const titleId = useId();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<AvailabilityFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  // «Editar productos» and «Cambiar precio» (2026-10-03 study, finding 3):
  // `focus` is the item whose price gets the cursor. S1 (relevo 37): a
  // search with nothing found opens the dialog with that name prefilled.
  const [editing, setEditing] = useState<{
    focus: AvailabilityItem | null;
    prefillName?: string | null;
  } | null>(null);
  const summary = experiences.data?.find((item) => item.id === id);
  const itemsPage =
    summary && isItemsPage(summary.type) && can("experiences.edit")
      ? { ...summary, type: summary.type }
      : null;
  const noun = useItemsNoun(itemsPage?.type ?? experience.type);
  const onEditPrice = useCallback(
    (item: AvailabilityItem) => setEditing({ focus: item }),
    [],
  );

  // Items changed while a filter or search is on stay in view until the
  // filter changes: they must not vanish under the finger.
  const isFiltering = filter !== "all" || normalizeSearch(query) !== "";
  const contextKey = `${id}|${filter}|${query}`;
  const [kept, setKept] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: "",
    ids: noItems,
  });
  const keep = kept.key === contextKey ? kept.ids : noItems;

  const counts = useMemo(() => countItems(experience), [experience]);
  const sections = useMemo(
    () => filterSections(experience.sections, filter, query, keep),
    [experience.sections, filter, query, keep],
  );
  const bulk = useMemo(() => allAvailableChanges(experience), [experience]);
  const showThumbs = useMemo(() => hasItemPhotos(experience), [experience]);
  const showTools = showsListTools(counts.all, filter, query);
  // One section is the whole page: its name and count would repeat the
  // header and the filters.
  const showSectionHeads = experience.sections.length > 1;
  const icon = typeIcon(experience.type);
  // S1 (relevo 37): a search with no matches offers to add that item.
  const emptyState = searchEmptyState(
    counts,
    filter,
    query,
    Boolean(itemsPage),
  );

  const onChange = useCallback(
    (itemId: string, next: ItemState) => {
      store.change(id, [
        { itemId, status: next.status, quantity: next.quantity },
      ]);
      if (isFiltering)
        setKept((current) => {
          const ids = new Set(current.key === contextKey ? current.ids : []);
          ids.add(itemId);
          return { key: contextKey, ids };
        });
    },
    [store, id, isFiltering, contextKey],
  );

  function applyAllAvailable() {
    setConfirmOpen(false);
    if (!bulk.length) return;
    const previous = snapshotChanges(
      experience,
      bulk.map((change) => change.itemId),
    );
    const name = experience.name;
    setFilter("all");
    store.change(id, bulk, { immediate: true });
    void store.whenSettled(id).then((saved) => {
      if (!saved) return;
      notify(`Todo quedó disponible en «${name}».`, "success", {
        action: {
          label: "Deshacer",
          onClick: () => {
            store.change(id, previous, { immediate: true });
            void store.whenSettled(id).then((undone) => {
              if (undone) notify("Volvió a quedar como estaba.", "info");
            });
          },
        },
      });
    });
  }

  const isLive =
    experience.source === "published" && experience.liveTouchpointCount > 0;
  const hasSwitch = entries.length > 1;

  return (
    <section aria-labelledby={titleId} className="av-board">
      <header className="av-head" data-switch={hasSwitch ? "" : undefined}>
        <span aria-hidden="true" className="av-head-icon">
          <Icon name={icon} size={22} />
        </span>
        <div className="av-head-copy">
          <h2 className="av-title" id={titleId}>
            <span className="av-title-text">{experience.name}</span>
            {hasSwitch ? (
              <ExperienceSwitcher
                entries={entries}
                onSelect={onSelect}
                selected={experience}
              />
            ) : null}
          </h2>
          <p className="av-head-meta">
            <span className="av-live" data-live={isLive ? "" : undefined}>
              {experience.source === "draft"
                ? "Sin publicar"
                : touchpointsLabel(experience.liveTouchpointCount)}
            </span>
            {experience.updatedAt ? (
              <span>
                Último cambio {relativeTime(experience.updatedAt, now)}
              </span>
            ) : null}
          </p>
        </div>
        <div className="av-head-actions">
          {itemsPage ? (
            <button
              className="button button-ghost button-small"
              onClick={() => setEditing({ focus: null })}
              type="button"
            >
              <Icon name="edit" size={16} />
              Editar {noun.many}
            </button>
          ) : (
            <Link
              className="button button-ghost button-small"
              to={{ name: "experience", id }}
            >
              <Icon name="edit" size={16} />
              {can("experiences.edit") ? "Editar contenido" : "Ver contenido"}
            </Link>
          )}
          {canChange ? (
            <button
              className="button button-secondary button-small"
              disabled={!bulk.length}
              onClick={() => setConfirmOpen(true)}
              title={bulk.length ? undefined : "Todo ya está disponible"}
              type="button"
            >
              <Icon name="availability" size={16} />
              Todo disponible
            </button>
          ) : null}
        </div>
      </header>

      {experience.source === "draft" ? (
        <Notice
          action={
            <Link className="text-action" to={{ name: "experience", id }}>
              Abrir editor
            </Link>
          }
          title="Aún no está publicada"
        >
          Puedes dejar lista la disponibilidad desde ahora: tus clientes la
          verán en cuanto publiques esta página.
        </Notice>
      ) : experience.hasUnpublishedChanges ? (
        <p className="av-note">
          <Icon name="info" size={16} />
          <span>
            Ves los artículos publicados: hay cambios en el editor que aún no
            publicas. <Link to={{ name: "experience", id }}>Ir al editor</Link>
          </span>
        </p>
      ) : null}

      {error ? (
        <Notice
          action={
            canChange ? (
              <button
                className="text-action"
                onClick={() => store.retry(id)}
                type="button"
              >
                Reintentar
              </button>
            ) : undefined
          }
          onDismiss={() => store.dismissError(id)}
          title={
            failedIds.size === 1
              ? "No se guardó un cambio"
              : `No se guardaron ${failedIds.size} cambios`
          }
          tone="danger"
        >
          {error}{" "}
          {failedIds.size === 1
            ? "El artículo volvió a su estado anterior."
            : "Los artículos volvieron a su estado anterior."}
        </Notice>
      ) : null}

      {showTools || canChange ? (
        <div className="av-toolbar" data-short={showTools ? undefined : ""}>
          <div className="av-toolbar-row">
            {showTools ? (
              <label className="av-search">
                <Icon name="search" size={17} />
                <span className="visually-hidden">
                  Buscar artículo por nombre
                </span>
                <input
                  autoComplete="off"
                  className="input"
                  enterKeyHint="search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre"
                  type="search"
                  value={query}
                />
              </label>
            ) : null}
            {canChange ? (
              <SaveStatus onRetry={() => store.retry(id)} phase={phase} />
            ) : null}
          </div>
          {showTools ? (
            <fieldset className="av-filters">
              <legend className="visually-hidden">Mostrar artículos</legend>
              {availabilityFilters.map((option) => (
                <button
                  aria-pressed={filter === option}
                  className="av-chip"
                  data-filter={option}
                  key={option}
                  onClick={() => setFilter(option)}
                  type="button"
                >
                  {option === "all" ? null : (
                    <span aria-hidden="true" className="av-chip-dot" />
                  )}
                  {filterLabels[option]}
                  <span className="av-chip-count">{counts[option]}</span>
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>
      ) : null}

      <div className="av-list">
        {sections.length ? (
          sections.map((section) => (
            <section
              aria-label={section.name ?? "Artículos"}
              className="av-section"
              key={section.id}
            >
              {section.name && showSectionHeads ? (
                <header className="av-section-head">
                  <h3>{section.name}</h3>
                  <span className="av-section-count">
                    {sectionSummary(
                      experience.sections.find(
                        (candidate) => candidate.id === section.id,
                      ) ?? section,
                    )}
                  </span>
                </header>
              ) : null}
              <ul className="av-items">
                {groupItems(section.items).map(({ dish, choices }) => (
                  <ItemRow
                    canChange={canChange}
                    // Each guisado keeps only its own availability, inside
                    // the dish's card; the price is the dish's.
                    choices={choices}
                    currency={experience.currency}
                    failed={failedIds.has(dish.id)}
                    failedIds={choices.length ? failedIds : undefined}
                    item={dish}
                    key={dish.id}
                    now={now}
                    onChange={onChange}
                    onEditPrice={itemsPage ? onEditPrice : undefined}
                    showThumb={showThumbs}
                    typeIcon={icon}
                    workspaceId={workspaceId}
                  />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <EmptyState
            action={
              emptyState.offerToAdd ? (
                <button
                  className="button button-primary button-small"
                  onClick={() =>
                    setEditing({
                      focus: null,
                      prefillName: emptyState.offerToAdd,
                    })
                  }
                  type="button"
                >
                  Agregarlo
                </button>
              ) : counts.all && isFiltering ? (
                <button
                  className="button button-secondary button-small"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                  type="button"
                >
                  Ver todos los artículos
                </button>
              ) : null
            }
            compact
            icon={counts.all ? "search" : icon}
            secondaryAction={
              emptyState.offerToAdd && counts.all ? (
                <button
                  className="button button-ghost button-small"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                  type="button"
                >
                  Ver todos los artículos
                </button>
              ) : null
            }
            title={emptyState.title}
          >
            {emptyState.message}
          </EmptyState>
        )}
      </div>

      {itemsPage ? (
        <EditItemsDialog
          experience={itemsPage}
          focusItem={editing?.focus}
          onClose={() => setEditing(null)}
          onSaved={({ published }) => {
            void store.refresh();
            // The new version takes a few seconds to go live.
            if (published) window.setTimeout(() => void store.refresh(), 5000);
          }}
          open={editing !== null}
          prefillName={editing?.prefillName}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="Todo disponible"
        description={
          bulk.length === 1
            ? `1 artículo de «${experience.name}» quedará disponible y sin conteo de piezas. Tus clientes lo verán al instante.`
            : `${bulk.length} artículos de «${experience.name}» quedarán disponibles y sin conteo de piezas. Tus clientes lo verán al instante.`
        }
        onClose={() => setConfirmOpen(false)}
        onConfirm={applyAllAvailable}
        open={confirmOpen}
        title="¿Dejar todo disponible?"
      />
    </section>
  );
}
