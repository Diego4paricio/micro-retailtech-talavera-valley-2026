import type { Touchpoint } from "@kardo/contracts";
import { type ReactNode, useMemo } from "react";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { flattenGroupTree, groupPathLabel } from "../../group-tree.js";
import { effectiveKind, isPhysicalTouchpoint } from "../../kind.js";

export type TouchpointSection = {
  id: string | null;
  name: string;
  items: Touchpoint[];
};

/** The backup QR of an NFC prints too (relevo 38, model A). */
export function isBackupQr(touchpoint: Touchpoint): boolean {
  return effectiveKind(touchpoint.kind) === "nfc";
}

/**
 * Every live code with a printable design, by group: each QR, and the
 * backup QR of each NFC (it lives in the NFC; not another touchpoint).
 */
export function useQrTouchpoints(): {
  items: Touchpoint[];
  sections: TouchpointSection[];
} {
  const { touchpoints, groups } = useWorkspace();
  return useMemo(() => {
    const items = (touchpoints.data ?? []).filter(
      (item) =>
        isPhysicalTouchpoint(item) &&
        (effectiveKind(item.kind) === "qr" || isBackupQr(item)) &&
        item.status !== "retired",
    );
    const byGroup = new Map<string | null, Touchpoint[]>();
    for (const item of items) {
      const key = item.groupId ?? null;
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    // Tree order, each with its path («Local Centro › Terraza»).
    const all = groups.data ?? [];
    const named = flattenGroupTree(all)
      .filter(({ group }) => byGroup.has(group.id))
      .map(({ group }) => ({
        id: group.id,
        name: groupPathLabel(all, group.id),
        items: byGroup.get(group.id) ?? [],
      }));
    const loose = byGroup.get(null);
    return {
      items,
      sections: loose?.length
        ? [...named, { id: null, name: "Sin grupo", items: loose }]
        : named,
    };
  }, [touchpoints.data, groups.data]);
}

/**
 * QR Touchpoints grouped by group, each with a checkbox; a group checkbox
 * selects all of its Touchpoints (indeterminate when only some are).
 */
export function TouchpointChecklist({
  legend,
  sections,
  selected,
  onToggle,
  disabled,
  describe,
  empty,
}: {
  legend: string;
  sections: readonly TouchpointSection[];
  selected: ReadonlySet<string>;
  onToggle: (ids: readonly string[], checked: boolean) => void;
  disabled?: boolean | undefined;
  /** Secondary text per Touchpoint (e.g. its current design). */
  describe?: ((touchpoint: Touchpoint) => ReactNode) | undefined;
  empty?: ReactNode | undefined;
}) {
  const total = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const count = sections.reduce(
    (sum, section) =>
      sum + section.items.filter((item) => selected.has(item.id)).length,
    0,
  );
  return (
    <fieldset className="qrs-batch-list" disabled={disabled}>
      <legend>
        {legend}{" "}
        <span className="optional-label">
          ({count} de {total})
        </span>
      </legend>
      {sections.length ? (
        sections.map((section) => {
          const ids = section.items.map((item) => item.id);
          const all = ids.every((id) => selected.has(id));
          const some = !all && ids.some((id) => selected.has(id));
          return (
            <div className="qrs-batch-group" key={section.id ?? "loose"}>
              <label className="qrs-batch-row qrs-batch-group-row">
                <input
                  checked={all}
                  onChange={(event) => onToggle(ids, event.target.checked)}
                  ref={(input) => {
                    if (input) input.indeterminate = some;
                  }}
                  type="checkbox"
                />
                <span>
                  <strong>{section.name}</strong>
                  <small>{section.items.length} QR</small>
                </span>
              </label>
              <ul>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <label className="qrs-batch-row">
                      <input
                        checked={selected.has(item.id)}
                        onChange={(event) =>
                          onToggle([item.id], event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span className="qrs-batch-name">
                        <span>{item.operationalName}</span>
                        {isBackupQr(item) ? (
                          <small>QR de respaldo</small>
                        ) : null}
                        {describe ? <small>{describe(item)}</small> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      ) : (
        <p className="qrs-hint">
          {empty ?? "No hay QR activos en este espacio."}
        </p>
      )}
    </fieldset>
  );
}

/** Adds or removes ids from a selection set (immutable). */
export function toggleIds(
  current: ReadonlySet<string>,
  ids: readonly string[],
  checked: boolean,
): Set<string> {
  const next = new Set(current);
  for (const id of ids) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}
