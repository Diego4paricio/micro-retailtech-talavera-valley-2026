import { staffMembersApi } from "../../api/staff.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDate } from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";

const statusTones = {
  active: "success",
  invited: "info",
  suspended: "warning",
  revoked: "danger",
} as const;

const statusLabels: Record<string, string> = {
  active: "Activo",
  invited: "Invitado",
  suspended: "Suspendido",
  revoked: "Revocado",
};

export function StaffPage() {
  const { can } = useStaff();
  const canView = can(staffPermissions.staffManage);
  const members = useResource(canView ? "staff-members" : null, (signal) =>
    staffMembersApi.list(signal),
  );

  if (!canView) {
    return (
      <div className="page">
        <PageHeader eyebrow="Kardo Operations" title="Equipo Kardo" />
        <Notice tone="warning" title="Sin acceso">
          Tu rol no incluye permiso para ver el equipo de Kardo.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        description="Vista de solo lectura. Cambiar roles requerirá un flujo de step-up (próximamente)."
        eyebrow="Kardo Operations"
        title="Equipo Kardo"
      />

      <Notice tone="info">
        Los cambios de rol de staff no están disponibles todavía en este panel:
        requerirán una verificación adicional (step-up) antes de lanzarse.
      </Notice>

      {members.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void members.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {members.error}
        </Notice>
      ) : members.isLoading && !members.data ? (
        <Skeleton lines={6} />
      ) : members.data && members.data.length === 0 ? (
        <EmptyState icon="staff" title="Sin personal registrado" />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Estado</th>
                <th scope="col">Roles</th>
                <th scope="col">Desde</th>
              </tr>
            </thead>
            <tbody>
              {(members.data ?? []).map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName ?? "—"}</td>
                  <td>{member.email ?? "—"}</td>
                  <td>
                    <StatusBadge tone={statusTones[member.status]}>
                      {statusLabels[member.status] ?? member.status}
                    </StatusBadge>
                  </td>
                  <td>{member.roles.join(", ")}</td>
                  <td>{formatDate(member.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
