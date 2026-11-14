import type {
  ExperienceSummary,
  ExperienceType,
  Touchpoint,
} from "@kardo/contracts";
import { suggestTouchpointName } from "../touchpoints/naming.js";
import type { FirstPageType } from "./pasted-list.js";

/**
 * Lo puro de «Cómo te encuentran» (paso 4): el nombre que Kardo propone y el
 * QR o link que ya se creó pero no se pudo publicar (A2-54).
 */

/** Un QR, una etiqueta o un link que se creó pero cuya publicación falló.
 * Se guarda en el estado de Primeros pasos para que, al recargar y volver a
 * pulsar, se reutilice en vez de crear otro igual. */
export type PendingShare = { touchpointId: string; experienceId: string };

/** El QR o link pendiente de ESTA página, si todavía existe; `null` si no
 * hay, si era de otra página o si se borró. */
export function rememberedPendingShare(
  remembered: PendingShare | null | undefined,
  experienceId: string,
  touchpoints: readonly Touchpoint[] | null | undefined,
): Touchpoint | null {
  if (!remembered || remembered.experienceId !== experienceId) return null;
  return (
    touchpoints?.find((item) => item.id === remembered.touchpointId) ?? null
  );
}

/**
 * El nombre de un QR o una etiqueta nuevos: dónde se pega, con las palabras
 * del dueño («Mesas», «Espejo»), según el nombre del negocio, el giro y los
 * nombres que ya usa. Una etiqueta recibe un nombre de etiqueta. Un menú en
 * PDF o en foto se trata como el menú escrito (la página del giro).
 */
export function shareTouchpointName(input: {
  kind: "qr" | "nfc";
  experienceType: ExperienceType;
  experienceName?: string | null | undefined;
  planType: FirstPageType;
  industry?: string | null | undefined;
  businessName?: string | null | undefined;
  existingNames: readonly string[];
}): string {
  const pageType: ExperienceType =
    input.experienceType === "document" ||
    input.experienceType === "image" ||
    input.experienceType === "linkpage"
      ? input.planType
      : input.experienceType;
  return suggestTouchpointName({
    kind: input.kind,
    pageType,
    industry: input.industry,
    businessName: input.businessName,
    existingNames: input.existingNames,
    pageName: input.experienceName,
  });
}

/** Whether `experience` is the page this QR shows right now. */
export function showsExperience(
  touchpoint: Pick<Touchpoint, "live">,
  experience: Pick<ExperienceSummary, "id">,
): boolean {
  return touchpoint.live?.experienceId === experience.id;
}
