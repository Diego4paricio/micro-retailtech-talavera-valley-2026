import { useState } from "react";
import { billingApi } from "../../api/billing.js";
import { workspacesApi } from "../../api/workspaces.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { StatusCard } from "../../components/StatusCard.js";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  roleLabels,
  touchpointStatusView,
  workspaceKindLabels,
} from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { AuditEventList } from "../audit/AuditEventList.js";
import { AccessSection, InternalTag } from "../billing/AccessSection.js";
import { PlanDialog } from "./PlanDialog.js";

export function CustomerDetailPage({ workspaceId }: { workspaceId: string }) {
  const { can } = useStaff();
  const detail = useResource(`customer:${workspaceId}`, (signal) =>
    workspacesApi.detail(workspaceId, signal),
  );
  const canReadBilling = can(staffPermissions.billingRead);
  // Access state lives with billing; it needs `billing.read`.
  const billing = useResource(
    canReadBilling ? `customer-billing:${workspaceId}` : null,
    (signal) => billingApi.workspace(workspaceId, signal),
  );
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

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
          {detail.error ?? "No pudimos cargar este cliente."}
        </Notice>
      </div>
    );
  }

  const {
    workspace,
    members,
    touchpoints,
    experiences,
    plan,
    leads,
    taps30Days,
    recentAudit,
  } = detail.data;

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            {can(staffPermissions.billingRead) ? (
              <Link
                className="button button-secondary"
                to={{ name: "billing-workspace", id: workspace.id }}
              >
                Ver facturación
              </Link>
            ) : null}
            {can(staffPermissions.plansWrite) ? (
              <button
                className="button button-primary"
                onClick={() => setPlanDialogOpen(true)}
                type="button"
              >
                Cambiar plan
              </button>
            ) : null}
          </>
        }
        back={
          <Link
            ariaLabel="Volver a clientes"
            className="text-action"
            to={{ name: "customers" }}
          >
            <Icon name="arrow-left" size={16} /> Clientes
          </Link>
        }
        description={`${workspaceKindLabels[workspace.kind] ?? workspace.kind} · ID público ${workspace.publicId} · Plan ${plan?.name ?? "sin asignar"} · Creado ${formatDate(workspace.createdAt)}`}
        eyebrow="Cliente"
        title={
          billing.data?.access.internal ? (
            <>
              {workspace.name} <InternalTag billing={billing.data} />
            </>
          ) : (
            workspace.name
          )
        }
      />

      {canReadBilling && billing.data ? (
        <AccessSection
          billing={billing.data}
          canWrite={can(staffPermissions.billingWrite)}
          onUpdated={(next) => billing.setData(next)}
        />
      ) : canReadBilling && billing.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void billing.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {billing.error}
        </Notice>
      ) : null}

      <section
        aria-label="Indicadores del cliente"
        className="status-grid status-grid-6"
      >
        <StatusCard label="Miembros" value={formatNumber(workspace.members)} />
        <StatusCard
          label="Touchpoints"
          value={formatNumber(workspace.touchpoints)}
        />
        <StatusCard
          label="Experiences"
          value={formatNumber(workspace.experiences)}
        />
        <StatusCard
          detail={`${formatNumber(leads.last30Days)} en 30 días`}
          label="Leads totales"
          value={formatNumber(leads.total)}
        />
        <StatusCard
          label="Taps · 30 días"
          value={taps30Days === null ? "—" : formatNumber(taps30Days)}
        />
        <StatusCard
          label="Suspendidos"
          value={formatNumber(workspace.suspendedTouchpoints)}
        />
      </section>

      <section aria-labelledby="members-heading" className="panel">
        <SectionHeading id="members-heading" title="Miembros" />
        {members.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Desde</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.profileId}>
                    <td>{member.displayName ?? "—"}</td>
                    <td>{member.email ?? "—"}</td>
                    <td>{roleLabels[member.role]}</td>
                    <td>{formatDate(member.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Sin miembros registrados.</p>
        )}
      </section>

      <section aria-labelledby="customer-touchpoints-heading" className="panel">
        <SectionHeading id="customer-touchpoints-heading" title="Touchpoints" />
        {touchpoints.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Touchpoint</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Experience en vivo</th>
                  <th scope="col">Creado</th>
                </tr>
              </thead>
              <tbody>
                {touchpoints.map((touchpoint) => {
                  const status = touchpointStatusView(touchpoint.status);
                  return (
                    <tr key={touchpoint.id}>
                      <td>
                        <Link to={{ name: "touchpoint", id: touchpoint.id }}>
                          <strong>
                            {touchpoint.operationalName ?? touchpoint.publicId}
                          </strong>
                        </Link>
                        <div className="row-meta">{touchpoint.publicId}</div>
                      </td>
                      <td>
                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                        {touchpoint.suspended ? (
                          <>
                            {" "}
                            <StatusBadge tone="danger">Suspendido</StatusBadge>
                          </>
                        ) : null}
                      </td>
                      <td>{touchpoint.liveExperienceName ?? "—"}</td>
                      <td>{formatDate(touchpoint.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Sin Touchpoints registrados.</p>
        )}
      </section>

      <section aria-labelledby="customer-experiences-heading" className="panel">
        <SectionHeading id="customer-experiences-heading" title="Experiences" />
        {experiences.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Tipo</th>
                  <th className="numeric" scope="col">
                    En vivo en
                  </th>
                  <th className="numeric" scope="col">
                    Versiones
                  </th>
                  <th scope="col">Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {experiences.map((experience) => (
                  <tr key={experience.id}>
                    <td>{experience.name}</td>
                    <td>{experience.type}</td>
                    <td className="numeric">
                      {formatNumber(experience.liveTouchpoints)}
                    </td>
                    <td className="numeric">
                      {formatNumber(experience.versions)}
                    </td>
                    <td>{formatDateTime(experience.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Sin Experiences registradas.</p>
        )}
      </section>

      <section aria-labelledby="customer-audit-heading" className="panel">
        <SectionHeading
          id="customer-audit-heading"
          title="Auditoría reciente"
        />
        <AuditEventList
          emptyLabel="Sin eventos de auditoría para este cliente."
          events={recentAudit}
        />
      </section>

      {can(staffPermissions.plansWrite) ? (
        <PlanDialog
          onClose={() => setPlanDialogOpen(false)}
          onUpdated={(next) => {
            detail.setData(next);
            // A manual plan changes the access state (courtesy, ADR 020).
            if (canReadBilling) void billing.reload();
          }}
          open={planDialogOpen}
          workspace={workspace}
        />
      ) : null}
    </div>
  );
}
