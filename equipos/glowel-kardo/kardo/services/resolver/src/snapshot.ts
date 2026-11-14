import {
  type DesignableExperienceType,
  type DesignCheckContext,
  DOCUMENT_VIEWER_MAX_PAGES,
  designBlocks,
  type PageDesign,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import {
  parsePublishedCustomHtml,
  parsePublishedDesign,
} from "@kardo/page-render";

// ---------------------------------------------------------------------------
// Published snapshot shapes. These mirror the per-type contracts in
// @kardo/contracts and the shapes the Publisher assembles in
// services/publisher/src/index.ts. Duplicated here (rather than shared)
// because the Resolver re-validates every snapshot it reads from R2 before
// treating it as safe to render or redirect to.
// ---------------------------------------------------------------------------

export type LinkItem = { id: string; label: string; url: string };

export type MenuChoice = { id: string; name: string };
export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  imageSha256?: string;
  /** «Menú del día» (relevo 37, D1): dishes to choose from, each sold out
   * on its own by the live availability. */
  choices?: MenuChoice[];
  choicesLabel?: string;
};
export type MenuSection = { id: string; name: string; items: MenuItem[] };

export type CatalogItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  url?: string;
  imageSha256?: string;
};

export type FormFieldSetting = "hidden" | "optional" | "required";
export type FormFields = {
  name: FormFieldSetting;
  phone: FormFieldSetting;
  message: FormFieldSetting;
};

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export type AssetRef = {
  sha256: string;
  mediaType: ImageMediaType | "application/pdf";
};

export function isImageMediaType(value: unknown): value is ImageMediaType {
  return (
    value === "image/png" || value === "image/jpeg" || value === "image/webp"
  );
}

/** Page theme as published: closed choices and `#rrggbb` colors only; an
 * image background is referenced by the asset's content hash and must match
 * an entry in the snapshot's `assets` list. Mirrors
 * services/publisher/src/index.ts's `SnapshotTheme`. */
export type SnapshotTheme = {
  background: {
    kind: "solid" | "gradient" | "image";
    color: string;
    colorTo?: string;
    angle?: number;
    imageSha256?: string;
    overlay?: number;
  };
  surface: "light" | "dark";
  accent: string;
  buttonStyle: "pill" | "rounded" | "square" | "outline";
  font: "sans" | "serif" | "rounded" | "mono";
};

export type SocialNetwork =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "x"
  | "youtube"
  | "linkedin"
  | "whatsapp"
  | "threads"
  | "pinterest"
  | "spotify"
  | "telegram"
  | "website"
  | "email"
  | "phone";

export type SocialLink = {
  id: string;
  network: SocialNetwork;
  /** HTTPS URL, or an email address / phone digits for those networks. */
  value: string;
};

/** Estudio de Experiences — "modo HTML" (ADR 018, extended 2026-09-29).
 * Already `@kardo/page-render`'s `prepareCustomHtml` output as the Publisher
 * left it: every `kardo-asset:<uuid>` rewritten to its content hash, every
 * tracked `<a>` tokenized to `kardo-link:<id>` with the real URL in `links`.
 * Validated by `parsePublishedCustomHtml` — mirrors `SnapshotTheme`/
 * `PageDesign`'s own re-validation on read. */
export type SnapshotCustomHtml = {
  html: string;
  css: string;
  links: { id: string; url: string }[];
};

/** One page of a visor de PDF: an image asset of this snapshot (sha256)
 * and its drawn size in px. */
export type SnapshotDocumentPage = {
  sha256: string;
  width: number;
  height: number;
};

export type ExperiencePayload = (
  | { type: "redirect"; destinationUrl: string }
  | {
      type: "links";
      title: string;
      description?: string;
      links: LinkItem[];
      /** Estudio de Experiences (ADR 018); replaces `theme` in rendering when
       * present. Validated by `parsePublishedDesign` (`@kardo/page-render`):
       * every `imageRef` is already this snapshot's asset sha256. */
      design?: PageDesign;
      /** "modo HTML" (ADR 018, extended 2026-09-29). Takes precedence over
       * `design`/`theme` when present — see `renderExperiencePage`. */
      customHtml?: SnapshotCustomHtml;
    }
  | {
      type: "profile";
      displayName: string;
      headline?: string;
      biography?: string;
      avatarSha256?: string;
      links: LinkItem[];
      design?: PageDesign;
      customHtml?: SnapshotCustomHtml;
    }
  | {
      type: "image";
      alt: string;
      /** Estudio (ADR 018, addendum 3): the main image is the snapshot's
       * first asset (`assets[0]`); `design` replaces `theme` when present. */
      design?: PageDesign;
    }
  | {
      type: "document";
      title: string;
      description?: string;
      /** Visor de PDF (addendum 3). Absent: "download". The PDF itself is
       * always `assets[0]`; `pages` are its pages drawn as images. */
      display?: "download" | "viewer";
      pages?: SnapshotDocumentPage[];
      allowDownload?: boolean;
      design?: PageDesign;
    }
  | {
      type: "menu";
      title: string;
      description?: string;
      currency: string;
      sections: MenuSection[];
      design?: PageDesign;
    }
  | {
      type: "catalog";
      title: string;
      description?: string;
      currency: string;
      items: CatalogItem[];
      design?: PageDesign;
    }
  | {
      type: "form";
      title: string;
      description?: string;
      fields: FormFields;
      submitLabel: string;
      successMessage: string;
      consentText: string;
      privacyNoticeUrl?: string;
      design?: PageDesign;
    }
  | {
      type: "linkpage";
      displayName: string;
      bio?: string;
      avatarSha256?: string;
      socials: SocialLink[];
      links: (LinkItem & { highlight?: boolean })[];
      design?: PageDesign;
      customHtml?: SnapshotCustomHtml;
    }
) & { theme?: SnapshotTheme };

export type PublishCommand = {
  publicId: string;
  revision: number;
  experience?: ExperiencePayload;
  /** Legacy single-asset compatibility field for image/document. */
  asset?: AssetRef & { title: string };
  /** Canonical list of every asset the experience references. */
  assets?: AssetRef[];
  /** Legacy top-level field kept for redirect snapshots stored before the
   * experience-shaped command existed. */
  destinationUrl?: string;
  /** The Experience this snapshot was published from, as a canonical
   * (lowercase) uuid. Absent on snapshots published before this field
   * existed — those simply never get live item availability applied. Used
   * only to key the `ItemAvailabilityState` Durable Object that holds live
   * Menu/Catalog item availability, which is deliberately NOT part of this
   * immutable snapshot (see item-availability.ts). */
  experienceId?: string;
};

export type PublishedSnapshot = PublishCommand & {
  schemaVersion: 1;
  status: "active";
};

const publicIdPattern = /^[A-Za-z0-9_-]{16,32}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const itemIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const currencyPattern = /^[A-Z]{3}$/;
/** Canonical (lowercase) uuid, mirroring the Publisher's `isUuid`. Used to
 * validate a snapshot's optional `experienceId`. */
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && publicIdPattern.test(value);
}

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && canonicalUuidPattern.test(value);
}

export function publishCommand(value: unknown): PublishCommand | null {
  if (!isRecord(value)) return null;
  const {
    publicId,
    revision,
    experience,
    asset,
    assets,
    destinationUrl,
    experienceId,
  } = value;
  if (!isPublicId(publicId)) return null;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 1
  )
    return null;
  if (experienceId !== undefined && !isCanonicalUuid(experienceId)) return null;

  if (asset !== undefined && !isLegacyAsset(asset)) return null;
  if (assets !== undefined && !isAssetRefArray(assets)) return null;

  // Every asset the command lists, legacy field first: a theme's image
  // background must reference one of these (by hash and image media type)
  // before the experience can be considered valid.
  const availableAssets: AssetRef[] = [
    ...(asset !== undefined && isLegacyAsset(asset) ? [asset] : []),
    ...(assets !== undefined && isAssetRefArray(assets) ? assets : []),
  ];

  const hasExperience = experience !== undefined;
  if (hasExperience && !isExperiencePayload(experience, availableAssets))
    return null;

  const legacyDestinationValid =
    typeof destinationUrl === "string" && isSafeUrl(destinationUrl);
  const legacyAssetValid = asset !== undefined && isLegacyAsset(asset);
  if (!hasExperience && !legacyDestinationValid && !legacyAssetValid)
    return null;

  return {
    publicId,
    revision,
    ...(hasExperience ? { experience: experience as ExperiencePayload } : {}),
    ...(legacyDestinationValid
      ? { destinationUrl: destinationUrl as string }
      : {}),
    ...(legacyAssetValid
      ? { asset: asset as AssetRef & { title: string } }
      : {}),
    ...(assets !== undefined ? { assets: assets as AssetRef[] } : {}),
    ...(experienceId !== undefined
      ? { experienceId: experienceId as string }
      : {}),
  };
}

export function publishedSnapshot(value: unknown): PublishedSnapshot | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.status !== "active"
  )
    return null;
  const command = publishCommand(value);
  return command ? { schemaVersion: 1, status: "active", ...command } : null;
}

/** Every asset the snapshot references, legacy field first, for lookup by hash. */
export function allAssetRefs(snapshot: PublishedSnapshot): AssetRef[] {
  const list: AssetRef[] = [];
  if (snapshot.asset) list.push(snapshot.asset);
  if (snapshot.assets) list.push(...snapshot.assets);
  return list;
}

/**
 * Resolves the destination URL for a `/go/{itemId}` tracked click. Only ever
 * looks an id up inside the already-validated, currently active snapshot —
 * never accepts a URL from the request itself, so this cannot become an open
 * redirect.
 */
export function findLinkableUrl(
  snapshot: PublishedSnapshot,
  itemId: string,
): string | null {
  const experience = snapshot.experience;
  if (!experience) return null;
  const contentUrl = contentLinkHref(experience, itemId);
  if (contentUrl) return contentUrl;
  if ("customHtml" in experience) {
    const customHtmlUrl = customHtmlLinkHref(experience.customHtml, itemId);
    if (customHtmlUrl) return customHtmlUrl;
  }
  // Every type that renders a page can carry a design (Menú, Catálogo,
  // Formulario, Imagen and PDF since addendum 3), and its buttons always
  // link through this route: skipping a type here is a 404 on a published
  // button and a click that never reaches Analítica (2026-10-03 study).
  if ("design" in experience)
    return designButtonHref(experience.design, itemId);
  return null;
}

/** The content's own tracked items: links, linkpage socials and a catalog
 * product's "Ver más". */
function contentLinkHref(
  experience: ExperiencePayload,
  itemId: string,
): string | null {
  if (
    experience.type === "links" ||
    experience.type === "profile" ||
    experience.type === "linkpage"
  ) {
    const link = experience.links.find((item) => item.id === itemId);
    if (link) return link.url;
  }
  if (experience.type === "linkpage") {
    const social = experience.socials.find((item) => item.id === itemId);
    if (social) return socialHref(social);
  }
  if (experience.type === "catalog")
    return experience.items.find((item) => item.id === itemId)?.url ?? null;
  return null;
}

/** Estudio de Experiences (ADR 018): a design `button` or `brandButton`
 * block is tracked through this same `/go/{itemId}` route, exactly like a
 * content link — its href never comes from the request, only from a block
 * id already validated by `parsePublishedDesign` inside this same active
 * snapshot. */
function designButtonHref(
  design: PageDesign | undefined,
  itemId: string,
): string | null {
  if (!design) return null;
  for (const block of designBlocks(design)) {
    if (
      (block.kind === "button" || block.kind === "brandButton") &&
      block.id === itemId
    )
      return block.href;
  }
  return null;
}

/** "modo HTML" (ADR 018, extended 2026-09-29): a tracked `<a>` inside
 * `customHtml` resolves through this same `/go/{itemId}` route — never a URL
 * from the request, only an id already validated by
 * `parsePublishedCustomHtml` inside this same active snapshot. */
function customHtmlLinkHref(
  customHtml: SnapshotCustomHtml | undefined,
  itemId: string,
): string | null {
  if (!customHtml) return null;
  return customHtml.links.find((link) => link.id === itemId)?.url ?? null;
}

/** Builds the actual redirect target for a linkpage social entry: the go
 * route is the only place this ever needs computing (the rendered page
 * always links through the tracked route by id, never a raw href), which is
 * also why an https/mailto/tel destination here can never become an open
 * redirect — it is derived only from the already-validated, active
 * snapshot, never from anything in the incoming request. */
function socialHref(social: SocialLink): string {
  if (social.network === "email")
    return `mailto:${encodeURIComponent(social.value)}`;
  if (social.network === "phone")
    return `tel:+${social.value.replace(/[^0-9]/g, "")}`;
  return social.value;
}

// ---------------------------------------------------------------------------
// Per-type validation
// ---------------------------------------------------------------------------

function isExperiencePayload(
  value: unknown,
  assets: AssetRef[],
): value is ExperiencePayload {
  if (!isRecord(value)) return false;
  // A theme is optional on every experience type (redirects never render a
  // page and so never actually carry one, but nothing here needs to special
  // case that: an absent `theme` is always valid).
  if (value.theme !== undefined && !isTheme(value.theme, assets)) return false;
  switch (value.type) {
    case "redirect":
      return isSafeUrl(value.destinationUrl);
    case "links": {
      if (
        !isSafeText(value.title, 120) ||
        !isOptionalText(value.description, 500) ||
        !isLinks(value.links, 1, 12)
      )
        return false;
      const links = value.links as LinkItem[];
      return (
        isDesignValid(
          value.design,
          "links",
          assets,
          links.map((link) => link.id),
        ) && isCustomHtmlValid(value.customHtml, assets)
      );
    }
    case "profile": {
      if (
        !isSafeText(value.displayName, 120) ||
        !isOptionalText(value.headline, 160) ||
        !isOptionalText(value.biography, 1000) ||
        (value.avatarSha256 !== undefined && !isSha256(value.avatarSha256)) ||
        !isLinks(value.links, 0, 8)
      )
        return false;
      const links = value.links as LinkItem[];
      return (
        isDesignValid(
          value.design,
          "profile",
          assets,
          links.map((link) => link.id),
        ) && isCustomHtmlValid(value.customHtml, assets)
      );
    }
    case "image":
      return (
        isSafeText(value.alt, 250) &&
        isDesignValid(value.design, "image", assets, [])
      );
    case "document":
      return isDocument(value, assets);
    case "menu":
      return isMenu(value, assets);
    case "catalog":
      return isCatalog(value, assets);
    case "form":
      return isForm(value, assets);
    case "linkpage":
      return isLinkPage(value, assets);
    default:
      return false;
  }
}

/** Estudio de Experiences (ADR 018). `assets` is this snapshot's own asset
 * list (already validated shape-wise by the caller); an absent `design` is
 * always valid — designs are optional on every type that can carry one.
 * `context` carries whatever else `checkDesign` needs to cross-check (today
 * only `menuSectionIds`, for a `menu` block's `sectionIds`). */
function isDesignValid(
  rawDesign: unknown,
  type: DesignableExperienceType,
  assets: AssetRef[],
  itemIds: readonly string[],
  context: DesignCheckContext = {},
): boolean {
  if (rawDesign === undefined) return true;
  const imageHashes = new Set(
    assets
      .filter((ref) => isImageMediaType(ref.mediaType))
      .map((ref) => ref.sha256),
  );
  return (
    parsePublishedDesign(rawDesign, type, imageHashes, itemIds, context) !==
    null
  );
}

/** "modo HTML" (ADR 018, extended 2026-09-29). An absent `customHtml` is
 * always valid — mirrors `isDesignValid`. */
function isCustomHtmlValid(
  rawCustomHtml: unknown,
  assets: AssetRef[],
): boolean {
  if (rawCustomHtml === undefined) return true;
  const imageHashes = new Set(
    assets
      .filter((ref) => isImageMediaType(ref.mediaType))
      .map((ref) => ref.sha256),
  );
  return parsePublishedCustomHtml(rawCustomHtml, imageHashes) !== null;
}

// ---------------------------------------------------------------------------
// Theme validation: closed enums, `#rrggbb` colors only, integer angle/overlay
// within range, and an image background hash that must match a real, image
// asset in this same snapshot. Mirrors the Publisher's `buildTheme`.
// ---------------------------------------------------------------------------

const themeBackgroundKinds = ["solid", "gradient", "image"] as const;
const themeSurfaces = ["light", "dark"] as const;
const themeButtonStyles = ["pill", "rounded", "square", "outline"] as const;
const themeFonts = ["sans", "serif", "rounded", "mono"] as const;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && hexColorPattern.test(value);
}
function isThemeInt(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isTheme(value: unknown, assets: AssetRef[]): value is SnapshotTheme {
  if (!isRecord(value) || !isRecord(value.background)) return false;
  const background = value.background;
  if (
    !themeBackgroundKinds.includes(
      background.kind as (typeof themeBackgroundKinds)[number],
    ) ||
    !isHexColor(background.color) ||
    (background.colorTo !== undefined && !isHexColor(background.colorTo)) ||
    (background.angle !== undefined && !isThemeInt(background.angle, 0, 360)) ||
    (background.overlay !== undefined &&
      !isThemeInt(background.overlay, 0, 80)) ||
    !themeSurfaces.includes(value.surface as (typeof themeSurfaces)[number]) ||
    !isHexColor(value.accent) ||
    !themeButtonStyles.includes(
      value.buttonStyle as (typeof themeButtonStyles)[number],
    ) ||
    !themeFonts.includes(value.font as (typeof themeFonts)[number])
  )
    return false;
  const kind = background.kind as SnapshotTheme["background"]["kind"];
  if (kind === "gradient" && background.colorTo === undefined) return false;
  if (kind === "image") {
    if (!isSha256(background.imageSha256)) return false;
    const matches = assets.some(
      (ref) =>
        ref.sha256 === background.imageSha256 &&
        isImageMediaType(ref.mediaType),
    );
    if (!matches) return false;
  } else if (background.imageSha256 !== undefined) {
    // An image hash on a solid/gradient background is not part of the
    // closed shape: fail closed rather than silently ignore stray fields.
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Link page ("linkpage") validation: a display name, optional bio/avatar, a
// bounded list of social entries and a bounded list of highlightable links.
// Ids must be unique across both lists — the tracked click route resolves an
// id against either.
// ---------------------------------------------------------------------------

const socialNetworkSet = new Set<SocialNetwork>([
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "linkedin",
  "whatsapp",
  "threads",
  "pinterest",
  "spotify",
  "telegram",
  "website",
  "email",
  "phone",
]);
const emailPattern = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,}$/;
const phoneValuePattern = /^\+?[0-9]{6,15}$/;

function isLinkPageLink(
  value: unknown,
): value is LinkItem & { highlight?: boolean } {
  return (
    isRecord(value) &&
    isItemId(value.id) &&
    isSafeText(value.label, 120) &&
    isSafeUrl(value.url) &&
    (value.highlight === undefined || typeof value.highlight === "boolean")
  );
}

function isSocialLink(value: unknown): value is SocialLink {
  if (!isRecord(value) || !isItemId(value.id)) return false;
  if (
    typeof value.network !== "string" ||
    !socialNetworkSet.has(value.network as SocialNetwork)
  )
    return false;
  if (typeof value.value !== "string") return false;
  const network = value.network as SocialNetwork;
  if (network === "email") return emailPattern.test(value.value);
  if (network === "phone") return phoneValuePattern.test(value.value);
  return isSafeUrl(value.value);
}

function isLinkPage(
  value: Record<string, unknown>,
  assets: AssetRef[],
): value is {
  type: "linkpage";
  displayName: string;
  bio?: string;
  avatarSha256?: string;
  socials: SocialLink[];
  links: (LinkItem & { highlight?: boolean })[];
  design?: PageDesign;
  customHtml?: SnapshotCustomHtml;
} {
  if (
    !isSafeText(value.displayName, 120) ||
    !isOptionalText(value.bio, 300) ||
    (value.avatarSha256 !== undefined && !isSha256(value.avatarSha256)) ||
    !Array.isArray(value.links) ||
    value.links.length > 20 ||
    !value.links.every(isLinkPageLink) ||
    !Array.isArray(value.socials) ||
    value.socials.length > 12 ||
    !value.socials.every(isSocialLink)
  )
    return false;
  const links = value.links as (LinkItem & { highlight?: boolean })[];
  const socials = value.socials as SocialLink[];
  if (links.length === 0 && socials.length === 0) return false;
  const ids = new Set<string>();
  for (const item of [...links, ...socials]) {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return (
    isDesignValid(value.design, "linkpage", assets, [...ids]) &&
    isCustomHtmlValid(value.customHtml, assets)
  );
}

function isLinkItem(value: unknown): value is LinkItem {
  return (
    isRecord(value) &&
    isItemId(value.id) &&
    isSafeText(value.label, 120) &&
    isSafeUrl(value.url)
  );
}

function isLinks(
  value: unknown,
  min: number,
  max: number,
): value is LinkItem[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every(isLinkItem)
  );
}

/** A Menu item's `imageSha256`, unlike Catalog's, must reference a real image
 * asset in this same snapshot — the same check `isTheme` applies to an image
 * background. (Catalog validation is intentionally left as-is: it only
 * checks the hash's shape.) */
function isMenuItem(value: unknown, assets: AssetRef[]): value is MenuItem {
  if (
    !isRecord(value) ||
    !isItemId(value.id) ||
    !isSafeText(value.name, 120) ||
    !isOptionalText(value.description, 200) ||
    !isOptionalPrice(value.price) ||
    !isOptionalMenuChoices(value.choices) ||
    !(value.choicesLabel === undefined || isSafeText(value.choicesLabel, 40))
  )
    return false;
  if (value.imageSha256 !== undefined) {
    if (!isSha256(value.imageSha256)) return false;
    const matches = assets.some(
      (ref) =>
        ref.sha256 === value.imageSha256 && isImageMediaType(ref.mediaType),
    );
    if (!matches) return false;
  }
  return true;
}

function isOptionalMenuChoices(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length >= 1 &&
      value.length <= 12 &&
      value.every(
        (choice) =>
          isRecord(choice) &&
          isItemId(choice.id) &&
          isSafeText(choice.name, 120),
      ))
  );
}

function isMenuSection(
  value: unknown,
  assets: AssetRef[],
): value is MenuSection {
  return (
    isRecord(value) &&
    isItemId(value.id) &&
    isSafeText(value.name, 120) &&
    Array.isArray(value.items) &&
    value.items.length >= 1 &&
    value.items.length <= 30 &&
    value.items.every((item) => isMenuItem(item, assets))
  );
}

function isMenu(
  value: Record<string, unknown>,
  assets: AssetRef[],
): value is {
  type: "menu";
  title: string;
  description?: string;
  currency: string;
  sections: MenuSection[];
  design?: PageDesign;
} {
  if (
    !isSafeText(value.title, 120) ||
    !isOptionalText(value.description, 500) ||
    !isCurrency(value.currency) ||
    !Array.isArray(value.sections) ||
    value.sections.length < 1 ||
    value.sections.length > 10 ||
    !value.sections.every((section) => isMenuSection(section, assets))
  )
    return false;
  const sections = value.sections as MenuSection[];
  const total = sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  if (total > 150) return false;
  // Estudio de Experiences (ADR 018, addendum 3): a `menu` design block may
  // only name sections the menu itself has. `featuredItems` (motor de 3
  // bloques, 2026-10-03) may only name real dishes.
  const menuSectionIds = sections.map((section) => section.id);
  const menuItemIds = sections.flatMap((section) =>
    section.items.map((item) => item.id),
  );
  const itemIds = [...menuSectionIds, ...menuItemIds];
  return isDesignValid(value.design, "menu", assets, itemIds, {
    menuSectionIds,
    featurableItemIds: menuItemIds,
  });
}

function isCatalogItem(value: unknown): value is CatalogItem {
  return (
    isRecord(value) &&
    isItemId(value.id) &&
    isSafeText(value.name, 120) &&
    isOptionalText(value.description, 300) &&
    isOptionalPrice(value.price) &&
    (value.url === undefined || isSafeUrl(value.url)) &&
    (value.imageSha256 === undefined || isSha256(value.imageSha256))
  );
}

function isCatalog(
  value: Record<string, unknown>,
  assets: AssetRef[],
): value is {
  type: "catalog";
  title: string;
  description?: string;
  currency: string;
  items: CatalogItem[];
  design?: PageDesign;
} {
  if (
    !isSafeText(value.title, 120) ||
    !isOptionalText(value.description, 500) ||
    !isCurrency(value.currency) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 48 ||
    !value.items.every(isCatalogItem)
  )
    return false;
  const items = value.items as CatalogItem[];
  const catalogItemIds = items.map((item) => item.id);
  return isDesignValid(value.design, "catalog", assets, catalogItemIds, {
    featurableItemIds: catalogItemIds,
  });
}

function isFieldSetting(value: unknown): value is FormFieldSetting {
  return value === "hidden" || value === "optional" || value === "required";
}

function isForm(
  value: Record<string, unknown>,
  assets: AssetRef[],
): value is {
  type: "form";
  title: string;
  description?: string;
  fields: FormFields;
  submitLabel: string;
  successMessage: string;
  consentText: string;
  privacyNoticeUrl?: string;
  design?: PageDesign;
} {
  return (
    isSafeText(value.title, 120) &&
    isOptionalText(value.description, 500) &&
    isRecord(value.fields) &&
    isFieldSetting(value.fields.name) &&
    isFieldSetting(value.fields.phone) &&
    isFieldSetting(value.fields.message) &&
    isSafeText(value.submitLabel, 40) &&
    isSafeText(value.successMessage, 200) &&
    isSafeText(value.consentText, 300) &&
    (value.privacyNoticeUrl === undefined ||
      isSafeUrl(value.privacyNoticeUrl)) &&
    isDesignValid(value.design, "form", assets, [])
  );
}

// ---------------------------------------------------------------------------
// Visor de PDF (ADR 018, addendum 3): `display` ("download"/"viewer"),
// `pages` drawn as images (each a real image asset of this same snapshot,
// mirroring `isMenuItem`'s own image hash check) and `allowDownload`.
// ---------------------------------------------------------------------------

function isPageDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10_000
  );
}

function isDocumentPage(
  value: unknown,
  assets: AssetRef[],
): value is SnapshotDocumentPage {
  if (
    !isRecord(value) ||
    !isSha256(value.sha256) ||
    !isPageDimension(value.width) ||
    !isPageDimension(value.height)
  )
    return false;
  return assets.some(
    (ref) => ref.sha256 === value.sha256 && isImageMediaType(ref.mediaType),
  );
}

function isDocument(
  value: Record<string, unknown>,
  assets: AssetRef[],
): value is {
  type: "document";
  title: string;
  description?: string;
  display?: "download" | "viewer";
  pages?: SnapshotDocumentPage[];
  allowDownload?: boolean;
  design?: PageDesign;
} {
  if (!isSafeText(value.title, 120) || !isOptionalText(value.description, 500))
    return false;
  if (
    value.display !== undefined &&
    value.display !== "download" &&
    value.display !== "viewer"
  )
    return false;
  if (
    value.allowDownload !== undefined &&
    typeof value.allowDownload !== "boolean"
  )
    return false;
  let pages: SnapshotDocumentPage[] | undefined;
  if (value.pages !== undefined) {
    if (
      !Array.isArray(value.pages) ||
      value.pages.length > DOCUMENT_VIEWER_MAX_PAGES ||
      !value.pages.every((page) => isDocumentPage(page, assets))
    )
      return false;
    pages = value.pages as SnapshotDocumentPage[];
  }
  if (value.display === "viewer" && (!pages || pages.length < 1)) return false;
  return isDesignValid(value.design, "document", assets, []);
}

function isAssetRef(value: unknown): value is AssetRef {
  return (
    isRecord(value) &&
    isSha256(value.sha256) &&
    (isImageMediaType(value.mediaType) || value.mediaType === "application/pdf")
  );
}

function isAssetRefArray(value: unknown): value is AssetRef[] {
  return Array.isArray(value) && value.every(isAssetRef);
}

function isLegacyAsset(value: unknown): value is AssetRef & { title: string } {
  return (
    isAssetRef(value) &&
    isSafeText((value as Record<string, unknown>).title, 120)
  );
}

function isSafeUrl(value: unknown): value is string {
  return typeof value === "string" && normalizePublicHttpsUrl(value) === value;
}
function isSha256(value: unknown): value is string {
  return typeof value === "string" && sha256Pattern.test(value);
}
function isItemId(value: unknown): value is string {
  return typeof value === "string" && itemIdPattern.test(value);
}
function isCurrency(value: unknown): value is string {
  return typeof value === "string" && currencyPattern.test(value);
}
function isSafeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}
function isOptionalText(value: unknown, max: number): boolean {
  return (
    value === undefined || (typeof value === "string" && value.length <= max)
  );
}
function isOptionalPrice(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 10_000_000)
  );
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
