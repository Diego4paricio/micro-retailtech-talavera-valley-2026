import { ApiRequestError } from "../../lib/api.js";

/**
 * A save refused because someone else saved the same page first (409
 * `EXPERIENCE_CHANGED`, domain audit A2-22). One check and one message for
 * the page editor, the Estudio, «Editar productos» and Primeros pasos.
 */
export function isChangedElsewhere(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.code === "EXPERIENCE_CHANGED"
  );
}

export const changedElsewhereMessage =
  "Alguien más guardó cambios en esta página. Recarga para ver la versión más reciente.";
