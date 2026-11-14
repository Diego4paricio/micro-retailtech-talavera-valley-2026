import type {
  AssignableRole,
  CreatedInvitation,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@kardo/contracts";
import { canManageMember } from "@kardo/domain";
import { DropdownMenu } from "radix-ui";
import { type FormEvent, type ReactNode, useState } from "react";
import { membersApi } from "../../api/members.js";
import { ConfirmDialog, Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { SettingsGroup, SettingsRow } from "../../components/SettingsBlocks.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import type { Resource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { InvitationLink, invitationErrorMessage } from "./InviteDialog.js";
import { OwnershipTransferCards } from "./OwnershipTransferCards.js";
import { RoleChoice } from "./RoleChoice.js";
import { roleLabels } from "./role-labels.js";
import {
  invitationDescription,
  memberName,
  noTransferCandidatesText,
  peopleRows,
  peopleSummary,
  transferCandidates as transferCandidatesOf,
  transferPlanLine,
  withInvitation,
} from "./team-model.js";
import "./organization.css";

/**
 * «Personas» (ADR 023 §2.4): members and pending invitations in one list,
 * Owners first. Each row has one menu with what the viewer may do to it;
 * every change opens its own dialog.
 */
export function PeopleGroup({
  members,
  invitations,
}: {
  members: Resource<WorkspaceMember[]>;
  /** Only loaded for people who can manage members (the API requires it). */
  invitations: Resource<WorkspaceInvitation[]> | null;
}) {
  const { workspace, session, can, reloadWorkspaces } = useWorkspace();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const canTransferOwnership = can("ownership.transfer");

  const [roleTarget, setRoleTarget] = useState<WorkspaceMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(
    null,
  );
  const [isRemoving, setIsRemoving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [showTransferPicker, setShowTransferPicker] = useState(false);
  const [transferTarget, setTransferTarget] = useState<WorkspaceMember | null>(
    null,
  );
  const [isTransferring, setIsTransferring] = useState(false);
  // Bumped after requesting a transfer so OwnershipTransferCards re-fetches.
  const [transferRefresh, setTransferRefresh] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<WorkspaceInvitation | null>(
    null,
  );
  const [isCancelling, setIsCancelling] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resent, setResent] = useState<CreatedInvitation | null>(null);

  async function confirmRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await membersApi.remove(workspace.id, removeTarget.profileId);
      members.setData((items) =>
        items
          ? items.filter((item) => item.profileId !== removeTarget.profileId)
          : items,
      );
      notify(`Quitaste a ${memberName(removeTarget)} de la organización.`);
      setRemoveTarget(null);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsRemoving(false);
    }
  }

  async function confirmTransfer() {
    if (!transferTarget) return;
    setIsTransferring(true);
    try {
      // Two-step (ADR 024, security review 2026-10-12): this only requests the
      // transfer. Nothing changes until the recipient accepts; the pending
      // state (and «Cancelar») shows in OwnershipTransferCards.
      await membersApi.transferOwnership(workspace.id, {
        profileId: transferTarget.profileId,
      });
      setTransferRefresh((value) => value + 1);
      notify(
        `Le enviamos la solicitud a ${memberName(transferTarget)}. La propiedad cambia cuando la acepte.`,
      );
      setTransferTarget(null);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsTransferring(false);
    }
  }

  async function confirmLeave() {
    setIsLeaving(true);
    try {
      await membersApi.remove(workspace.id, session.user.id);
      notify(`Saliste de ${workspace.name}.`);
      await reloadWorkspaces();
      navigate({ name: "overview" });
    } catch (requestError) {
      // OWNER_MUST_TRANSFER arrives here with its own message.
      notify(errorMessage(requestError), "error");
    } finally {
      setIsLeaving(false);
      setShowLeaveConfirm(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget || !invitations) return;
    setIsCancelling(true);
    try {
      await membersApi.revokeInvitation(workspace.id, cancelTarget.id);
      invitations.setData((items) =>
        items ? items.filter((item) => item.id !== cancelTarget.id) : items,
      );
      notify(`Cancelaste la invitación de ${cancelTarget.email}.`);
      setCancelTarget(null);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsCancelling(false);
    }
  }

  /** Inviting the same email again replaces the pending invitation. */
  async function resend(invitation: WorkspaceInvitation) {
    if (!invitations) return;
    setResendingId(invitation.id);
    try {
      const created = await membersApi.invite(workspace.id, {
        email: invitation.email,
        role: invitation.role,
      });
      invitations.setData((items) => withInvitation(items, created.invitation));
      setResent(created);
    } catch (requestError) {
      notify(invitationErrorMessage(requestError), "error");
    } finally {
      setResendingId(null);
    }
  }

  const memberList = members.data ?? [];
  const pendingCount = (invitations?.data ?? []).filter(
    (item) => item.status === "pending",
  ).length;
  const rows = peopleRows(memberList, invitations?.data ?? []);
  const transferCandidates = transferCandidatesOf(memberList);
  const hasOtherPeople = memberList.some((member) => !member.isCurrentUser);
  const canManageTeam = can("members.manage");

  return (
    <>
      <SettingsGroup
        description={
          members.data
            ? peopleSummary(memberList.length, pendingCount)
            : undefined
        }
        footer={
          canManageTeam
            ? invitations?.error
              ? `No pudimos cargar las invitaciones pendientes: ${invitations.error}`
              : undefined
            : "Solo un Owner o un Admin puede invitar personas o cambiar roles."
        }
        id="team-people"
        title="Personas"
      >
        <OwnershipTransferCards refreshToken={transferRefresh} />
        {members.isLoading && !members.data ? (
          <div className="team-loading">
            <Skeleton label="Cargando al equipo…" lines={3} />
          </div>
        ) : members.error ? (
          <SettingsRow
            action={
              <button
                className="button button-secondary button-small"
                onClick={() => void members.reload()}
                type="button"
              >
                Reintentar
              </button>
            }
            description={members.error}
            label="No pudimos cargar al equipo"
          />
        ) : (
          rows.map((row) =>
            row.kind === "member" ? (
              <SettingsRow
                action={
                  <MemberMenu
                    canManage={
                      !row.member.isCurrentUser &&
                      row.member.role !== "owner" &&
                      canManageMember(workspace.role, row.member.role)
                    }
                    canTransferOwnership={canTransferOwnership}
                    member={row.member}
                    onChangeRole={setRoleTarget}
                    onLeave={() => setShowLeaveConfirm(true)}
                    onRemove={setRemoveTarget}
                    onTransfer={setTransferTarget}
                    onTransferPicker={() => setShowTransferPicker(true)}
                  />
                }
                description={row.member.email ?? "Sin correo"}
                key={row.key}
                label={
                  <>
                    {memberName(row.member)}
                    {row.member.isCurrentUser ? (
                      <span className="team-you"> (tú)</span>
                    ) : null}
                  </>
                }
                value={roleLabels[row.member.role]}
              />
            ) : (
              <SettingsRow
                action={
                  <InvitationMenu
                    busy={resendingId === row.invitation.id}
                    invitation={row.invitation}
                    onCancel={setCancelTarget}
                    onResend={(invitation) => void resend(invitation)}
                  />
                }
                description={invitationDescription(row.invitation)}
                key={row.key}
                label={row.invitation.email}
                value={roleLabels[row.invitation.role]}
              />
            ),
          )
        )}
      </SettingsGroup>

      <ChangeRoleDialog
        member={roleTarget}
        onChanged={(updated) =>
          members.setData((items) =>
            items
              ? items.map((item) =>
                  item.profileId === updated.profileId ? updated : item,
                )
              : items,
          )
        }
        onClose={() => setRoleTarget(null)}
      />
      <ConfirmDialog
        confirmLabel="Quitar"
        description={`${removeTarget ? memberName(removeTarget) : "Esta persona"} dejará de tener acceso a ${workspace.name} de inmediato. Puedes volver a invitarla cuando quieras.`}
        isBusy={isRemoving}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
        open={Boolean(removeTarget)}
        title="¿Quitar de la organización?"
        tone="danger"
      />
      <ConfirmDialog
        confirmLabel="Salir"
        description={`Dejarás de tener acceso a ${workspace.name} de inmediato. Un Owner o un Admin puede volver a invitarte.`}
        isBusy={isLeaving}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={() => void confirmLeave()}
        open={showLeaveConfirm}
        title="¿Salir de la organización?"
        tone="danger"
      />
      <ConfirmDialog
        confirmLabel="Enviar solicitud"
        description={`Le enviaremos una solicitud a ${transferTarget ? memberName(transferTarget) : "esta persona"}. La propiedad de ${workspace.name} cambia solo cuando la acepte: pasará a ser Owner y tú, Admin. ${transferPlanLine(transferTarget ? memberName(transferTarget) : "esa persona")}`}
        isBusy={isTransferring}
        onClose={() => setTransferTarget(null)}
        onConfirm={() => void confirmTransfer()}
        open={Boolean(transferTarget)}
        title="¿Pedir la transferencia?"
        tone="primary"
      />
      <Dialog
        description="Elige quién será el nuevo Owner. Tú quedarás como Admin y, si quieres, después podrás salir de la organización."
        onClose={() => setShowTransferPicker(false)}
        open={showTransferPicker}
        title="Transferir propiedad"
      >
        {transferCandidates.length ? (
          <ul className="team-pick-list">
            {transferCandidates.map((member) => (
              <li key={member.profileId}>
                <span className="team-pick-name">
                  <strong>{memberName(member)}</strong>
                  <small>{roleLabels[member.role]}</small>
                </span>
                <button
                  className="button button-secondary button-small"
                  onClick={() => {
                    setShowTransferPicker(false);
                    setTransferTarget(member);
                  }}
                  type="button"
                >
                  Elegir
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="team-dialog-text">
            {hasOtherPeople
              ? noTransferCandidatesText
              : `Aún eres la única persona en ${workspace.name}. Invita a alguien antes de transferir la propiedad.`}
          </p>
        )}
      </Dialog>
      <ConfirmDialog
        cancelLabel="Volver"
        confirmLabel="Cancelar invitación"
        description={`El enlace que recibió ${cancelTarget?.email ?? "esta persona"} dejará de funcionar. Puedes invitarla de nuevo cuando quieras.`}
        isBusy={isCancelling}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => void confirmCancel()}
        open={Boolean(cancelTarget)}
        title="¿Cancelar la invitación?"
        tone="danger"
      />
      <Dialog
        footer={
          <button
            className="button button-primary"
            onClick={() => setResent(null)}
            type="button"
          >
            Listo
          </button>
        }
        onClose={() => setResent(null)}
        open={Boolean(resent)}
        title="Invitación reenviada"
      >
        {resent ? <InvitationLink created={resent} resent /> : null}
      </Dialog>
    </>
  );
}

function MemberMenu({
  member,
  canManage,
  canTransferOwnership,
  onChangeRole,
  onTransfer,
  onRemove,
  onLeave,
  onTransferPicker,
}: {
  member: WorkspaceMember;
  /** Someone else, below the viewer's role (`canManageMember`). */
  canManage: boolean;
  canTransferOwnership: boolean;
  onChangeRole: (member: WorkspaceMember) => void;
  onTransfer: (member: WorkspaceMember) => void;
  onRemove: (member: WorkspaceMember) => void;
  onLeave: () => void;
  onTransferPicker: () => void;
}) {
  if (!canManage && !member.isCurrentUser) return null;
  return (
    <RowMenu label={`Acciones para ${memberName(member)}`}>
      {member.isCurrentUser ? (
        member.role === "owner" ? (
          // An Owner never just leaves: ownership goes to someone else first.
          <DropdownMenu.Item
            className="kd-dropdown-item"
            onSelect={onTransferPicker}
          >
            Transferir propiedad…
          </DropdownMenu.Item>
        ) : (
          <DropdownMenu.Item
            className="kd-dropdown-item kd-dropdown-item-danger"
            onSelect={onLeave}
          >
            Salir de la organización…
          </DropdownMenu.Item>
        )
      ) : (
        <>
          <DropdownMenu.Item
            className="kd-dropdown-item"
            onSelect={() => onChangeRole(member)}
          >
            Cambiar rol…
          </DropdownMenu.Item>
          {canTransferOwnership && member.role === "admin" ? (
            <DropdownMenu.Item
              className="kd-dropdown-item"
              onSelect={() => onTransfer(member)}
            >
              Transferir propiedad…
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Separator className="kd-dropdown-separator" />
          <DropdownMenu.Item
            className="kd-dropdown-item kd-dropdown-item-danger"
            onSelect={() => onRemove(member)}
          >
            Quitar de la organización…
          </DropdownMenu.Item>
        </>
      )}
    </RowMenu>
  );
}

function InvitationMenu({
  invitation,
  busy,
  onResend,
  onCancel,
}: {
  invitation: WorkspaceInvitation;
  busy: boolean;
  onResend: (invitation: WorkspaceInvitation) => void;
  onCancel: (invitation: WorkspaceInvitation) => void;
}) {
  return (
    <RowMenu
      busy={busy}
      label={`Acciones para la invitación de ${invitation.email}`}
    >
      <DropdownMenu.Item
        className="kd-dropdown-item"
        onSelect={() => onResend(invitation)}
      >
        Reenviar invitación
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="kd-dropdown-separator" />
      <DropdownMenu.Item
        className="kd-dropdown-item kd-dropdown-item-danger"
        onSelect={() => onCancel(invitation)}
      >
        Cancelar invitación…
      </DropdownMenu.Item>
    </RowMenu>
  );
}

function RowMenu({
  label,
  busy,
  children,
}: {
  label: string;
  busy?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-busy={busy || undefined}
          aria-label={label}
          className="icon-button"
          disabled={busy}
          type="button"
        >
          {busy ? (
            <Icon className="team-spin" name="loader" />
          ) : (
            <Icon name="more" />
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="kd-dropdown-content"
          sideOffset={6}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** «Cambiar rol» in its own dialog, with the same role list as «Invitar». */
function ChangeRoleDialog({
  member,
  onChanged,
  onClose,
}: {
  member: WorkspaceMember | null;
  onChanged: (member: WorkspaceMember) => void;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const [role, setRole] = useState<AssignableRole>("editor");
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the member's current role each time the dialog opens.
  if (member && shownFor !== member.profileId) {
    setShownFor(member.profileId);
    setRole(member.role === "owner" ? "admin" : member.role);
    setError(null);
  }
  if (!member && shownFor !== null) setShownFor(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member) return;
    setError(null);
    setIsSaving(true);
    try {
      const updated = await membersApi.updateRole(
        workspace.id,
        member.profileId,
        { role },
      );
      onChanged(updated);
      notify(`${memberName(updated)} ahora es ${roleLabels[updated.role]}.`);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description={
        member
          ? `Lo que ${memberName(member)} puede hacer en ${workspace.name}.`
          : undefined
      }
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={isSaving || role === member?.role}
            form="change-role-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={Boolean(member)}
      title="Cambiar rol"
    >
      <form className="form-grid" id="change-role-form" onSubmit={submit}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <RoleChoice
          disabled={isSaving}
          name="change-role"
          onChange={setRole}
          value={role}
        />
      </form>
    </Dialog>
  );
}
