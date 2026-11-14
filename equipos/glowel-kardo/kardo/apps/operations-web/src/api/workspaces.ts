import type {
  StaffAssignPlan,
  StaffWorkspaceDetail,
  StaffWorkspacePage,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { buildQuery } from "../lib/pagination.js";

export type WorkspaceKind = "personal" | "organization";

export type WorkspaceQuery = {
  query?: string;
  kind?: WorkspaceKind;
  cursor?: string | null;
  limit?: number;
};

export const workspacesApi = {
  list: (params: WorkspaceQuery, signal?: AbortSignal) =>
    apiRequest<StaffWorkspacePage>(
      `/v1/staff/workspaces${buildQuery(params)}`,
      { signal },
    ),
  detail: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<StaffWorkspaceDetail>(`/v1/staff/workspaces/${workspaceId}`, {
      signal,
    }),
  assignPlan: (workspaceId: string, body: StaffAssignPlan) =>
    apiRequest<StaffWorkspaceDetail>(
      `/v1/staff/workspaces/${workspaceId}/plan`,
      { method: "PUT", body },
    ),
};
