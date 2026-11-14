import type { ExperienceContent, ExperienceType } from "@kardo/contracts";
import type { FirstStepsPlan } from "./first-steps-model.js";

/**
 * «Cómo se ve» (relevo 33): the two texts the owner changes in place, the
 * page's title and the line under it. They start from what the page already
 * has, else from what Kardo knows (the business's name, its giro and its
 * city), never from a made-up slogan.
 */
export type LookTexts = { title: string; phrase: string };

type TextContent = {
  title?: string;
  description?: string;
  displayName?: string;
  headline?: string;
  bio?: string;
};

/** «Puebla, Puebla» → «Puebla». */
function cityName(city: string | null | undefined): string {
  return (city ?? "").split(",")[0]?.trim() ?? "";
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es-MX") + text.slice(1);
}

export function lookTexts(input: {
  type: ExperienceType;
  content: ExperienceContent;
  plan: FirstStepsPlan;
  businessName: string;
  city?: string | null | undefined;
}): LookTexts {
  const value = input.content as TextContent;
  const city = cityName(input.city);
  const inCity = (text: string) => (city ? `${text} en ${city}` : text);
  switch (input.type) {
    case "profile":
      return {
        title: value.displayName?.trim() || input.businessName,
        phrase: value.headline?.trim() ?? "",
      };
    case "linkpage":
      return {
        title: value.displayName?.trim() || input.businessName,
        phrase: value.bio?.trim() ?? "",
      };
    case "image":
      return { title: input.businessName, phrase: "" };
    case "menu":
      return {
        title: value.title?.trim() || input.businessName,
        phrase: inCity("Nuestro menú"),
      };
    case "catalog":
      return {
        title: value.title?.trim() || input.businessName,
        phrase: inCity(
          input.plan.type === "catalog"
            ? `Nuestros ${input.plan.noun.many}`
            : "Nuestro catálogo",
        ),
      };
    case "document":
      return {
        title: value.title?.trim() || input.businessName,
        phrase:
          input.plan.type === "menu" ? "Nuestro menú" : "Nuestro catálogo",
      };
    case "form":
      return {
        title: value.title?.trim() || input.businessName,
        phrase: "Déjanos tus datos y te escribimos",
      };
    case "links":
      return {
        title: value.title?.trim() || input.businessName,
        phrase: value.description?.trim() ?? "",
      };
    case "redirect":
      return { title: input.businessName, phrase: "" };
  }
}

/** The heading over a Catálogo's list: «Servicios», «Productos»… */
export function listTitleFor(plan: FirstStepsPlan): string {
  return plan.type === "catalog" ? capitalize(plan.noun.many) : "Productos";
}

/** The content with the owner's two texts where the page shows them: a
 * Perfil and a Página de enlaces show their own name and line, the rest
 * keep the title too (the browser tab and the shared link show it). */
export function contentWithTexts(
  type: ExperienceType,
  content: ExperienceContent,
  texts: LookTexts,
): ExperienceContent {
  const title = texts.title.trim().slice(0, 120);
  const phrase = texts.phrase.trim();
  const value = content as Record<string, unknown>;
  switch (type) {
    case "profile":
      return {
        ...value,
        displayName: title || value.displayName,
        ...(phrase ? { headline: phrase.slice(0, 160) } : {}),
      } as ExperienceContent;
    case "linkpage":
      return {
        ...value,
        displayName: title || value.displayName,
        ...(phrase ? { bio: phrase.slice(0, 300) } : {}),
      } as ExperienceContent;
    case "menu":
    case "catalog":
    case "document":
    case "form":
    case "links":
      return { ...value, title: title || value.title } as ExperienceContent;
    default:
      return content;
  }
}

/** Moved to Páginas (`experiences/content.ts`): a content helper the
 * Estudio uses too (domain audit A2-42). */
export { contentHasPhotos } from "../experiences/content.js";
