import type {
  StaffSuspendTouchpoint,
  StaffTouchpointDetail,
  StaffTouchpointPage,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { buildQuery } from "../lib/pagination.js";

export type TouchpointStatus =
  | "prepared"
  | "available"
  | "assigned"
  | "active"
  | "paused"
  | "lost"
  | "replaced"
  | "retired";

export type TouchpointQuery = {
  query?: string;
  status?: TouchpointStatus;
  suspended?: boolean;
  cursor?: string | null;
  limit?: number;
};

export const touchpointsApi = {
  list: (params: TouchpointQuery, signal?: AbortSignal) =>
    apiRequest<StaffTouchpointPage>(
      `/v1/staff/touchpoints${buildQuery(params)}`,
      { signal },
    ),
  detail: (touchpointId: string, signal?: AbortSignal) =>
    apiRequest<StaffTouchpointDetail>(`/v1/staff/touchpoints/${touchpointId}`, {
      signal,
    }),
  suspend: (touchpointId: string, body: StaffSuspendTouchpoint) =>
    apiRequest<StaffTouchpointDetail>(
      `/v1/staff/touchpoints/${touchpointId}/suspension`,
      { method: "POST", body },
    ),
  liftSuspension: (touchpointId: string) =>
    apiRequest<StaffTouchpointDetail>(
      `/v1/staff/touchpoints/${touchpointId}/suspension`,
      { method: "DELETE" },
    ),
};
