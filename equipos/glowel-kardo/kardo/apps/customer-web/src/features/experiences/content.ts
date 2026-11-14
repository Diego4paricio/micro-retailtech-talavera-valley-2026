import {
  CONTENT_LIMITS,
  DOCUMENT_VIEWER_MAX_PAGES,
  type ExperienceContent,
  type ExperienceContentByType,
  type ExperienceTheme,
  type ExperienceType,
  MENU_ITEM_CHOICES_MAX,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import { sampleText } from "./sample-content.js";
import {
  normalizeSocialValue,
  validateSocialValue,
} from "./social-networks.js";

export type ContentOf<T extends ExperienceType> = ExperienceContentByType[T];

/**
 * Sets or clears a content's `theme` without ever writing an explicit
 * `theme: undefined` key — `exactOptionalPropertyTypes` (and the API
 * contract's `additionalProperties: false`) both require the key to be
 * entirely absent rather than present-but-undefined. Not generic: a generic
 * constrained to `{ theme?: ExperienceTheme }` hits TypeScript's "weak type"
 * check against `ExperienceContent`'s `redirect` member, which shares no
 * properties with that all-optional shape.
 */
export function withTheme(
  content: ExperienceContent,
  theme: ExperienceTheme | undefined,
): ExperienceContent {
  if (theme) return { ...content, theme } as ExperienceContent;
  const { theme: _theme, ...rest } = content as ExperienceContent & {
    theme?: ExperienceTheme;
  };
  return rest as ExperienceContent;
}

/** Short, stable ids for list items (links, menu items, catalog products). */
export function newItemId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

export const currencies = [
  ["MXN", "Peso mexicano (MXN)"],
  ["USD", "Dólar estadounidense (USD)"],
  ["EUR", "Euro (EUR)"],
  ["COP", "Peso colombiano (COP)"],
  ["ARS", "Peso argentino (ARS)"],
  ["CLP", "Peso chileno (CLP)"],
  ["PEN", "Sol peruano (PEN)"],
] as const;

export const limits = {
  name: 120,
  title: 120,
  description: 500,
  links: CONTENT_LIMITS.links,
  profileLinks: CONTENT_LIMITS.profileLinks,
  /** Página de enlaces: botones y redes. */
  linkpageLinks: CONTENT_LIMITS.linkpageLinks,
  linkpageSocials: CONTENT_LIMITS.linkpageSocials,
  headline: 160,
  biography: 1_000,
  alt: 250,
  menuSections: CONTENT_LIMITS.menuSections,
  menuChoices: MENU_ITEM_CHOICES_MAX,
  menuItemsPerSection: CONTENT_LIMITS.sectionItems,
  menuItemsTotal: 150,
  menuItemDescription: 200,
  catalogItems: CONTENT_LIMITS.catalogItems,
  catalogDescription: 300,
  submitLabel: 40,
  successMessage: 200,
  consentText: 300,
  maxPrice: 10_000_000,
} as const;

/**
 * Starting content for a brand-new Experience of every type but `image` and
 * `document`: those need a file chosen first, since their `assetId` is
 * required (see `NewExperiencePage.tsx`). Creating and opening the Estudio is
 * a single step (ADR 018, addendum 3) — there is no content form to fill
 * in first — so this must already pass `validateContent` on its own. It uses
 * the internal name the person just typed as a starting title, and a small
 * amount of placeholder content where the contract requires at least one
 * item; the person replaces all of it in the Estudio. The placeholders'
 * wording comes from `sample-content.ts`, which also finds them again.
 */
export function seedContentForCreation(
  type: Exclude<ExperienceType, "image" | "document">,
  entryName: string,
  businessName: string | undefined,
): ExperienceContent {
  const exampleLink = () => ({
    id: newItemId(),
    label: sampleText.linkLabel,
    url: sampleText.linkUrl,
  });
  switch (type) {
    case "redirect":
      return { destinationUrl: "" };
    case "links":
      return { title: entryName, links: [exampleLink()] };
    case "profile":
      return { displayName: entryName, links: [] };
    case "menu":
      return {
        title: entryName,
        currency: "MXN",
        sections: [
          {
            id: newItemId(),
            name: sampleText.section(1),
            items: [{ id: newItemId(), name: sampleText.menuItem(1) }],
          },
        ],
      };
    case "catalog":
      return {
        title: entryName,
        currency: "MXN",
        items: [{ id: newItemId(), name: sampleText.catalogItem(1) }],
      };
    case "form":
      return {
        title: entryName,
        fields: { name: "required", phone: "optional", message: "optional" },
        submitLabel: "Enviar",
        successMessage: "¡Gracias! Te contactaremos pronto.",
        consentText: `Acepto que ${businessName?.trim() || "este negocio"} use mis datos para responder a mi solicitud, según su aviso de privacidad.`,
      };
    case "linkpage":
      // The page needs at least one button or social; one example button,
      // like Enlaces, that the person replaces in the Estudio.
      return {
        displayName: entryName,
        socials: [],
        links: [exampleLink()],
      };
  }
}

export type ValidationErrors = Record<string, string>;

const required = "Este campo es obligatorio.";
const tooLong = (max: number) => `Máximo ${max} caracteres.`;
const invalidUrl =
  "Usa una URL completa que empiece con https:// (sin usuario ni contraseña).";

function text(
  errors: ValidationErrors,
  path: string,
  value: string | undefined,
  max: number,
  isRequired: boolean,
) {
  const trimmed = value?.trim() ?? "";
  if (isRequired && !trimmed) errors[path] = required;
  else if (trimmed.length > max) errors[path] = tooLong(max);
}

function url(
  errors: ValidationErrors,
  path: string,
  value: string | undefined,
  isRequired: boolean,
) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    if (isRequired) errors[path] = required;
    return;
  }
  if (!normalizePublicHttpsUrl(trimmed)) errors[path] = invalidUrl;
}

/** Too many entries for a list: «Máximo 12 enlaces.» (domain audit A2-31). */
function tooMany(
  errors: ValidationErrors,
  path: string,
  count: number,
  max: number,
  noun: string,
) {
  if (count > max) errors[path] = `Máximo ${max} ${noun}.`;
}

function price(
  errors: ValidationErrors,
  path: string,
  value: number | undefined,
) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > limits.maxPrice)
    errors[path] = "Precio no válido.";
}

/** Mirrors the server contract so customers see errors before saving. */
export function validateContent(
  type: ExperienceType,
  content: ExperienceContent,
): ValidationErrors {
  const errors: ValidationErrors = {};
  switch (type) {
    case "redirect": {
      const value = content as ContentOf<"redirect">;
      url(errors, "destinationUrl", value.destinationUrl, true);
      break;
    }
    case "links": {
      const value = content as ContentOf<"links">;
      text(errors, "title", value.title, limits.title, true);
      text(errors, "description", value.description, limits.description, false);
      if (!value.links.length) errors.links = "Añade al menos un enlace.";
      tooMany(errors, "links", value.links.length, limits.links, "enlaces");
      value.links.forEach((link, index) => {
        text(errors, `links.${index}.label`, link.label, limits.title, true);
        url(errors, `links.${index}.url`, link.url, true);
      });
      break;
    }
    case "profile": {
      const value = content as ContentOf<"profile">;
      text(errors, "displayName", value.displayName, limits.title, true);
      text(errors, "headline", value.headline, limits.headline, false);
      text(errors, "biography", value.biography, limits.biography, false);
      tooMany(
        errors,
        "links",
        value.links.length,
        limits.profileLinks,
        "enlaces",
      );
      value.links.forEach((link, index) => {
        text(errors, `links.${index}.label`, link.label, limits.title, true);
        url(errors, `links.${index}.url`, link.url, true);
      });
      break;
    }
    case "image": {
      const value = content as ContentOf<"image">;
      if (!value.assetId) errors.assetId = "Elige una imagen validada.";
      text(errors, "alt", value.alt, limits.alt, true);
      break;
    }
    case "document": {
      const value = content as ContentOf<"document">;
      const isViewer = value.display === "viewer";
      // The viewer only ever shows `pages`: the PDF itself is only required
      // to offer it as a download ("download", or "viewer" with
      // `allowDownload`) — a PDF the Assets Worker rejected (or one too big
      // to upload) can still show in the page without it.
      if ((!isViewer || value.allowDownload) && !value.assetId)
        errors.assetId = "Elige un PDF validado.";
      text(errors, "title", value.title, limits.title, true);
      text(errors, "description", value.description, limits.description, false);
      if (isViewer) {
        const pageCount = value.pages?.length ?? 0;
        if (pageCount === 0)
          errors.pages = "Prepara las páginas del PDF para mostrarlo.";
        else if (pageCount > DOCUMENT_VIEWER_MAX_PAGES)
          errors.pages = `El visor admite hasta ${DOCUMENT_VIEWER_MAX_PAGES} páginas; prepara de nuevo el PDF.`;
      }
      break;
    }
    case "menu": {
      const value = content as ContentOf<"menu">;
      text(errors, "title", value.title, limits.title, true);
      text(errors, "description", value.description, limits.description, false);
      const total = value.sections.reduce(
        (sum, section) => sum + section.items.length,
        0,
      );
      if (total > limits.menuItemsTotal)
        errors.sections = `El menú admite hasta ${limits.menuItemsTotal} productos en total.`;
      else
        tooMany(
          errors,
          "sections",
          value.sections.length,
          limits.menuSections,
          "secciones",
        );
      value.sections.forEach((section, sectionIndex) => {
        text(
          errors,
          `sections.${sectionIndex}.name`,
          section.name,
          limits.title,
          true,
        );
        if (!section.items.length)
          errors[`sections.${sectionIndex}.items`] =
            "Añade al menos un producto.";
        tooMany(
          errors,
          `sections.${sectionIndex}.items`,
          section.items.length,
          limits.menuItemsPerSection,
          "productos por sección",
        );
        section.items.forEach((item, itemIndex) => {
          const path = `sections.${sectionIndex}.items.${itemIndex}`;
          text(errors, `${path}.name`, item.name, limits.title, true);
          text(
            errors,
            `${path}.description`,
            item.description,
            limits.menuItemDescription,
            false,
          );
          price(errors, `${path}.price`, item.price);
          const choices = item.choices ?? [];
          tooMany(
            errors,
            `${path}.choices`,
            choices.filter((choice) => choice.name.trim()).length,
            limits.menuChoices,
            "opciones por platillo",
          );
          choices.forEach((choice, choiceIndex) => {
            text(
              errors,
              `${path}.choices.${choiceIndex}.name`,
              choice.name,
              limits.title,
              false,
            );
          });
        });
      });
      break;
    }
    case "catalog": {
      const value = content as ContentOf<"catalog">;
      text(errors, "title", value.title, limits.title, true);
      text(errors, "description", value.description, limits.description, false);
      if (!value.items.length) errors.items = "Añade al menos un producto.";
      tooMany(
        errors,
        "items",
        value.items.length,
        limits.catalogItems,
        "productos",
      );
      value.items.forEach((item, index) => {
        text(errors, `items.${index}.name`, item.name, limits.title, true);
        text(
          errors,
          `items.${index}.description`,
          item.description,
          limits.catalogDescription,
          false,
        );
        price(errors, `items.${index}.price`, item.price);
        url(errors, `items.${index}.url`, item.url, false);
      });
      break;
    }
    case "form": {
      const value = content as ContentOf<"form">;
      text(errors, "title", value.title, limits.title, true);
      text(errors, "description", value.description, limits.description, false);
      text(errors, "submitLabel", value.submitLabel, limits.submitLabel, true);
      text(
        errors,
        "successMessage",
        value.successMessage,
        limits.successMessage,
        true,
      );
      text(errors, "consentText", value.consentText, limits.consentText, true);
      url(errors, "privacyNoticeUrl", value.privacyNoticeUrl, false);
      break;
    }
    case "linkpage": {
      const value = content as ContentOf<"linkpage">;
      text(errors, "displayName", value.displayName, 120, true);
      text(errors, "bio", value.bio, 300, false);
      if (!value.links.length && !value.socials.length)
        errors.links = "Agrega al menos un botón o una red social.";
      tooMany(
        errors,
        "links",
        value.links.length,
        limits.linkpageLinks,
        "botones",
      );
      tooMany(
        errors,
        "socials",
        value.socials.length,
        limits.linkpageSocials,
        "redes sociales",
      );
      value.links.forEach((link, index) => {
        text(errors, `links.${index}.label`, link.label, 120, true);
        url(errors, `links.${index}.url`, link.url, true);
      });
      value.socials.forEach((social, index) => {
        const message = validateSocialValue(social.network, social.value);
        if (message) errors[`socials.${index}.value`] = message;
      });
      break;
    }
  }
  if (type !== "redirect") {
    const theme = (content as { theme?: ExperienceTheme }).theme;
    if (theme?.background.kind === "gradient" && !theme.background.colorTo)
      errors.theme = "El degradado necesita un segundo color.";
    else if (
      theme?.background.kind === "image" &&
      !theme.background.imageAssetId
    )
      errors.theme = "Elige una imagen de tu biblioteca para el fondo.";
  }
  return errors;
}

/**
 * Produces the exact payload for the API: trims text, normalizes URLs and
 * drops empty optional fields (the contract forbids empty optional strings
 * in some places and `additionalProperties`).
 */
export function cleanContent(
  type: ExperienceType,
  content: ExperienceContent,
): ExperienceContent {
  const optional = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const link = (value: { id: string; label: string; url: string }) => ({
    id: value.id,
    label: value.label.trim(),
    url: normalizePublicHttpsUrl(value.url.trim()) ?? value.url.trim(),
  });
  const compact = (value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    );
  // The API contract forbids explicit `undefined`; compacted objects match it.
  const finish = (value: Record<string, unknown>) =>
    compact(value) as unknown as ExperienceContent;

  switch (type) {
    case "redirect": {
      const value = content as ContentOf<"redirect">;
      const destination = value.destinationUrl.trim();
      return {
        destinationUrl: normalizePublicHttpsUrl(destination) ?? destination,
      };
    }
    case "links": {
      const value = content as ContentOf<"links">;
      return finish({
        title: value.title.trim(),
        description: optional(value.description),
        links: value.links.map(link),
        theme: value.theme,
        // Estudio de Experiences: the design and the modo HTML source travel
        // with the content, so editing the content never erases them.
        design: value.design,
        customHtml: value.customHtml,
      });
    }
    case "profile": {
      const value = content as ContentOf<"profile">;
      return finish({
        displayName: value.displayName.trim(),
        headline: optional(value.headline),
        biography: optional(value.biography),
        avatarAssetId: value.avatarAssetId || undefined,
        links: value.links.map(link),
        theme: value.theme,
        design: value.design,
        customHtml: value.customHtml,
      });
    }
    case "image": {
      const value = content as ContentOf<"image">;
      return finish({
        assetId: value.assetId,
        alt: value.alt.trim(),
        theme: value.theme,
        // Estudio de Experiences: the design travels with the content, so
        // editing the picture or its alt text never erases it.
        design: value.design,
      });
    }
    case "document": {
      const value = content as ContentOf<"document">;
      return finish({
        assetId: value.assetId,
        title: value.title.trim(),
        description: optional(value.description),
        theme: value.theme,
        // Documento PDF (ADR 018, addendum 3): editing the title or the PDF
        // itself never drops its pages, its display mode or its design.
        display: value.display,
        pages: value.pages,
        allowDownload: value.allowDownload,
        design: value.design,
      });
    }
    case "menu": {
      const value = content as ContentOf<"menu">;
      return finish({
        title: value.title.trim(),
        description: optional(value.description),
        currency: value.currency,
        sections: value.sections.map((section) => ({
          id: section.id,
          name: section.name.trim(),
          items: section.items.map((item) => {
            // «Menú del día» (relevo 37, D1): the guisados to choose from.
            // Round 3: they were dropped here and Rosa's were never saved.
            const choices = (item.choices ?? [])
              .map((choice) => ({ id: choice.id, name: choice.name.trim() }))
              .filter((choice) => choice.name);
            return compact({
              id: item.id,
              name: item.name.trim(),
              description: optional(item.description),
              price: item.price,
              imageAssetId: item.imageAssetId || undefined,
              choices: choices.length ? choices : undefined,
              choicesLabel: choices.length
                ? optional(item.choicesLabel)
                : undefined,
            });
          }),
        })),
        theme: value.theme,
        design: value.design,
      });
    }
    case "catalog": {
      const value = content as ContentOf<"catalog">;
      return finish({
        title: value.title.trim(),
        description: optional(value.description),
        currency: value.currency,
        items: value.items.map((item) =>
          compact({
            id: item.id,
            name: item.name.trim(),
            description: optional(item.description),
            price: item.price,
            url: item.url?.trim()
              ? (normalizePublicHttpsUrl(item.url.trim()) ?? item.url.trim())
              : undefined,
            imageAssetId: item.imageAssetId || undefined,
          }),
        ),
        theme: value.theme,
        design: value.design,
      });
    }
    case "form": {
      const value = content as ContentOf<"form">;
      return finish({
        title: value.title.trim(),
        description: optional(value.description),
        fields: value.fields,
        submitLabel: value.submitLabel.trim(),
        successMessage: value.successMessage.trim(),
        consentText: value.consentText.trim(),
        privacyNoticeUrl: value.privacyNoticeUrl?.trim()
          ? (normalizePublicHttpsUrl(value.privacyNoticeUrl.trim()) ??
            value.privacyNoticeUrl.trim())
          : undefined,
        theme: value.theme,
        design: value.design,
      });
    }
    case "linkpage": {
      const value = content as ContentOf<"linkpage">;
      return finish({
        displayName: value.displayName.trim(),
        bio: optional(value.bio),
        avatarAssetId: value.avatarAssetId || undefined,
        socials: value.socials.map((social) => ({
          ...social,
          value: normalizeSocialValue(social.network, social.value),
        })),
        links: value.links.map((item) => ({
          ...link(item),
          ...(item.highlight ? { highlight: true } : {}),
        })),
        theme: value.theme,
        design: value.design,
        customHtml: value.customHtml,
      });
    }
  }
}

/** A Menú or a Catálogo whose items already have photos shows them. */
export function contentHasPhotos(content: ExperienceContent): boolean {
  const value = content as {
    sections?: { items: { imageAssetId?: string }[] }[];
    items?: { imageAssetId?: string }[];
  };
  const items = [
    ...(value.sections ?? []).flatMap((section) => section.items),
    ...(value.items ?? []),
  ];
  return items.some((item) => Boolean(item.imageAssetId));
}
