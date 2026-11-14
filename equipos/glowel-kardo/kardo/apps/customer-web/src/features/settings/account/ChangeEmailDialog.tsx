import { type FormEvent, useEffect, useState } from "react";
import { Dialog } from "../../../components/Dialog.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import { StepTrack } from "../../../components/StepTrack.js";
import { useToast } from "../../../components/Toast.js";
import { authErrorNotice } from "../../../lib/auth-errors.js";
import { supabase } from "../../../supabase.js";
import { useReauthenticate } from "./use-reauthenticate.js";

type Step = "identity" | "email" | "codes" | "done";

const stepLabels: { step: Exclude<Step, "done">; label: string }[] = [
  { step: "identity", label: "Confirma que eres tú" },
  { step: "email", label: "Correo nuevo" },
  { step: "codes", label: "Códigos" },
];

function digits(value: string, max: number) {
  return value.replace(/\D/g, "").slice(0, max);
}

/**
 * Changing the email is possible but deliberate (ADR 023): confirm it is
 * you (password, or the authenticator code with 2FA), then Supabase sends a
 * code to the current address and another to the new one
 * (`double_confirm_changes`), and both must be entered here. Supabase then
 * warns the old address that it changed.
 */
export function ChangeEmailDialog({
  open,
  currentEmail,
  onClose,
  onDone,
}: {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [step, setStep] = useState<Step>("identity");
  const { factorId, confirm, failureMessage } = useReauthenticate({
    email: currentEmail,
    open,
  });
  const [secret, setSecret] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);

  useEffect(() => {
    if (!open || !supabase) return;
    setStep("identity");
    setSecret("");
    setNewEmail("");
    setCurrentCode("");
    setNewCode("");
    setNotice(null);
  }, [open]);

  useEffect(() => {
    if (resendAfter === 0) return;
    const timer = window.setTimeout(
      () => setResendAfter((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendAfter]);

  async function confirmIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsBusy(true);
    setNotice(null);
    // With 2FA the authenticator code confirms it is you; else the password.
    const confirmed = await confirm(secret);
    setIsBusy(false);
    if (!confirmed) {
      setNotice(failureMessage);
      setSecret("");
      return;
    }
    setSecret("");
    setStep("email");
  }

  async function sendCodes(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!supabase) return;
    const email = newEmail.trim().toLowerCase();
    if (email === currentEmail.toLowerCase()) {
      setNotice("Ese ya es tu correo.");
      return;
    }
    setIsBusy(true);
    setNotice(null);
    const { error } = await supabase.auth.updateUser({ email });
    setIsBusy(false);
    if (error) {
      setNotice(
        /already|exists|registered/i.test(error.message)
          ? "Ese correo ya tiene una cuenta en Kardo."
          : authErrorNotice("sign-up", error.message),
      );
      return;
    }
    setResendAfter(60);
    setStep("codes");
  }

  async function verifyCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const email = newEmail.trim().toLowerCase();
    setIsBusy(true);
    setNotice(null);
    const first = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: currentCode,
      type: "email_change",
    });
    if (first.error) {
      setIsBusy(false);
      setNotice(`El código de ${currentEmail} no es válido o expiró.`);
      return;
    }
    const second = await supabase.auth.verifyOtp({
      email,
      token: newCode,
      type: "email_change",
    });
    if (second.error) {
      setIsBusy(false);
      setNotice(`El código de ${email} no es válido o expiró.`);
      return;
    }
    // The new address travels in the token the Customer API reads.
    await supabase.auth.refreshSession();
    setIsBusy(false);
    setStep("done");
    notify("Tu correo cambió.");
    onDone();
  }

  const stepIndex = stepLabels.findIndex((entry) => entry.step === step);
  return (
    <Dialog
      description={
        step === "done"
          ? undefined
          : "Lo pedimos en tres pasos para que nadie más pueda cambiarlo."
      }
      footer={
        step === "done" ? (
          <button
            className="button button-primary"
            onClick={onClose}
            type="button"
          >
            Listo
          </button>
        ) : (
          <>
            <button
              className="button button-secondary"
              onClick={onClose}
              type="button"
            >
              Cancelar
            </button>
            <button
              aria-busy={isBusy || undefined}
              className="button button-primary"
              disabled={
                isBusy ||
                (step === "identity" &&
                  (factorId === undefined ||
                    (factorId ? secret.length !== 6 : !secret))) ||
                (step === "email" && !newEmail.trim()) ||
                (step === "codes" &&
                  (currentCode.length < 6 || newCode.length < 6))
              }
              form={`change-email-${step}`}
              type="submit"
            >
              {isBusy
                ? "Comprobando…"
                : step === "email"
                  ? "Enviar códigos"
                  : step === "codes"
                    ? "Cambiar correo"
                    : "Continuar"}
            </button>
          </>
        )
      }
      onClose={onClose}
      open={open}
      title="Cambiar correo"
    >
      {step !== "done" ? (
        <StepTrack
          current={stepIndex}
          items={stepLabels.map((entry, index) => ({
            label: entry.label,
            done: index < stepIndex,
          }))}
          label="Pasos para cambiar el correo"
        />
      ) : null}
      {notice ? <Notice tone="danger">{notice}</Notice> : null}

      {step === "identity" ? (
        <form
          className="dialog-form"
          id="change-email-identity"
          onSubmit={confirmIdentity}
        >
          {factorId ? (
            <Field
              hint="Abre tu app de autenticación."
              id="change-email-code"
              label="Código de 6 dígitos"
            >
              <input
                autoComplete="one-time-code"
                className="verification-code"
                id="change-email-code"
                inputMode="numeric"
                onChange={(event) => setSecret(digits(event.target.value, 6))}
                value={secret}
              />
            </Field>
          ) : (
            <Field id="change-email-password" label="Tu contraseña">
              <input
                autoComplete="current-password"
                id="change-email-password"
                onChange={(event) => setSecret(event.target.value)}
                type="password"
                value={secret}
              />
            </Field>
          )}
        </form>
      ) : null}

      {step === "email" ? (
        <form
          className="dialog-form"
          id="change-email-email"
          onSubmit={sendCodes}
        >
          <Field
            hint={`Te mandaremos un código a ${currentEmail} y otro al correo nuevo.`}
            id="change-email-new"
            label="Correo nuevo"
          >
            <input
              autoComplete="email"
              id="change-email-new"
              maxLength={320}
              onChange={(event) => setNewEmail(event.target.value)}
              type="email"
              value={newEmail}
            />
          </Field>
        </form>
      ) : null}

      {step === "codes" ? (
        <form
          className="dialog-form"
          id="change-email-codes"
          onSubmit={verifyCodes}
        >
          <Field
            id="change-email-current-code"
            label={`Código enviado a ${currentEmail}`}
          >
            <input
              autoComplete="one-time-code"
              className="verification-code"
              id="change-email-current-code"
              inputMode="numeric"
              onChange={(event) =>
                setCurrentCode(digits(event.target.value, 10))
              }
              value={currentCode}
            />
          </Field>
          <Field
            id="change-email-new-code"
            label={`Código enviado a ${newEmail.trim().toLowerCase()}`}
          >
            <input
              autoComplete="one-time-code"
              className="verification-code"
              id="change-email-new-code"
              inputMode="numeric"
              onChange={(event) => setNewCode(digits(event.target.value, 10))}
              value={newCode}
            />
          </Field>
          <button
            className="text-action"
            disabled={isBusy || resendAfter > 0}
            onClick={() => void sendCodes()}
            type="button"
          >
            {resendAfter > 0
              ? `Reenviar códigos en ${resendAfter} s`
              : "Reenviar códigos"}
          </button>
        </form>
      ) : null}

      {step === "done" ? (
        <p className="dialog-done">
          Desde ahora entras con{" "}
          <strong>{newEmail.trim().toLowerCase()}</strong>. Avisamos a{" "}
          {currentEmail} del cambio.
        </p>
      ) : null}
    </Dialog>
  );
}
