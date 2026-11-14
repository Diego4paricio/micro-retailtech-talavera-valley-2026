import type { ExperienceType, Touchpoint } from "@kardo/contracts";
import type { IconName } from "../../components/Icon.js";
import type { Route } from "../../lib/router.js";

/**
 * «Pruébalo» y «Lo que sigue» (A2-57): lo puro. Qué QR, etiqueta o link
 * probar, y qué ofrecer después según el tipo de página.
 */

/**
 * Dónde probar la página de Primeros pasos: donde se publicó aquí (si esa
 * recordada sigue mostrándola o aún se está publicando) o, si la memoria de
 * este navegador se perdió, uno activo que MUESTRE esta página. Nunca el
 * primer QR activo de cualquier página.
 */
export function pickTryTouchpoint(
  touchpoints: readonly Touchpoint[],
  rememberedId: string | null,
  experienceId: string | null,
): Touchpoint | null {
  const remembered = rememberedId
    ? touchpoints.find((item) => item.id === rememberedId)
    : undefined;
  if (remembered) {
    const shows = remembered.live?.experienceId === experienceId;
    // A remembered place that now shows another page is not this page's.
    if (!remembered.live || shows || !experienceId) return remembered;
  }
  if (!experienceId) return null;
  return (
    touchpoints.find(
      (item) =>
        item.status === "active" && item.live?.experienceId === experienceId,
    ) ?? null
  );
}

/** Lo que se le dice a quien no tiene dónde probar todavía. */
export function tryMissingMessage(
  touchpoints: readonly Touchpoint[],
  experienceId: string | null,
): string {
  if (touchpoints.some((item) => item.publishing))
    return "Tu página se está publicando. En unos segundos aparece aquí.";
  return experienceId
    ? "Tu página todavía no está en ningún QR, etiqueta ni link. Publícala en el paso 4 y aquí la pruebas."
    : "Primero elige y publica tu página. Aquí la pruebas.";
}

export type NextStep = { route: Route; icon: IconName; label: string };

/** «Lo que sigue», según la página: un formulario lleva a Solicitudes (y
 * a los avisos por correo); un menú o un catálogo, a Disponibilidad; las
 * demás no ofrecen Disponibilidad. */
export function nextStepsFor(type: ExperienceType | undefined): NextStep[] {
  const specific: NextStep[] =
    type === "form"
      ? [
          {
            route: { name: "leads" },
            icon: "lead",
            label: "Solicitudes y avisos por correo",
          },
        ]
      : type === "menu" || type === "catalog"
        ? [
            {
              route: { name: "availability" },
              icon: "checklist",
              label: "Disponibilidad",
            },
          ]
        : [];
  return [
    ...specific,
    { route: { name: "experiences" }, icon: "palette", label: "Tu página" },
    { route: { name: "analytics" }, icon: "analytics", label: "Analítica" },
  ];
}
