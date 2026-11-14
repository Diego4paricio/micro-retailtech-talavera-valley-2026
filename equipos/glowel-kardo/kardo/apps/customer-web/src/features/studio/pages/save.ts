import type {
  CustomHtml,
  ExperienceContent,
  ExperienceType,
  PageDesign,
} from "@kardo/contracts";
import { cleanContent } from "../../experiences/content.js";
import { contentCustomHtml, withCustomHtml } from "../html/model.js";
import { contentDesign, withDesign } from "../model/content.js";

/** What the Estudio saved (see DesignStudio's `StudioSaveChanges`). */
type Changes = {
  design?: PageDesign | undefined;
  customHtml?: CustomHtml | undefined;
  content?: ExperienceContent | undefined;
};

/**
 * The draft content one PATCH writes after Guardar in the Estudio: the
 * edited content (or the saved one), cleaned for the API, with the new
 * design and HTML when they changed and the saved ones otherwise.
 */
export function savedContent(
  type: ExperienceType,
  saved: ExperienceContent,
  changes: Changes,
): ExperienceContent {
  const base = changes.content
    ? withCustomHtml(
        withDesign(changes.content, contentDesign(saved)),
        contentCustomHtml(saved),
      )
    : saved;
  // `cleanContent` keeps the design and the HTML it finds.
  let next = cleanContent(type, base);
  next = withDesign(next, changes.design ?? contentDesign(saved));
  next = withCustomHtml(next, changes.customHtml ?? contentCustomHtml(saved));
  return next;
}

/** "Diseño guardado.", "Contenido guardado.", "Cambios guardados."… */
export function studioSavedMessage(changes: Changes): string {
  const parts = [changes.design, changes.customHtml, changes.content].filter(
    Boolean,
  ).length;
  if (parts > 1) return "Cambios guardados.";
  if (changes.content) return "Contenido guardado.";
  if (changes.customHtml) return "HTML guardado.";
  return "Diseño guardado.";
}

/**
 * The PATCH body of Guardar: the name and content, plus the draft revision
 * the screen loaded, so a save over someone else's is refused (409
 * `EXPERIENCE_CHANGED`) instead of silently replacing it (A2-22).
 */
export function studioUpdateBody(
  name: string,
  content: ExperienceContent,
  expectedDraftRevision: number | undefined,
): {
  name: string;
  content: ExperienceContent;
  expectedDraftRevision?: number;
} {
  return {
    name,
    content,
    ...(expectedDraftRevision !== undefined ? { expectedDraftRevision } : {}),
  };
}

export {
  changedElsewhereMessage,
  isChangedElsewhere,
} from "../../experiences/draft-conflict.js";
