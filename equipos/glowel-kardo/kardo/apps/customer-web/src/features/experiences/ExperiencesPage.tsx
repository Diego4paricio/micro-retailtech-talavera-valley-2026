import {
  type ExperienceSummary,
  type ExperienceType,
  experienceTypes,
} from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import { useMemo, useState } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { ConfirmDialog } from "../../components/Dialog.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { PageTypeIcon } from "../../components/PageTypeIcon.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatDate, formatRelative } from "../../lib/format.js";
import { Link, type Route, useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  flattenGroupTree,
  groupChain,
  indentedName,
  treeIds,
} from "../touchpoints/group-tree.js";
import { experienceTypeLabels } from "./labels.js";
import { findSampleContent } from "./sample-content.js";
import {
  describeTargets,
  experienceTargetsOf,
  experienceTargetsTouchpoint,
} from "./targets.js";
import {
  experienceListStatus,
  type ListFilter,
  listFilterCounts,
  listFilters,
  listStatusViews,
  livePlacesOf,
  matchesListFilter,
  matchesSearch,
  type PlaceCounts,
  reachLabel,
} from "./workspace-model.js";

/**
 * Experiences at a glance: status, type, where each one is live and when it
 * was last edited, with filters by state, search, type and destination.
 */
export function ExperiencesPage() {
  const { workspace, experiences, touchpoints, groups, can, upsertExperience } =
    useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [query, setQuery] = useState("");
  // "t:<id>" filters by Touchpoint, "g:<id>" by group.
  const [scope, setScope] = useState("");
  const [type, setType] = useState<ExperienceType | "">("");
  const [archiveTarget, setArchiveTarget] = useState<ExperienceSummary | null>(
    null,
  );
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  const isArchivedView = filter === "archived";
  const archived = useResource(
    isArchivedView ? `experiences-archived:${workspace.id}` : null,
    (signal) => experiencesApi.listArchived(workspace.id, signal),
  );
  const resource = isArchivedView ? archived : experiences;
  const items = resource.data ?? [];
  const touchpointItems = touchpoints.data ?? [];
  const groupItems = groups.data ?? [];
  const counts = useMemo(
    () => listFilterCounts(experiences.data ?? []),
    [experiences.data],
  );
  const canEdit = can("experiences.edit");
  const hasFilters = Boolean(query.trim() || scope || type);

  function matchesScope(item: ExperienceSummary): boolean {
    if (!scope) return true;
    const targets = experienceTargetsOf(item);
    const [kind, id] = scope.split(":");
    if (kind === "g") {
      // Groups nest: what reaches the group (or any of its subgroups), or a
      // Touchpoint inside it, counts.
      const tree = treeIds(groupItems, id ?? "");
      const above = new Set(
        groupChain(groupItems, id ?? "").map((group) => group.id),
      );
      return (
        targets.groupIds.some(
          (groupId) => tree.has(groupId) || above.has(groupId),
        ) ||
        touchpointItems.some(
          (touchpoint) =>
            Boolean(touchpoint.groupId && tree.has(touchpoint.groupId)) &&
            targets.touchpointIds.includes(touchpoint.id),
        )
      );
    }
    const touchpoint = touchpointItems.find((candidate) => candidate.id === id);
    return touchpoint
      ? experienceTargetsTouchpoint(item, touchpoint, groupItems)
      : false;
  }

  const filtered = items.filter(
    (item) =>
      matchesListFilter(
        isArchivedView
          ? { ...item, archivedAt: item.archivedAt ?? "archived" }
          : item,
        filter,
      ) &&
      matchesSearch(item, query) &&
      matchesScope(item) &&
      (!type || item.type === type),
  );

  async function duplicate(experience: ExperienceSummary) {
    setIsDuplicating(experience.id);
    try {
      const created = await experiencesApi.duplicate(
        workspace.id,
        experience.id,
      );
      upsertExperience(created);
      notify(`«${created.name}» se creó como borrador.`);
      navigate({ name: "experience", id: created.id });
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsDuplicating(null);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setIsArchiving(true);
    setArchiveError(null);
    try {
      const result = await experiencesApi.archive(
        workspace.id,
        archiveTarget.id,
      );
      experiences.setData((current) =>
        current
          ? current.filter((item) => item.id !== archiveTarget.id)
          : current,
      );
      notify(
        result.fallbackPublications
          ? `Página archivada. ${result.fallbackPublications === 1 ? "1 QR o etiqueta" : `${result.fallbackPublications} QR y etiquetas`} ahora muestran la página de su grupo.`
          : "Página archivada.",
      );
      setArchiveTarget(null);
    } catch (requestError) {
      setArchiveError(errorMessage(requestError));
    } finally {
      setIsArchiving(false);
    }
  }

  async function unarchive(experience: ExperienceSummary) {
    try {
      const restored = await experiencesApi.unarchive(
        workspace.id,
        experience.id,
      );
      upsertExperience(restored);
      archived.setData((current) =>
        current ? current.filter((item) => item.id !== experience.id) : current,
      );
      notify(`«${restored.name}» se restauró desde Archivadas.`);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    }
  }

  const isEmptyWorkspace =
    !isArchivedView && !resource.isLoading && !(experiences.data ?? []).length;

  return (
    <div className="page xpl">
      <PageHeader
        actions={
          canEdit ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link
                className="button button-secondary"
                to={{ name: "experience-scan" }}
              >
                Foto a menú (IA)
              </Link>
              <Link
                className="button button-primary"
                to={{ name: "experience-new", touchpointId: null }}
              >
                <Icon name="plus" /> Nueva página
              </Link>
            </div>
          ) : null
        }
        help="experiences"
        description="La página que ve tu cliente al escanear: tu menú, tu catálogo, tu formulario… Diséñala y publícala en tus QR."
        title="Páginas"
      />

      {isEmptyWorkspace ? (
        <EmptyState
          action={
            canEdit ? (
              <Link
                className="button button-primary"
                to={{ name: "experience-new", touchpointId: null }}
              >
                Crear mi primera página
              </Link>
            ) : null
          }
          icon="experience"
          title="Aún no hay páginas"
        >
          Menú, catálogo, perfil, enlaces, formulario de contacto, imagen, PDF o
          redirección. Primero la diseñas; los QR y etiquetas se eligen al
          publicar.
        </EmptyState>
      ) : (
        <>
          <div className="xpl-toolbar">
            <fieldset className="segmented xpl-filters">
              <legend className="visually-hidden">Filtrar por estado</legend>
              {listFilters.map(({ value, label }) => (
                <button
                  aria-pressed={filter === value}
                  className={
                    filter === value ? "segment segment-current" : "segment"
                  }
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {label}
                  {value !== "archived" && experiences.data ? (
                    <span className="xpl-filter-count tabular">
                      {counts[value]}
                    </span>
                  ) : null}
                </button>
              ))}
            </fieldset>
            <label className="search-field xpl-search">
              <span className="visually-hidden">Buscar páginas</span>
              <Icon className="xpl-search-icon" name="search" size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o tipo"
                type="search"
                value={query}
              />
            </label>
            <div className="toolbar xpl-selects">
              <label>
                <span className="visually-hidden">Filtrar por tipo</span>
                <select
                  onChange={(event) =>
                    setType(event.target.value as ExperienceType | "")
                  }
                  value={type}
                >
                  <option value="">Todos los tipos</option>
                  {experienceTypes.map((option) => (
                    <option key={option} value={option}>
                      {experienceTypeLabels[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">
                  Filtrar por grupo o QR/etiqueta
                </span>
                <select
                  onChange={(event) => setScope(event.target.value)}
                  value={scope}
                >
                  <option value="">Todos</option>
                  {groupItems.length ? (
                    <optgroup label="Grupos">
                      {flattenGroupTree(groupItems).map(({ group, depth }) => (
                        <option key={group.id} value={`g:${group.id}`}>
                          {indentedName(group.name, depth)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <optgroup label="QR y etiquetas">
                    {touchpointItems
                      .filter((touchpoint) => touchpoint.kind !== "link")
                      .map((touchpoint) => (
                        <option
                          key={touchpoint.id}
                          value={`t:${touchpoint.id}`}
                        >
                          {touchpoint.operationalName}
                        </option>
                      ))}
                  </optgroup>
                  {/* Links filter in their own group (domain audit A2-27). */}
                  {touchpointItems.some(
                    (touchpoint) => touchpoint.kind === "link",
                  ) ? (
                    <optgroup label="Links">
                      {touchpointItems
                        .filter((touchpoint) => touchpoint.kind === "link")
                        .map((touchpoint) => (
                          <option
                            key={touchpoint.id}
                            value={`t:${touchpoint.id}`}
                          >
                            {touchpoint.operationalName}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
            </div>
          </div>

          {resource.error ? (
            <Notice
              action={
                <button
                  className="text-action"
                  onClick={() => void resource.reload()}
                  type="button"
                >
                  Reintentar
                </button>
              }
              tone="danger"
            >
              {resource.error}
            </Notice>
          ) : null}

          {resource.isLoading && !items.length ? (
            <Skeleton lines={4} />
          ) : filtered.length ? (
            <section
              aria-label="Páginas del espacio"
              className="panel xpl-panel"
            >
              <ul className="xpl-list">
                {filtered.map((experience) => (
                  <ExperienceRow
                    canEdit={canEdit}
                    experience={experience}
                    isArchivedView={isArchivedView}
                    isBusy={isDuplicating === experience.id}
                    key={experience.id}
                    onArchive={() => setArchiveTarget(experience)}
                    onDuplicate={() => void duplicate(experience)}
                    onUnarchive={() => void unarchive(experience)}
                    places={livePlacesOf(
                      experience.id,
                      experience.liveTouchpointCount ?? 0,
                      touchpointItems,
                    )}
                    targetsLabel={describeTargets(
                      experienceTargetsOf(experience),
                      touchpointItems,
                      groupItems,
                    )}
                  />
                ))}
              </ul>
            </section>
          ) : (
            <div className="xpl-empty">
              {isArchivedView && !hasFilters ? (
                <EmptyState
                  compact
                  icon="experience"
                  title="No hay páginas archivadas"
                >
                  Las que archives aparecerán aquí y podrás restaurarlas cuando
                  quieras.
                </EmptyState>
              ) : (
                <EmptyState
                  action={
                    hasFilters ? (
                      <button
                        className="button button-secondary button-small"
                        onClick={() => {
                          setQuery("");
                          setScope("");
                          setType("");
                        }}
                        type="button"
                      >
                        Quitar filtros
                      </button>
                    ) : null
                  }
                  compact
                  icon="search"
                  title="Ninguna página coincide"
                >
                  {filter === "published"
                    ? "Todavía no hay páginas en vivo con estos filtros."
                    : filter === "drafts"
                      ? "No hay borradores con estos filtros."
                      : "Prueba con otro nombre, tipo o dónde se ve."}
                </EmptyState>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        confirmLabel="Archivar"
        description={
          <>
            «{archiveTarget?.name}» se ocultará del espacio. Los QR y etiquetas
            que la muestran por un grupo pasarán a la página de ese grupo, si
            tiene una.
            {archiveError ? (
              <Notice tone="danger">{archiveError}</Notice>
            ) : null}
          </>
        }
        isBusy={isArchiving}
        onClose={() => {
          setArchiveTarget(null);
          setArchiveError(null);
        }}
        onConfirm={() => void confirmArchive()}
        open={Boolean(archiveTarget)}
        title="¿Archivar esta página?"
        tone="danger"
      />
    </div>
  );
}

function ExperienceRow({
  experience,
  targetsLabel,
  places,
  isArchivedView,
  canEdit,
  isBusy,
  onDuplicate,
  onArchive,
  onUnarchive,
}: {
  experience: ExperienceSummary;
  targetsLabel: string;
  /** Where it is live, by kind (QR, etiqueta or link). */
  places: PlaceCounts;
  isArchivedView: boolean;
  canEdit: boolean;
  isBusy: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const status = experienceListStatus(
    isArchivedView
      ? { ...experience, archivedAt: experience.archivedAt ?? "archived" }
      : experience,
  );
  const statusView = listStatusViews[status];
  const reach = reachLabel(experience, places);
  const withSampleText =
    !isArchivedView &&
    (experience.liveTouchpointCount ?? 0) === 0 &&
    findSampleContent(experience.type, experience.content).length > 0;
  const to: Route = { name: "experience", id: experience.id };
  const edited =
    isArchivedView && experience.archivedAt
      ? `Archivada ${formatDate(experience.archivedAt)}`
      : experience.updatedAt
        ? `Editada ${formatRelative(experience.updatedAt)}`
        : null;

  return (
    <li className="xpl-row">
      <Link className="xpl-link" to={to}>
        <span aria-hidden="true" className="xpl-icon">
          <PageTypeIcon size={18} type={experience.type} />
        </span>
        <span className="xpl-main">
          <strong>{experience.name}</strong>
          <small>
            {experienceTypeLabels[experience.type]}
            {edited ? ` · ${edited}` : ""}
            {/* Half-made pages (relevo 37, S5): Carmen's «Mis Servicios»
                still said «Platillo 1» and nothing told her. */}
            {withSampleText ? (
              <span className="xpl-sample"> · Con textos de ejemplo</span>
            ) : null}
          </small>
        </span>
        <span
          className={`xpl-reach xpl-reach-${isArchivedView ? "none" : reach.tone}`}
          title={reach.tone === "none" ? undefined : targetsLabel}
        >
          <Icon
            name={reach.tone === "none" ? "link-off" : "touchpoint"}
            size={15}
          />
          <span>
            {reach.tone === "assigned"
              ? `Asignada a ${targetsLabel}`
              : reach.label}
          </span>
        </span>
        <span className="xpl-status" title={statusView.hint}>
          <StatusBadge tone={statusView.tone}>{statusView.label}</StatusBadge>
        </span>
        <Icon className="xpl-chevron" name="chevron-right" size={16} />
      </Link>
      {canEdit ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label={`Acciones para ${experience.name}`}
              className="icon-button xpl-more"
              disabled={isBusy}
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
              <DropdownMenu.Item
                className="kd-dropdown-item"
                onSelect={onDuplicate}
              >
                <Icon name="duplicate" size={16} /> Duplicar
              </DropdownMenu.Item>
              {isArchivedView ? (
                <DropdownMenu.Item
                  className="kd-dropdown-item"
                  onSelect={onUnarchive}
                >
                  <Icon name="reset" size={16} /> Restaurar
                </DropdownMenu.Item>
              ) : (
                <DropdownMenu.Item
                  className="kd-dropdown-item kd-dropdown-item-danger"
                  onSelect={onArchive}
                >
                  <Icon name="trash" size={16} /> Archivar
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
    </li>
  );
}
