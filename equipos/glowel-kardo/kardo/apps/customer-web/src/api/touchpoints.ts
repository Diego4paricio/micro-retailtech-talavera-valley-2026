import type {
  CreateTouchpoint,
  CreateTouchpointBatch,
  Touchpoint,
  TouchpointBatchResult,
  TouchpointObjectProbe,
  UpdateTouchpoint,
  UpdateTouchpointObject,
  UpdateTouchpointStatus,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/touchpoints`;

export const touchpointsApi = {
  list: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<Touchpoint[]>(base(workspaceId), { signal }),
  create: (workspaceId: string, body: CreateTouchpoint) =>
    apiRequest<Touchpoint>(base(workspaceId), { method: "POST", body }),
  /** Creates `count` Touchpoints at once, e.g. "Mesa 1" … "Mesa 20". */
  createBatch: (workspaceId: string, body: CreateTouchpointBatch) =>
    apiRequest<TouchpointBatchResult>(`${base(workspaceId)}/batch`, {
      method: "POST",
      body,
    }),
  update: (workspaceId: string, touchpointId: string, body: UpdateTouchpoint) =>
    apiRequest<Touchpoint>(`${base(workspaceId)}/${touchpointId}`, {
      method: "PATCH",
      body,
    }),
  setStatus: (
    workspaceId: string,
    touchpointId: string,
    body: UpdateTouchpointStatus,
  ) =>
    apiRequest<Touchpoint>(`${base(workspaceId)}/${touchpointId}/status`, {
      method: "PATCH",
      body,
    }),
  /** Irreversible: the Touchpoint's printed QR/NFC never serves again. */
  retire: (workspaceId: string, touchpointId: string) =>
    apiRequest<Touchpoint>(`${base(workspaceId)}/${touchpointId}/retire`, {
      method: "POST",
    }),
  /** «Conecta el objeto»: every step is saved, so a reload comes back to it. */
  updateObject: (
    workspaceId: string,
    touchpointId: string,
    body: UpdateTouchpointObject,
  ) =>
    apiRequest<Touchpoint>(`${base(workspaceId)}/${touchpointId}/object`, {
      method: "POST",
      body,
    }),
  /** «Pruébalo»: marks it tested once its first visit has arrived. */
  probeObject: (workspaceId: string, touchpointId: string, since: string) =>
    apiRequest<TouchpointObjectProbe>(
      `${base(workspaceId)}/${touchpointId}/object/probe`,
      { method: "POST", body: { since } },
    ),
};
