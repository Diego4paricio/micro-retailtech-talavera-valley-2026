import type { WorkspaceAccess } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { handleAccessDemo, handleExportDemo } from "../lib/demo/billing.js";
import { isDemoMode } from "../lib/demo.js";

const later = <T>(value: () => T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value()), 120));

/**
 * Access state of an organization (ADR 020) and the data export that stays
 * available even when the plan lapsed.
 */
export const accessApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    isDemoMode
      ? later(() => handleAccessDemo())
      : apiRequest<WorkspaceAccess>(`/v1/workspaces/${workspaceId}/access`, {
          signal,
        }),
  /** JSON file with Touchpoints, Experiences, groups and leads (Owner, Admin). */
  exportData: (workspaceId: string): Promise<Blob> =>
    isDemoMode
      ? later(() => handleExportDemo(workspaceId))
      : apiRequest<Blob>(`/v1/workspaces/${workspaceId}/export`, {
          responseType: "blob",
        }),
};
