import type {
  ExperienceContent,
  ExperienceSummary,
  ExperienceType,
  WorkspaceProfile,
} from "@kardo/contracts";
import {
  emptyRow,
  type FirstPageType,
  filledRows,
  formatPrice,
  type ItemRow,
  mergeSections,
  parsePastedList,
  parsePrice,
  rowPriceError,
  type SectionRows,
} from "../experiences/items/pasted-list.js";
import { realItems } from "../experiences/items/rows.js";
import { type PageTypePlan, pagePlanFor } from "../experiences/page-types.js";
import { isSampleLink } from "../experiences/sample-content.js";

// The rows-of-name-and-price logic lives with Páginas now (domain audit
// A2-28); re-exported so Primeros pasos keeps importing it from here.
export {
  contentFromRows,
  realItems,
  rowsFromContent,
} from "../experiences/items/rows.js";
export type { FirstPageType, ItemRow, SectionRows };
export {
  emptyRow,
  filledRows,
  formatPrice,
  mergeSections,
  parsePastedList,
  parsePrice,
  rowPriceError,
};

/**
 * Primeros pasos (relevo 31, proposal approved by the owner 2026-10-03):
 * five steps in the owner's words that end in a page a customer can use.
 * In the simulated-user study 6 of 6 owners signed up fine and 0 of 6
 * ended with such a page: they got lost entering their products, using the
 * AI and publishing. This module is the pure part: which page the giro
 * gets, what is done, and the quick product capture.
 */

export const firstStepIds = [
  "business",
  "content",
  "look",
  "qr",
  "try",
] as const;
export type FirstStepId = (typeof firstStepIds)[number];

/** Which page a giro gets first: lives with the page catalog in Páginas
 * (domain audit A2-28); kept here under its old names. */
export type FirstStepsPlan = PageTypePlan;

/**
 * Giros in the owner's words (Beto, a taquero, did not know he was a
 * «Restaurante»: relevo 31, finding 12). Shared with Configuración.
 */
export { industryOptions as industryChoices } from "../business-profile/options.js";
export const firstStepsPlan = pagePlanFor;

/**
 * The page Primeros pasos works on: the one chosen or created in step 2
 * (remembered by this browser), otherwise the live one, otherwise the one
 * edited last.
 */
export function firstStepsExperience(
  experiences: readonly ExperienceSummary[],
  chosenId?: string | null,
): ExperienceSummary | null {
  const candidates = experiences.filter((item) => !item.archivedAt);
  const chosen = chosenId
    ? candidates.find((item) => item.id === chosenId)
    : undefined;
  if (chosen) return chosen;
  candidates.sort(
    (a, b) =>
      (b.liveTouchpointCount ?? 0) - (a.liveTouchpointCount ?? 0) ||
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return candidates[0] ?? null;
}

/** Whether a page already has what its customers would see: items of
 * their own on a Menú or Catálogo, the PDF, the image, the address… */
export function pageHasContent(
  type: ExperienceType,
  content: ExperienceContent,
): boolean {
  const value = content as {
    pages?: unknown[];
    assetId?: string;
    destinationUrl?: string;
    links?: { label?: string; url?: string }[];
    socials?: unknown[];
  };
  switch (type) {
    case "menu":
    case "catalog":
      return realItems(type, content).length > 0;
    case "document":
      return Boolean(value.pages?.length || value.assetId);
    case "image":
      return Boolean(value.assetId);
    case "redirect":
      return Boolean(value.destinationUrl);
    case "links":
    case "profile":
    case "linkpage":
      return (
        (value.socials?.length ?? 0) > 0 ||
        (value.links ?? []).some((link) => link.url && !isSampleLink(link))
      );
    case "form":
      return true;
  }
}

/** A Redirección has no page to see: «Cómo se ve» does not apply. */
export function pageHasLook(type: ExperienceType): boolean {
  return type !== "redirect";
}

const inFlight = new Set(["pending", "processing", "published"]);

export type FirstStepsState = {
  plan: FirstStepsPlan;
  experience: ExperienceSummary | null;
  done: Record<FirstStepId, boolean>;
  completed: number;
  /** The first step not done, or null when all are. */
  next: FirstStepId | null;
};

export function firstStepsState(input: {
  profile: WorkspaceProfile | null;
  experiences: readonly ExperienceSummary[];
  tried: boolean;
  /** May edit the business's data. An Editor cannot, so step 1 does not
   * wait for them (A2-7). Default: yes. */
  canManageBusiness?: boolean;
  /** The page chosen or created in step 2. */
  experienceId?: string | null;
}): FirstStepsState {
  // The giro is the organization's own (A2-55): never another one's, so
  // none yet means the generic plan.
  const plan = firstStepsPlan(input.profile?.industry);
  const experience = firstStepsExperience(
    input.experiences,
    input.experienceId,
  );
  const content = (experience?.content ?? {}) as ExperienceContent;
  const done: Record<FirstStepId, boolean> = {
    // Someone who cannot edit the business is not held up by step 1: they
    // are told to ask an Owner or Admin (A2-7).
    business:
      input.canManageBusiness === false ||
      Boolean(input.profile?.industry && input.profile.phone),
    content: experience ? pageHasContent(experience.type, content) : false,
    look: experience
      ? !pageHasLook(experience.type) ||
        Boolean((content as { design?: unknown }).design)
      : false,
    qr: experience
      ? (experience.liveTouchpointCount ?? 0) > 0 ||
        inFlight.has(experience.publicationStatus)
      : false,
    try: input.tried,
  };
  const next = firstStepIds.find((id) => !done[id]) ?? null;
  return {
    plan,
    experience,
    done,
    completed: firstStepIds.filter((id) => done[id]).length,
    next,
  };
}

/**
 * Whether to guide the organization: something is missing and it is not
 * live yet, or it went live through these steps. One already live before
 * (the demo account, 2026-10-04) is not guided again. The last step only
 * shows to someone who published here, so nobody else is asked to «probar».
 */
export function isFirstStepsPending(input: {
  state: FirstStepsState;
  experiences: readonly ExperienceSummary[];
  publishedHere: boolean;
}): boolean {
  const liveBefore =
    !input.publishedHere &&
    input.experiences.some((item) => (item.liveTouchpointCount ?? 0) > 0);
  return (
    !liveBefore &&
    input.state.next !== null &&
    (input.state.next !== "try" || input.publishedHere)
  );
}

/**
 * Which steps can be opened. Before publishing, any step up to the next
 * one, to go back and change something. Once the page is published here,
 * only «Pruébalo»: changes are made in the panel, and «Cómo te encuentran»
 * never publishes twice (owner, 2026-10-04: after a QR it let a link be
 * published too).
 */
export function isStepOpenable(
  id: FirstStepId,
  state: FirstStepsState,
): boolean {
  if (state.done.qr) return id === "try";
  const next = state.next ?? "try";
  return firstStepIds.indexOf(id) <= firstStepIds.indexOf(next);
}

// The catalog of page types to create (titles, default names, recommended
// order per giro) lives with Páginas, shared with «Nueva página» (domain
// audit A2-28); re-exported so Primeros pasos keeps importing it from here.
export {
  type PageChoice,
  pageChoices,
  pageNameFor,
  titleFromFileName,
} from "../experiences/page-types.js";
