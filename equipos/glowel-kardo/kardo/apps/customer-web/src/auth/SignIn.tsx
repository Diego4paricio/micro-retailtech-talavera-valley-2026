import { type FormEvent, useEffect, useState } from "react";
import { legalLinks } from "../features/legal/legal-links.js";
import { writePendingMark } from "../features/legal/terms-model.js";
import { authErrorNotice } from "../lib/auth-errors.js";
import { writeRegistrationStage } from "../lib/registration-stage.js";
import { supabase } from "../supabase.js";
import { AuthLayout, FormNotice } from "./AuthLayout.js";
import "../features/legal/legal.css";

type Mode = "sign-in" | "sign-up" | "recover";
type Step = "email" | "verify";

const copy: Record<Mode, Record<Step, { title: string; intro: string }>> = {
  "sign-in": {
    email: {
      title: "Hola de nuevo.",
      intro: "Entra con tu correo y tu contraseña.",
    },
    verify: { title: "", intro: "" },
  },
  "sign-up": {
    email: {
      title: "Crea tu cuenta.",
      intro: "Primero confirmamos tu correo. Después eliges tu contraseña.",
    },
    verify: {
      title: "Confirma tu correo.",
      intro: "Enviamos un código de verificación a",
    },
  },
  recover: {
    email: {
      title: "Recupera tu acceso.",
      intro:
        "Escribe el correo de tu cuenta. Te enviaremos un código para elegir una nueva contraseña.",
    },
    verify: {
      title: "Revisa tu correo.",
      intro: "Si existe una cuenta, enviamos un código de verificación a",
    },
  },
};

export function SignIn({
  onVerified,
  initialMode = "sign-in",
  invited = false,
}: {
  onVerified: (stage: "password" | "recovery") => void;
  initialMode?: "sign-in" | "sign-up";
  /** Opened from an invitation link (relevo 20, T3). */
  invited?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("email");
  // After «Borrar mi cuenta» (ADR 023), once.
  const [notice, setNotice] = useState<string | null>(() => {
    try {
      if (window.sessionStorage.getItem("kardo.accountDeleted") !== "1")
        return null;
      window.sessionStorage.removeItem("kardo.accountDeleted");
      return "Borramos tu cuenta y tus datos.";
    } catch {
      return null;
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (resendAfter === 0) return;
    const timer = window.setTimeout(
      () => setResendAfter((seconds) => Math.max(0, seconds - 1)),
      1_000,
    );
    return () => window.clearTimeout(timer);
  }, [resendAfter]);

  function switchMode(next: Mode) {
    if (next === "sign-in") writeRegistrationStage(null);
    setMode(next);
    setStep("email");
    setNotice(null);
    setCode("");
  }

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!supabase) return;
    if (mode === "sign-up") {
      if (!acceptedTerms) return;
      writePendingMark();
    }
    setIsSubmitting(true);
    setNotice(null);
    const result = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Recovery never creates an identity; registration does.
      options: { shouldCreateUser: mode === "sign-up" },
    });
    setIsSubmitting(false);
    // Recovery shows the same next step whether or not the account exists,
    // so the form cannot be used to discover registered emails.
    if (result.error && mode === "sign-up") {
      setNotice(authErrorNotice("sign-up", result.error.message));
      return;
    }
    if (
      result.error &&
      /rate|too many|security purposes/i.test(result.error.message)
    ) {
      setNotice(authErrorNotice("sign-in", result.error.message));
      return;
    }
    setStep("verify");
    setResendAfter(60);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSubmitting(true);
    setNotice(null);
    const result = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);
    if (result.error)
      setNotice(authErrorNotice("sign-in", result.error.message));
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSubmitting(true);
    setNotice(null);
    const stage = mode === "recover" ? "recovery" : "password";
    // Persist the pending stage before the session event re-renders the app.
    writeRegistrationStage(stage);
    const result = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setIsSubmitting(false);
    if (result.error) {
      writeRegistrationStage(null);
      setNotice(authErrorNotice("sign-up", result.error.message));
      return;
    }
    onVerified(stage);
  }

  const text = copy[mode][step];
  return (
    <AuthLayout formKey={`${mode}-${step}`}>
      <h2>{text.title}</h2>
      {invited && step === "email" && mode !== "recover" ? (
        <p className="auth-intro">
          Te invitaron a un espacio de Kardo. Crea tu cuenta con el correo de la
          invitación o, si ya tienes una, inicia sesión.
        </p>
      ) : null}
      <p className="auth-intro">
        {text.intro}
        {step === "verify" ? (
          <>
            {" "}
            <strong>{email}</strong>. Escríbelo aquí para continuar.
          </>
        ) : null}
      </p>

      {mode === "sign-in" ? (
        <form className="auth-form" onSubmit={submitLogin}>
          <label htmlFor="email">Correo electrónico</label>
          <input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@correo.com"
            required
            type="email"
            value={email}
          />
          <div className="auth-label-row">
            <label htmlFor="password">Contraseña</label>
            <button
              className="link-button"
              onClick={() => switchMode("recover")}
              type="button"
            >
              ¿La olvidaste?
            </button>
          </div>
          <input
            autoComplete="current-password"
            id="password"
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <FormNotice>{notice}</FormNotice>
          <button
            className="button button-primary"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>
      ) : step === "email" ? (
        <form className="auth-form" onSubmit={sendCode}>
          <label htmlFor="email">Correo electrónico</label>
          <input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@correo.com"
            required
            type="email"
            value={email}
          />
          {mode === "sign-up" ? (
            <label className="legal-check" htmlFor="accept-terms">
              <input
                checked={acceptedTerms}
                id="accept-terms"
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                required
                type="checkbox"
              />
              <span>
                Acepto los{" "}
                <a
                  href={legalLinks().terms}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Términos y Condiciones
                </a>{" "}
                y el{" "}
                <a
                  href={legalLinks().privacy}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Aviso de Privacidad
                </a>{" "}
                de Kardo.
              </span>
            </label>
          ) : null}
          <FormNotice>{notice}</FormNotice>
          <button
            className="button button-primary"
            disabled={isSubmitting || (mode === "sign-up" && !acceptedTerms)}
            type="submit"
          >
            {isSubmitting ? "Enviando…" : "Enviar código"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <label htmlFor="verification-code">Código de verificación</label>
          <input
            autoComplete="one-time-code"
            className="verification-code"
            id="verification-code"
            inputMode="numeric"
            maxLength={10}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            pattern="[0-9]{6,10}"
            placeholder="••••••"
            required
            value={code}
          />
          <FormNotice>{notice}</FormNotice>
          <button
            className="button button-primary"
            disabled={isSubmitting || code.length < 6}
            type="submit"
          >
            {isSubmitting ? "Comprobando…" : "Continuar"}
          </button>
          <button
            className="mode-switch"
            disabled={isSubmitting || resendAfter > 0}
            onClick={() => void sendCode()}
            type="button"
          >
            {resendAfter > 0
              ? `Reenviar código en ${resendAfter}s`
              : "Reenviar código"}
          </button>
          <button
            className="mode-switch mode-switch-secondary"
            onClick={() => {
              setStep("email");
              setNotice(null);
              setCode("");
            }}
            type="button"
          >
            Usar otro correo
          </button>
        </form>
      )}

      <button
        className="mode-switch"
        onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        type="button"
      >
        {mode === "sign-in"
          ? "¿Aún no tienes cuenta? Crear una"
          : mode === "recover"
            ? "Volver a iniciar sesión"
            : "¿Ya tienes cuenta? Iniciar sesión"}
      </button>
    </AuthLayout>
  );
}
