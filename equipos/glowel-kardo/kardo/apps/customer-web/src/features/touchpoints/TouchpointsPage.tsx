import type { Touchpoint, TouchpointGroup } from "@kardo/contracts";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { groupsApi } from "../../api/groups.js";
import { qrTemplatesApi } from "../../api/qr-designs.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import { Link, useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { experienceTypeLabels } from "../experiences/labels.js";
import { GroupDialog } from "./GroupDialog.js";
import {
  buildGroupTree,
  GROUP_MAX_DEPTH,
  type GroupNode,
  groupChain,
  groupIcon,
  groupKind,
  groupPathLabel,
} from "./group-tree.js";
import {
  effectiveKind,
  excludeLinks,
  touchpointKindIcons,
  touchpointKindLabels,
} from "./kind.js";
import { touchpointBadge } from "./labels.js";
import { MoveToGroupDialog } from "./MoveToGroupDialog.js";
import { NewTouchpointDialog } from "./NewTouchpointDialog.js";
import { needsPlacing, objectStateView } from "./object-steps.js";
import {
  PieceThumb,
  pieceKindLabel,
  pieceModelOf,
} from "./pieces/PieceThumb.js";
import { GroupDesignDialog } from "./qr/library/GroupDesignDialog.js";

/** «Por colocar» (relevo 36): a live object still missing from its place. */
type StatusFilter = "all" | Touchpoint["status"] | "place";

/** States as a plain dot and a word (owner, 2026-10-03), as on its page. */
const toneClass = {
  success: "tp-state-placed",
  info: "tp-state-ready",
  warning: "tp-state-ready",
  danger: "tp-state-danger",
  neutral: "tp-state-pending",
} as const;
type View = "groups" | "list";

/** With more touchpoints than this, groups start collapsed (one line each). */
const COLLAPSE_OVER = 20;
const UNGROUPED = "ungrouped";

function readView(key: string): View | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === "groups" || value === "list" ? value : null;
  } catch {
    return null;
  }
}

/** The groups the customer collapsed, per workspace; null = never chose. */
function readCollapsed(key: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value) => typeof value === "string"))
      : null;
  } catch {
    return null;
  }
}

function writeCollapsed(key: string, ids: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // A private window or blocked storage: it just won't be remembered.
  }
}

export function TouchpointsPage({
  activating = false,
  activationCode = null,
}: {
  /** `/activar`: «Nuevo QR o etiqueta» open on «Producto de Kardo»
   * (ADR 026). */
  activating?: boolean;
  activationCode?: string | null;
} = {}) {
  const { workspace, touchpoints, groups, can } = useWorkspace();
  const { navigate } = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const canActivate = can("touchpoints.manage");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  // The view the customer chose last on this device ("Por grupo" or
  // "Lista"); without a choice, "Por grupo" whenever there are groups.
  const viewKey = `kardo:touchpoints:view:${workspace.id}`;
  const [view, setViewState] = useState<View | null>(() => readView(viewKey));
  function setView(next: View) {
    setViewState(next);
    try {
      window.localStorage.setItem(viewKey, next);
    } catch {
      // Not remembered in a private window; the choice still applies now.
    }
  }
  const [editingGroup, setEditingGroup] = useState<
    TouchpointGroup | "new" | null
  >(null);
  const [designGroup, setDesignGroup] = useState<TouchpointGroup | null>(null);
  // "Nuevo grupo" from a group's header creates it inside that group.
  const [newGroupParent, setNewGroupParent] = useState<string | null>(null);
  // "Ordenar": pick several touchpoints and move them between groups.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isMoving, setIsMoving] = useState(false);
  const [isUngrouping, setIsUngrouping] = useState(false);
  const { notify } = useToast();
  const { refreshGroups } = useWorkspace();
  const collapseKey = `kardo:touchpoints:collapsed:${workspace.id}`;
  const [collapsedPref, setCollapsedPref] =
    useState<ReadonlySet<string> | null>(() => readCollapsed(collapseKey));
  useEffect(() => {
    setCollapsedPref(readCollapsed(collapseKey));
  }, [collapseKey]);
  useEffect(() => {
    setViewState(readView(viewKey));
  }, [viewKey]);
  // Names of the library designs groups give their QR Touchpoints.
  const qrTemplates = useResource(
    groups.data?.length ? `qr-templates:${workspace.id}` : null,
    (signal) => qrTemplatesApi.list(workspace.id, signal),
  );
  const canManage = can("touchpoints.manage");
  const canEdit = can("experiences.edit");
  // Links (`kind: "link"`) are a separate product: never shown among
  // Touchpoints, in their groups, counts, filters or batches.
  const allItems = useMemo(
    () => excludeLinks(touchpoints.data ?? []),
    [touchpoints.data],
  );
  // Retired Touchpoints are permanently withdrawn: they never appear in the
  // regular views, only in the collapsed "Retirados" section below.
  const items = useMemo(
    () => allItems.filter((item) => item.status !== "retired"),
    [allItems],
  );
  const retiredItems = useMemo(
    () => allItems.filter((item) => item.status === "retired"),
    [allItems],
  );
  const groupItems = groups.data ?? [];
  // If the groups could not be read, grouping would hide every touchpoint
  // that has one: show the plain list (with a notice) until they load.
  const groupsFailed = Boolean(groups.error) && !groups.data;
  const activeView: View = groupsFailed
    ? "list"
    : (view ?? (groupItems.length ? "groups" : "list"));

  const toPlace = useMemo(
    () => items.filter((item) => needsPlacing(item)).length,
    [items],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        (status === "all" ||
          (status === "place" ? needsPlacing(item) : item.status === status)) &&
        (!needle ||
          item.operationalName.toLowerCase().includes(needle) ||
          item.publicId.toLowerCase().includes(needle)),
    );
  }, [items, query, status]);

  const filteredRetired = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return retiredItems.filter(
      (item) =>
        !needle ||
        item.operationalName.toLowerCase().includes(needle) ||
        item.publicId.toLowerCase().includes(needle),
    );
  }, [retiredItems, query]);

  const isEmpty = !touchpoints.isLoading && !allItems.length;
  // A touchpoint whose group is not loaded (deleted meanwhile) is never
  // hidden: it shows with those without a group.
  const knownGroupIds = new Set(groupItems.map((group) => group.id));
  const ungrouped = filtered.filter(
    (item) => !item.groupId || !knownGroupIds.has(item.groupId),
  );
  // Long lists start with every group collapsed; a search always shows what
  // it found. The customer's own choice is remembered on this device.
  const sectionIds = [
    ...groupItems.map((group) => group.id),
    ...(ungrouped.length ? [UNGROUPED] : []),
  ];
  const autoCollapsed = items.length > COLLAPSE_OVER && groupItems.length > 0;
  const collapsedNow: ReadonlySet<string> =
    collapsedPref ?? (autoCollapsed ? new Set(sectionIds) : new Set());
  const isSearching = Boolean(query.trim()) || status !== "all";
  const isCollapsed = (id: string) => !isSearching && collapsedNow.has(id);
  const allCollapsed = sectionIds.every((id) => collapsedNow.has(id));

  // Groups nest (ADR 021): «Local Centro › Terraza › Mesa 12».
  const groupTree = useMemo(() => buildGroupTree(groupItems), [groupItems]);
  const membersByGroup = useMemo(() => {
    const byGroup = new Map<string, Touchpoint[]>();
    for (const item of filtered) {
      if (!item.groupId) continue;
      const list = byGroup.get(item.groupId) ?? [];
      list.push(item);
      byGroup.set(item.groupId, list);
    }
    return byGroup;
  }, [filtered]);
  const treeMembers = (node: GroupNode): Touchpoint[] => [
    ...(membersByGroup.get(node.group.id) ?? []),
    ...node.children.flatMap(treeMembers),
  ];

  function setCollapsed(next: ReadonlySet<string>) {
    setCollapsedPref(next);
    writeCollapsed(collapseKey, next);
  }

  function toggleSection(id: string) {
    const next = new Set(collapsedNow);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
  }
  // Only what is still on screen counts (a filter may hide part of it).
  const selectedItems = items.filter((item) => selected.has(item.id));
  const selectedGroupIds = new Set(selectedItems.map((item) => item.groupId));
  const sharedGroupId =
    selectedGroupIds.size === 1 ? ([...selectedGroupIds][0] ?? null) : null;
  const selection = selecting
    ? {
        selected,
        toggle: (ids: readonly string[], on: boolean) =>
          setSelected((current) => {
            const next = new Set(current);
            for (const id of ids) {
              if (on) next.add(id);
              else next.delete(id);
            }
            return next;
          }),
      }
    : undefined;

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  async function ungroupSelected() {
    const ids = selectedItems
      .filter((item) => item.groupId)
      .map((item) => item.id);
    if (!ids.length) return;
    setIsUngrouping(true);
    try {
      const result = await groupsApi.move(workspace.id, ids, null);
      await refreshGroups();
      notify(
        result.moved === 1
          ? "1 QR o etiqueta quedó sin grupo. Sigue mostrando lo mismo."
          : `${result.moved} QR y etiquetas quedaron sin grupo. Siguen mostrando lo mismo.`,
      );
      setSelected(new Set());
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsUngrouping(false);
    }
  }

  /** A group with its own touchpoints and, inside, its subgroups. */
  function renderGroupNode(node: GroupNode): ReactNode {
    const { group } = node;
    const members = membersByGroup.get(group.id) ?? [];
    const inTree = treeMembers(node);
    if (isSearching && !inTree.length) return null;
    const active = inTree.filter((item) => item.status === "active").length;
    const total = group.totalTouchpointCount ?? group.touchpointCount;
    const subgroups = node.children.length;
    const collapsed = isCollapsed(group.id);
    const isLocation = groupKind(group) === "location";
    // Without its own design it uses the nearest group above that has one.
    const inherited = group.qrTemplateId
      ? null
      : (groupChain(groupItems, group.id)
          .slice(0, -1)
          .reverse()
          .find((item) => item.qrTemplateId) ?? null);
    return (
      <section
        className={
          collapsed ? "group-section group-section-collapsed" : "group-section"
        }
        key={group.id}
      >
        <header className="group-section-header">
          <span className="row-icon" aria-hidden="true">
            <Icon name={groupIcon(group)} />
          </span>
          <div className="group-section-title">
            <h2>
              <SectionToggle
                collapsed={collapsed}
                controls={`group-rows-${group.id}`}
                disabled={isSearching}
                label={group.name}
                onToggle={() => toggleSection(group.id)}
              />
              {isLocation ? (
                <span className="group-kind-badge">Local</span>
              ) : null}
            </h2>
            <small>
              {total === 1 ? "1 QR o etiqueta" : `${total} QR y etiquetas`}
              {subgroups
                ? ` · ${subgroups === 1 ? "1 subgrupo" : `${subgroups} subgrupos`}`
                : ""}
              {total
                ? ` · ${active} ${active === 1 ? "activo" : "activos"}`
                : ""}
              {group.description ? ` · ${group.description}` : ""}
            </small>
            <p className="group-qr-design">
              <Icon name="qr" size={14} />
              <span>
                Diseño QR:{" "}
                {group.qrTemplateId ? (
                  <Link to={{ name: "qr-design", id: group.qrTemplateId }}>
                    {`«${
                      qrTemplates.data?.find(
                        (item) => item.id === group.qrTemplateId,
                      )?.name ?? "Diseño de la biblioteca"
                    }»`}
                  </Link>
                ) : inherited ? (
                  `«${
                    qrTemplates.data?.find(
                      (item) => item.id === inherited.qrTemplateId,
                    )?.name ?? "Diseño de la biblioteca"
                  }», heredado de «${inherited.name}»`
                ) : (
                  "Kardo por defecto"
                )}
              </span>
              {canManage ? (
                <button
                  className="link-button"
                  onClick={() => setDesignGroup(group)}
                  type="button"
                >
                  Cambiar
                </button>
              ) : null}
            </p>
          </div>
          <div className="row-actions">
            {selection && inTree.length ? (
              <SelectAll
                ids={inTree.map((item) => item.id)}
                label={`Marcar todo «${group.name}»`}
                selection={selection}
              />
            ) : null}
            {!selection && canEdit && total ? (
              <Link
                className="button button-secondary button-small"
                ariaLabel={
                  subgroups
                    ? `Publicar en ${group.name} y sus subgrupos`
                    : undefined
                }
                to={{
                  name: "experience-new",
                  touchpointId: null,
                  groupId: group.id,
                }}
              >
                <Icon name="experience" size={16} /> Publicar en el{" "}
                {isLocation ? "local" : "grupo"}
              </Link>
            ) : null}
            {canManage && !selection && node.depth < GROUP_MAX_DEPTH ? (
              <button
                aria-label={`Nuevo subgrupo en ${group.name}`}
                className="icon-button"
                onClick={() => {
                  setNewGroupParent(group.id);
                  setEditingGroup("new");
                }}
                title="Nuevo subgrupo"
                type="button"
              >
                <Icon name="plus" />
              </button>
            ) : null}
            {canManage && !selection ? (
              <button
                aria-label={`Editar grupo ${group.name}`}
                className="icon-button"
                onClick={() => setEditingGroup(group)}
                title="Editar grupo"
                type="button"
              >
                <Icon name="edit" />
              </button>
            ) : null}
          </div>
        </header>
        {collapsed ? null : (
          <div id={`group-rows-${group.id}`}>
            {members.length ? (
              <TouchpointRows
                groups={groupItems}
                items={members}
                selection={selection}
              />
            ) : !subgroups ? (
              <p className="muted group-empty">
                {isLocation ? "Este local" : "Este grupo"} aún no tiene QR ni
                etiquetas.
                {canManage ? " Edítalo para agregar algunos." : ""}
              </p>
            ) : null}
            {subgroups ? (
              <div className="group-children">
                {node.children.map((child) => renderGroupNode(child))}
              </div>
            ) : null}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="page">
      <PageHeader
        actions={
          canManage && !isEmpty ? (
            <>
              <button
                className="button button-secondary"
                onClick={() => {
                  setNewGroupParent(null);
                  setEditingGroup("new");
                }}
                type="button"
              >
                <Icon name="group" /> Nuevo grupo
              </button>
              <button
                className="button button-primary"
                onClick={() => setIsCreating(true)}
                type="button"
              >
                <Icon name="plus" /> Nuevo QR o etiqueta
              </button>
            </>
          ) : null
        }
        description="Lo que tus clientes escanean o tocan: tu QR, una etiqueta NFC o una tarjeta. Si cambias lo que muestra, el QR sigue igual."
        help="touchpoints"
        title="QR y etiquetas"
      />

      {canManage && isEmpty && !touchpoints.error ? (
        <TouchpointsOnboarding onCreate={() => setIsCreating(true)} />
      ) : null}

      {groupsFailed && !touchpoints.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void groups.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          No pudimos cargar los grupos, así que te mostramos todos los QR y
          etiquetas en una lista. {groups.error}
        </Notice>
      ) : null}

      {touchpoints.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void touchpoints.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {touchpoints.error}
        </Notice>
      ) : null}

      {touchpoints.isLoading && !items.length ? (
        <Skeleton lines={4} />
      ) : items.length ? (
        <section className="panel" aria-label="QR y etiquetas registrados">
          <div className="toolbar">
            <label className="search-field">
              <span className="visually-hidden">Buscar QR y etiquetas</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o ID"
                type="search"
                value={query}
              />
            </label>
            <fieldset className="segmented">
              <legend className="visually-hidden">Filtrar por estado</legend>
              {(
                [
                  ["all", "Todos"],
                  ["active", "Activos"],
                  ["assigned", "Sin publicar"],
                  ["paused", "Pausados"],
                  ["place", `Por colocar${toPlace ? ` ${toPlace}` : ""}`],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-pressed={status === value}
                  className={
                    status === value ? "segment segment-current" : "segment"
                  }
                  key={value}
                  onClick={() => setStatus(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <fieldset className="segmented">
              <legend className="visually-hidden">Vista</legend>
              {(
                [
                  ["groups", "Por grupo"],
                  ["list", "Lista"],
                ] as const
              ).map(([value, label]) => (
                <button
                  aria-pressed={activeView === value}
                  disabled={groupsFailed && value === "groups"}
                  className={
                    activeView === value ? "segment segment-current" : "segment"
                  }
                  key={value}
                  onClick={() => setView(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <button
              aria-label="Actualizar estado"
              className="icon-button"
              disabled={touchpoints.isLoading}
              onClick={() => void touchpoints.reload()}
              title="Actualizar estado"
              type="button"
            >
              <Icon name="refresh" />
            </button>
            {canManage ? (
              <button
                aria-pressed={selecting}
                className={
                  selecting
                    ? "button button-primary button-small"
                    : "button button-secondary button-small"
                }
                onClick={() =>
                  selecting ? stopSelecting() : setSelecting(true)
                }
                type="button"
              >
                <Icon name="move-to" size={16} />{" "}
                {selecting ? "Listo" : "Ordenar"}
              </button>
            ) : null}
          </div>
          {selecting ? (
            <p className="tp-select-hint">
              Marca los QR y etiquetas que quieres mover. Puedes marcar un grupo
              completo desde su encabezado.
            </p>
          ) : null}

          {activeView === "list" ? (
            filtered.length ? (
              <TouchpointRows
                groups={groupItems}
                items={filtered}
                selection={selection}
                showGroup
              />
            ) : (
              <p className="muted">
                Ningún QR o etiqueta coincide con el filtro.
              </p>
            )
          ) : (
            <div className="group-sections">
              {groupItems.length && !isSearching ? (
                <div className="group-sections-tools">
                  <button
                    className="link-button"
                    onClick={() =>
                      setCollapsed(
                        allCollapsed ? new Set() : new Set(sectionIds),
                      )
                    }
                    type="button"
                  >
                    <Icon
                      name={allCollapsed ? "chevrons-up-down" : "minus"}
                      size={14}
                    />{" "}
                    {allCollapsed ? "Expandir todos" : "Contraer todos"}
                  </button>
                </div>
              ) : null}
              {groupTree.map((node) => renderGroupNode(node))}
              {ungrouped.length ? (
                <section
                  className={
                    isCollapsed(UNGROUPED)
                      ? "group-section group-section-collapsed"
                      : "group-section"
                  }
                >
                  <header className="group-section-header">
                    <span
                      className="row-icon row-icon-quiet"
                      aria-hidden="true"
                    >
                      <Icon name="touchpoint" />
                    </span>
                    <div className="group-section-title">
                      <h2>
                        <SectionToggle
                          collapsed={isCollapsed(UNGROUPED)}
                          controls="group-rows-ungrouped"
                          disabled={isSearching}
                          label="Sin grupo"
                          onToggle={() => toggleSection(UNGROUPED)}
                        />
                      </h2>
                      <small>
                        {ungrouped.length === 1
                          ? "1 QR o etiqueta"
                          : `${ungrouped.length} QR y etiquetas`}
                      </small>
                    </div>
                    {selection ? (
                      <div className="row-actions">
                        <SelectAll
                          ids={ungrouped.map((item) => item.id)}
                          label="Marcar todos los sin grupo"
                          selection={selection}
                        />
                      </div>
                    ) : null}
                  </header>
                  {isCollapsed(UNGROUPED) ? null : (
                    <div id="group-rows-ungrouped">
                      <TouchpointRows
                        groups={groupItems}
                        items={ungrouped}
                        selection={selection}
                      />
                    </div>
                  )}
                </section>
              ) : null}
              {!groupItems.length && canManage ? (
                <div className="group-hint">
                  <Icon name="info" size={16} />
                  <span>
                    Crea grupos como «Local Centro» o «Mesas terraza» para
                    publicar una página en varios QR y etiquetas a la vez.
                  </span>
                  <button
                    className="text-action"
                    onClick={() => {
                      setNewGroupParent(null);
                      setEditingGroup("new");
                    }}
                    type="button"
                  >
                    Crear grupo
                  </button>
                </div>
              ) : null}
            </div>
          )}
          {selecting ? (
            <section
              aria-label="Acciones para los seleccionados"
              className="tp-bulk-bar"
            >
              <span className="tp-bulk-count">
                {selectedItems.length === 1
                  ? "1 seleccionado"
                  : `${selectedItems.length} seleccionados`}
              </span>
              <button
                className="link-button"
                onClick={() =>
                  selection?.toggle(
                    filtered.map((item) => item.id),
                    selectedItems.length < filtered.length,
                  )
                }
                type="button"
              >
                {selectedItems.length < filtered.length
                  ? `Marcar los ${filtered.length}`
                  : "Desmarcar todo"}
              </button>
              <span className="tp-bulk-actions">
                <button
                  className="button button-secondary button-small"
                  disabled={
                    isUngrouping || !selectedItems.some((item) => item.groupId)
                  }
                  onClick={() => void ungroupSelected()}
                  type="button"
                >
                  {isUngrouping ? "Quitando…" : "Quitar del grupo"}
                </button>
                <button
                  className="button button-primary button-small"
                  disabled={!selectedItems.length}
                  onClick={() => setIsMoving(true)}
                  type="button"
                >
                  <Icon name="group" size={16} /> Mover a grupo
                </button>
              </span>
            </section>
          ) : null}
        </section>
      ) : !canManage && !touchpoints.isLoading ? (
        <EmptyState icon="touchpoint" title="Aún no hay QR ni etiquetas">
          Cuando alguien del equipo cree uno, aparecerá aquí.
        </EmptyState>
      ) : null}

      {retiredItems.length ? (
        <details className="panel retired-section">
          <summary>
            Retirados ({filteredRetired.length}/{retiredItems.length})
          </summary>
          <p className="muted">
            Su QR y NFC ya no activan nada: se retiraron de forma permanente y
            no se pueden reactivar.
          </p>
          {filteredRetired.length ? (
            <TouchpointRows
              groups={groupItems}
              items={filteredRetired}
              showGroup
            />
          ) : (
            <p className="muted">
              Ningún QR o etiqueta retirado coincide con la búsqueda.
            </p>
          )}
        </details>
      ) : null}

      <NewTouchpointDialog
        onClose={() => {
          setIsCreating(false);
          if (activating) navigate({ name: "touchpoints" }, { replace: true });
        }}
        onLeavePiece={() => {
          if (activating) navigate({ name: "touchpoints" }, { replace: true });
        }}
        onPiece={() => {
          if (!activating) navigate({ name: "activate-piece" });
        }}
        open={isCreating || (activating && canActivate)}
        piece={activating}
        pieceCode={activationCode}
      />
      <GroupDesignDialog
        group={designGroup}
        onChanged={() => void qrTemplates.reload()}
        onClose={() => setDesignGroup(null)}
      />
      <GroupDialog
        defaultParentId={editingGroup === "new" ? newGroupParent : null}
        group={editingGroup === "new" ? null : editingGroup}
        onClose={() => setEditingGroup(null)}
        open={editingGroup !== null}
      />
      <MoveToGroupDialog
        currentGroupId={sharedGroupId}
        onClose={() => setIsMoving(false)}
        onMoved={(message) => {
          notify(message);
          setSelected(new Set());
        }}
        open={isMoving}
        touchpointIds={selectedItems.map((item) => item.id)}
      />
    </div>
  );
}

/** A group's name that also collapses or expands its touchpoints. */
function SectionToggle({
  label,
  collapsed,
  controls,
  disabled,
  onToggle,
}: {
  label: string;
  collapsed: boolean;
  controls: string;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-controls={collapsed ? undefined : controls}
      aria-expanded={!collapsed}
      className="group-toggle"
      disabled={disabled}
      onClick={onToggle}
      title={
        collapsed ? "Mostrar sus QR y etiquetas" : "Ocultar sus QR y etiquetas"
      }
      type="button"
    >
      <Icon className="group-toggle-chevron" name="chevron-down" size={16} />
      <span>{label}</span>
    </button>
  );
}

type Selection = {
  selected: ReadonlySet<string>;
  toggle: (ids: readonly string[], on: boolean) => void;
};

function SelectAll({
  ids,
  label,
  selection,
}: {
  ids: readonly string[];
  label: string;
  selection: Selection;
}) {
  const marked = ids.filter((id) => selection.selected.has(id)).length;
  return (
    <label className="tp-select-all">
      <input
        aria-label={label}
        checked={marked === ids.length}
        onChange={(event) => selection.toggle(ids, event.target.checked)}
        ref={(input) => {
          if (input) input.indeterminate = marked > 0 && marked < ids.length;
        }}
        type="checkbox"
      />
      <span aria-hidden="true">Todos</span>
    </label>
  );
}

function TouchpointRows({
  items,
  groups,
  showGroup,
  selection,
}: {
  items: readonly Touchpoint[];
  groups: readonly TouchpointGroup[];
  showGroup?: boolean;
  /** "Ordenar" mode: rows become checkboxes instead of links. */
  selection?: Selection | undefined;
}) {
  return (
    <ul className="row-list">
      {items.map((touchpoint) => {
        const view = touchpointBadge(touchpoint);
        const objectView = objectStateView(touchpoint);
        const kind = effectiveKind(touchpoint.kind);
        const pieceModel = pieceModelOf(touchpoint);
        const groupName = touchpoint.groupId
          ? groupPathLabel(groups, touchpoint.groupId)
          : null;
        const content = (
          <>
            <span
              className={`row-icon row-icon-kind-${kind}`}
              aria-hidden="true"
            >
              {pieceModel ? (
                <PieceThumb model={pieceModel} size={30} />
              ) : (
                <Icon name={touchpointKindIcons[kind]} />
              )}
            </span>
            <span className="row-main">
              <strong>{touchpoint.operationalName}</strong>
              <small>
                {pieceModel
                  ? pieceKindLabel(pieceModel)
                  : touchpointKindLabels[kind]}{" "}
                · {showGroup && groupName ? `${groupName} · ` : ""}
                <code>{touchpoint.publicId.slice(0, 10)}…</code>
                {touchpoint.createdAt
                  ? ` · ${formatDate(touchpoint.createdAt)}`
                  : ""}
              </small>
            </span>
            {/* Without opening each one (relevo 37, B2): Iván's two tables
                showed nothing and he only learned it days later. */}
            <span
              className={
                touchpoint.live ? "row-meta" : "row-meta row-meta-empty"
              }
            >
              {touchpoint.live
                ? `${experienceTypeLabels[touchpoint.live.experienceType as keyof typeof experienceTypeLabels] ?? "Página"}: ${touchpoint.live.experienceName}`
                : "Sin página publicada"}
            </span>
            <span className="row-status-group tp-row-states">
              <span className={`tp-state ${toneClass[view.tone]}`}>
                {view.label}
              </span>
              {touchpoint.status !== "retired" ? (
                <span className={`tp-state tp-state-${objectView.tone}`}>
                  {objectView.label}
                </span>
              ) : null}
            </span>
          </>
        );
        if (selection) {
          const checked = selection.selected.has(touchpoint.id);
          return (
            <li key={touchpoint.id}>
              <label
                className={
                  checked
                    ? "row-link row-selectable row-selected"
                    : "row-link row-selectable"
                }
              >
                <input
                  checked={checked}
                  className="row-check"
                  onChange={(event) =>
                    selection.toggle([touchpoint.id], event.target.checked)
                  }
                  type="checkbox"
                />
                {content}
              </label>
            </li>
          );
        }
        return (
          <li key={touchpoint.id}>
            <Link
              className="row-link"
              to={{ name: "touchpoint", id: touchpoint.id }}
            >
              {content}
              <Icon className="row-chevron" name="arrow-right" size={16} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** First visit: what a touchpoint is and the three steps, with one button. */
export function TouchpointsOnboarding({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      className="panel tp-onboarding"
      aria-labelledby="tp-onboarding-title"
    >
      <div className="tp-onboarding-intro">
        <span aria-hidden="true" className="tp-onboarding-icon">
          <Icon name="touchpoint" size={24} />
        </span>
        <h2 id="tp-onboarding-title">Crea tu primer QR o etiqueta</h2>
        <p>
          Un QR o etiqueta es el objeto que tus clientes tocan o escanean: una
          mesa con QR, una tarjeta NFC, un volante. Su URL nunca cambia, así que
          lo imprimes una vez y cambias lo que muestra cuando quieras.
        </p>
      </div>
      <ol className="tp-onboarding-steps">
        <li>
          <strong>Elige el objeto</strong>
          <span>QR, NFC u otro soporte.</span>
        </li>
        <li>
          <strong>Ponle nombre</strong>
          <span>Uno, o varios a la vez: Mesa 1 a Mesa 20.</span>
        </li>
        <li>
          <strong>Publica una página</strong>
          <span>Menú, catálogo, enlaces o formulario.</span>
        </li>
      </ol>
      <button
        className="button button-primary"
        onClick={onCreate}
        type="button"
      >
        <Icon name="plus" /> Crear QR o etiqueta
      </button>
    </section>
  );
}
