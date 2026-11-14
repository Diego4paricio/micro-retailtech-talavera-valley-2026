import type { NotificationInbox } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

/** The bell (ADR 022): per person, not per workspace. */
export const notificationsApi = {
  inbox: (
    query: { limit?: number; cursor?: string | null; unread?: boolean },
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams();
    if (query.limit) params.set("limit", String(query.limit));
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.unread) params.set("unread", "true");
    const search = params.toString();
    return apiRequest<NotificationInbox>(
      `/v1/notifications${search ? `?${search}` : ""}`,
      { signal },
    );
  },
  markRead: (notificationId: string) =>
    apiRequest<void>(`/v1/notifications/${notificationId}/read`, {
      method: "POST",
    }),
  markAllRead: () =>
    apiRequest<void>("/v1/notifications/read-all", { method: "POST" }),
  markOpened: () =>
    apiRequest<void>("/v1/notifications/opened", { method: "POST" }),
};
