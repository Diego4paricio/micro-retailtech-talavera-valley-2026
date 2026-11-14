import type {
  CreateTouchpointGroup,
  MoveTouchpointsResult,
  TouchpointGroup,
  UpdateTouchpointGroup,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/touchpoint-groups`;

export const groupsApi = {
  list: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<TouchpointGroup[]>(base(workspaceId), { signal }),
  create: (workspaceId: string, body: CreateTouchpointGroup) =>
    apiRequest<TouchpointGroup>(base(workspaceId), { method: "POST", body }),
  update: (workspaceId: string, groupId: string, body: UpdateTouchpointGroup) =>
    apiRequest<TouchpointGroup>(`${base(workspaceId)}/${groupId}`, {
      method: "PATCH",
      body,
    }),
  /** Replaces the group's membership with exactly these Touchpoints. */
  setTouchpoints: (
    workspaceId: string,
    groupId: string,
    touchpointIds: string[],
  ) =>
    apiRequest<TouchpointGroup>(`${base(workspaceId)}/${groupId}/touchpoints`, {
      method: "PUT",
      body: { touchpointIds },
    }),
  /**
   * Moves these Touchpoints into `groupId` (or out of their group with
   * `null`) without touching the group's other members.
   */
  move: (
    workspaceId: string,
    touchpointIds: string[],
    groupId: string | null,
  ) =>
    apiRequest<MoveTouchpointsResult>(
      `/v1/workspaces/${workspaceId}/touchpoints/move`,
      { method: "POST", body: { touchpointIds, groupId } },
    ),
  /** Deleting a group keeps its Touchpoints; they become ungrouped. */
  remove: (workspaceId: string, groupId: string) =>
    apiRequest<void>(`${base(workspaceId)}/${groupId}`, { method: "DELETE" }),
};
