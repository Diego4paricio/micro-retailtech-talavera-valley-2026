import type { WorkspaceProfile, WorkspaceProfilePatch } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export const workspaceProfileApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<WorkspaceProfile>(`/v1/workspaces/${workspaceId}/profile`, {
      signal,
    }),
  /**
   * Changes only the fields sent; the rest stays as stored (`null`
   * removes one). Every screen saves through this, never the whole record
   * it loaded (domain audit A2-1). Use `saveWorkspaceProfile` from
   * `features/business-profile` so every open screen sees the result.
   */
  patch: (workspaceId: string, patch: WorkspaceProfilePatch) =>
    apiRequest<WorkspaceProfile>(`/v1/workspaces/${workspaceId}/profile`, {
      method: "PATCH",
      body: patch,
    }),
};
