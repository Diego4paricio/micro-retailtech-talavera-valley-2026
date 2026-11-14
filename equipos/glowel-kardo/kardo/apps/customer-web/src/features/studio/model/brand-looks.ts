import type {
  DesignableExperienceType,
  ExperienceContent,
  WorkspaceProfile,
} from "@kardo/contracts";
import { contentHasPhotos } from "../../experiences/content.js";
import {
  familyFor,
  firstImpressionDesign,
  looksFor,
} from "../templates/first-impression/index.js";
import type { StudioTemplate } from "../templates/index.js";
import { createIdFactory } from "./ids.js";
import type { StudioOrganizationBrand } from "./organization-brand.js";

/**
 * «Para tu marca» (domain audit A2-41, owner's decision): the twenty
 * first-impression looks of Primeros pasos, offered in the Estudio's
 * «Plantillas» too, generated with the organization's brand (its color, its
 * logo, its hours and WhatsApp, its giro) exactly as Primeros pasos does.
 * They are plain `StudioTemplate`s, so they apply, preview and undo like
 * every other template. The page's content is not touched: only its design.
 */

/** The giro label these templates carry in the list. */
export const brandLooksGiro = "Para tu marca";

const isHex = (value: string | undefined): value is string =>
  Boolean(value && /^#[0-9a-f]{6}$/i.test(value));

type TextContent = {
  title?: string;
  displayName?: string;
  headline?: string;
  bio?: string;
};

/** The page's own title and the line under it, as the page has them. */
function pageTexts(
  type: DesignableExperienceType,
  content: ExperienceContent,
  fallbackTitle: string,
): { title: string; phrase: string } {
  const value = content as TextContent;
  if (type === "profile")
    return {
      title: value.displayName?.trim() || fallbackTitle,
      phrase: value.headline?.trim() ?? "",
    };
  if (type === "linkpage")
    return {
      title: value.displayName?.trim() || fallbackTitle,
      phrase: value.bio?.trim() ?? "",
    };
  return { title: value.title?.trim() || fallbackTitle, phrase: "" };
}

/**
 * The looks as templates, the giro's best first. `profile` null (not
 * loaded yet) still gives looks, with their own default colors.
 */
export function brandLookTemplates(input: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  contentIds: readonly string[];
  businessName: string;
  profile: WorkspaceProfile | null;
  brand: StudioOrganizationBrand | null;
}): StudioTemplate[] {
  const { type, content, profile, brand } = input;
  const texts = pageTexts(type, content, input.businessName);
  const accent = [brand?.brand?.primary, brand?.brand?.accent].find(isHex);
  const family = familyFor(profile?.industry);
  return looksFor(family).map((look) => ({
    id: `look-${look.id}`,
    name: look.name,
    giro: brandLooksGiro,
    types: [type],
    description: "Con tu marca, tus datos y el estilo que más va con tu giro.",
    design: firstImpressionDesign({
      type,
      family,
      look: look.id,
      accent: accent ? accent.toLowerCase() : look.defaultAccent,
      title: texts.title,
      phrase: texts.phrase,
      listTitle: type === "catalog" ? "Productos" : undefined,
      hours: brand?.hours,
      city: profile?.city,
      whatsappUrl: brand?.whatsappUrl,
      logoAssetId: brand?.logoAssetId,
      hasPhotos: contentHasPhotos(content),
      profileName: texts.title,
      profileBio: texts.phrase,
      newId: createIdFactory(input.contentIds),
    }),
  }));
}
