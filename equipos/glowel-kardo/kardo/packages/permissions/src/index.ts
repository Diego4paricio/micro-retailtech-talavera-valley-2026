export const staffStatuses = [
  "invited",
  "active",
  "suspended",
  "revoked",
] as const;
export type StaffStatus = (typeof staffStatuses)[number];

export type StaffAuthorizationContext = {
  subject: string;
  status: StaffStatus;
  aal: "aal1" | "aal2";
  permissions: readonly string[];
};

/** Built only from a verified JWT and server-controlled kardo_staff data. */
export function canStaff(
  context: StaffAuthorizationContext,
  permission: string,
): boolean {
  return (
    context.status === "active" &&
    context.aal === "aal2" &&
    context.permissions.includes(permission)
  );
}
