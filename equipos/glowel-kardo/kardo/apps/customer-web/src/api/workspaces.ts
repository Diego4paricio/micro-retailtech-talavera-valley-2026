import type {
  AcceptLegalTerms,
  CompleteCustomerOnboarding,
  CreateOrganization,
  CustomerProfile,
  CustomerWorkspace,
  UpdateCustomerProfile,
  UpdateWorkspace,
} from "@kardo/contracts";
import { ApiRequestError, apiRequest } from "../lib/api.js";

/** Waits before the 2nd and 3rd attempt to list the workspaces. */
const listRetries = [1_500, 4_000];

/**
 * The list every screen needs first (sign up, the panel). A passing failure
 * (a busy database pool, a timeout, a redeploy) gets two more tries before
 * the error screen; a refused session or a client error does not.
 */
async function listWithRetry(
  signal?: AbortSignal,
): Promise<CustomerWorkspace[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await apiRequest<CustomerWorkspace[]>("/v1/workspaces", {
        signal,
      });
    } catch (error) {
      const passing =
        !(error instanceof ApiRequestError) ||
        error.status === 0 ||
        error.status >= 500;
      if (signal?.aborted || !passing || attempt >= listRetries.length)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, listRetries[attempt]));
      if (signal?.aborted) throw error;
    }
  }
}

export const workspacesApi = {
  list: listWithRetry,
  completeOnboarding: (workspaceId: string, body: CompleteCustomerOnboarding) =>
    apiRequest<CustomerWorkspace>(`/v1/workspaces/${workspaceId}/onboarding`, {
      method: "PATCH",
      body,
    }),
  update: (workspaceId: string, body: UpdateWorkspace) =>
    apiRequest<CustomerWorkspace>(`/v1/workspaces/${workspaceId}`, {
      method: "PATCH",
      body,
    }),
  createOrganization: (body: CreateOrganization) =>
    apiRequest<CustomerWorkspace>("/v1/organizations", {
      method: "POST",
      body,
    }),
};

export const profileApi = {
  get: (signal?: AbortSignal) =>
    apiRequest<CustomerProfile>("/v1/me/profile", { signal }),
  update: (body: UpdateCustomerProfile) =>
    apiRequest<CustomerProfile>("/v1/me/profile", { method: "PATCH", body }),
  acceptTerms: (body: AcceptLegalTerms) =>
    apiRequest<CustomerProfile>("/v1/me/terms-acceptance", {
      method: "POST",
      body,
    }),
};
