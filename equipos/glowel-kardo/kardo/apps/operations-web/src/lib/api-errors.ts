/**
 * Pure error-mapping logic for the Staff API, kept separate from `api.ts` so
 * it can be unit tested without touching `fetch` or Supabase.
 */

/** A failed Staff API call. `message` is always safe, staff-facing Spanish. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const messagesByCode: Record<string, string> = {
  STAFF_SESSION_REQUIRED: "Tu sesión expiró. Vuelve a iniciar sesión.",
  STAFF_MFA_REQUIRED:
    "Necesitas completar la verificación de dos factores para continuar.",
  STAFF_ACCESS_DENIED: "Esta cuenta no tiene acceso de staff activo.",
  STAFF_PERMISSION_DENIED: "Tu rol no incluye permiso para esta acción.",
  STAFF_NOT_FOUND: "No encontramos este elemento.",
  STAFF_CONFLICT:
    "El estado cambió mientras trabajabas. Actualiza e intenta de nuevo.",
  BILLING_UNAVAILABLE:
    "Stripe no está configurado en este entorno, así que no se puede consultar ni cambiar la facturación.",
  BILLING_CONFLICT:
    "Esta acción no aplica al estado actual de la suscripción. Actualiza e intenta de nuevo.",
  STAFF_SERVICE_UNAVAILABLE:
    "El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.",
};

/** Maps an HTTP status + API error code to safe, user-facing Spanish copy. */
export function messageFor(status: number, code: string | null): string {
  if (code && messagesByCode[code]) return messagesByCode[code];
  if (status === 400) return "Revisa los campos: algún valor no es válido.";
  if (status === 401) return messagesByCode.STAFF_SESSION_REQUIRED ?? "";
  if (status === 403) return messagesByCode.STAFF_ACCESS_DENIED ?? "";
  if (status === 404) return messagesByCode.STAFF_NOT_FOUND ?? "";
  if (status === 409) return messagesByCode.STAFF_CONFLICT ?? "";
  if (status === 503) return messagesByCode.STAFF_SERVICE_UNAVAILABLE ?? "";
  return "No pudimos completar esta acción. Intenta de nuevo.";
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "No pudimos completar esta acción. Intenta de nuevo.";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
