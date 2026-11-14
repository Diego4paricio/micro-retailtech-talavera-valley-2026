import type { StaffAuditPage } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { buildQuery } from "../lib/pagination.js";

export type AuditActorType = "customer" | "staff" | "service";

export type AuditQuery = {
  workspaceId?: string;
  actorType?: AuditActorType;
  action?: string;
  cursor?: string | null;
  limit?: number;
};

export const auditApi = {
  list: (params: AuditQuery, signal?: AbortSignal) =>
    apiRequest<StaffAuditPage>(`/v1/staff/audit${buildQuery(params)}`, {
      signal,
    }),
};
