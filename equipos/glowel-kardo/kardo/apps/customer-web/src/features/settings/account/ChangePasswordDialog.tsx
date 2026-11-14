import { type FormEvent, useEffect, useState } from "react";
import {
  isStrongPassword,
  PasswordRules,
} from "../../../auth/PasswordRules.js";
import { Dialog } from "../../../components/Dialog.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import { useToast } from "../../../components/Toast.js";
import { authErrorNotice } from "../../../lib/auth-errors.js";
import { isDemoMode } from "../../../lib/demo.js";
import { supabase } from "../../../supabase.js";
import { useReauthenticate } from "./use-reauthenticate.js";

/**
 * Changing the password asks for the current one (ADR 023). The panel
 * checks it first; Supabase checks it again with «Require current
 * password» on. Afterwards every other session is closed and Supabase emails
 * the «password changed» notice.
 */
export function ChangePasswordDialog({
  open,
  email,
  onClose,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
}) {
  const { notify } = useToast();
  // The password only: the dialog asks for the current one, not a code.
  const { confirm } = useReauthenticate({
    email,
    open,
    secondFactor: false,
  });
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrent("");
      setPassword("");
      setConfirmation("");
      setNotice(null);
    }
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (password !== confirmation) {
      setNotice("Las contraseñas nuevas no coinciden.");
      return;
    }
    if (!isStrongPassword(password)) {
      setNotice("Elige una contraseña que cumpla todos los requisitos.");
      return;
    }
    setIsSaving(true);
    setNotice(null);
    if (!(await confirm(current))) {
      setIsSaving(false);
      setNotice("La contraseña actual no es correcta.");
      return;
    }
    const { error } = await supabase.auth.updateUser({
      password,
      current_password: current,
    });
    if (error) {
      setIsSaving(false);
      setNotice(
        /current.?password/i.test(error.message)
          ? "La contraseña actual no es correcta."
          : authErrorNotice("sign-up", error.message),
      );
      return;
    }
    // Someone who knew the old password is signed out everywhere else.
    await supabase.auth.signOut({ scope: "others" });
    setIsSaving(false);
    notify("Cambiamos tu contraseña y cerramos tus otras sesiones.");
    onClose();
  }

  return (
    <Dialog
      description={
        isDemoMode
          ? "En el modo de demostración no se cambia la contraseña."
          : "Al cambiarla cerramos tu cuenta en los demás dispositivos."
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
          {isDemoMode ? null : (
            <button
              aria-busy={isSaving || undefined}
              className="button button-primary"
              disabled={isSaving || !current || !password || !confirmation}
              form="change-password-form"
              type="submit"
            >
              {isSaving ? "Cambiando…" : "Cambiar contraseña"}
            </button>
          )}
        </>
      }
      onClose={onClose}
      open={open}
      title="Cambiar contraseña"
    >
      {isDemoMode ? null : (
        <form
          className="dialog-form"
          id="change-password-form"
          onSubmit={submit}
        >
          {notice ? <Notice tone="danger">{notice}</Notice> : null}
          <Field id="password-current" label="Contraseña actual">
            <input
              autoComplete="current-password"
              id="password-current"
              onChange={(event) => setCurrent(event.target.value)}
              type="password"
              value={current}
            />
          </Field>
          <Field id="password-new" label="Contraseña nueva">
            <input
              autoComplete="new-password"
              id="password-new"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </Field>
          <PasswordRules value={password} />
          <Field
            id="password-confirmation"
            label="Confirma la contraseña nueva"
          >
            <input
              autoComplete="new-password"
              id="password-confirmation"
              onChange={(event) => setConfirmation(event.target.value)}
              type="password"
              value={confirmation}
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
