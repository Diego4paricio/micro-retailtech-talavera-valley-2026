import type {
  AddStatusUpdate,
  CreateStatusIncident,
  StaffServiceStatus,
  StaffStatusIncident,
  StaffStatusIncidentList,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export const statusApi = {
  current: (signal?: AbortSignal) =>
    apiRequest<StaffServiceStatus>("/v1/staff/status", { signal }),
  check: () =>
    apiRequest<StaffServiceStatus>("/v1/staff/status/check", {
      method: "POST",
    }),
  incidents: (signal?: AbortSignal) =>
    apiRequest<StaffStatusIncidentList>("/v1/staff/status/incidents", {
      signal,
    }),
  createIncident: (body: CreateStatusIncident) =>
    apiRequest<StaffStatusIncident>("/v1/staff/status/incidents", {
      method: "POST",
      body,
    }),
  addUpdate: (incidentId: string, body: AddStatusUpdate) =>
    apiRequest<StaffStatusIncident>(
      `/v1/staff/status/incidents/${incidentId}/updates`,
      { method: "POST", body },
    ),
  sync: () =>
    apiRequest<{ incidents: number }>("/v1/staff/status/sync", {
      method: "POST",
    }),
};
