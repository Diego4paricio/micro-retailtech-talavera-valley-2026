import { type CustomerProfile, PROFILE_LIMITS } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { profileApi } from "../../../api/workspaces.js";
import { Dialog } from "../../../components/Dialog.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import {
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
} from "../../../components/SettingsBlocks.js";
import { Skeleton } from "../../../components/Skeleton.js";
import { useToast } from "../../../components/Toast.js";
import {
  greetingName,
  setAccountProfile,
  syncEmailNames,
  useAccountProfile,
} from "../../../lib/account-profile.js";
import { errorMessage } from "../../../lib/api.js";
import { isDemoMode } from "../../../lib/demo.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { ChangeEmailDialog } from "./ChangeEmailDialog.js";

type Editing = "name" | "preferred" | "email" | null;

/** Tu cuenta → Perfil (ADR 023): name, preferred name and email. */
export function ProfilePage() {
  const { session } = useWorkspace();
  const { profile, error, reload } = useAccountProfile(session.user.id);
  const [editing, setEditing] = useState<Editing>(null);

  return (
    <>
      <SettingsIntro
        description="Tus datos te siguen en todas tus organizaciones y en cualquier dispositivo."
        title="Perfil"
      />
      {error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {error}
        </Notice>
      ) : !profile ? (
        <Skeleton lines={3} />
      ) : (
        <SettingsGroup id="profile-data" title="Tus datos">
          <SettingsRow
            action={
              <ChangeButton
                label="Cambiar nombre"
                onClick={() => setEditing("name")}
              />
            }
            description="Así te ven las personas de tus organizaciones."
            label="Nombre"
            value={
              profile.displayName || <span className="muted">Sin nombre</span>
            }
          />
          <SettingsRow
            action={
              <ChangeButton
                label="Cambiar nombre preferido"
                onClick={() => setEditing("preferred")}
              />
            }
            description="Cómo te saluda Kardo en el panel y en los correos."
            label="Nombre preferido"
            value={
              profile.preferredName ? (
                profile.preferredName
              ) : (
                <span className="muted">
                  {greetingName(profile)
                    ? `Sin definir: te saludamos como «${greetingName(profile)}»`
                    : "Sin definir"}
                </span>
              )
            }
          />
          <SettingsRow
            action={
              <ChangeButton
                label="Cambiar correo"
                onClick={() => setEditing("email")}
              />
            }
            description="Con él entras a Kardo y te llegan los avisos de tu cuenta."
            label="Correo"
            value={profile.email}
          />
        </SettingsGroup>
      )}

      {profile ? (
        <>
          <EditTextDialog
            description="Tu nombre completo, como quieres que te vea tu equipo."
            initial={profile.displayName ?? ""}
            label="Nombre"
            maxLength={PROFILE_LIMITS.displayName}
            onClose={() => setEditing(null)}
            open={editing === "name"}
            save={async (value) => {
              const saved = await profileApi.update({ displayName: value });
              void syncEmailNames({ display_name: saved.displayName });
              return saved;
            }}
            title="Cambiar nombre"
          />
          <EditTextDialog
            clearLabel={profile.preferredName ? "Quitar" : undefined}
            description="Por ejemplo, «Mari» o «Doctor Ruiz». Así te saluda Kardo en el panel y en los correos."
            initial={profile.preferredName ?? ""}
            label="Nombre preferido"
            maxLength={PROFILE_LIMITS.preferredName}
            onClear={async () => {
              const saved = await profileApi.update({ preferredName: null });
              void syncEmailNames({ preferred_name: null });
              return saved;
            }}
            onClose={() => setEditing(null)}
            open={editing === "preferred"}
            save={async (value) => {
              const saved = await profileApi.update({ preferredName: value });
              void syncEmailNames({
                preferred_name: saved.preferredName ?? null,
              });
              return saved;
            }}
            title="Cambiar nombre preferido"
          />
          <ChangeEmailDialog
            currentEmail={profile.email}
            onClose={() => setEditing(null)}
            onDone={() => void reload()}
            open={editing === "email" && !isDemoMode}
          />
          <Dialog
            description="En el modo de demostración no se cambia el correo."
            footer={
              <button
                className="button button-primary"
                onClick={() => setEditing(null)}
                type="button"
              >
                Entendido
              </button>
            }
            onClose={() => setEditing(null)}
            open={editing === "email" && isDemoMode}
            title="Cambiar correo"
          />
        </>
      ) : null}
    </>
  );
}

export function ChangeButton({
  label,
  onClick,
  text = "Cambiar",
}: {
  /** Accessible name: «Cambiar» alone is ambiguous in a list of rows. */
  label: string;
  onClick: () => void;
  text?: string;
}) {
  return (
    <button
      aria-label={label}
      className="button button-secondary button-small"
      onClick={onClick}
      type="button"
    >
      {text}
    </button>
  );
}

/** One text value, edited in its own dialog and saved on its own. */
function EditTextDialog({
  open,
  title,
  description,
  label,
  initial,
  maxLength,
  save,
  onClose,
  clearLabel,
  onClear,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  initial: string;
  maxLength: number;
  save: (value: string) => Promise<CustomerProfile>;
  onClose: () => void;
  clearLabel?: string | undefined;
  onClear?: (() => Promise<CustomerProfile>) | undefined;
}) {
  const { notify } = useToast();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initial);
      setError(null);
    }
  }, [open, initial]);

  async function run(action: () => Promise<CustomerProfile>) {
    setIsSaving(true);
    setError(null);
    try {
      setAccountProfile(await action());
      notify("Listo, guardamos el cambio.");
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    void run(() => save(trimmed));
  }

  const formId = `${title.replace(/\s+/g, "-").toLowerCase()}-form`;
  return (
    <Dialog
      description={description}
      footer={
        <>
          {clearLabel && onClear ? (
            <button
              className="button button-ghost settings-dialog-start"
              disabled={isSaving}
              onClick={() => void run(onClear)}
              type="button"
            >
              {clearLabel}
            </button>
          ) : null}
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
            disabled={isSaving || !value.trim() || value.trim() === initial}
            form={formId}
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    >
      <form className="dialog-form" id={formId} onSubmit={submit}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field
          counter={{ value: value.length, max: maxLength }}
          id={`${formId}-value`}
          label={label}
        >
          <input
            autoComplete={label === "Nombre" ? "name" : "nickname"}
            id={`${formId}-value`}
            maxLength={maxLength}
            onChange={(event) => setValue(event.target.value)}
            required
            value={value}
          />
        </Field>
      </form>
    </Dialog>
  );
}
