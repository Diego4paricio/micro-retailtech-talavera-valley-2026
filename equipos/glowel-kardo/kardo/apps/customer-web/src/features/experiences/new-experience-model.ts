import type { DocumentPage, ExperienceType } from "@kardo/contracts";
import { touchpointExperienceTypes } from "@kardo/contracts";
import type { Route } from "../../lib/router.js";
import { validateContent } from "./content.js";
import { experienceTypeLabels } from "./labels.js";
import { defaultPageName, type PageTypePlan } from "./page-types.js";

/**
 * Pure rules behind "Nueva Experience": the type picker and its two-step
 * creation flow (pick the type, then fill only what it needs), kept free of
 * React so they are unit-tested directly.
 */

/** Every type this screen can create, in the order the cards are shown. */
export const creationTypeOrder: readonly ExperienceType[] =
  touchpointExperienceTypes;

export type CreationStep = 1 | 2;

/** Step 2 once a type is chosen; step 1 otherwise. */
export function creationStepOf(type: ExperienceType | null): CreationStep {
  return type ? 2 : 1;
}

/**
 * The name to suggest when a type is (re)chosen: the person's own text stays
 * untouched unless the field is still empty or still holds another type's
 * placeholder name (so switching cards before typing anything keeps the name
 * in sync with the pick, without ever overwriting real input).
 */
export function suggestedName(
  type: ExperienceType,
  currentName: string,
  /** The giro's plan: the same default names Primeros pasos gives
   * («Foto del menú», «Perfil»…), from the one catalog (A2-28). */
  plan: PageTypePlan | null = null,
): string {
  const trimmed = currentName.trim();
  const isPlaceholder = creationTypeOrder.some(
    (candidate) =>
      experienceTypeLabels[candidate] === trimmed ||
      defaultPageName(candidate, plan) === trimmed,
  );
  return !trimmed || isPlaceholder ? defaultPageName(type, plan) : currentName;
}

/** The fields step 2 may collect, besides the internal name every type needs. */
export type CreationFields = {
  name: string;
  assetId: string;
  alt: string;
  pdfPages: readonly DocumentPage[] | null;
  destinationUrl: string;
  /** A PDF already in Archivos (domain audit A2-47): its pages cannot be
   * drawn again from the panel, so the page offers it as a download. */
  fromLibrary?: boolean | undefined;
};

/**
 * Whether step 2 has everything its type needs to create the Experience:
 * Imagen needs a validated image and its alt text, Documento PDF needs its
 * pages prepared (every new one shows in the page — ADR 018, addendum 3) but
 * not necessarily the PDF itself — the Assets Worker may have rejected it
 * (active content) or it may be over the 5 MB download limit, and the viewer
 * only needs the pages — Redirección needs a valid HTTPS URL, and every other
 * type needs only the name (its content is filled in the Estudio).
 */
export function canCreateFromStep2(
  type: ExperienceType,
  fields: CreationFields,
): boolean {
  if (!fields.name.trim()) return false;
  switch (type) {
    case "image":
      return Boolean(fields.assetId) && Boolean(fields.alt.trim());
    case "document":
      return (
        Boolean(fields.pdfPages?.length) ||
        Boolean(fields.fromLibrary && fields.assetId)
      );
    case "redirect":
      return !validateContent("redirect", {
        destinationUrl: fields.destinationUrl,
      }).destinationUrl;
    default:
      return true;
  }
}

/**
 * The "Nueva Experience" route for a given step: `type` set means step 2,
 * omitted means step 1. Pushing it on selection, and replacing it on "Atrás",
 * is what lets the browser's own Back button move between the two steps.
 */
export function newExperienceRoute(
  touchpointId: string | null,
  groupId: string | null,
  type: ExperienceType | null,
): Route {
  return {
    name: "experience-new",
    touchpointId,
    ...(groupId ? { groupId } : {}),
    ...(type ? { type } : {}),
  };
}
