import {
  type AcceptInvitation,
  AcceptInvitationSchema,
  ApiErrorSchema,
  CreatedInvitationSchema,
  type CreateInvitation,
  CreateInvitationSchema,
  CustomerWorkspaceSchema,
  InvitationPreviewRequestSchema,
  InvitationPreviewSchema,
  OwnershipTransferListSchema,
  OwnershipTransferSchema,
  PendingOwnershipTransferSchema,
  type TransferOwnership,
  TransferOwnershipSchema,
  type UpdateMemberRole,
  UpdateMemberRoleSchema,
  WorkspaceInvitationListSchema,
  WorkspaceMemberListSchema,
  WorkspaceMemberSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type TransferParams,
  transferParamsSchema,
  type WorkspaceInvitationParams,
  type WorkspaceMemberParams,
  type WorkspaceParams,
  type WorkspaceTransferParams,
  workspaceInvitationParamsSchema,
  workspaceMemberParamsSchema,
  workspaceParamsSchema,
  workspaceTransferParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";
import { isUndeliverable } from "../invitation-mailer.js";

export function registerMemberRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/members",
    {
      schema: {
        tags: ["members"],
        summary: "List a workspace's members",
        params: workspaceParamsSchema,
        response: {
          200: WorkspaceMemberListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.memberRepository.listMembers(identity, params.workspaceId);
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/members/:profileId",
    {
      schema: {
        tags: ["members"],
        summary: "Change a member's role",
        params: workspaceMemberParamsSchema,
        body: UpdateMemberRoleSchema,
        response: {
          200: WorkspaceMemberSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceMemberParams;
      const body = request.body as UpdateMemberRole;
      return deps.memberRepository.updateMemberRole(
        identity,
        params.workspaceId,
        params.profileId,
        body.role,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/members/:profileId",
    {
      schema: {
        tags: ["members"],
        summary: "Remove a member, or leave the workspace as yourself",
        params: workspaceMemberParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceMemberParams;
      await deps.memberRepository.removeMember(
        identity,
        params.workspaceId,
        params.profileId,
      );
      return reply.code(204).send();
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/invitations",
    {
      schema: {
        tags: ["members"],
        summary: "List a workspace's invitations",
        params: workspaceParamsSchema,
        response: {
          200: WorkspaceInvitationListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.memberRepository.listInvitations(
        identity,
        params.workspaceId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/invitations",
    {
      schema: {
        tags: ["members"],
        summary: "Invite a new member to an organization workspace",
        params: workspaceParamsSchema,
        body: CreateInvitationSchema,
        response: {
          201: CreatedInvitationSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const { workspaceName, inviterName, ...created } =
        await deps.memberRepository.createInvitation(
          identity,
          params.workspaceId,
          request.body as CreateInvitation,
        );
      // One link for the email and the panel's «Copiar enlace», so both
      // always point to the same panel (domain audit A2-17).
      const inviteUrl = new URL(
        `/invite#token=${created.token}`,
        deps.customerAppOrigin,
      ).toString();
      const emailSent = deps.invitationMailer.enabled
        ? await deps.invitationMailer.send({
            to: created.invitation.email,
            workspaceName,
            inviterName,
            role: created.invitation.role,
            acceptUrl: inviteUrl,
            expiresAt: created.invitation.expiresAt,
          })
        : false;
      if (
        deps.invitationMailer.enabled &&
        !emailSent &&
        !isUndeliverable(created.invitation.email)
      ) {
        request.log.warn("Invitation email could not be sent.");
      }
      return reply.code(201).send({ ...created, emailSent, inviteUrl });
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/invitations/:invitationId",
    {
      schema: {
        tags: ["members"],
        summary: "Revoke a pending invitation",
        params: workspaceInvitationParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceInvitationParams;
      await deps.memberRepository.revokeInvitation(
        identity,
        params.workspaceId,
        params.invitationId,
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/invitations/accept",
    {
      schema: {
        tags: ["members"],
        summary: "Accept a workspace invitation by its plaintext token",
        body: AcceptInvitationSchema,
        response: {
          201: CustomerWorkspaceSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      // Throttle per verified subject: the token is 256-bit so it cannot be
      // guessed, but accepting an invitation is a sensitive, membership-
      // changing action and should not be callable in a tight loop
      // (security review 2026-10-12).
      deps.rateLimiters.checkSensitive(request);
      const body = request.body as AcceptInvitation;
      const workspace = await deps.memberRepository.acceptInvitation(
        identity,
        body.token,
      );
      return reply.code(201).send(workspace);
    },
  );

  // What an invitation link is before accepting it (domain audit A2-17):
  // the organization, the role, who invited and, when it cannot be used,
  // why. The token travels in the body, as for accepting.
  app.post(
    "/v1/invitations/preview",
    {
      schema: {
        tags: ["members"],
        summary: "Preview a workspace invitation by its plaintext token",
        body: InvitationPreviewRequestSchema,
        response: {
          200: InvitationPreviewSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          429: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const body = request.body as AcceptInvitation;
      return deps.memberRepository.previewInvitation(identity, body.token);
    },
  );

  // Two-step ownership transfer (ADR 024, security review 2026-10-12): the
  // Owner requests it, the recipient accepts. Nothing changes until then.
  app.post(
    "/v1/workspaces/:workspaceId/ownership-transfer",
    {
      schema: {
        tags: ["members"],
        summary: "Request an ownership transfer to an Admin (they must accept)",
        params: workspaceParamsSchema,
        body: TransferOwnershipSchema,
        response: {
          201: OwnershipTransferSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const transfer = await deps.memberRepository.transferOwnership(
        identity,
        params.workspaceId,
        (request.body as TransferOwnership).profileId,
      );
      return reply.code(201).send(transfer);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/ownership-transfer",
    {
      schema: {
        tags: ["members"],
        summary: "The organization's pending ownership transfer, or null",
        params: workspaceParamsSchema,
        response: {
          200: PendingOwnershipTransferSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.memberRepository.pendingTransfer(
        identity,
        params.workspaceId,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/ownership-transfer/:transferId",
    {
      schema: {
        tags: ["members"],
        summary: "Cancel a pending ownership transfer (Owner only)",
        params: workspaceTransferParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceTransferParams;
      await deps.memberRepository.cancelOwnershipTransfer(
        identity,
        params.workspaceId,
        params.transferId,
      );
      return reply.code(204).send();
    },
  );

  // Recipient side: the transfers waiting for me, and my response to one.
  app.get(
    "/v1/ownership-transfers",
    {
      schema: {
        tags: ["members"],
        summary: "Ownership transfers waiting for the current person to accept",
        response: {
          200: OwnershipTransferListSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return deps.memberRepository.incomingTransfers(identity);
    },
  );

  app.post(
    "/v1/ownership-transfers/:transferId/accept",
    {
      schema: {
        tags: ["members"],
        summary:
          "Accept an ownership transfer: become Owner of the organization",
        params: transferParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as TransferParams;
      await deps.memberRepository.acceptOwnershipTransfer(
        identity,
        params.transferId,
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/ownership-transfers/:transferId/decline",
    {
      schema: {
        tags: ["members"],
        summary: "Decline an ownership transfer",
        params: transferParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as TransferParams;
      await deps.memberRepository.declineOwnershipTransfer(
        identity,
        params.transferId,
      );
      return reply.code(204).send();
    },
  );
}
