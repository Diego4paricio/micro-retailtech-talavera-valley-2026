import { type FormEvent, useState } from "react";
import { supabase } from "../supabase.js";
import { AuthLayout, FormNotice } from "./AuthLayout.js";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSubmitting(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);
    if (error)
      setNotice("No pudimos iniciar sesión. Verifica tu correo y contraseña.");
  }

  return (
    <AuthLayout
      body="Tu identidad de staff, el segundo factor y tus permisos se verifican otra vez en la API antes de mostrar cualquier dato."
      eyebrow="Kardo Operations"
      headline="Opera con evidencia, no con atajos."
    >
      <p className="eyebrow">Acceso de personal</p>
      <h2>Inicia sesión</h2>
      <p className="auth-intro">
        Después te pediremos tu código de verificación en dos pasos.
      </p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="staff-email">Correo de trabajo</label>
        <input
          autoComplete="email"
          id="staff-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <label htmlFor="staff-password">Contraseña</label>
        <input
          autoComplete="current-password"
          id="staff-password"
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
          {isSubmitting ? "Verificando…" : "Continuar"}
        </button>
      </form>
    </AuthLayout>
  );
}
