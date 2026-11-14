import type {
  ExperienceTargets,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import { useId, useMemo, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import {
  buildGroupTree,
  type GroupNode,
  groupIcon,
  groupKind,
  treeIds,
} from "../touchpoints/group-tree.js";
import { touchpointStatusView } from "../touchpoints/labels.js";
import { resolveTargetTouchpoints } from "./targets.js";

// The pure target rules live in targets.ts; they are re-exported here for
// the screens that already import them from the picker.
export {
  describeTargets,
  emptyTargets,
  experienceTargetsOf,
  experienceTargetsTouchpoint,
  groupLiveExperienceName,
  resolveTargetTouchpoints,
  sameTargets,
} from "./targets.js";

export function TargetPicker({
  value,
  onChange,
  touchpoints,
  groups,
  readOnly,
  error,
  legend = "Dónde se publica",
  currentExperienceId,
}: {
  value: ExperienceTargets;
  onChange: (value: ExperienceTargets) => void;
  touchpoints: readonly Touchpoint[];
  groups: readonly TouchpointGroup[];
  readOnly?: boolean | undefined;
  error?: string | undefined;
  /** Visible legend; the surrounding view may already title the picker. */
  legend?: string | undefined;
  /**
   * When given, a Touchpoint already live with a different Experience shows
   * a clear (not gray) warning instead of the neutral "Ahora muestra" hint
   * (PublishDialog, relevo 37 B2): replacing it is chosen on purpose.
   */
  currentExperienceId?: string | null | undefined;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const resolved = resolveTargetTouchpoints(value, touchpoints, groups);
  const needle = query.trim().toLowerCase();

  const sections = useMemo(() => {
    const byGroup = new Map<string | null, Touchpoint[]>();
    const links: Touchpoint[] = [];
    // Retired Touchpoints are permanently withdrawn. Links are Touchpoints
    // too (owner, 2026-10-04) and get their own list: they never belong to
    // a group.
    for (const touchpoint of touchpoints) {
      if (touchpoint.status === "retired") continue;
      if (touchpoint.kind === "link") {
        links.push(touchpoint);
        continue;
      }
      const key = touchpoint.groupId ?? null;
      const list = byGroup.get(key) ?? [];
      list.push(touchpoint);
      byGroup.set(key, list);
    }
    const ungrouped = byGroup.get(null) ?? [];
    // Groups nest (ADR 021): choosing a group includes its whole tree.
    return { tree: buildGroupTree(groups), byGroup, ungrouped, links };
  }, [groups, touchpoints]);

  const itemsOf = (groupId: string) => sections.byGroup.get(groupId) ?? [];
  const treeItems = (node: GroupNode): Touchpoint[] => [
    ...itemsOf(node.group.id),
    ...node.children.flatMap(treeItems),
  ];

  const matches = (touchpoint: Touchpoint) =>
    !needle || touchpoint.operationalName.toLowerCase().includes(needle);

  function toggleGroup(groupId: string, checked: boolean) {
    // Explicit picks inside a now-selected group (its Touchpoints and its
    // subgroups, at any level) are redundant.
    const tree = treeIds(groups, groupId);
    const groupIds = checked
      ? [...value.groupIds.filter((item) => !tree.has(item)), groupId]
      : value.groupIds.filter((item) => item !== groupId);
    const touchpointIds = checked
      ? value.touchpointIds.filter(
          (item) =>
            !touchpoints.some(
              (touchpoint) =>
                touchpoint.id === item &&
                touchpoint.groupId !== null &&
                tree.has(touchpoint.groupId ?? ""),
            ),
        )
      : value.touchpointIds;
    onChange({ touchpointIds, groupIds });
  }

  function toggleTouchpoint(touchpointId: string, checked: boolean) {
    onChange({
      groupIds: value.groupIds,
      touchpointIds: checked
        ? [...value.touchpointIds, touchpointId]
        : value.touchpointIds.filter((item) => item !== touchpointId),
    });
  }

  const renderTouchpoint = (
    touchpoint: Touchpoint,
    coveredByGroup: boolean,
  ) => {
    const checked =
      coveredByGroup || value.touchpointIds.includes(touchpoint.id);
    const status = touchpointStatusView(touchpoint.status);
    const replacesOther =
      currentExperienceId !== undefined &&
      !coveredByGroup &&
      Boolean(touchpoint.live) &&
      touchpoint.live?.experienceId !== currentExperienceId;
    return (
      <li key={touchpoint.id}>
        <label
          className={checked ? "target-row target-row-checked" : "target-row"}
        >
          <input
            checked={checked}
            disabled={readOnly || coveredByGroup}
            onChange={(event) =>
              toggleTouchpoint(touchpoint.id, event.target.checked)
            }
            type="checkbox"
          />
          <span className="target-row-main">
            <strong>{touchpoint.operationalName}</strong>
            <small className={replacesOther ? "target-row-warn" : undefined}>
              {coveredByGroup
                ? "Incluido por su grupo"
                : touchpoint.live
                  ? replacesOther
                    ? `Reemplaza: ${touchpoint.live.experienceName}`
                    : `Ahora muestra: ${touchpoint.live.experienceName}`
                  : "Sin página publicada"}
            </small>
          </span>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </label>
      </li>
    );
  };

  /** A group, its Touchpoints and its subgroups; `coveredBy` names the
   * selected group above it, if any (that one already includes it). */
  function renderGroup(node: GroupNode, coveredBy: string | null) {
    const { group } = node;
    const isGroupSelected = value.groupIds.includes(group.id);
    const covered = coveredBy !== null;
    const all = treeItems(node);
    const visible = itemsOf(group.id).filter(matches);
    if (needle && !all.some(matches)) return null;
    const subgroups = node.children.length;
    return (
      <section
        className={
          node.depth > 1 ? "target-group target-subgroup" : "target-group"
        }
        key={group.id}
      >
        <label
          className={
            isGroupSelected || covered
              ? "target-group-header target-row-checked"
              : "target-group-header"
          }
        >
          <input
            checked={isGroupSelected || covered}
            disabled={readOnly || covered || !all.length}
            onChange={(event) => toggleGroup(group.id, event.target.checked)}
            type="checkbox"
          />
          <Icon name={groupIcon(group)} size={16} />
          <span className="target-row-main">
            <strong>{group.name}</strong>
            <small>
              {covered
                ? `Incluido por «${coveredBy}»`
                : `${groupKind(group) === "location" ? "Todo el local" : "Todo el grupo"}${subgroups ? " y sus subgrupos" : ""} · ${
                    all.length === 1
                      ? "1 QR o etiqueta"
                      : `${all.length} QR o etiquetas`
                  }`}
            </small>
          </span>
        </label>
        {visible.length ? (
          <ul className="target-list">
            {visible.map((item) =>
              renderTouchpoint(item, isGroupSelected || covered),
            )}
          </ul>
        ) : null}
        {node.children.map((child) =>
          renderGroup(
            child,
            coveredBy ?? (isGroupSelected ? group.name : null),
          ),
        )}
      </section>
    );
  }

  return (
    <fieldset
      aria-describedby={`${id}-summary`}
      className={
        error ? "target-picker target-picker-invalid" : "target-picker"
      }
    >
      <legend>{legend}</legend>
      <p className="target-summary" id={`${id}-summary`}>
        <Icon name="touchpoint" size={16} />
        {resolved.length === 0
          ? "Elige grupos completos o QR y etiquetas concretos."
          : resolved.length === 1
            ? "Se publicará en 1 QR o etiqueta."
            : `Se publicará en ${resolved.length} QR o etiquetas.`}
      </p>
      {error ? <p className="field-error">{error}</p> : null}
      {touchpoints.length > 10 ? (
        <label className="search-field target-search">
          <span className="visually-hidden">Buscar QR y etiquetas</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar QR o etiqueta"
            type="search"
            value={query}
          />
        </label>
      ) : null}

      {sections.tree.map((node) => renderGroup(node, null))}

      {sections.ungrouped.filter(matches).length ? (
        <section className="target-group">
          {sections.tree.length ? (
            <p className="target-group-title">Sin grupo</p>
          ) : null}
          <ul className="target-list">
            {sections.ungrouped
              .filter(matches)
              .map((item) => renderTouchpoint(item, false))}
          </ul>
        </section>
      ) : null}

      {sections.links.filter(matches).length ? (
        <section className="target-group">
          <p className="target-group-title">
            Links para compartir en WhatsApp, Instagram o tu bio
          </p>
          <ul className="target-list">
            {sections.links
              .filter(matches)
              .map((item) => renderTouchpoint(item, false))}
          </ul>
        </section>
      ) : null}
    </fieldset>
  );
}
