import type {
  PlanSelection,
  SavedPlanSelection,
  SavePlanSelection,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

/** Downgrade option B (ADR 023): what stays active within the plan. */
export const planSelectionApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<PlanSelection>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/plan-selection`,
      { signal },
    ),
  save: (workspaceId: string, body: SavePlanSelection) =>
    apiRequest<SavedPlanSelection>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/plan-selection`,
      { method: "PUT", body },
    ),
};
