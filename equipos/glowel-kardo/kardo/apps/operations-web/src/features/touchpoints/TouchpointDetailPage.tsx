import { useState } from "react";
import { touchpointsApi } from "../../api/touchpoints.js";
import { CopyField } from "../../components/CopyField.js";
import { ConfirmDialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { StatusCard } from "../../components/StatusCard.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import {
  formatDateTime,
  formatNumber,
  publicationStatusView,
  touchpointStatusView,
} from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { SuspendDialog } from "./SuspendDialog.js";

export function TouchpointDetailPage({
  touchpointId,
}: {
  touchpointId: string;
}) {
  const { can } = useStaff();
  const { notify } = useToast();
  const detail = useResource(`touchpoint:${touchpointId}`, (signal) =>
    touchpointsApi.detail(touchpointId, signal),
  );
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="page">
        <Skeleton lines={8} />
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <div className="page">
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void detail.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {detail.error ?? "No pudimos cargar este Touchpoint."}
        </Notice>
      </div>
    );
  }

  const { touchpoint, urls, suspension, publications, taps30Days } =
    detail.data;
  const status = touchpointStatusView(touchpoint.status);
  const canSuspend = can(staffPermissions.touchpointsSuspend);

  async function suspend(reason: string) {
    setIsBusy(true);
    try {
      const next = await touchpointsApi.suspend(touchpointId, { reason });
      detail.setData(next);
      notify("Touchpoint suspendido.");
      setSuspendOpen(false);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsBusy(false);
    }
  }

  async function liftSuspension() {
    setIsBusy(true);
    try {
      const next = await touchpointsApi.liftSuspension(touchpointId);
      detail.setData(next);
      notify("Suspensión levantada.");
      setLiftOpen(false);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        back={
          <Link
            ariaLabel="Volver a touchpoints"
            className="text-action"
            to={{ name: "touchpoints" }}
          >
            <Icon name="arrow-left" size={16} /> Touchpoints
          </Link>
        }
        description={
          touchpoint.workspaceId ? (
            <>
              Cliente:{" "}
              <Link to={{ name: "customer", id: touchpoint.workspaceId }}>
                {touchpoint.workspaceName ?? "—"}
              </Link>
            </>
          ) : (
            "Sin cliente asociado."
          )
        }
        eyebrow={`ID público ${touchpoint.publicId}`}
        title={touchpoint.operationalName ?? touchpoint.publicId}
      />

      <section
        aria-label="Estado del touchpoint"
        className="status-grid status-grid-4"
      >
        <StatusCard
          label="Estado"
          value={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        />
        <StatusCard
          label="Suspendido"
          value={touchpoint.suspended ? "Sí" : "No"}
        />
        <StatusCard
          label="Experience en vivo"
          value={touchpoint.liveExperienceName ?? "—"}
        />
        <StatusCard
          label="Taps · 30 días"
          value={taps30Days === null ? "—" : formatNumber(taps30Days)}
        />
      </section>

      <section aria-labelledby="urls-heading" className="panel">
        <SectionHeading id="urls-heading" title="Enlaces públicos" />
        <div className="form-grid">
          <CopyField icon="link" label="Enlace directo" value={urls.link} />
          <CopyField icon="nfc" label="NFC" value={urls.nfc} />
          <CopyField icon="qr" label="QR" value={urls.qr} />
        </div>
      </section>

      <section aria-labelledby="suspension-heading" className="panel">
        <SectionHeading id="suspension-heading" title="Suspensión" />
        {suspension ? (
          <>
            <Notice tone="warning" title="Este Touchpoint está suspendido">
              {suspension.reason}
              <br />
              Desde {formatDateTime(suspension.suspendedAt)}
              {suspension.suspendedByEmail
                ? ` · ${suspension.suspendedByEmail}`
                : ""}
            </Notice>
            {canSuspend ? (
              <button
                className="button button-primary"
                onClick={() => setLiftOpen(true)}
                type="button"
              >
                Levantar suspensión
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p className="muted">Este Touchpoint no está suspendido.</p>
            {canSuspend ? (
              <button
                className="button button-danger"
                onClick={() => setSuspendOpen(true)}
                type="button"
              >
                <Icon name="ban" size={16} /> Suspender
              </button>
            ) : null}
          </>
        )}
      </section>

      <section
        aria-labelledby="touchpoint-publications-heading"
        className="panel"
      >
        <SectionHeading
          id="touchpoint-publications-heading"
          title="Publicaciones"
        />
        {publications.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Experience</th>
                  <th className="numeric" scope="col">
                    Revisión
                  </th>
                  <th scope="col">Estado</th>
                  <th className="numeric" scope="col">
                    Intentos
                  </th>
                  <th scope="col">Error</th>
                  <th scope="col">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((publication) => {
                  const view = publicationStatusView(publication.status);
                  return (
                    <tr key={publication.id}>
                      <td>{publication.experienceName}</td>
                      <td className="numeric">{publication.versionRevision}</td>
                      <td>
                        <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                      </td>
                      <td className="numeric">
                        {formatNumber(publication.attempts)}
                      </td>
                      <td>{publication.lastError ?? "—"}</td>
                      <td>
                        {formatDateTime(
                          publication.publishedAt ?? publication.createdAt,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Sin publicaciones registradas.</p>
        )}
      </section>

      <SuspendDialog
        isBusy={isBusy}
        onClose={() => setSuspendOpen(false)}
        onConfirm={(reason) => void suspend(reason)}
        open={suspendOpen}
      />
      <ConfirmDialog
        confirmLabel="Levantar suspensión"
        description="El Touchpoint volverá a servir su Experience en vivo de inmediato."
        isBusy={isBusy}
        onClose={() => setLiftOpen(false)}
        onConfirm={() => void liftSuspension()}
        open={liftOpen}
        title="Levantar suspensión"
      />
    </div>
  );
}
