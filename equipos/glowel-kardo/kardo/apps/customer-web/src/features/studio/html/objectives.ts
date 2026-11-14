import { type ConceptBrief, CUSTOM_HTML_LIMITS } from "@kardo/contracts";
import type { IconName } from "../../../components/Icon.js";

/**
 * Quick objective chips for Paso 1 ("¿Qué quieres?"): a shortcut for someone
 * who does not know what to write. Choosing one appends a ready sentence to
 * the concept description; choosing it again removes that same sentence.
 * Purely a writing shortcut: the `ConceptBrief` contract is untouched beyond
 * its existing `description` field.
 */
export type ObjectiveId =
  | "orders"
  | "reservations"
  | "menu"
  | "contact"
  | "portfolio"
  | "promotion";

export type Objective = {
  id: ObjectiveId;
  label: string;
  icon: IconName;
  /** Appended to (or removed from) the description when toggled. */
  phrase: string;
};

export const objectives: readonly Objective[] = [
  {
    id: "orders",
    label: "Pedidos",
    icon: "cart",
    phrase: "Quiero que sea fácil pedir o comprar desde la página.",
  },
  {
    id: "reservations",
    label: "Reservas",
    icon: "calendar",
    phrase: "Necesito un lugar claro para reservar o agendar una cita.",
  },
  {
    id: "menu",
    label: "Menú o catálogo",
    icon: "modules",
    phrase: "Muestra el menú o catálogo de productos, con fotos.",
  },
  {
    id: "contact",
    label: "Contacto",
    icon: "send",
    phrase: "Pon a la vista cómo contactarnos: teléfono, WhatsApp o correo.",
  },
  {
    id: "portfolio",
    label: "Portafolio",
    icon: "frame",
    phrase: "Destaca una galería con fotos de trabajos o productos anteriores.",
  },
  {
    id: "promotion",
    label: "Promoción",
    icon: "gift",
    phrase: "Resalta una promoción u oferta especial arriba de todo.",
  },
];

/** Whether the objective's phrase is already part of the description. */
export function objectiveActive(
  brief: Pick<ConceptBrief, "description">,
  objective: Objective,
): boolean {
  return brief.description.includes(objective.phrase);
}

/**
 * Adds `phrase` to the description, or removes it when it is already there
 * (a toggle), without touching tone, colors, images or fonts. The one
 * writing-shortcut logic for the objective chips of modo HTML and the
 * shortcuts of the AI rail (domain audit A2-43 f).
 */
export function togglePhrase(
  brief: ConceptBrief,
  phrase: string,
  max: number = CUSTOM_HTML_LIMITS.briefDescription,
): ConceptBrief {
  if (brief.description.includes(phrase)) {
    const description = brief.description
      .replace(phrase, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { ...brief, description };
  }
  const trimmed = brief.description.trim();
  const description = (trimmed ? `${trimmed} ${phrase}` : phrase).slice(0, max);
  return { ...brief, description };
}

export function toggleObjective(
  brief: ConceptBrief,
  objective: Objective,
): ConceptBrief {
  return togglePhrase(brief, objective.phrase);
}
