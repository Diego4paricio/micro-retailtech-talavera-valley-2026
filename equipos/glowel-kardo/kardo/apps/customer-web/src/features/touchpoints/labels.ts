import type { Touchpoint } from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";

/** Status badges and words of QR and tags (moved from `lib/format.ts`,
 * domain audit A2-72). */
export function touchpointStatusView(status: Touchpoint["status"]): {
  label: string;
  tone: StatusTone;
  detail: string;
} {
  if (status === "active")
    return {
      label: "Activo",
      tone: "success",
      detail: "Abre la página publicada.",
    };
  if (status === "paused")
    return {
      label: "Pausado",
      tone: "warning",
      detail: "El enlace público está bloqueado temporalmente.",
    };
  if (status === "retired")
    return {
      label: "Retirado",
      tone: "neutral",
      detail: "Se retiró de forma permanente. Su QR y NFC ya no activan nada.",
    };
  return {
    label: "Sin publicar",
    tone: "neutral",
    detail: "Publica una página para activarlo.",
  };
}

/**
 * The badge to show for a Touchpoint row or header: suspension (by Kardo),
 * being left out of the plan (ADR 023) and an in-flight publication take
 * priority over the plain lifecycle status.
 */
export function touchpointBadge(
  touchpoint: Pick<
    Touchpoint,
    "status" | "suspended" | "publishing" | "planExcluded"
  >,
): { label: string; tone: StatusTone } {
  if (touchpoint.suspended)
    return { label: "Suspendido por Kardo", tone: "danger" };
  if (touchpoint.planExcluded && touchpoint.status !== "retired")
    return { label: "Fuera del plan", tone: "warning" };
  if (touchpoint.publishing) return { label: "Publicando…", tone: "info" };
  const { label, tone } = touchpointStatusView(touchpoint.status);
  return { label, tone };
}

export const physicalTypeLabels: Record<Touchpoint["physicalType"], string> = {
  card: "Tarjeta",
  label: "Etiqueta",
  other: "Otro objeto",
};

/** What an NFC tag is, in plain words, for whoever picks one (relevo 37,
 * round 3: «Etiqueta NFC» was a word Rosa and Javier did not know). */
export const nfcMeaning =
  "Una etiqueta que tus clientes leen acercando su celular, sin abrir la cámara.";
