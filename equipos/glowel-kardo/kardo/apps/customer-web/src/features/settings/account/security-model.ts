import type { CustomerWorkspace } from "@kardo/contracts";

/**
 * True when the person is Owner or Admin in ANY of their organizations
 * (domain audit 2026-10-13, A2-65): the 2FA recommendation is about how
 * much she can do across her whole account, not only the open one.
 */
export function leadsAnyOrganization(
  workspaces: readonly Pick<CustomerWorkspace, "role">[],
): boolean {
  return workspaces.some(
    (item) => item.role === "owner" || item.role === "admin",
  );
}
