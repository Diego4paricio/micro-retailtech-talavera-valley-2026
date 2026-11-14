/**
 * `publication_jobs.last_error` is written by the Publisher as
 * `"CODE: detail"`, where `detail` is an internal diagnostic string that must
 * never reach a customer verbatim (it can include raw SQL, Resolver response
 * bodies, etc.). This maps only the known `CODE` prefix to a safe, Spanish,
 * customer-facing sentence; everything else — including a missing or
 * unrecognized code — collapses to one generic message.
 */
export function translatePublicationFailureReason(
  lastError: string | null | undefined,
): string | null {
  if (!lastError) return null;
  const code = lastError.split(":")[0]?.trim();
  switch (code) {
    case "CONTENT_INVALID":
      return "El contenido no pasó la validación de publicación.";
    case "ASSET_UNAVAILABLE":
      return "Un archivo asociado ya no está disponible.";
    case "RESOLVER_REJECTED":
      return "El servicio público rechazó la versión.";
    case "RESOLVER_UNAVAILABLE":
      return "El servicio público no respondió; se reintentará.";
    case "INPUT_UNAVAILABLE":
      return "No pudimos preparar esta versión para publicarla; se reintentará.";
    case "STATE_SYNC_FAILED":
      return "La versión llegó al servicio público pero no pudimos registrarla; se reintentará.";
    default:
      return "No se pudo publicar esta versión.";
  }
}
