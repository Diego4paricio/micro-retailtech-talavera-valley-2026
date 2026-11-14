import type {
  LeadDeliverySettings,
  LeadDeliverySettingsResult,
  UpdateLeadDeliverySettings,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/lead-delivery`;

export const leadDeliveryApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<LeadDeliverySettings>(base(workspaceId), { signal }),
  update: (workspaceId: string, body: UpdateLeadDeliverySettings) =>
    apiRequest<LeadDeliverySettingsResult>(base(workspaceId), {
      method: "PUT",
      body,
    }),
  /** Only rotates the signing secret; nothing else of the settings changes.
   * The new secret comes back once, in `webhookSecret`. */
  rotateWebhookSecret: (workspaceId: string) =>
    apiRequest<LeadDeliverySettingsResult>(
      `${base(workspaceId)}/webhook-secret`,
      { method: "POST", body: {} },
    ),
  /** Sends a signed sample event to the configured webhook. */
  test: (workspaceId: string) =>
    apiRequest<{ delivered: boolean; status: number | null }>(
      `${base(workspaceId)}/test`,
      {
        method: "POST",
      },
    ),
};
