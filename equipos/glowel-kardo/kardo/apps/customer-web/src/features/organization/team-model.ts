import type {
  AssignableRole,
  CustomerRole,
  InvitationPreview,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@kardo/contracts";
import { customerRoles, customerRoleText } from "@kardo/domain";
import { formatDate } from "../../lib/format.js";

/**
 * Equipo (ADR 023 §2.4): members and pending invitations are one list.
 * Pure helpers so the order and the wording are testable without a DOM.
 */

export const assignableRoles: readonly AssignableRole[] = [
  "admin",
  "editor",
  "viewer",
];

export type PersonRow =
  | { kind: "member"; key: string; member: WorkspaceMember }
  | { kind: "invitation"; key: string; invitation: WorkspaceInvitation };

const roleRank = (role: CustomerRole) => customerRoles.indexOf(role);

/**
 * Owners, Admins, Editors and Viewers (the server's join order inside each
 * role, since the sort is stable), then the invitations still pending, the
 * newest first. Accepted ones are already members; revoked and expired ones
 * no longer give access, so they are left out.
 */
export function peopleRows(
  members: readonly WorkspaceMember[],
  invitations: readonly WorkspaceInvitation[],
): PersonRow[] {
  const people = [...members]
    .sort((a, b) => roleRank(a.role) - roleRank(b.role))
    .map(
      (member): PersonRow => ({
        kind: "member",
        key: `member:${member.profileId}`,
        member,
      }),
    );
  const pending = invitations
    .filter((invitation) => invitation.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(
      (invitation): PersonRow => ({
        kind: "invitation",
        key: `invitation:${invitation.id}`,
        invitation,
      }),
    );
  return [...people, ...pending];
}

/**
 * A personal space is named «<name> · Personal» when it is created; the
 * suffix is the space's label, not the person's name (A2-15).
 */
export function withoutPersonalSuffix(name: string): string {
  return name.replace(/\s*·\s*Personal\s*$/i, "").trim();
}

/**
 * Who ownership can be offered to: other Administrators only (A2-9). The
 * server refuses anyone else, and says so after the person already chose.
 */
export function transferCandidates(
  members: readonly WorkspaceMember[],
): WorkspaceMember[] {
  return members.filter(
    (member) => !member.isCurrentUser && member.role === "admin",
  );
}

/** What the picker says when nobody can receive ownership yet. */
export const noTransferCandidatesText =
  "Primero haz Administrador a alguien de tu equipo.";

/** The recipient can only accept while she is still an Administrator. */
export function canAcceptTransfer(role: CustomerRole): boolean {
  return role === "admin";
}

/** Shown to the recipient instead of «Aceptar la propiedad» (A2-10). */
export const cannotAcceptTransferText =
  "Para aceptar, un Owner debe volver a hacerte Administrador y pedirte la propiedad otra vez. Mientras tanto puedes rechazarla.";

/** The accept failed because the request no longer stands (A2-10). */
export const transferGoneText =
  "Esta solicitud ya no está disponible: tu rol cambió o quien la envió la canceló. Si todavía la quieres, pide que te la envíen otra vez.";

export function memberName(member: WorkspaceMember): string {
  const name = member.displayName
    ? withoutPersonalSuffix(member.displayName)
    : "";
  return name || member.email || "Persona sin nombre";
}

export function invitationDescription(invitation: WorkspaceInvitation): string {
  return `Invitación pendiente · vence el ${formatDate(invitation.expiresAt)}`;
}

/** Re-inviting an email replaces its pending invitation (same as the API). */
export function withInvitation(
  invitations: readonly WorkspaceInvitation[] | null,
  created: WorkspaceInvitation,
): WorkspaceInvitation[] {
  const email = created.email.toLowerCase();
  return [
    created,
    ...(invitations ?? []).filter(
      (item) =>
        !(item.status === "pending" && item.email.toLowerCase() === email),
    ),
  ];
}

export function peopleSummary(members: number, pending: number): string {
  const people = members === 1 ? "1 persona" : `${members} personas`;
  if (!pending) return people;
  return `${people} y ${pending === 1 ? "1 invitación pendiente" : `${pending} invitaciones pendientes`}`;
}

/**
 * «Qué puede hacer cada rol», in words: from `@kardo/domain`
 * (`customerRoleText`), next to the matrix (`canCustomer`) the server enforces.
 */
export const roleSummaries: Record<CustomerRole, string> = {
  owner: customerRoleText.owner.summary,
  admin: customerRoleText.admin.summary,
  editor: customerRoleText.editor.summary,
  viewer: customerRoleText.viewer.summary,
};

/** One line per role in the role picker (invite, change role). */
export const roleHints: Record<AssignableRole, string> = {
  admin: customerRoleText.admin.hint,
  editor: customerRoleText.editor.hint,
  viewer: customerRoleText.viewer.hint,
};

/**
 * What the invitation page says about the link (A2-17): who invites to what
 * and as which role, or the cause when it cannot be used. Before, a wrong
 * email, an expired link and a used one all read the same.
 */
export function invitationPreviewText(
  preview: InvitationPreview,
  currentEmail: string,
): { title: string; detail: string; canAccept: boolean } {
  const role = customerRoleText[preview.role].label;
  const title = `Te invitaron a ${preview.workspaceName}`;
  const by = preview.invitedBy
    ? `${preview.invitedBy} te invitó`
    : "Te invitaron";
  switch (preview.state) {
    case "valid":
      return {
        title,
        detail: `${by} como ${role}. Al aceptar, ${currentEmail} se une a la organización.`,
        canAccept: true,
      };
    case "wrong_email":
      return {
        title,
        detail: `Esta invitación es para ${preview.emailHint}, y entraste con ${currentEmail}. Cierra sesión y entra con la cuenta invitada.`,
        canAccept: false,
      };
    case "accepted":
      return {
        title,
        detail:
          "Esta invitación ya se usó. Si eres tú, entra a Kardo y ya la tienes en tu lista de organizaciones.",
        canAccept: false,
      };
    case "revoked":
      return {
        title,
        detail:
          "Quien te invitó la canceló. Pídele que te envíe una invitación nueva.",
        canAccept: false,
      };
    case "expired":
      return {
        title,
        detail:
          "Esta invitación venció. Pídele a quien te invitó que te envíe una nueva.",
        canAccept: false,
      };
  }
}

/** The one thing the transfer says about billing (ADR 024). */
export function transferPlanLine(receiverName: string): string {
  return `Sale de tu plan y entra al plan de ${receiverName}.`;
}
