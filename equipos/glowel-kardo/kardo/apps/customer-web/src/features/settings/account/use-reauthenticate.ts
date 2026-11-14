import { useCallback, useEffect, useState } from "react";
import { supabase, verifyPassword } from "../../../supabase.js";

/** What to say when «Confirma que eres tú» fails. */
export function reauthenticationProblem(usesCode: boolean): string {
  return usesCode
    ? "El código no es válido o ya cambió. Escribe el que muestra tu app ahora."
    : "La contraseña no es correcta.";
}

/**
 * «Confirma que eres tú», in one place (domain audit 2026-10-13, A2-14):
 * borrar la cuenta, cambiar el correo y cambiar la contraseña lo escribían
 * cada uno a su manera, y el primero iniciaba sesión otra vez en el cliente
 * principal (registrando un inicio de sesión nuevo). With 2FA the
 * authenticator code confirms it; otherwise the password, checked by the
 * throwaway client of `verifyPassword`, never this tab's session.
 *
 * `usesCode` is `undefined` while the factors load, then true or false.
 * Pass `secondFactor: false` to always ask for the password.
 */
export function useReauthenticate({
  email,
  open,
  secondFactor = true,
}: {
  email: string;
  open: boolean;
  secondFactor?: boolean;
}) {
  const [factorId, setFactorId] = useState<string | null | undefined>(
    secondFactor ? undefined : null,
  );

  useEffect(() => {
    if (!open) return;
    if (!secondFactor || !supabase) {
      setFactorId(null);
      return;
    }
    setFactorId(undefined);
    let current = true;
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      if (current) setFactorId(data?.totp[0]?.id ?? null);
    });
    return () => {
      current = false;
    };
  }, [open, secondFactor]);

  const confirm = useCallback(
    async (secret: string): Promise<boolean> => {
      if (factorId) {
        if (!supabase) return false;
        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code: secret,
        });
        return !error;
      }
      return verifyPassword(email, secret);
    },
    [factorId, email],
  );

  return {
    factorId,
    /** True when the code of the authenticator app is asked, not the password. */
    usesCode: factorId === undefined ? undefined : factorId !== null,
    confirm,
    failureMessage: reauthenticationProblem(Boolean(factorId)),
  };
}
