export function authErrorNotice(
  mode: "sign-in" | "sign-up",
  message: string,
): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("password should be at least"))
    return "La contraseña no cumple la longitud mínima.";
  if (normalized.includes("user already registered"))
    return "Ya existe una cuenta con ese correo. Inicia sesión en su lugar.";
  if (
    normalized.includes("email rate limit") ||
    normalized.includes("email sending rate limit")
  )
    return "Se alcanzó temporalmente el límite de correos de verificación. Espera unos minutos antes de volver a intentarlo.";
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("security purposes")
  )
    return "Hiciste demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  if (
    normalized.includes("invalid email") ||
    normalized.includes("email address is invalid")
  )
    return "Revisa el correo: no debe tener espacios ni caracteres extra.";
  if (normalized.includes("token has expired") || normalized.includes("otp"))
    return "El código no es válido o expiró. Solicita uno nuevo.";
  if (normalized.includes("signups not allowed"))
    return "El registro está desactivado temporalmente.";
  if (
    normalized.includes("same password") ||
    normalized.includes("different from the old")
  )
    return "La nueva contraseña debe ser distinta de la actual.";
  if (normalized.includes("weak") || normalized.includes("pwned"))
    return "Esa contraseña es demasiado común o aparece en filtraciones. Elige otra.";
  if (mode === "sign-in")
    // Never reveal whether the account exists.
    return "No pudimos iniciar sesión con esos datos. Verifica tu correo y contraseña.";
  return "No pudimos completar el registro. Intenta de nuevo.";
}

export const passwordRules = [
  { label: "12 caracteres o más", test: (value: string) => value.length >= 12 },
  {
    label: "Una letra minúscula",
    test: (value: string) => /[a-z]/.test(value),
  },
  {
    label: "Una letra mayúscula",
    test: (value: string) => /[A-Z]/.test(value),
  },
  { label: "Un número", test: (value: string) => /\d/.test(value) },
  { label: "Un símbolo", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;
