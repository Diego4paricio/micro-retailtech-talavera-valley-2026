import type { PlanSelection } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { planSelectionApi } from "../../api/plan-selection.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import {
  SettingsGroup,
  SettingsRow,
  StatusText,
} from "../../components/SettingsBlocks.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatNumber } from "../../lib/format.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { pricingUrl } from "./access-model.js";
import {
  initialKeep,
  keepIdsToSave,
  keptCount,
  mostVisitedId,
  organizationCandidates,
  organizationDetail,
  overWords,
  PLAN_SELECTION_SAVED_EVENT,
  selectionHeadline,
  selectionStateOf,
  toggleOrganization,
  visibleItems,
} from "./plan-overage-model.js";

const formatLabels: Record<string, string> = {
  qr: "QR",
  nfc: "NFC",
  other: "Otro",
  link: "Link",
};

/**
 * Configuración → Plan y facturación: what stays active within the plan
 * (ADR 023, option B). Shows only while something is over the plan or out
 * of it; Owners and Admins choose in a dialog.
 */
export function PlanSelectionGroup({
  onSaved,
  holder = true,
}: {
  /** Refreshes the rest of the page (usage bars) after saving. */
  onSaved?: () => void;
  /** Only the person whose plan it is chooses (ADR 024). */
  holder?: boolean;
} = {}) {
  const { workspace, can, touchpoints } = useWorkspace();
  const selection = useResource(`plan-selection:${workspace.id}`, (signal) =>
    planSelectionApi.get(workspace.id, signal),
  );
  const [choosing, setChoosing] = useState(false);
  const state = selectionStateOf(selection.data);
  if (!selection.data || state.kind === "none") return null;
  const canChoose = can("workspace.manage") && holder;
  return (
    <SettingsGroup
      actions={
        canChoose ? (
          <button
            className="button button-primary button-small"
            onClick={() => setChoosing(true)}
            type="button"
          >
            Elegir cuáles siguen activos
          </button>
        ) : null
      }
      description={selectionHeadline(state)}
      id="billing-plan-selection"
      title="Qué sigue activo"
    >
      <SettingsRow
        description="Lo que incluye tu plan."
        label="Límites"
        value={[
          ...(selection.data.limits.organizations !== null
            ? [
                `${formatNumber(selection.data.limits.organizations)} ${selection.data.limits.organizations === 1 ? "organización" : "organizaciones"}`,
              ]
            : []),
          selection.data.limits.touchpoints !== null
            ? `${formatNumber(selection.data.limits.touchpoints)} Touchpoints`
            : "Touchpoints sin límite",
          selection.data.limits.links !== null
            ? `${formatNumber(selection.data.limits.links)} Links`
            : "Links sin límite",
        ].join(" · ")}
      />
      <SettingsRow
        description="Muestran una página neutral, no reciben visitas ni formularios y vuelven al instante si subes de plan o liberas espacio."
        label="Fuera del plan"
        value={
          state.kind === "out" ? (
            <StatusText tone="warning">{overWords(state.out)}</StatusText>
          ) : (
            <span className="muted">Nada todavía</span>
          )
        }
      />
      {canChoose ? null : (
        <SettingsRow
          label={
            holder
              ? "Solo el Owner o un Admin puede elegir."
              : "Solo el Owner del plan puede elegir."
          }
        />
      )}
      <PlanSelectionDialog
        onClose={() => setChoosing(false)}
        onSaved={() => {
          void selection.reload();
          // «Fuera del plan» shows on the Touchpoints, the usage bars stop
          // counting what was left out and the banner goes away right away.
          void touchpoints.reload();
          onSaved?.();
          window.dispatchEvent(new Event(PLAN_SELECTION_SAVED_EVENT));
        }}
        open={choosing}
        selection={selection.data}
      />
    </SettingsGroup>
  );
}

function PlanSelectionDialog({
  open,
  selection,
  onClose,
  onSaved,
}: {
  open: boolean;
  selection: PlanSelection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const [keep, setKeep] = useState<Set<string>>(() => initialKeep(selection));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setKeep(initialKeep(selection));
      setError(null);
    }
  }, [open, selection]);

  const organizations = organizationCandidates(selection);
  const organizationLimit = selection.limits.organizations;
  const best = mostVisitedId(organizations);
  const keptOrganizations = keptCount(selection, keep, "organization");
  const groups = (["touchpoint", "link"] as const)
    .map((kind) => ({
      kind,
      limit:
        kind === "link" ? selection.limits.links : selection.limits.touchpoints,
      items: visibleItems(selection, keep, kind),
    }))
    .filter((group) => group.items.length > 0);
  const overLimit =
    (organizations.length > 0 &&
      (keptOrganizations === 0 ||
        (organizationLimit !== null &&
          keptOrganizations > organizationLimit))) ||
    groups.some(
      (group) =>
        group.limit !== null &&
        keptCount(selection, keep, group.kind) > group.limit,
    );

  function toggle(id: string) {
    setKeep((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const result = await planSelectionApi.save(workspace.id, {
        keep: keepIdsToSave(selection, keep),
      });
      notify(
        result.excluded + result.included === 0
          ? "No hubo cambios."
          : "Guardamos qué sigue activo.",
      );
      onSaved();
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  const single = organizationLimit === 1;
  return (
    <Dialog
      description="Las demás se pausan: sus páginas dicen “No disponible por ahora”. Nada se borra."
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={isSaving || overLimit}
            onClick={() => void save()}
            type="button"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title="Elige qué sigue"
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {organizations.length > 0 ? (
        <fieldset className="plan-selection-kind">
          <legend>
            Organizaciones
            <span
              className={
                organizationLimit !== null &&
                keptOrganizations > organizationLimit
                  ? "plan-selection-count plan-selection-count-over"
                  : "plan-selection-count"
              }
            >
              {organizationLimit === null
                ? `${keptOrganizations} activas`
                : `${keptOrganizations} de ${organizationLimit}`}
            </span>
          </legend>
          <ul className="plan-selection-list">
            {organizations.map((item) => (
              <li key={item.id}>
                <label className="plan-selection-item">
                  <input
                    checked={keep.has(item.id)}
                    name={single ? "plan-selection-organization" : undefined}
                    onChange={() =>
                      setKeep((current) =>
                        toggleOrganization(selection, current, item.id),
                      )
                    }
                    type={single ? "radio" : "checkbox"}
                  />
                  <span className="plan-selection-name">
                    <strong>{item.name || item.publicId}</strong>
                    <small>{organizationDetail(item)}</small>
                  </span>
                  {best === item.id ? (
                    <span className="plan-selection-best">La más visitada</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      {groups.map((group) => {
        const count = keptCount(selection, keep, group.kind);
        const label = group.kind === "link" ? "Links" : "QR y etiquetas";
        return (
          <fieldset className="plan-selection-kind" key={group.kind}>
            <legend>
              {label}
              <span
                className={
                  group.limit !== null && count > group.limit
                    ? "plan-selection-count plan-selection-count-over"
                    : "plan-selection-count"
                }
              >
                {group.limit === null
                  ? `${count} activos`
                  : `${count} de ${group.limit}`}
              </span>
            </legend>
            <ul className="plan-selection-list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <label className="plan-selection-item">
                    <input
                      checked={keep.has(item.id)}
                      onChange={() => toggle(item.id)}
                      type="checkbox"
                    />
                    <span className="plan-selection-name">
                      <strong>{item.name || item.publicId}</strong>
                      <small>
                        {formatLabels[item.format] ?? item.format}
                        {item.visits !== null
                          ? ` · ${formatNumber(item.visits)} ${item.visits === 1 ? "visita" : "visitas"} en 30 días`
                          : ""}
                      </small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      {organizations.length > 0 ? (
        <p className="plan-selection-upgrade">
          <a className="text-action" href={pricingUrl(workspace.id)}>
            Mejor subir de plan
          </a>
        </p>
      ) : null}
    </Dialog>
  );
}
