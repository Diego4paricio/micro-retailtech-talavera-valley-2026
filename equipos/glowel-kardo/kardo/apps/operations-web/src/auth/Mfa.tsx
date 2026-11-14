import { type FormEvent, useEffect, useState } from "react";
import { Icon } from "../components/Icon.js";
import { supabase } from "../supabase.js";
import { AuthLayout, FormNotice } from "./AuthLayout.js";

/**
 * A verified TOTP factor already exists: challenge it. Supabase's
 * `challengeAndVerify` combines the challenge + verify round trip; on success
 * the session is upgraded to `aal2` and `onAuthStateChange` fires.
 */
export function TotpChallenge({ factorId }: { factorId: string }) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSubmitting(true);
    setNotice(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });
    setIsSubmitting(false);
    if (error) setNotice("Código inválido o expirado. Intenta de nuevo.");
  }

  return (
    <AuthLayout
      body="Ingresa el código de 6 dígitos de tu aplicación de autenticación."
      eyebrow="Kardo Operations"
      headline="Verifica tu identidad."
    >
      <p className="eyebrow">Segundo factor</p>
      <h2>Código de verificación</h2>
      <p className="auth-intro">
        Abre tu aplicación de autenticación (Google Authenticator, 1Password,
        Authy…) y escribe el código actual.
      </p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="totp-code">Código de 6 dígitos</label>
        <input
          autoComplete="one-time-code"
          className="verification-code"
          id="totp-code"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          pattern="[0-9]{6}"
          placeholder="••••••"
          required
          value={code}
        />
        <FormNotice>{notice}</FormNotice>
        <button
          className="button button-primary"
          disabled={isSubmitting || code.length !== 6}
          type="submit"
        >
          {isSubmitting ? "Comprobando…" : "Verificar"}
        </button>
      </form>
      <button
        className="mode-switch"
        onClick={() => void supabase?.auth.signOut()}
        type="button"
      >
        Usar otra cuenta
      </button>
    </AuthLayout>
  );
}

type EnrollData = { factorId: string; qrCode: string; secret: string };

/** No verified TOTP factor exists yet: enroll one before granting access. */
export function TotpEnroll() {
  const [enrollment, setEnrollment] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: enroll exactly once, on mount
  useEffect(() => {
    void start();
  }, []);

  async function start() {
    if (!supabase) return;
    setIsStarting(true);
    setNotice(null);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `kardo-operations-${Date.now()}`,
    });
    setIsStarting(false);
    if (error || !data) {
      setNotice("No pudimos iniciar el registro de MFA. Intenta de nuevo.");
      return;
    }
    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !enrollment) return;
    setIsSubmitting(true);
    setNotice(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: code.trim(),
    });
    setIsSubmitting(false);
    if (error)
      setNotice("Código inválido. Verifica la hora de tu dispositivo.");
  }

  return (
    <AuthLayout
      body="Kardo Operations exige un segundo factor para todo el personal. Regístralo una sola vez."
      eyebrow="Kardo Operations"
      headline="Activa la verificación en dos pasos."
    >
      <p className="eyebrow">Segundo factor obligatorio</p>
      <h2>Registra tu aplicación de autenticación</h2>
      {isStarting ? (
        <p className="auth-intro" role="status">
          Generando tu código QR…
        </p>
      ) : enrollment ? (
        <>
          <p className="auth-intro">
            Escanea este código con Google Authenticator, 1Password o Authy. Si
            no puedes escanearlo, escribe la clave manualmente.
          </p>
          <div className="totp-enroll-qr">
            <img
              alt="Código QR para registrar la aplicación de autenticación"
              height={176}
              src={enrollment.qrCode}
              width={176}
            />
            <code className="totp-secret">{enrollment.secret}</code>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="enroll-code">Código de 6 dígitos</label>
            <input
              autoComplete="one-time-code"
              className="verification-code"
              id="enroll-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              pattern="[0-9]{6}"
              placeholder="••••••"
              required
              value={code}
            />
            <FormNotice>{notice}</FormNotice>
            <button
              className="button button-primary"
              disabled={isSubmitting || code.length !== 6}
              type="submit"
            >
              {isSubmitting ? "Verificando…" : "Activar y continuar"}
            </button>
          </form>
        </>
      ) : (
        <>
          <FormNotice>{notice}</FormNotice>
          <button
            className="button button-primary"
            onClick={() => void start()}
            type="button"
          >
            <Icon name="refresh" /> Reintentar
          </button>
        </>
      )}
      <button
        className="mode-switch"
        onClick={() => void supabase?.auth.signOut()}
        type="button"
      >
        Usar otra cuenta
      </button>
    </AuthLayout>
  );
}
