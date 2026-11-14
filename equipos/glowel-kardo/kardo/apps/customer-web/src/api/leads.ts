import type { Lead, LeadPage, LeadStatus, UpdateLead } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/leads`;

export const leadsApi = {
  list: (
    workspaceId: string,
    input: {
      touchpointId?: string | undefined;
      status?: LeadStatus | undefined;
      cursor?: string | null | undefined;
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({ limit: "50" });
    if (input.touchpointId) query.set("touchpointId", input.touchpointId);
    if (input.status) query.set("status", input.status);
    if (input.cursor) query.set("cursor", input.cursor);
    return apiRequest<LeadPage>(`${base(workspaceId)}?${query}`, { signal });
  },
  /** The CSV of what the list shows: the same QR/tag and status filters. */
  exportCsv: (
    workspaceId: string,
    filters: {
      touchpointId?: string | undefined;
      status?: LeadStatus | undefined;
    } = {},
  ) => {
    const query = new URLSearchParams();
    if (filters.touchpointId) query.set("touchpointId", filters.touchpointId);
    if (filters.status) query.set("status", filters.status);
    return apiRequest<string>(`${base(workspaceId)}/export?${query}`, {
      responseType: "text",
    });
  },
  updateStatus: (workspaceId: string, leadId: string, body: UpdateLead) =>
    apiRequest<Lead>(`${base(workspaceId)}/${leadId}`, {
      method: "PATCH",
      body,
    }),
  /** Deletes the lead and its personal data. */
  remove: (workspaceId: string, leadId: string) =>
    apiRequest<void>(`${base(workspaceId)}/${leadId}`, { method: "DELETE" }),
};
