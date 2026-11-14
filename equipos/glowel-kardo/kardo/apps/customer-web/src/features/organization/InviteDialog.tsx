import type {
  AssignableRole,
  CreatedInvitation,
  WorkspaceInvitation,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { membersApi } from "../../api/members.js";
import { CopyField } from "../../components/CopyField.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { ApiRequestError, errorMessage } from "../../lib/api.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { RoleChoice } from "./RoleChoice.js";
import "./organization.css";

/** At the plan's member cap (pending invitations count too, relevo 20 T3). */
export const membersCapMessage =
  "Llegaste al máximo de miembros de tu plan, contando las invitaciones pendientes. Cancela una invitación pendiente o cambia de plan en Configuración, Plan y facturación, para invitar a alguien más.";

/** The API waits 10 minutes before the same email can be invited again. */
export const inviteCooldownMessage =
  "Ya invitaste a este correo hace poco. Espera unos minutos para volver a enviarle la invitación.";

/** The email already belongs to someone on the team (A2-11). */
export const alreadyMemberMessage = "Esa persona ya es parte del equipo.";

export function invitationErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === "ALREADY_MEMBER")
    return alreadyMemberMessage;
  if (error instanceof ApiRequestError && error.code === "PLAN_LIMIT")
    return membersCapMessage;
  if (error instanceof ApiRequestError && error.status === 429)
    return inviteCooldownMessage;
  return errorMessage(error);
}

/** The link of the email when the server sent it (A2-17), so the one copied
 * here never points to another origin; else this panel's own. */
export function invitationLink(created: CreatedInvitation): string {
  return (
    created.inviteUrl ??
    `${window.location.origin}/invite#token=${created.token}`
  );
}

/**
 * What happens after inviting (or inviting again): the email went out, or
 * the link must be shared by hand. The token only travels in this response,
 * so the link is shown once.
 */
export function InvitationLink({
  created,
  resent,
}: {
  created: CreatedInvitation;
  resent?: boolean | undefined;
}) {
  const email = created.invitation.email;
  return (
    <>
      <p className="team-dialog-text">
        {created.emailSent
          ? `Le enviamos un correo a ${email} con el enlace para unirse. También puedes compartirlo tú.`
          : `Copia este enlace y compártelo con ${email}: es su forma de unirse.`}
        {resent ? " El enlace anterior ya no sirve." : null}
      </p>
      <CopyField
        hint="Solo se muestra ahora. Sirve una vez y vence en 7 días."
        label="Enlace"
        value={invitationLink(created)}
      />
    </>
  );
}

/**
 * «Invitar» (ADR 023 §2.4): email and role in a dialog; once sent, the same
 * dialog shows the result.
 */
export function InviteDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (invitation: WorkspaceInvitation) => void;
}) {
  const { workspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  // The submit button goes away with the form: keep focus inside the dialog.
  useEffect(() => {
    if (created) doneRef.current?.focus();
  }, [created]);

  function reset() {
    setEmail("");
    setRole("editor");
    setError(null);
    setCreated(null);
  }

  function close() {
    onClose();
    // The dialog animates out showing its last content; clear after that.
    window.setTimeout(reset, 300);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await membersApi.invite(workspace.id, {
        email: email.trim(),
        role,
      });
      setCreated(result);
      onInvited(result.invitation);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setIsSubmitting(false);
    }
  }

  const atPlanLimit =
    error instanceof ApiRequestError && error.code === "PLAN_LIMIT";

  if (created)
    return (
      <Dialog
        footer={
          <>
            <button
              className="button button-secondary"
              onClick={reset}
              type="button"
            >
              Invitar a otra persona
            </button>
            <button
              className="button button-primary"
              onClick={close}
              ref={doneRef}
              type="button"
            >
              Listo
            </button>
          </>
        }
        onClose={close}
        open={open}
        title={
          created.emailSent ? "Invitación enviada" : "Comparte la invitación"
        }
      >
        <InvitationLink created={created} />
      </Dialog>
    );

  return (
    <Dialog
      description={`Recibirá un enlace para unirse a ${workspace.name}. Sirve una vez y vence en 7 días.`}
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={close}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSubmitting || undefined}
            className="button button-primary"
            disabled={isSubmitting || !email.trim()}
            form="invite-form"
            type="submit"
          >
            {isSubmitting ? "Enviando…" : "Enviar invitación"}
          </button>
        </>
      }
      onClose={close}
      open={open}
      title="Invitar a alguien"
    >
      <form className="form-grid" id="invite-form" onSubmit={submit}>
        {error ? (
          <Notice
            action={
              atPlanLimit ? (
                <Link
                  className="link-button"
                  to={{ name: "settings", section: "plan" }}
                >
                  Ver el plan
                </Link>
              ) : undefined
            }
            tone="danger"
          >
            {invitationErrorMessage(error)}
          </Notice>
        ) : null}
        <Field id="invite-email" label="Correo">
          <input
            autoComplete="off"
            autoFocus
            id="invite-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@negocio.com"
            required
            type="email"
            value={email}
          />
        </Field>
        <RoleChoice
          disabled={isSubmitting}
          name="invite-role"
          onChange={setRole}
          value={role}
        />
      </form>
    </Dialog>
  );
}
