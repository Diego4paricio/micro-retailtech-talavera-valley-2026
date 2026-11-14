import type { StaffWorkspaceBilling } from "@kardo/contracts";
import { useState } from "react";
import { Notice } from "../../components/Notice.js";
import { SectionHeading } from "../../components/PageHeader.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTimeMx } from "../../lib/format.js";
import {
  ExtendKardoTrialDialog,
  InternalDialog,
} from "./BillingActionDialogs.js";
import {
  accessDateRows,
  accessEndsAt,
  accessSourceLabels,
  accessStateView,
  deletionCleanupText,
  deletionReasonLabel,
  deletionSummary,
  hasUnconvertedKardoTrial,
  pausePendingNote,
} from "./format.js";

/** "Interna" tag shown next to an organization's name. */
export function InternalTag({
  billing,
}: {
  billing: Pick<StaffWorkspaceBilling, "access">;
}) {
  if (!billing.access.internal) return null;
  return <StatusBadge tone="info">Interna</StatusBadge>;
}

/** What a deletion removed and kept, and how the outside cleanup stands. */
function DeletionDetails({
  deletion,
}: {
  deletion: NonNullable<StaffWorkspaceBilling["access"]["deletion"]>;
}) {
  const { deleted, kept } = deletionSummary(deletion);
  return (
    <div className="access-internal">
      <strong>Eliminada el {formatDateTimeMx(deletion.deletedAt)}</strong>
      <span>{deletionReasonLabel(deletion.reason)}</span>
      {deleted.length > 0 ? (
        <>
          <span className="row-meta">Borrado</span>
          <ul>
            {deleted.map((line) => (
              <li key={line.label}>
                {line.label}: {line.count}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {kept.length > 0 ? (
        <>
          <span className="row-meta">Conservado por ley</span>
          <ul>
            {kept.map((line) => (
              <li key={line.label}>
                {line.label}: {line.count}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <span>{deletionCleanupText(deletion, formatDateTimeMx)}</span>
      {!deletion.cleanupCompletedAt && deletion.lastCleanupError ? (
        <small className="row-meta">
          Último error: {deletion.lastCleanupError}
        </small>
      ) : null}
    </div>
  );
}

/**
 * "Acceso" section (ADR 020 §4 and §8) for the billing and customer detail
 * pages. The internal switch and the trial extension only render for staff
 * with `billing.write`.
 */
export function AccessSection({
  billing,
  canWrite,
  onUpdated,
}: {
  billing: StaffWorkspaceBilling;
  canWrite: boolean;
  onUpdated: (next: StaffWorkspaceBilling) => void;
}) {
  const [dialog, setDialog] = useState<"internal" | "trial" | null>(null);
  const { access } = billing;
  const state = accessStateView(access.state);
  const rows = accessDateRows(access, accessEndsAt(billing), formatDateTimeMx);
  const isInternal = access.internal !== null;
  // A deleted organization accepts no staff action (the API answers 409).
  const isDeleted = access.state === "deleted";
  const canExtend =
    canWrite && !isDeleted && hasUnconvertedKardoTrial(billing.trial);
  const close = () => setDialog(null);

  return (
    <section aria-labelledby="access-heading" className="panel">
      <SectionHeading
        description="Qué puede hacer hoy la organización y cuándo cambia. Las fechas están en hora de la Ciudad de México."
        id="access-heading"
        title="Acceso"
      />
      <div className="access-head">
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        <span className="muted">
          Origen: {accessSourceLabels[access.source]}
        </span>
      </div>

      {isDeleted ? (
        access.deletion ? (
          <DeletionDetails deletion={access.deletion} />
        ) : (
          <p className="muted">
            {access.deleteAt
              ? `Eliminada el ${formatDateTimeMx(access.deleteAt)}.`
              : "Organización eliminada."}
          </p>
        )
      ) : rows.length > 0 ? (
        <dl className="billing-facts">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.value === pausePendingNote ? (
                  <Notice tone="warning">{row.value}</Notice>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">Sin fechas pendientes.</p>
      )}

      {access.internal ? (
        <div className="access-internal">
          <strong>Cuenta interna (demo)</strong>
          <span>{access.internal.reason}</span>
          <span className="row-meta">
            {access.internal.setByName
              ? `Por ${access.internal.setByName}, `
              : ""}
            {formatDateTimeMx(access.internal.setAt)}
          </span>
        </div>
      ) : null}

      {!isDeleted && (canWrite || canExtend) ? (
        <div className="access-actions">
          {canWrite ? (
            <button
              aria-checked={isInternal}
              className="access-switch"
              onClick={() => setDialog("internal")}
              role="switch"
              type="button"
            >
              <span aria-hidden="true" className="access-switch-track" />
              Cuenta interna (demo)
            </button>
          ) : null}
          {canExtend ? (
            <button
              className="button button-secondary button-small"
              onClick={() => setDialog("trial")}
              type="button"
            >
              Extender prueba de Kardo
            </button>
          ) : null}
        </div>
      ) : null}

      {dialog === "internal" ? (
        <InternalDialog
          enable={!isInternal}
          onClose={close}
          onUpdated={onUpdated}
          workspaceId={billing.workspaceId}
          workspaceName={billing.workspaceName}
        />
      ) : null}
      {dialog === "trial" && billing.trial ? (
        <ExtendKardoTrialDialog
          onClose={close}
          onUpdated={onUpdated}
          trial={billing.trial}
          workspaceId={billing.workspaceId}
        />
      ) : null}
    </section>
  );
}
