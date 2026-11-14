import type { DashboardLayout, DashboardLayoutState } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/dashboard`;

/** The signed-in member's own Resumen layout for a workspace. */
export const dashboardApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<DashboardLayoutState>(base(workspaceId), { signal }),
  save: (workspaceId: string, layout: DashboardLayout) =>
    apiRequest<DashboardLayoutState>(base(workspaceId), {
      method: "PUT",
      body: { layout },
    }),
  reset: (workspaceId: string) =>
    apiRequest<void>(base(workspaceId), { method: "DELETE" }),
};
