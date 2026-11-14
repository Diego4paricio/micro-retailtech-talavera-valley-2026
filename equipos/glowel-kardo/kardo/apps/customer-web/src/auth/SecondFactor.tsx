import type { Factor } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { AuthLayout, FormNotice } from "./AuthLayout.js";

/**
 * The second step of signing in when the account has an authenticator app
 * (relevo 28). It runs after any first step: password, or the email code of
 * registration and recovery. Verifying upgrades the session to aal2; the
 * access gate hears it and lets the person in. The Customer API refuses aal1
 * tokens of these accounts, so skipping this screen opens nothing.
 */
export function SecondFactor() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    // listFactors asks Supabase for the current user, so a factor added on
    // another device shows up here too.
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setNotice("No pudimos preparar la verificación. Intenta de nuevo.");
        setFactors([]);
        return;
      }
      setFactors(data.totp);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const factor = factors?.[0] ?? null;

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factor) return;
    setIsSubmitting(true);
    setNotice(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: code.trim(),
    });
    setIsSubmitting(false);
    if (error) {
      setCode("");
      setNotice(
        /rate|too many/i.test(error.message)
          ? "Hiciste demasiados intentos. Espera unos minutos antes de volver a intentarlo."
          : "El código no es válido o ya cambió. Escribe el que muestra tu app ahora.",
      );
    }
  }

  return (
    <AuthLayout>
      <h2>Verificación en dos pasos.</h2>
      <p className="auth-intro">
        Abre tu app de autenticación y escribe el código de 6 dígitos de Kardo.
      </p>
      {factors !== null && !factor ? (
        <div className="auth-form">
          <FormNotice>
            {notice ??
              "Tu cuenta pide un segundo paso que este panel no reconoce. Entra con otra cuenta o vuelve a intentarlo."}
          </FormNotice>
        </div>
      ) : (
        <form className="auth-form" onSubmit={verify}>
          <label htmlFor="second-factor-code">Código de verificación</label>
          <input
            autoComplete="one-time-code"
            className="verification-code"
            disabled={factors === null}
            id="second-factor-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            pattern="[0-9]{6}"
            placeholder="••••••"
            required
            value={code}
          />
          <FormNotice>{notice}</FormNotice>
          <button
            className="button button-primary"
            disabled={isSubmitting || !factor || code.length !== 6}
            type="submit"
          >
            {isSubmitting ? "Comprobando…" : "Continuar"}
          </button>
        </form>
      )}
      <button
        className="mode-switch"
        onClick={() => void supabase?.auth.signOut({ scope: "local" })}
        type="button"
      >
        Entrar con otra cuenta
      </button>
    </AuthLayout>
  );
}
