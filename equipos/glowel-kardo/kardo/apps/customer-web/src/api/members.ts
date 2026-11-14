import type {
  AcceptInvitation,
  CreatedInvitation,
  CreateInvitation,
  CustomerWorkspace,
  InvitationPreview,
  OwnershipTransfer,
  TransferOwnership,
  UpdateMemberRole,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}`;

export const membersApi = {
  list: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<WorkspaceMember[]>(`${base(workspaceId)}/members`, { signal }),
  updateRole: (
    workspaceId: string,
    profileId: string,
    body: UpdateMemberRole,
  ) =>
    apiRequest<WorkspaceMember>(`${base(workspaceId)}/members/${profileId}`, {
      method: "PATCH",
      body,
    }),
  remove: (workspaceId: string, profileId: string) =>
    apiRequest<void>(`${base(workspaceId)}/members/${profileId}`, {
      method: "DELETE",
    }),
  invitations: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<WorkspaceInvitation[]>(`${base(workspaceId)}/invitations`, {
      signal,
    }),
  invite: (workspaceId: string, body: CreateInvitation) =>
    apiRequest<CreatedInvitation>(`${base(workspaceId)}/invitations`, {
      method: "POST",
      body,
    }),
  revokeInvitation: (workspaceId: string, invitationId: string) =>
    apiRequest<void>(`${base(workspaceId)}/invitations/${invitationId}`, {
      method: "DELETE",
    }),
  /** What the invitation link is, before accepting it (the token in the body). */
  previewInvitation: (token: string, signal?: AbortSignal) =>
    apiRequest<InvitationPreview>("/v1/invitations/preview", {
      method: "POST",
      body: { token },
      signal,
    }),
  acceptInvitation: (body: AcceptInvitation) =>
    apiRequest<CustomerWorkspace>("/v1/invitations/accept", {
      method: "POST",
      body,
    }),
  /** Owner-only: requests a transfer to `profileId` (an Admin). Nothing
   * changes until the recipient accepts; returns the pending request. */
  transferOwnership: (workspaceId: string, body: TransferOwnership) =>
    apiRequest<OwnershipTransfer>(`${base(workspaceId)}/ownership-transfer`, {
      method: "POST",
      body,
    }),
  /** The organization's pending transfer, or null (Owner's view). */
  pendingTransfer: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<OwnershipTransfer | null>(
      `${base(workspaceId)}/ownership-transfer`,
      { signal },
    ),
  /** Owner cancels a pending transfer. */
  cancelTransfer: (workspaceId: string, transferId: string) =>
    apiRequest<void>(`${base(workspaceId)}/ownership-transfer/${transferId}`, {
      method: "DELETE",
    }),
  /** Transfers waiting for the current person to accept. */
  incomingTransfers: (signal?: AbortSignal) =>
    apiRequest<OwnershipTransfer[]>("/v1/ownership-transfers", { signal }),
  /** The recipient accepts: becomes Owner of that organization. */
  acceptTransfer: (transferId: string) =>
    apiRequest<void>(`/v1/ownership-transfers/${transferId}/accept`, {
      method: "POST",
    }),
  /** The recipient declines. */
  declineTransfer: (transferId: string) =>
    apiRequest<void>(`/v1/ownership-transfers/${transferId}/decline`, {
      method: "POST",
    }),
};
