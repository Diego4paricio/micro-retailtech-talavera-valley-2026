import { useMemo, useState } from "react";
import { qrTemplatesApi } from "../../../../api/qr-designs.js";
import { EmptyState } from "../../../../components/EmptyState.js";
import { Icon } from "../../../../components/Icon.js";
import { SectionHeading } from "../../../../components/PageHeader.js";
import { Skeleton } from "../../../../components/Skeleton.js";
import { useToast } from "../../../../components/Toast.js";
import { formatDayMonth } from "../../../../lib/format.js";
import { Link } from "../../../../lib/router.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { groupPathLabel } from "../../group-tree.js";
import { defaultQrDesign } from "../qr-design.js";
import { BatchExportDialog } from "../studio/BatchExportDialog.js";
import { TemplatePickerDialog, templateErrorMessage } from "./dialogs.js";
import { useFingerprints } from "./fingerprints.js";
import {
  type PrintState,
  printState,
  qrExportFormatLabels,
  qrSourceLabels,
} from "./model.js";
import {
  isBackupQr,
  toggleIds,
  useQrTouchpoints,
} from "./TouchpointChecklist.js";
import type { ResolvedQrs } from "./useResolvedQrs.js";

type Filter = "all" | "changed" | "never";

const printLabels: Record<PrintState, string> = {
  never: "Nunca exportado",
  current: "Impreso con este diseño",
  changed: "El diseño cambió desde la última impresión",
  checking: "Comprobando…",
};

/**
 * "Tus QR": every active QR Touchpoint with the design a new print would use,
 * where that design comes from and whether the last print used it.
 */
export function QrInventory({
  resolved,
  brandAssetId,
}: {
  resolved: ResolvedQrs;
  brandAssetId: string | null | undefined;
}) {
  const { workspace, groups, can } = useWorkspace();
  const { notify } = useToast();
  const { items } = useQrTouchpoints();
  const canEdit = can("touchpoints.manage");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isSheetOpen, setSheetOpen] = useState(false);

  const groupNames = useMemo(
    () =>
      new Map(
        (groups.data ?? []).map((group) => [
          group.id,
          groupPathLabel(groups.data ?? [], group.id),
        ]),
      ),
    [groups.data],
  );
  const entries = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        design: resolved.byTouchpoint.get(item.id)?.design ?? defaultQrDesign,
      })),
    [items, resolved.byTouchpoint],
  );
  const fingerprints = useFingerprints(entries);

  const rows = items.map((item) => {
    const row = resolved.byTouchpoint.get(item.id);
    return {
      touchpoint: item,
      row,
      state: printState(row?.lastExport ?? null, fingerprints.get(item.id)),
    };
  });
  const needle = query.trim().toLowerCase();
  const visible = rows.filter(
    ({ touchpoint, state }) =>
      (filter === "all" || state === filter) &&
      (!needle || touchpoint.operationalName.toLowerCase().includes(needle)),
  );
  const changedCount = rows.filter((entry) => entry.state === "changed").length;
  const neverCount = rows.filter((entry) => entry.state === "never").length;
  const visibleIds = visible.map((entry) => entry.touchpoint.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selected.has(id));

  return (
    <section aria-labelledby="qrl-inventory" className="qrl-section">
      <SectionHeading
        description="Cada QR, y el respaldo de cada NFC, con el diseño que usaría una nueva impresión y si ya lo imprimiste así."
        id="qrl-inventory"
        title="Tus QR"
      />
      {resolved.isLoading ? (
        <Skeleton lines={4} />
      ) : !items.length ? (
        <EmptyState
          action={
            <Link
              className="button button-secondary"
              to={{ name: "touchpoints" }}
            >
              Crear un QR
            </Link>
          }
          compact
          icon="qr"
          title="Aún no tienes QR"
        >
          Crea un QR o un NFC para diseñar e imprimir su código.
        </EmptyState>
      ) : (
        <div className="qrl-inventory">
          <div className="toolbar qrl-inventory-toolbar">
            <label className="search-field">
              <span className="visually-hidden">Buscar QR</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre"
                type="search"
                value={query}
              />
            </label>
            <fieldset className="segmented">
              <legend className="visually-hidden">Filtrar por impresión</legend>
              {(
                [
                  ["all", `Todos (${rows.length})`],
                  ["changed", `Diseño cambiado (${changedCount})`],
                  ["never", `Sin exportar (${neverCount})`],
                ] as const
              ).map(([value, label]) => (
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
                </button>
              ))}
            </fieldset>
          </div>

          <div
            aria-live="polite"
            className="qrl-selection"
            data-active={selected.size > 0 || undefined}
          >
            <span>
              {selected.size
                ? `${selected.size} ${selected.size === 1 ? "seleccionado" : "seleccionados"}`
                : "Selecciona QR para aplicar un diseño o exportar una hoja."}
            </span>
            <span className="qrl-selection-actions">
              {canEdit ? (
                <button
                  className="button button-secondary button-small"
                  disabled={!selected.size}
                  onClick={() => setPickerOpen(true)}
                  type="button"
                >
                  <Icon name="template" size={14} /> Aplicar diseño
                </button>
              ) : null}
              <button
                className="button button-secondary button-small"
                disabled={!selected.size}
                onClick={() => setSheetOpen(true)}
                type="button"
              >
                <Icon name="file-stack" size={14} /> Descargar hoja
              </button>
              {selected.size ? (
                <button
                  className="button button-ghost button-small"
                  onClick={() => setSelected(new Set())}
                  type="button"
                >
                  Quitar selección
                </button>
              ) : null}
            </span>
          </div>

          <table className="qrl-table">
            <caption className="visually-hidden">Tus QR</caption>
            <thead>
              <tr className="qrl-row qrl-row-head">
                <th scope="col">
                  <input
                    aria-label="Seleccionar todos los visibles"
                    checked={allVisibleSelected}
                    onChange={(event) =>
                      setSelected((current) =>
                        toggleIds(current, visibleIds, event.target.checked),
                      )
                    }
                    ref={(input) => {
                      if (input) input.indeterminate = someVisibleSelected;
                    }}
                    type="checkbox"
                  />
                </th>
                <th scope="col">QR</th>
                <th scope="col">Diseño</th>
                <th scope="col">Origen</th>
                <th scope="col">Impresión</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map(({ touchpoint, row, state }) => {
                  const source = row?.source ?? "default";
                  const groupName = touchpoint.groupId
                    ? groupNames.get(touchpoint.groupId)
                    : null;
                  return (
                    <tr
                      className="qrl-row"
                      data-selected={selected.has(touchpoint.id) || undefined}
                      key={touchpoint.id}
                    >
                      <td className="qrl-cell-check">
                        <input
                          aria-label={`Seleccionar ${touchpoint.operationalName}`}
                          checked={selected.has(touchpoint.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              toggleIds(
                                current,
                                [touchpoint.id],
                                event.target.checked,
                              ),
                            )
                          }
                          type="checkbox"
                        />
                      </td>
                      <td className="qrl-cell-main">
                        <Link
                          className="qrl-row-link"
                          to={{ name: "qr-studio", id: touchpoint.id }}
                        >
                          {touchpoint.operationalName}
                        </Link>
                        <small>
                          {isBackupQr(touchpoint) ? "QR de respaldo · " : ""}
                          {groupName ?? "Sin grupo"}
                        </small>
                      </td>
                      <td className="qrl-cell-design">
                        {row?.templateId && row.templateName ? (
                          <Link
                            className="qrl-design-link"
                            to={{ name: "qr-design", id: row.templateId }}
                          >
                            {row.templateName}
                          </Link>
                        ) : source === "custom" ? (
                          "Diseño propio"
                        ) : (
                          "Diseño Kardo"
                        )}
                      </td>
                      <td className="qrl-cell-source">
                        <span className="qrl-source" data-source={source}>
                          {qrSourceLabels[source]}
                        </span>
                      </td>
                      <td className="qrl-cell-print">
                        <span className="qrl-print" data-state={state}>
                          <Icon
                            name={
                              state === "current"
                                ? "circle-check"
                                : state === "changed"
                                  ? "info"
                                  : state === "checking"
                                    ? "loader"
                                    : "printer"
                            }
                            size={14}
                          />
                          {printLabels[state]}
                        </span>
                        {row?.lastExport ? (
                          <small>
                            {`${formatDayMonth(row.lastExport.at)} (${qrExportFormatLabels[row.lastExport.format]})`}
                          </small>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="qrl-empty-row" colSpan={5}>
                    Ningún QR coincide con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {changedCount ? (
            <p className="qrs-hint">
              <Icon name="info" size={13} /> «El diseño cambió» no es un error:
              los QR ya impresos siguen funcionando. Vuelve a imprimir solo si
              quieres que se vean con el diseño nuevo.
            </p>
          ) : null}
        </div>
      )}

      <TemplatePickerDialog
        brandAssetId={brandAssetId}
        confirmLabel={`Aplicar a ${selected.size}`}
        currentId={null}
        description="Los QR elegidos dejan el diseño que tengan (también uno propio) y usan este por referencia. Los QR impresos siguen funcionando."
        onClose={() => setPickerOpen(false)}
        onPick={async (templateId) => {
          if (!templateId) return "Elige un diseño de la biblioteca.";
          try {
            const result = await qrTemplatesApi.apply(
              workspace.id,
              templateId,
              {
                touchpointIds: [...selected],
                groupIds: [],
              },
            );
            await resolved.reload();
            const name = resolved.templates.find(
              (item) => item.id === templateId,
            )?.name;
            notify(
              `«${name ?? "Diseño"}» se aplicó a ${result.touchpoints} QR.`,
            );
            setSelected(new Set());
            setPickerOpen(false);
            return null;
          } catch (error) {
            return templateErrorMessage(error);
          }
        }}
        open={isPickerOpen}
        templates={resolved.templates}
        title="Aplicar un diseño de la biblioteca"
      />
      <BatchExportDialog
        brandAssetId={brandAssetId}
        onClose={() => setSheetOpen(false)}
        onExported={() => void resolved.reload()}
        open={isSheetOpen}
        preselect={{ touchpointIds: [...selected] }}
      />
    </section>
  );
}
