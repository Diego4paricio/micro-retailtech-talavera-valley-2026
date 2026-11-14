import type {
  DesignableExperienceType,
  ExperienceContent,
} from "@kardo/contracts";

/**
 * Maps a `validateContent` error path (`features/experiences/content.ts`,
 * e.g. `sections.0.items.2.name`) to the DOM id its own field editor gives
 * it, so a failed save's first error can be scrolled into view and focused
 * (relevo 37, C5c — Ana's empty product never surfaced beyond a toast on
 * her phone) instead of just naming the field in a message. Each editor's
 * id convention is read off `features/experiences/editors/*` (not owned by
 * this session, so these must be kept in sync by hand if that convention
 * ever changes); a path this does not recognize returns `null` and nothing
 * is focused, same as before this existed.
 */

type Indexed = Record<string, unknown>;

function at<T>(list: unknown, index: number): T | undefined {
  return Array.isArray(list) ? (list[index] as T | undefined) : undefined;
}

const simpleFieldIds: Partial<
  Record<DesignableExperienceType, Record<string, string>>
> = {
  links: { title: "links-title", description: "links-description" },
  profile: {
    displayName: "profile-name",
    headline: "profile-headline",
    biography: "profile-biography",
  },
  linkpage: { displayName: "linkpage-name", bio: "linkpage-bio" },
  menu: { title: "menu-title", description: "menu-description" },
  catalog: { title: "catalog-title", description: "catalog-description" },
  form: {
    title: "form-title",
    description: "form-description",
    submitLabel: "form-submit",
    successMessage: "form-success",
    consentText: "form-consent",
    privacyNoticeUrl: "form-privacy-url",
  },
  document: {
    title: "document-title",
    description: "document-description",
    assetId: "document-asset",
  },
  image: { assetId: "image-asset", alt: "image-alt" },
};

export function contentFieldDomId(
  type: DesignableExperienceType,
  content: ExperienceContent,
  field: string,
): string | null {
  const [head, ...rest] = field.split(".");
  if (!head) return null;
  const value = content as Indexed;

  if (type === "menu" && head === "sections") {
    const sectionIndex = Number(rest[0]);
    const section = at<{ id: string; items: unknown }>(
      value.sections,
      sectionIndex,
    );
    if (!section) return null;
    if (rest[1] === "name") return `section-${section.id}-name`;
    if (rest[1] === "items") {
      const item = at<{ id: string }>(section.items, Number(rest[2]));
      const attr = rest[3];
      return item && attr ? `item-${item.id}-${attr}` : null;
    }
    return null;
  }

  if (type === "catalog" && head === "items") {
    const item = at<{ id: string }>(value.items, Number(rest[0]));
    const attr = rest[1];
    return item && attr ? `catalog-${item.id}-${attr}` : null;
  }

  if (head === "links") {
    const link = at<{ id: string }>(value.links, Number(rest[0]));
    const attr = rest[1];
    if (!link || !attr) return null;
    return type === "linkpage"
      ? `linkpage-button-${link.id}-${attr}`
      : `link-${link.id}-${attr}`;
  }

  if (type === "linkpage" && head === "socials") {
    const social = at<{ id: string }>(value.socials, Number(rest[0]));
    return social ? `social-${social.id}-value` : null;
  }

  return simpleFieldIds[type]?.[head] ?? null;
}
