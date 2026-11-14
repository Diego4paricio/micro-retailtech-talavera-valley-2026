import type { LeadRetention } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/lead-retention`;

/** Older leads are deleted automatically every day; `days: null` keeps them all. */
export const leadRetentionApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<LeadRetention>(base(workspaceId), { signal }),
  update: (workspaceId: string, body: LeadRetention) =>
    apiRequest<LeadRetention>(base(workspaceId), { method: "PUT", body }),
};
