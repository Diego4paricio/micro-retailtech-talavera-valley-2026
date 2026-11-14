import type { CustomerRole } from "@kardo/contracts";
import { customerRoleText } from "@kardo/domain";

/** Role names, from the one text in `@kardo/domain` (moved from
 * `lib/format.ts`, domain audit A2-72). */
export const roleLabels: Record<CustomerRole, string> = {
  owner: customerRoleText.owner.label,
  admin: customerRoleText.admin.label,
  editor: customerRoleText.editor.label,
  viewer: customerRoleText.viewer.label,
};
