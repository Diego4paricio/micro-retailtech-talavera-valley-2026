import {
  type DesignableExperienceType,
  designableExperienceTypes,
  type ExperienceContent,
  type ExperienceType,
  type PageDesign,
  type SocialLink,
} from "@kardo/contracts";
import type { DesignableContent } from "@kardo/page-render";

/**
 * The bridge between an Experience's content and its Estudio design. The
 * content (titles, links, dishes, products, fields, pages) stays the source
 * of truth and is edited where it is today (or inside the Estudio's own
 * "Contenido" rail, `panels/ContentPanel.tsx`); the design only places and
 * styles it.
 */

export function isDesignableType(
  type: ExperienceType,
): type is DesignableExperienceType {
  return (designableExperienceTypes as readonly string[]).includes(type);
}

type WithItems = {
  links?: readonly { id: string }[];
  socials?: readonly { id: string }[];
  /** Catalog items: their "Ver más" link is tracked like a content link
   * (see `DesignableCatalogItem` in @kardo/page-render), so their ids share
   * the same "never reused by a design id" namespace. Menu dishes have no
   * link of their own and are left out on purpose. */
  items?: readonly { id: string }[];
};

/** Ids a design may never reuse: every content link, social and catalog
 * item (all three are tracked through the same `/go/{id}` mechanism as a
 * design `button` block). */
export function contentItemIds(content: ExperienceContent): string[] {
  const value = content as WithItems;
  return [
    ...(value.links ?? []).map((link) => link.id),
    ...(value.socials ?? []).map((social) => social.id),
    ...(value.items ?? []).map((item) => item.id),
  ];
}

/** A Menú's own section ids, in order (for `menu` blocks' `sectionIds` and
 * for `checkDesign`'s `menuSectionIds` context). `undefined` for content
 * that has no sections (every type other than `menu`). */
export function contentMenuSectionIds(
  content: ExperienceContent,
): string[] | undefined {
  const value = content as { sections?: readonly { id: string }[] };
  return value.sections?.map((section) => section.id);
}

/** One real dish or product a `featuredItems` block may name: what the
 * "qué destaca" picker in `FeaturedItemsFields` shows. */
export type FeaturableItem = {
  id: string;
  name: string;
  price?: number;
  imageRef?: string;
};

/** A Menú's dishes (flattened across every section, since a highlight does
 * not care which section a dish is in) or a Catálogo's products, in the
 * content's own order. `[]` for every other type. */
export function contentFeaturableItems(
  type: DesignableExperienceType,
  content: ExperienceContent,
): FeaturableItem[] {
  if (type === "menu") {
    const value = content as {
      sections?: readonly {
        items?: readonly {
          id: string;
          name: string;
          price?: number;
          imageAssetId?: string;
        }[];
      }[];
    };
    return (value.sections ?? []).flatMap((section) =>
      (section.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        ...(item.price !== undefined ? { price: item.price } : {}),
        ...(item.imageAssetId ? { imageRef: item.imageAssetId } : {}),
      })),
    );
  }
  if (type === "catalog") {
    const value = content as {
      items?: readonly {
        id: string;
        name: string;
        price?: number;
        imageAssetId?: string;
      }[];
    };
    return (value.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.price !== undefined ? { price: item.price } : {}),
      ...(item.imageAssetId ? { imageRef: item.imageAssetId } : {}),
    }));
  }
  return [];
}

/** Real dish/product ids a `featuredItems` block of this type may name (for
 * `checkDesign`'s `featurableItemIds` context). `undefined` for every type
 * but Menú and Catálogo, so `checkDesign` skips the check there, exactly
 * like `contentMenuSectionIds` does for `menuSectionIds`. */
export function contentFeaturableItemIds(
  type: DesignableExperienceType,
  content: ExperienceContent,
): string[] | undefined {
  if (type !== "menu" && type !== "catalog") return undefined;
  return contentFeaturableItems(type, content).map((item) => item.id);
}

export function contentDesign(content: ExperienceContent): PageDesign | null {
  return (content as { design?: PageDesign }).design ?? null;
}

/** Sets or removes `design` without ever writing an explicit `undefined`. */
export function withDesign(
  content: ExperienceContent,
  design: PageDesign | null,
): ExperienceContent {
  const { design: _previous, ...rest } = content as ExperienceContent & {
    design?: PageDesign;
  };
  return (design ? { ...rest, design } : rest) as ExperienceContent;
}

type LinkInput = { id: string; label: string; url: string };

/** What the shared renderer (`@kardo/page-render`) needs from the content. */
export type { DesignableContent };

type ContentFormField = "hidden" | "optional" | "required";

type AnyContent = {
  title?: string;
  description?: string;
  displayName?: string;
  headline?: string;
  biography?: string;
  bio?: string;
  avatarAssetId?: string;
  links?: (LinkInput & { highlight?: boolean })[];
  socials?: SocialLink[];
  // Menú
  currency?: string;
  sections?: {
    id: string;
    name: string;
    items: {
      id: string;
      name: string;
      description?: string;
      price?: number;
      imageAssetId?: string;
      /** «Menú del día» (relevo 37, D1): guisados a elegir. */
      choices?: { id: string; name: string }[];
      choicesLabel?: string;
    }[];
  }[];
  // Catálogo
  items?: {
    id: string;
    name: string;
    description?: string;
    price?: number;
    url?: string;
    imageAssetId?: string;
  }[];
  // Formulario
  fields?: {
    name: ContentFormField;
    phone: ContentFormField;
    message: ContentFormField;
  };
  submitLabel?: string;
  successMessage?: string;
  consentText?: string;
  privacyNoticeUrl?: string;
  // PDF
  assetId?: string;
  display?: "download" | "viewer";
  pages?: { assetId: string; width: number; height: number }[];
  allowDownload?: boolean;
  // Imagen
  alt?: string;
};

function optional<K extends string>(
  key: K,
  value: string | undefined,
): Partial<Record<K, string>> {
  const trimmed = value?.trim();
  return trimmed ? ({ [key]: trimmed } as Record<K, string>) : {};
}

function optionalNumber<K extends string>(
  key: K,
  value: number | undefined,
): Partial<Record<K, number>> {
  return value !== undefined ? ({ [key]: value } as Record<K, number>) : {};
}

export function toDesignableContent(
  type: DesignableExperienceType,
  content: ExperienceContent,
): DesignableContent {
  const value = content as AnyContent;
  const links = (value.links ?? []).map((link) => ({
    id: link.id,
    label: link.label,
    url: link.url,
    ...(type === "linkpage" && link.highlight ? { highlight: true } : {}),
  }));
  switch (type) {
    case "links":
      return {
        type,
        title: value.title ?? "",
        ...optional("description", value.description),
        links,
      };
    case "profile":
      return {
        type,
        displayName: value.displayName ?? "",
        ...optional("headline", value.headline),
        ...optional("biography", value.biography),
        ...optional("avatarRef", value.avatarAssetId),
        links,
      };
    case "linkpage":
      return {
        type,
        displayName: value.displayName ?? "",
        ...optional("bio", value.bio),
        ...optional("avatarRef", value.avatarAssetId),
        socials: value.socials ?? [],
        links,
      };
    case "menu":
      return {
        type,
        title: value.title ?? "",
        ...optional("description", value.description),
        currency: value.currency ?? "MXN",
        sections: (value.sections ?? []).map((section) => ({
          id: section.id,
          name: section.name,
          items: section.items.map((item) => ({
            id: item.id,
            name: item.name,
            ...optional("description", item.description),
            ...optionalNumber("price", item.price),
            ...optional("imageRef", item.imageAssetId),
            // «Menú del día» (relevo 37, D1): guisados a elegir, so the
            // preview shows them the same way the Resolver does.
            ...(item.choices?.length ? { choices: item.choices } : {}),
            ...optional("choicesLabel", item.choicesLabel),
          })),
        })),
      };
    case "catalog":
      return {
        type,
        title: value.title ?? "",
        ...optional("description", value.description),
        currency: value.currency ?? "MXN",
        items: (value.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          ...optional("description", item.description),
          ...optionalNumber("price", item.price),
          ...optional("url", item.url),
          ...optional("imageRef", item.imageAssetId),
        })),
      };
    case "form":
      return {
        type,
        title: value.title ?? "",
        ...optional("description", value.description),
        fields: value.fields ?? {
          name: "optional",
          phone: "optional",
          message: "required",
        },
        submitLabel: value.submitLabel ?? "Enviar",
        successMessage:
          value.successMessage ?? "¡Gracias! Te contactaremos pronto.",
        consentText: value.consentText ?? "",
        ...optional("privacyNoticeUrl", value.privacyNoticeUrl),
      };
    case "document":
      return {
        type,
        title: value.title ?? "",
        ...optional("description", value.description),
        display: value.display ?? "download",
        pages: (value.pages ?? []).map((page) => ({
          ref: page.assetId,
          width: page.width,
          height: page.height,
        })),
        allowDownload: value.allowDownload ?? false,
      };
    case "image":
      return {
        type,
        alt: value.alt ?? "",
        imageRef: value.assetId ?? "",
      };
  }
}

/** The page title of a designed document (the browser tab). Every
 * designable type but `image` carries one (`title` or `displayName`). */
export function contentTitle(
  type: DesignableExperienceType,
  content: ExperienceContent,
): string {
  const value = content as AnyContent;
  const title =
    type === "profile" || type === "linkpage" ? value.displayName : value.title;
  return title?.trim() || "Kardo";
}
