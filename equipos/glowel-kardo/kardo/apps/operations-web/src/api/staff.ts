import type { StaffMemberList } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export const staffMembersApi = {
  list: (signal?: AbortSignal) =>
    apiRequest<StaffMemberList>("/v1/staff/staff-members", { signal }),
};
