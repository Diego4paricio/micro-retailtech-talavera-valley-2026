import type { StaffDiagnostics, StaffSession } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export const sessionApi = {
  current: (signal?: AbortSignal) =>
    apiRequest<StaffSession>("/v1/staff/session", { signal }),
  diagnostics: (signal?: AbortSignal) =>
    apiRequest<StaffDiagnostics>("/v1/staff/diagnostics", { signal }),
};
