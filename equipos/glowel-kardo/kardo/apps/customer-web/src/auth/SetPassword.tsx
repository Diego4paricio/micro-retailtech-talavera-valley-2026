import { type FormEvent, useState } from "react";
import { authErrorNotice } from "../lib/auth-errors.js";
import { supabase } from "../supabase.js";
import { AuthLayout, FormNotice } from "./AuthLayout.js";
import { isStrongPassword, PasswordRules } from "./PasswordRules.js";

export function SetPassword({
  variant,
  onCompleted,
}: {
  variant: "new-account" | "recovery";
  onCompleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isStrong = isStrongPassword(password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (password !== confirmation) {
      setNotice("Las contraseñas no coinciden.");
      return;
    }
    if (!isStrong) {
      setNotice("Elige una contraseña que cumpla todos los requisitos.");
      return;
    }
    setIsSubmitting(true);
    setNotice(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setIsSubmitting(false);
      setNotice(authErrorNotice("sign-up", error.message));
      return;
    }
    // Recovering access closes every other session (ADR 023): whoever had
    // the old password is out.
    if (variant === "recovery")
      await supabase.auth.signOut({ scope: "others" });
    setIsSubmitting(false);
    onCompleted();
  }

  const isRecovery = variant === "recovery";
  return (
    <AuthLayout>
      <h2>
        {isRecovery ? "Elige una nueva contraseña." : "Protege tu cuenta."}
      </h2>
      <p className="auth-intro">
        {isRecovery
          ? "Al guardarla cerramos tu cuenta en los demás dispositivos."
          : "Una contraseña robusta protege tus QR y etiquetas, páginas y archivos."}
      </p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="new-password">Contraseña</label>
        <input
          aria-describedby="password-rules"
          autoComplete="new-password"
          id="new-password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <div id="password-rules">
          <PasswordRules value={password} />
        </div>
        <label htmlFor="confirm-password">Confirmar contraseña</label>
        <input
          autoComplete="new-password"
          id="confirm-password"
          onChange={(event) => setConfirmation(event.target.value)}
          required
          type="password"
          value={confirmation}
        />
        <FormNotice>{notice}</FormNotice>
        <button
          className="button button-primary"
          disabled={isSubmitting || !isStrong || password !== confirmation}
          type="submit"
        >
          {isSubmitting
            ? "Guardando…"
            : isRecovery
              ? "Guardar y entrar"
              : "Continuar"}
        </button>
      </form>
    </AuthLayout>
  );
}
