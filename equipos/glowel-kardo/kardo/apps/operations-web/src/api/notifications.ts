import type {
  CreateStaffNotification,
  NotificationAudience,
  NotificationAudienceEstimate,
  StaffNotification,
  StaffNotificationPage,
  StaffNotificationState,
  StaffProfileLookup,
  UpdateStaffNotification,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { buildQuery } from "../lib/pagination.js";

export type NotificationListQuery = {
  state?: StaffNotificationState;
  cursor?: string | null;
  limit?: number;
};

export const notificationsApi = {
  list: (params: NotificationListQuery, signal?: AbortSignal) =>
    apiRequest<StaffNotificationPage>(
      `/v1/staff/notifications${buildQuery(params)}`,
      { signal },
    ),
  get: (id: string, signal?: AbortSignal) =>
    apiRequest<StaffNotification>(`/v1/staff/notifications/${id}`, { signal }),
  create: (body: CreateStaffNotification) =>
    apiRequest<StaffNotification>("/v1/staff/notifications", {
      method: "POST",
      body,
    }),
  update: (id: string, body: UpdateStaffNotification) =>
    apiRequest<StaffNotification>(`/v1/staff/notifications/${id}`, {
      method: "PATCH",
      body,
    }),
  retire: (id: string) =>
    apiRequest<StaffNotification>(`/v1/staff/notifications/${id}/retire`, {
      method: "POST",
    }),
  estimate: (audience: NotificationAudience, signal?: AbortSignal) =>
    apiRequest<NotificationAudienceEstimate>(
      "/v1/staff/notifications/estimate",
      { method: "POST", body: audience, signal },
    ),
  lookupProfiles: (email: string, signal?: AbortSignal) =>
    apiRequest<StaffProfileLookup>(
      `/v1/staff/notification-recipients${buildQuery({ email })}`,
      { signal },
    ),
};
