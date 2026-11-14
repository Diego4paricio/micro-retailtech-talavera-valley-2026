import { type StaffPermission, staffPermissions } from "@kardo/contracts";

/** True when the staff session's permission list includes `permission`. */
export function hasPermission(
  permissions: readonly string[],
  permission: StaffPermission,
): boolean {
  return permissions.includes(permission);
}

export type NavPermissionItem<T> = T & { permission?: StaffPermission };

/**
 * Filters a list of nav items / actions down to the ones the session's
 * permissions allow. Items without a `permission` are always kept.
 */
export function filterByPermission<T>(
  items: readonly NavPermissionItem<T>[],
  permissions: readonly string[],
): NavPermissionItem<T>[] {
  return items.filter(
    (item) => !item.permission || hasPermission(permissions, item.permission),
  );
}

export type { StaffPermission };
export { staffPermissions };

/**
 * Short, human labels for each permission, grouped by area. The Staff API
 * session response carries a flat permission list (no role names), so the
 * top bar derives a coarse "roles" summary from it for display purposes only.
 */
const areaLabels: Record<StaffPermission, string> = {
  [staffPermissions.diagnosticsRead]: "Diagnóstico",
  [staffPermissions.metricsRead]: "Métricas",
  [staffPermissions.customersRead]: "Clientes",
  [staffPermissions.touchpointsRead]: "Touchpoints",
  [staffPermissions.touchpointsWrite]: "Touchpoints (gestión)",
  [staffPermissions.touchpointsSuspend]: "Suspensiones",
  [staffPermissions.publicationsRetry]: "Publicaciones",
  [staffPermissions.auditRead]: "Auditoría",
  [staffPermissions.plansRead]: "Planes",
  [staffPermissions.plansWrite]: "Planes (gestión)",
  [staffPermissions.billingRead]: "Suscripciones",
  [staffPermissions.billingWrite]: "Suscripciones (gestión)",
  [staffPermissions.billingRefund]: "Reembolsos",
  [staffPermissions.staffManage]: "Equipo Kardo",
  // One chip per section: the top bar already lists many areas.
  [staffPermissions.notificationsRead]: "Notificaciones",
  [staffPermissions.notificationsSend]: "Notificaciones",
  [staffPermissions.notificationsBroadcast]: "Notificaciones",
  [staffPermissions.statusRead]: "Estado",
  [staffPermissions.statusWrite]: "Estado",
  [staffPermissions.piecesRead]: "Piezas: ver",
  [staffPermissions.piecesWrite]: "Piezas: crear lotes",
};

/** Unique, ordered display labels for the permissions a session carries. */
export function permissionAreas(permissions: readonly string[]): string[] {
  const known = Object.values(staffPermissions);
  const labels: string[] = [];
  for (const permission of known) {
    if (
      permissions.includes(permission) &&
      !labels.includes(areaLabels[permission])
    )
      labels.push(areaLabels[permission]);
  }
  return labels;
}
