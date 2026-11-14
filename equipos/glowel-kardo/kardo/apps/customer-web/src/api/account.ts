import {
  ACCOUNT_DELETION_PHRASE,
  type AccountDeleted,
  type AccountDeletionCheck,
  type AccountExport,
  type AccountSessionList,
  type AccountSignInList,
  type ClosedSessions,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

/** Tu cuenta → Seguridad (ADR 023): sessions and sign-in history. */
export const accountApi = {
  sessions: (signal?: AbortSignal) =>
    apiRequest<AccountSessionList>("/v1/me/sessions", { signal }),
  closeSession: (sessionId: string) =>
    apiRequest<ClosedSessions>(
      `/v1/me/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
    ),
  closeOtherSessions: () =>
    apiRequest<ClosedSessions>("/v1/me/sessions/close-others", {
      method: "POST",
    }),
  signIns: (signal?: AbortSignal) =>
    apiRequest<AccountSignInList>("/v1/me/sign-ins", { signal }),
  exportData: () => apiRequest<AccountExport>("/v1/me/export"),
  deletionCheck: (signal?: AbortSignal) =>
    apiRequest<AccountDeletionCheck>("/v1/me/deletion", { signal }),
  deleteAccount: () =>
    apiRequest<AccountDeleted>("/v1/me", {
      method: "DELETE",
      body: { confirm: ACCOUNT_DELETION_PHRASE },
    }),
};
