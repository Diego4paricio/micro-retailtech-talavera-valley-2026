import {
  ACCOUNT_DELETION_PHRASE,
  type AccountDeletionCheck,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { accountApi } from "../../../api/account.js";
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
import { errorMessage } from "../../../lib/api.js";
import { isDemoMode } from "../../../lib/demo.js";
import { downloadFile } from "../../../lib/download.js";
import { Link } from "../../../lib/router.js";
import { supabase } from "../../../supabase.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { useReauthenticate } from "./use-reauthenticate.js";

/** Shown once on the sign-in screen after the account is gone. */
export const ACCOUNT_DELETED_KEY = "kardo.accountDeleted";

const blockerText: Record<
  AccountDeletionCheck["blockers"][number]["kind"],
  (name: string | null) => string
> = {
  owner_with_team: (name) =>
    `Eres el único Owner de «${name ?? ""}», que tiene más personas. Transfiere la propiedad en Configuración, Equipo, o deja a otra persona como Owner.`,
  open_subscription: (name) =>
    `«${name ?? ""}» tiene una suscripción activa. Cancélala en Plan y facturación y espera a que termine el periodo pagado.`,
  internal: (name) =>
    `«${name ?? ""}» es un espacio interno de Kardo y no se borra desde aquí.`,
  staff: () =>
    "Tu cuenta también es del equipo de Kardo y no se borra desde aquí.",
};

/** Tu cuenta → Tus datos (ADR 023): your data, and deleting your account. */
export function DataPage() {
  const { notify } = useToast();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function download() {
    setExporting(true);
    try {
      const data = await accountApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      downloadFile(
        blob,
        `kardo-mis-datos-${data.exportedAt.slice(0, 10)}.json`,
      );
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <SettingsIntro
        description="Descarga lo que Kardo guarda de ti, o borra tu cuenta."
        title="Tus datos"
      />
      <SettingsGroup
        description={
          <>
            Lo de cada organización (QR y etiquetas, páginas, solicitudes) se
            descarga en{" "}
            <Link to={{ name: "settings", section: "organizacion" }}>
              Configuración, General
            </Link>
            .
          </>
        }
        id="data-export"
        title="Exportar mis datos"
      >
        <SettingsRow
          action={
            <button
              aria-busy={exporting || undefined}
              className="button button-secondary button-small"
              disabled={exporting || isDemoMode}
              onClick={() => void download()}
              type="button"
            >
              {exporting ? "Preparando…" : "Descargar"}
            </button>
          }
          description="Perfil, preferencias, organizaciones y roles, métodos de verificación, sesiones e inicios de sesión de 90 días, en un archivo JSON."
          label="Tu información personal"
        />
      </SettingsGroup>
      <SettingsGroup id="data-delete" title="Borrar mi cuenta">
        <SettingsRow
          action={
            <button
              className="button button-danger-quiet button-small"
              disabled={isDemoMode}
              onClick={() => setDeleting(true)}
              type="button"
            >
              Borrar mi cuenta
            </button>
          }
          description="Borra tu cuenta, tu espacio personal y las organizaciones donde eres la única persona. No se puede deshacer."
          label="Borrar para siempre"
          tone="danger"
        />
      </SettingsGroup>
      <DeleteAccountDialog onClose={() => setDeleting(false)} open={deleting} />
    </>
  );
}

function DeleteAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { session } = useWorkspace();
  const [check, setCheck] = useState<AccountDeletionCheck | null>(null);
  const {
    factorId,
    confirm: reauthenticate,
    failureMessage,
  } = useReauthenticate({
    email: session.user.email ?? "",
    open,
  });
  const [secret, setSecret] = useState("");
  const [phrase, setPhrase] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCheck(null);
    setSecret("");
    setPhrase("");
    setNotice(null);
    const controller = new AbortController();
    void accountApi
      .deletionCheck(controller.signal)
      .then(setCheck, (error: unknown) => setNotice(errorMessage(error)));
    return () => controller.abort();
  }, [open]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsBusy(true);
    setNotice(null);
    // The authenticator code, or the password, without signing in again.
    if (!(await reauthenticate(secret))) {
      setIsBusy(false);
      setSecret("");
      setNotice(failureMessage);
      return;
    }
    try {
      await accountApi.deleteAccount();
      try {
        window.sessionStorage.setItem(ACCOUNT_DELETED_KEY, "1");
      } catch {
        // The sign-in screen just will not say it.
      }
      await supabase.auth.signOut({ scope: "local" });
    } catch (requestError) {
      setIsBusy(false);
      setNotice(errorMessage(requestError));
    }
  }

  const blocked = (check?.blockers.length ?? 0) > 0;
  return (
    <Dialog
      description={
        blocked
          ? "Antes de borrar tu cuenta hay que resolver esto:"
          : "No se puede deshacer. Conservamos solo lo que la ley nos pide, como las constancias de cobro y las facturas."
      }
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            {blocked ? "Entendido" : "Cancelar"}
          </button>
          {check && !blocked ? (
            <button
              aria-busy={isBusy || undefined}
              className="button button-danger"
              disabled={
                isBusy ||
                factorId === undefined ||
                phrase.trim() !== ACCOUNT_DELETION_PHRASE ||
                (factorId ? secret.length !== 6 : !secret)
              }
              form="delete-account-form"
              type="submit"
            >
              {isBusy ? "Borrando…" : "Borrar mi cuenta"}
            </button>
          ) : null}
        </>
      }
      onClose={onClose}
      open={open}
      title="Borrar mi cuenta"
      tone="danger"
    >
      {notice ? <Notice tone="danger">{notice}</Notice> : null}
      {!check ? (
        notice ? null : (
          <Skeleton lines={3} />
        )
      ) : blocked ? (
        <ul className="delete-account-list">
          {check.blockers.map((blocker) => (
            <li key={`${blocker.kind}:${blocker.workspaceId ?? ""}`}>
              {blockerText[blocker.kind](blocker.name)}
            </li>
          ))}
        </ul>
      ) : (
        <form
          className="dialog-form"
          id="delete-account-form"
          onSubmit={confirm}
        >
          <div>
            <p className="dialog-done">Se borra contigo:</p>
            <ul className="delete-account-list">
              {check.erase.map((space) => (
                <li key={space.workspaceId}>
                  {space.kind === "personal"
                    ? "Tu espacio personal, con todo su contenido."
                    : `La organización «${space.name}», con sus QR y etiquetas, páginas, archivos y solicitudes. Sus QR dejarán de funcionar.`}
                </li>
              ))}
              <li>
                Tu lugar en las demás organizaciones. Lo que hiciste ahí se
                queda, sin tu nombre.
              </li>
            </ul>
          </div>
          {factorId ? (
            <Field
              hint="Abre tu app de autenticación."
              id="delete-account-code"
              label="Código de 6 dígitos"
            >
              <input
                autoComplete="one-time-code"
                className="verification-code"
                id="delete-account-code"
                inputMode="numeric"
                onChange={(event) =>
                  setSecret(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                value={secret}
              />
            </Field>
          ) : (
            <Field id="delete-account-password" label="Tu contraseña">
              <input
                autoComplete="current-password"
                id="delete-account-password"
                onChange={(event) => setSecret(event.target.value)}
                type="password"
                value={secret}
              />
            </Field>
          )}
          <Field
            hint={`Escribe ${ACCOUNT_DELETION_PHRASE} para confirmar.`}
            id="delete-account-phrase"
            label="Confirmación"
          >
            <input
              autoComplete="off"
              id="delete-account-phrase"
              onChange={(event) => setPhrase(event.target.value)}
              value={phrase}
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}
