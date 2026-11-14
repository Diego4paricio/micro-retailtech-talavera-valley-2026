import type { Factor } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { Dialog } from "../../../components/Dialog.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import { SettingsRow, StatusText } from "../../../components/SettingsBlocks.js";
import { StepTrack } from "../../../components/StepTrack.js";
import { useToast } from "../../../components/Toast.js";
import { isDemoMode } from "../../../lib/demo.js";
import { formatDate } from "../../../lib/format.js";
import { supabase } from "../../../supabase.js";

type Enrollment = {
  factorId: string;
  qrDataUri: string;
  secret: string;
};

type View = "list" | "name" | "scan" | "remove";

/** supabase-js returns the QR as a `data:image/svg+xml` URI; only a raw SVG
 * (older clients) needs the prefix. Anything else is not rendered. */
function toQrDataUri(qrCode: string): string {
  if (qrCode.startsWith("data:image/svg+xml")) return qrCode;
  if (qrCode.trimStart().startsWith("<svg"))
    return `data:image/svg+xml;utf-8,${encodeURIComponent(qrCode)}`;
  return "";
}

function suggestedName(count: number): string {
  if (count === 0) return "App de autenticación";
  if (count === 1) return "App de respaldo";
  return `App ${count + 1}`;
}

/**
 * Verificación en dos pasos (ADR 023): TOTP apps, several of them so a
 * backup exists (Supabase gives no recovery codes). Enrolling verifies the
 * first code, which upgrades this session to aal2; from then on every sign
 * in asks for a code and the Customer API refuses aal1 tokens.
 */
export function TwoFactorDialog({
  open,
  factors,
  onClose,
  onChanged,
}: {
  open: boolean;
  factors: Factor[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [view, setView] = useState<View>("list");
  const [name, setName] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [target, setTarget] = useState<Factor | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Only when it opens: a list refreshed behind it must not reset a step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!open) return;
    setView(factors.length === 0 ? "name" : "list");
    setName(suggestedName(factors.length));
    setEnrollment(null);
    setCode("");
    setTarget(null);
    setNotice(null);
  }, [open]);

  async function discardEnrollment() {
    if (supabase && enrollment)
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
  }

  async function close() {
    await discardEnrollment();
    onClose();
  }

  async function startEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsBusy(true);
    setNotice(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: name.trim(),
    });
    setIsBusy(false);
    if (error || !data) {
      setNotice(
        /friendly name|already exists/i.test(error?.message ?? "")
          ? "Ya tienes una app con ese nombre. Elige otro."
          : "No pudimos preparar la app. Intenta de nuevo.",
      );
      return;
    }
    setEnrollment({
      factorId: data.id,
      qrDataUri: toQrDataUri(data.totp.qr_code),
      secret: data.totp.secret,
    });
    setCode("");
    setView("scan");
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !enrollment) return;
    setIsBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code,
    });
    setIsBusy(false);
    if (error) {
      setCode("");
      setNotice(
        "El código no es válido o ya cambió. Escribe el que muestra tu app ahora.",
      );
      return;
    }
    notify(
      factors.length === 0
        ? "Verificación en dos pasos activada."
        : "Agregamos tu app de respaldo.",
    );
    setEnrollment(null);
    onChanged();
    onClose();
  }

  async function remove() {
    if (!supabase || !target) return;
    setIsBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: target.id });
    setIsBusy(false);
    if (error) {
      setNotice("No pudimos quitar esta app. Intenta de nuevo.");
      return;
    }
    notify(
      factors.length === 1
        ? "Desactivamos la verificación en dos pasos."
        : "Quitamos esa app.",
    );
    onChanged();
    onClose();
  }

  const title =
    view === "remove"
      ? "Quitar app"
      : factors.length === 0
        ? "Activar la verificación en dos pasos"
        : view === "list"
          ? "Verificación en dos pasos"
          : "Agregar app de respaldo";

  const footer =
    view === "list" ? (
      <>
        <button
          className="button button-secondary"
          onClick={() => void close()}
          type="button"
        >
          Cerrar
        </button>
        <button
          className="button button-primary"
          onClick={() => {
            setName(suggestedName(factors.length));
            setView("name");
          }}
          type="button"
        >
          Agregar app de respaldo
        </button>
      </>
    ) : view === "remove" ? (
      <>
        <button
          className="button button-secondary"
          onClick={() => setView("list")}
          type="button"
        >
          Cancelar
        </button>
        <button
          aria-busy={isBusy || undefined}
          className="button button-danger"
          disabled={isBusy}
          onClick={() => void remove()}
          type="button"
        >
          {factors.length === 1 ? "Quitar y desactivar" : "Quitar"}
        </button>
      </>
    ) : (
      <>
        <button
          className="button button-secondary"
          onClick={() => void close()}
          type="button"
        >
          Cancelar
        </button>
        <button
          aria-busy={isBusy || undefined}
          className="button button-primary"
          disabled={
            isBusy ||
            (view === "name" && !name.trim()) ||
            (view === "scan" && code.length !== 6)
          }
          form={`two-factor-${view}`}
          type="submit"
        >
          {isBusy ? "Comprobando…" : view === "name" ? "Continuar" : "Activar"}
        </button>
      </>
    );

  return (
    <Dialog
      description={
        isDemoMode
          ? "No disponible en el modo de demostración."
          : view === "list"
            ? "Kardo no da códigos de recuperación: con una segunda app (en otro teléfono o en tu gestor de contraseñas) no te quedas fuera si pierdes la primera."
            : view === "remove"
              ? factors.length === 1
                ? "Es tu única app: al quitarla, entrarás solo con tu contraseña."
                : "Podrás seguir entrando con tus otras apps."
              : "Usa Google Authenticator, Microsoft Authenticator, 1Password o la app que prefieras."
      }
      footer={isDemoMode ? undefined : footer}
      onClose={() => void close()}
      open={open}
      size={view === "scan" ? "large" : "medium"}
      title={title}
    >
      {isDemoMode ? null : (
        <>
          {view === "name" || view === "scan" ? (
            <StepTrack
              current={view === "name" ? 0 : 1}
              items={[
                { label: "Nombre", done: view === "scan" },
                { label: "Escanear y verificar", done: false },
              ]}
              label="Pasos para activar la verificación"
            />
          ) : null}
          {notice ? <Notice tone="danger">{notice}</Notice> : null}

          {view === "list" ? (
            <div className="settings-rows">
              {factors.map((factor) => (
                <SettingsRow
                  action={
                    <button
                      aria-label={`Quitar ${factor.friendly_name ?? "esta app"}`}
                      className="text-action"
                      onClick={() => {
                        setTarget(factor);
                        setView("remove");
                      }}
                      type="button"
                    >
                      Quitar
                    </button>
                  }
                  description={`Agregada el ${formatDate(factor.created_at)}`}
                  key={factor.id}
                  label={factor.friendly_name ?? "App de autenticación"}
                  value={<StatusText tone="on">Activa</StatusText>}
                />
              ))}
            </div>
          ) : null}

          {view === "name" ? (
            <form
              className="dialog-form"
              id="two-factor-name"
              onSubmit={startEnrollment}
            >
              <Field
                hint="Para reconocerla después, por ejemplo «Teléfono de Ana»."
                id="two-factor-app-name"
                label="Nombre de la app"
              >
                <input
                  id="two-factor-app-name"
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </Field>
            </form>
          ) : null}

          {view === "scan" && enrollment ? (
            <form
              className="dialog-form two-factor-scan"
              id="two-factor-scan"
              onSubmit={confirmEnrollment}
            >
              <ol className="two-factor-steps">
                <li>Escanea este código con tu app.</li>
                <li>Escribe el código de 6 dígitos que te muestra.</li>
              </ol>
              <div className="two-factor-scan-body">
                {enrollment.qrDataUri ? (
                  <img
                    alt="Código QR para tu app de autenticación"
                    className="two-factor-qr-image"
                    src={enrollment.qrDataUri}
                  />
                ) : null}
                <div className="dialog-form">
                  <Field
                    hint="Si no puedes escanear, escribe esta clave en tu app."
                    id="two-factor-secret"
                    label="Clave manual"
                  >
                    <input
                      className="two-factor-secret"
                      id="two-factor-secret"
                      readOnly
                      value={enrollment.secret}
                    />
                  </Field>
                  <Field id="two-factor-code" label="Código de 6 dígitos">
                    <input
                      autoComplete="one-time-code"
                      className="verification-code"
                      id="two-factor-code"
                      inputMode="numeric"
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      value={code}
                    />
                  </Field>
                </div>
              </div>
            </form>
          ) : null}

          {view === "remove" && target ? (
            <p className="dialog-done">
              Vas a quitar <strong>{target.friendly_name ?? "esta app"}</strong>
              .
            </p>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
