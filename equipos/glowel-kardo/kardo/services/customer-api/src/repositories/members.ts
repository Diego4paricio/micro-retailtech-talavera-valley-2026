import { createHash } from "node:crypto";
import type {
  AssignableRole,
  CreatedInvitation,
  CreateInvitation,
  CustomerRole,
  CustomerWorkspace,
  InvitationPreview,
  OwnershipTransfer,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@kardo/contracts";
import { canManageMember } from "@kardo/domain";
import type { Sql } from "postgres";
import { assertWithinLimit } from "../billing/entitlements.js";
import {
  ConflictError,
  InvitationInvalidError,
  NotFoundError,
  RateLimitedError,
  WorkspaceAccessError,
} from "../errors.js";
import { randomInvitationToken } from "../ids.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";
import { personalSuffix } from "./display-name.js";

/** A new invitation to the same address waits this long (each one sends
 * an email from Kardo's domain). */
export const INVITATION_RESEND_COOLDOWN_MS = 10 * 60_000;
/** Invitations an organization may create in 24 hours (revoked and
 * re-sent ones count too). */
export const INVITATIONS_PER_DAY = 100;

/**
 * Seconds to wait before inviting again, or null when it may go out now.
 * Invitations send email from Kardo's domain with names the customer
 * writes, so they are throttled per address and per organization (security
 * review 2026-10, V8).
 */
export function invitationThrottle(input: {
  lastPendingAt: Date | null;
  sentLastDay: number;
  now: Date;
}): number | null {
  if (input.sentLastDay >= INVITATIONS_PER_DAY) return 3600;
  if (input.lastPendingAt) {
    const elapsed = input.now.getTime() - input.lastPendingAt.getTime();
    if (elapsed < INVITATION_RESEND_COOLDOWN_MS) {
      return Math.max(
        1,
        Math.ceil((INVITATION_RESEND_COOLDOWN_MS - elapsed) / 1000),
      );
    }
  }
  return null;
}

export type MemberRepository = {
  listMembers(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<readonly WorkspaceMember[]>;
  updateMemberRole(
    identity: CustomerIdentity,
    workspaceId: string,
    targetProfileId: string,
    role: AssignableRole,
  ): Promise<WorkspaceMember>;
  removeMember(
    identity: CustomerIdentity,
    workspaceId: string,
    targetProfileId: string,
  ): Promise<void>;
  listInvitations(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<readonly WorkspaceInvitation[]>;
  createInvitation(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateInvitation,
  ): Promise<CreatedInvitationWithContext>;
  /** Requests an ownership transfer to `targetProfileId` (an Admin). Nothing
   * changes until the recipient accepts; returns the pending request. */
  transferOwnership(
    identity: CustomerIdentity,
    workspaceId: string,
    targetProfileId: string,
  ): Promise<OwnershipTransfer>;
  /** The organization's pending transfer, or null (for the Owner's view). */
  pendingTransfer(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<OwnershipTransfer | null>;
  /** The Owner cancels a pending transfer. */
  cancelOwnershipTransfer(
    identity: CustomerIdentity,
    workspaceId: string,
    transferId: string,
  ): Promise<void>;
  /** Transfers addressed to the caller and still pending (recipient's view). */
  incomingTransfers(
    identity: CustomerIdentity,
  ): Promise<readonly OwnershipTransfer[]>;
  /** The recipient accepts: becomes Owner and the organization moves to them. */
  acceptOwnershipTransfer(
    identity: CustomerIdentity,
    transferId: string,
  ): Promise<void>;
  /** The recipient declines. */
  declineOwnershipTransfer(
    identity: CustomerIdentity,
    transferId: string,
  ): Promise<void>;
  revokeInvitation(
    identity: CustomerIdentity,
    workspaceId: string,
    invitationId: string,
  ): Promise<void>;
  acceptInvitation(
    identity: CustomerIdentity,
    token: string,
  ): Promise<CustomerWorkspace>;
  /** What an invitation link is before accepting it (domain audit A2-17);
   * 404 for an unknown token. */
  previewInvitation(
    identity: CustomerIdentity,
    token: string,
  ): Promise<InvitationPreview>;
};

/** What the invitation email needs besides the public response. */
export type CreatedInvitationWithContext = CreatedInvitation & {
  workspaceName: string;
  inviterName: string | null;
};

export class MemberRepositoryError extends Error {}

export function unavailableMemberRepository(): MemberRepository {
  const unavailable = () =>
    Promise.reject(
      new MemberRepositoryError("Member storage is not configured."),
    );
  return {
    listMembers: unavailable,
    updateMemberRole: unavailable,
    removeMember: unavailable,
    listInvitations: unavailable,
    createInvitation: unavailable,
    revokeInvitation: unavailable,
    acceptInvitation: unavailable,
    previewInvitation: unavailable,
    transferOwnership: unavailable,
    pendingTransfer: unavailable,
    cancelOwnershipTransfer: unavailable,
    incomingTransfers: unavailable,
    acceptOwnershipTransfer: unavailable,
    declineOwnershipTransfer: unavailable,
  };
}

type OwnershipTransferRow = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  from_profile: string;
  from_name: string | null;
  to_profile: string;
  to_name: string | null;
  status: OwnershipTransfer["status"];
  created_at: string;
};

function toOwnershipTransfer(
  row: OwnershipTransferRow,
  identity: CustomerIdentity,
): OwnershipTransfer {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    fromProfileId: row.from_profile,
    fromName: row.from_name,
    toProfileId: row.to_profile,
    toName: row.to_name,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    isRecipient: row.to_profile === identity.subject,
  };
}

// The columns every ownership-transfer read returns are repeated inline in
// the three readers below; RLS limits the rows to the recipient and the
// organization's members.

async function readTransferById(
  tx: Sql,
  identity: CustomerIdentity,
  transferId: string,
): Promise<OwnershipTransfer | null> {
  const [row] = await tx<OwnershipTransferRow[]>`
    select t.id, t.workspace_id, w.name as workspace_name,
           t.from_profile, fp.display_name as from_name,
           t.to_profile, tp.display_name as to_name,
           t.status, t.created_at
    from kardo_core.ownership_transfers t
    join kardo_core.workspaces w on w.id = t.workspace_id
    left join kardo_core.profiles fp on fp.id = t.from_profile
    left join kardo_core.profiles tp on tp.id = t.to_profile
    where t.id = ${transferId}::uuid
    limit 1
  `;
  return row ? toOwnershipTransfer(row, identity) : null;
}

/** Turns the `create/accept/decline/cancel_ownership_transfer` guards'
 * `P0001` messages into the right API error. */
function translateTransferError(error: unknown): Error {
  // Two concurrent requests for the same organization race on the one-pending
  // unique index; surface a clean 409 instead of a raw 23505 (code review).
  if (
    error &&
    typeof error === "object" &&
    (error as { code?: string }).code === "23505"
  ) {
    return new ConflictError(
      "CONFLICT",
      "Ya hay una transferencia pendiente para esta organización.",
    );
  }
  const message = error instanceof Error ? error.message : "";
  switch (message) {
    case "FORBIDDEN":
      return new WorkspaceAccessError();
    case "NOT_FOUND":
    case "MEMBER_NOT_FOUND":
      return new NotFoundError("The transfer or member was not found.");
    case "NOT_AN_ORGANIZATION":
      return new ConflictError(
        "CONFLICT",
        "Solo las organizaciones se pueden transferir.",
      );
    case "RECIPIENT_MUST_BE_ADMIN":
      return new ConflictError(
        "CONFLICT",
        "Antes de transferir la propiedad, haz Administrador a esa persona.",
      );
    case "CANNOT_TRANSFER_TO_SELF":
      return new ConflictError(
        "CONFLICT",
        "Elige a otra persona para recibir la propiedad.",
      );
    default:
      return error instanceof Error
        ? error
        : new MemberRepositoryError(message);
  }
}

type MemberRow = {
  profile_id: string;
  display_name: string | null;
  email: string | null;
  role: CustomerRole;
  created_at: string;
};

type InvitationRow = {
  id: string;
  email: string;
  role: AssignableRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  public_id: string;
  name: string;
  kind: "personal" | "organization";
  role: CustomerRole;
};

export function createPostgresMemberRepository(sql: Sql): MemberRepository {
  return {
    async listMembers(identity, workspaceId) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return tx<MemberRow[]>`
          select membership.profile_id, profile.display_name, profile.email,
                 membership.role, membership.created_at
          from kardo_core.workspace_memberships membership
          join kardo_core.profiles profile on profile.id = membership.profile_id
          where membership.workspace_id = ${workspaceId}::uuid
          order by membership.created_at asc
        `;
      });
      return rows.map((row) => toWorkspaceMember(row, identity));
    },
    async transferOwnership(identity, workspaceId, targetProfileId) {
      // Two-step (ADR 024, security review 2026-10-12): this only *requests*
      // the transfer. The recipient must accept before any role or billing
      // change happens. `create_ownership_transfer` checks the caller is the
      // Owner, the workspace is an organization, and the recipient is an Admin.
      return withCustomerContext(sql, identity, async (tx) => {
        let transferId: string;
        try {
          const [created] = await tx<{ id: string }[]>`
            select kardo_private.create_ownership_transfer(
              ${workspaceId}::uuid, ${targetProfileId}::uuid
            ) as id
          `;
          if (!created?.id)
            throw new MemberRepositoryError("Transfer was not created.");
          transferId = created.id;
        } catch (error) {
          throw translateTransferError(error);
        }
        const transfer = await readTransferById(tx, identity, transferId);
        if (!transfer) throw new NotFoundError("Transfer was not found.");
        return transfer;
      });
    },
    async pendingTransfer(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        // Only the Owner (ownership.transfer) sees the pending request and who
        // it is offered to; a non-Owner member must not read it through the
        // API even though the UI already hides it (code review of 3255ddb).
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "ownership.transfer",
        );
        const [row] = await tx<OwnershipTransferRow[]>`
          select t.id, t.workspace_id, w.name as workspace_name,
                 t.from_profile, fp.display_name as from_name,
                 t.to_profile, tp.display_name as to_name,
                 t.status, t.created_at
          from kardo_core.ownership_transfers t
          join kardo_core.workspaces w on w.id = t.workspace_id
          left join kardo_core.profiles fp on fp.id = t.from_profile
          left join kardo_core.profiles tp on tp.id = t.to_profile
          where t.workspace_id = ${workspaceId}::uuid and t.status = 'pending'
          limit 1
        `;
        return row ? toOwnershipTransfer(row, identity) : null;
      });
    },
    async cancelOwnershipTransfer(identity, _workspaceId, transferId) {
      // `_workspaceId` comes from the REST path; the SQL guard resolves the
      // organization from the transfer itself and checks the caller owns it.
      await withCustomerContext(sql, identity, async (tx) => {
        try {
          await tx`select kardo_private.cancel_ownership_transfer(${transferId}::uuid)`;
        } catch (error) {
          throw translateTransferError(error);
        }
      });
    },
    async incomingTransfers(identity) {
      return withCustomerContext(sql, identity, async (tx) => {
        const rows = await tx<OwnershipTransferRow[]>`
          select t.id, t.workspace_id, w.name as workspace_name,
                 t.from_profile, fp.display_name as from_name,
                 t.to_profile, tp.display_name as to_name,
                 t.status, t.created_at
          from kardo_core.ownership_transfers t
          join kardo_core.workspaces w on w.id = t.workspace_id
          left join kardo_core.profiles fp on fp.id = t.from_profile
          left join kardo_core.profiles tp on tp.id = t.to_profile
          where t.to_profile = ${identity.subject}::uuid and t.status = 'pending'
          order by t.created_at desc
        `;
        return rows.map((row) => toOwnershipTransfer(row, identity));
      });
    },
    async acceptOwnershipTransfer(identity, transferId) {
      await withCustomerContext(sql, identity, async (tx) => {
        try {
          await tx`select kardo_private.accept_ownership_transfer(${transferId}::uuid)`;
        } catch (error) {
          throw translateTransferError(error);
        }
      });
    },
    async declineOwnershipTransfer(identity, transferId) {
      await withCustomerContext(sql, identity, async (tx) => {
        try {
          await tx`select kardo_private.decline_ownership_transfer(${transferId}::uuid)`;
        } catch (error) {
          throw translateTransferError(error);
        }
      });
    },
    async updateMemberRole(identity, workspaceId, targetProfileId, role) {
      return withCustomerContext(sql, identity, async (tx) => {
        const actorRole = await requireMembership(tx, identity, workspaceId);
        const targetRole = await lookupMemberRole(
          tx,
          workspaceId,
          targetProfileId,
        );
        if (!targetRole) throw new NotFoundError("Member was not found.");
        if (!canManageMember(actorRole, targetRole)) {
          throw new WorkspaceAccessError();
        }
        const rows = await runCatchingLastOwner(
          tx<MemberRow[]>`
            update kardo_core.workspace_memberships membership
            set role = ${role}
            from kardo_core.profiles profile
            where membership.workspace_id = ${workspaceId}::uuid
              and membership.profile_id = ${targetProfileId}::uuid
              and profile.id = membership.profile_id
            returning membership.profile_id, profile.display_name, profile.email,
                      membership.role, membership.created_at
          `,
        );
        const row = rows[0];
        if (!row) throw new NotFoundError("Member was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "member.role_changed",
          targetType: "profile",
          targetId: targetProfileId,
          result: "succeeded",
          metadata: { role },
        });
        return toWorkspaceMember(row, identity);
      });
    },
    async removeMember(identity, workspaceId, targetProfileId) {
      await withCustomerContext(sql, identity, async (tx) => {
        const actorRole = await requireMembership(tx, identity, workspaceId);
        const isSelf = targetProfileId === identity.subject;
        // An Owner never walks away from a workspace: ownership is handed
        // over first (the Owner becomes Admin) and only then can they leave.
        if (isSelf && actorRole === "owner") {
          throw new ConflictError(
            "OWNER_MUST_TRANSFER",
            "Transfiere la propiedad a otro miembro antes de salir de la organización.",
          );
        }
        if (!isSelf) {
          const targetRole = await lookupMemberRole(
            tx,
            workspaceId,
            targetProfileId,
          );
          if (!targetRole) throw new NotFoundError("Member was not found.");
          if (!canManageMember(actorRole, targetRole)) {
            throw new WorkspaceAccessError();
          }
        }
        // Audit first: after leaving, RLS no longer lets this person write
        // events for the workspace. Same transaction, so a failed delete
        // rolls the audit row back too.
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: isSelf ? "member.left" : "member.removed",
          targetType: "profile",
          targetId: targetProfileId,
          result: "succeeded",
        });
        const rows = await runCatchingLastOwner(
          tx<{ profile_id: string }[]>`
            delete from kardo_core.workspace_memberships
            where workspace_id = ${workspaceId}::uuid and profile_id = ${targetProfileId}::uuid
            returning profile_id
          `,
        );
        if (!rows[0]) throw new NotFoundError("Member was not found.");
      });
    },
    async listInvitations(identity, workspaceId) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        // Only Owners and Admins see the list, but reading it changes
        // nothing, so it stays open without a plan (ADR 020 §4): a new
        // organization without one showed «No pudimos cargar las
        // invitaciones pendientes» in Equipo (2026-10-03 study, finding 7).
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "members.manage",
          { allowWithoutPlan: true },
        );
        await requireOrganizationWorkspace(tx, workspaceId);
        return tx<InvitationRow[]>`
          select id, email, role,
                 case
                   when status = 'pending' and expires_at < now() then 'expired'
                   else status
                 end as status,
                 expires_at, created_at
          from kardo_core.workspace_invitations
          where workspace_id = ${workspaceId}::uuid
          order by created_at desc
        `;
      });
      return rows.map(toWorkspaceInvitation);
    },
    async createInvitation(identity, workspaceId, input) {
      const email = input.email.trim().toLowerCase();
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "members.manage",
        );
        await requireOrganizationWorkspace(tx, workspaceId);
        // Domain audit A2-11: someone already in this team is not invited
        // again (accepting was a silent no-op).
        const [member] = await tx<{ id: string }[]>`
          select membership.profile_id as id
          from kardo_core.workspace_memberships membership
          join kardo_core.profiles profile on profile.id = membership.profile_id
          where membership.workspace_id = ${workspaceId}::uuid
            and lower(profile.email) = ${email}
        `;
        if (member) {
          throw new ConflictError(
            "ALREADY_MEMBER",
            "Esa persona ya es parte del equipo.",
          );
        }
        // Re-inviting the same email replaces its pending invitation, so it
        // does not count twice against the plan; it does count against the
        // email throttle.
        const [recent] = await tx<
          { last_pending: Date | null; sent_last_day: number }[]
        >`
          select
            (select max(created_at) from kardo_core.workspace_invitations
              where workspace_id = ${workspaceId}::uuid and email = ${email}
                and status = 'pending' and expires_at > now()) as last_pending,
            (select count(*)::int from kardo_core.workspace_invitations
              where workspace_id = ${workspaceId}::uuid
                and created_at > now() - interval '24 hours') as sent_last_day
        `;
        const wait = invitationThrottle({
          lastPendingAt: recent?.last_pending
            ? new Date(recent.last_pending)
            : null,
          sentLastDay: Number(recent?.sent_last_day ?? 0),
          now: new Date(),
        });
        if (wait !== null) {
          throw new RateLimitedError(
            wait,
            "Too many invitations. Try again shortly.",
          );
        }
        if (!recent?.last_pending) {
          // Members count people, not places (ADR 024): a person already in
          // another organization of the account takes no new place (A2-11).
          const [pool] = await tx<{ counted: boolean }[]>`
            select kardo_billing.email_counts_in_pool(${workspaceId}::uuid, ${email}) as counted
          `;
          await assertWithinLimit(
            tx,
            workspaceId,
            "members.max",
            pool?.counted ? 0 : 1,
          );
        }

        await tx`
          update kardo_core.workspace_invitations
          set status = 'revoked', revoked_at = now(), updated_at = now()
          where workspace_id = ${workspaceId}::uuid
            and email = ${email}
            and status = 'pending'
        `;

        const token = randomInvitationToken();
        const tokenHash = sha256Hex(token);
        const rows = await tx<InvitationRow[]>`
          insert into kardo_core.workspace_invitations (
            workspace_id, email, role, token_hash, status, invited_by, expires_at
          ) values (
            ${workspaceId}::uuid, ${email}, ${input.role}, ${tokenHash}, 'pending',
            ${identity.subject}::uuid, now() + interval '7 days'
          )
          returning id, email, role, status, expires_at, created_at
        `;
        const row = rows[0];
        if (!row) {
          throw new MemberRepositoryError("Invitation was not created.");
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "invitation.created",
          targetType: "invitation",
          targetId: row.id,
          result: "succeeded",
          metadata: { email, role: input.role },
        });
        const context = await tx<
          { workspace_name: string; inviter_name: string | null }[]
        >`
          select workspace.name as workspace_name, profile.display_name as inviter_name
          from kardo_core.workspaces workspace
          left join kardo_core.profiles profile on profile.id = ${identity.subject}::uuid
          where workspace.id = ${workspaceId}::uuid
        `;
        return {
          invitation: toWorkspaceInvitation(row),
          token,
          workspaceName: context[0]?.workspace_name ?? "Kardo",
          inviterName: context[0]?.inviter_name ?? null,
        };
      });
    },
    async revokeInvitation(identity, workspaceId, invitationId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "members.manage",
        );
        await requireOrganizationWorkspace(tx, workspaceId);
        const rows = await tx<{ id: string }[]>`
          update kardo_core.workspace_invitations
          set status = 'revoked', revoked_at = now(), updated_at = now()
          where id = ${invitationId}::uuid
            and workspace_id = ${workspaceId}::uuid
            and status = 'pending'
          returning id
        `;
        if (!rows[0]) {
          throw new NotFoundError("Invitation was not found.");
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "invitation.revoked",
          targetType: "invitation",
          targetId: invitationId,
          result: "succeeded",
        });
      });
    },
    async acceptInvitation(identity, token) {
      const tokenHash = sha256Hex(token);
      return withCustomerContext(sql, identity, async (tx) => {
        let workspaceId: string;
        try {
          const result = await tx<{ id: string }[]>`
            select kardo_core.accept_workspace_invitation(${tokenHash}) as id
          `;
          const id = result[0]?.id;
          if (!id) throw new InvitationInvalidError();
          workspaceId = id;
        } catch (error) {
          if (error instanceof InvitationInvalidError) throw error;
          throw new InvitationInvalidError();
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "invitation.accepted",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
        });
        // People who join by invitation skip sign up, which is where the
        // display name is set: the account's default name ("juan · Personal")
        // loses its suffix, so the team sees the person, not a space.
        await tx`
          update kardo_core.profiles
          set display_name = left(display_name, char_length(display_name) - char_length(${personalSuffix})),
            updated_at = now()
          where id = ${identity.subject}::uuid
            and right(display_name, char_length(${personalSuffix})) = ${personalSuffix}
            and char_length(display_name) > char_length(${personalSuffix})
        `;
        const rows = await tx<WorkspaceRow[]>`
          select workspace.id, workspace.public_id, workspace.name, workspace.kind, membership.role
          from kardo_core.workspaces workspace
          join kardo_core.workspace_memberships membership
            on membership.workspace_id = workspace.id and membership.profile_id = ${identity.subject}::uuid
          where workspace.id = ${workspaceId}::uuid
        `;
        const row = rows[0];
        if (!row) throw new InvitationInvalidError();
        return {
          id: row.id,
          publicId: row.public_id,
          name: row.name,
          kind: row.kind,
          role: row.role,
        };
      });
    },
    async previewInvitation(identity, token) {
      const tokenHash = sha256Hex(token);
      return withCustomerContext(sql, identity, async (tx) => {
        const [row] = await tx<
          {
            workspace_name: string;
            role: AssignableRole;
            invited_by: string | null;
            state: string;
            email: string;
            email_matches: boolean;
          }[]
        >`
          select * from kardo_core.preview_workspace_invitation(${tokenHash})
        `;
        if (!row) throw new NotFoundError("Invitation was not found.");
        const state =
          row.state === "pending"
            ? row.email_matches
              ? "valid"
              : "wrong_email"
            : row.state === "accepted" ||
                row.state === "revoked" ||
                row.state === "expired"
              ? row.state
              : "revoked";
        return {
          workspaceName: row.workspace_name,
          role: row.role,
          invitedBy: row.invited_by
            ? stripPersonalSuffix(row.invited_by)
            : null,
          state,
          emailHint: maskEmail(row.email),
        };
      });
    },
  };
}

/** «an•••@gmail.com»: enough to recognize the address, not to read it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const name = email.slice(0, at);
  const shown = name.slice(0, Math.min(2, name.length - 1 || 1));
  return `${shown}•••${email.slice(at)}`;
}

function stripPersonalSuffix(name: string): string {
  return name.endsWith(personalSuffix) && name.length > personalSuffix.length
    ? name.slice(0, -personalSuffix.length)
    : name;
}

async function lookupMemberRole(
  sql: Sql,
  workspaceId: string,
  profileId: string,
): Promise<CustomerRole | null> {
  const rows = await sql<{ role: CustomerRole }[]>`
    select role from kardo_core.workspace_memberships
    where workspace_id = ${workspaceId}::uuid and profile_id = ${profileId}::uuid
  `;
  return rows[0]?.role ?? null;
}

async function requireOrganizationWorkspace(
  sql: Sql,
  workspaceId: string,
): Promise<void> {
  const rows = await sql<{ kind: "personal" | "organization" }[]>`
    select kind from kardo_core.workspaces where id = ${workspaceId}::uuid
  `;
  if (rows[0]?.kind !== "organization") {
    throw new ConflictError(
      "ORGANIZATION_REQUIRED",
      "Members and invitations require an organization workspace.",
    );
  }
}

/** The `LAST_OWNER` trigger on `workspace_memberships` raises a plain
 * exception with that message when a role change or removal would leave the
 * workspace without an owner. postgres.js surfaces it as a `PostgresError`
 * whose `message` contains the raised text; this maps that specific case to
 * a typed `ConflictError` and re-throws anything else untouched. */
async function runCatchingLastOwner<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (error instanceof Error && error.message.includes("LAST_OWNER")) {
      throw new ConflictError(
        "LAST_OWNER",
        "A workspace must always keep at least one owner.",
      );
    }
    throw error;
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toWorkspaceMember(
  row: MemberRow,
  identity: CustomerIdentity,
): WorkspaceMember {
  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    joinedAt: new Date(row.created_at).toISOString(),
    isCurrentUser: row.profile_id === identity.subject,
  };
}

function toWorkspaceInvitation(row: InvitationRow): WorkspaceInvitation {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
