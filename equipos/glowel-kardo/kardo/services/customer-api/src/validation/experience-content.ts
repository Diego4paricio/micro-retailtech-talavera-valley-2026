import {
  type CustomHtml,
  checkDesign,
  type DesignableExperienceType,
  type DesignCheckContext,
  DOCUMENT_VIEWER_MAX_PAGES,
  designableExperienceTypes,
  designBlocks,
  designHtmlAssetRefs,
  designImageRefs,
  type ExperienceContent,
  type ExperienceContentByType,
  type ExperienceType,
  experienceContentSchemas,
  type PageDesign,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import { prepareCustomHtml } from "@kardo/page-render";
import { Value } from "@sinclair/typebox/value";
import { ContentValidationError } from "../errors.js";
// Side-effect only: registers the `uri`/`uuid`/... format checkers
// `Value.Check` needs to evaluate `@kardo/contracts` schemas at all. Must be
// imported before the first `Value.Check` call below.
import "./formats.js";

const MAX_MENU_ITEMS_TOTAL = 150;

export type AssetReferencePurpose =
  | "image"
  | "document"
  | "avatar"
  | "catalog-image"
  | "menu-image"
  | "design-image"
  | "background"
  | "custom-html-image"
  /** A visor de PDF page (`document.pages[].assetId`), addendum 3. */
  | "document-page";

export type AssetReference = {
  assetId: string;
  purpose: AssetReferencePurpose;
  /** Media type an asset in this workspace must already have: any
   * supported image (PNG, JPEG, WebP) or a PDF. */
  expectedMediaType: "image/*" | "application/pdf";
};

export type ValidatedExperienceContent = {
  content: ExperienceContent;
  assetReferences: readonly AssetReference[];
};

/**
 * Full server-side validation for Experience draft/version content, applied
 * on create, update and (re-)publish. Runs, in order:
 *
 *  1. Structural validation against `experienceContentSchemas[type]` from
 *     `@kardo/contracts`, via TypeBox's `Value.Check` (not just Fastify's
 *     request-body schema — this also protects legacy drafts re-validated at
 *     publish time and content read back from Postgres).
 *  2. Every public URL (redirect destination, link/profile/catalog URLs)
 *     re-normalized through `@kardo/domain`'s `normalizePublicHttpsUrl`, the
 *     single canonical "is this a safe public URL" rule shared with the
 *     Publisher and Resolver.
 *  3. Item id uniqueness within each own list (links, menu sections, menu
 *     items within a section, catalog items).
 *  4. The 150-total-item cap for a menu, which the per-section `maxItems: 30`
 *     schema limit alone cannot express.
 *
 * Callers still owe a database check for the returned `assetReferences`:
 * this module has no database access and cannot confirm an asset id belongs
 * to the workspace, is `validated`, or has the right media type.
 */
export function validateExperienceContent(
  type: ExperienceType,
  rawContent: unknown,
): ValidatedExperienceContent {
  const schema = experienceContentSchemas[type];
  if (!Value.Check(schema, rawContent)) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "The Experience content does not match the expected shape for its type.",
    );
  }

  // `Value.Check` narrows `rawContent` to the right static type, but only
  // within this call; clone it so downstream mutation (URL normalization)
  // never touches caller-owned data.
  const content = structuredClone(rawContent) as ExperienceContent;
  normalizeUrls(type, content);
  enforceItemIdUniqueness(type, content);
  enforceMenuItemLimit(type, content);
  enforceLinkPageRules(type, content);
  enforceThemeRules(content);
  enforceDocumentViewerRules(type, content);
  const designReferences = enforceDesignRules(type, content);
  const customHtmlReferences = enforceCustomHtmlRules(content);
  const assetReferences = [
    ...collectAssetReferences(type, content),
    ...collectThemeAssetReferences(content),
    ...designReferences,
    ...customHtmlReferences,
  ];
  return { content, assetReferences };
}

/** The Experience content's `customHtml`, if this type carries one (only
 * links, profile and linkpage do; the TypeBox schema already enforces
 * that, since no other type's schema declares the field). */
export function getCustomHtml(
  content: ExperienceContent,
): CustomHtml | undefined {
  return (content as { customHtml?: CustomHtml }).customHtml;
}

/** The Experience content's `design`, if this type carries one (the eight
 * `designableExperienceTypes`; every other type's schema has no such field). */
export function getDesign(content: ExperienceContent): PageDesign | undefined {
  return (content as { design?: PageDesign }).design;
}

const kardoAssetTokenPattern = /kardo-asset:([^\s"'()]+)/g;

/** Estudio de Experiences, modo HTML (owner decision, 2026-09-29): every
 * brief image and every `kardo-asset:<uuid>` token actually used in the
 * HTML/CSS source must be a workspace image asset id. The source itself is
 * kept exactly as written here (never sanitized): `@kardo/page-render`
 * sanitizes it for preview, publish and the public page. */
function enforceCustomHtmlRules(content: ExperienceContent): AssetReference[] {
  const customHtml = getCustomHtml(content);
  if (!customHtml) return [];

  const refs = new Set<string>();
  for (const ref of customHtml.brief?.imageRefs ?? []) refs.add(ref);
  for (const source of [customHtml.html, customHtml.css]) {
    for (const match of source.matchAll(kardoAssetTokenPattern)) {
      const token = match[1];
      if (!token) continue;
      if (!uuidPattern.test(token)) {
        throw new ContentValidationError(
          "INVALID_EXPERIENCE_CONTENT",
          "A kardo-asset image in the custom HTML must reference an image from your library.",
        );
      }
      refs.add(token);
    }
  }

  // An active page is published as the sanitizer leaves it, and every
  // tracked link must then pass the same URL rule as any other link (the
  // Publisher checks again). Say so while saving, not as a failed
  // publication later.
  if (customHtml.active) {
    const prepared = prepareCustomHtml({
      html: customHtml.html,
      css: customHtml.css,
    });
    for (const link of prepared.links) {
      if (!normalizePublicHttpsUrl(link.url)) {
        throw new ContentValidationError(
          "INVALID_EXPERIENCE_CONTENT",
          `Every link in the custom HTML must be a complete HTTPS address: ${link.url.slice(0, 200)}`,
        );
      }
    }
  }

  return [...refs].map((assetId) => ({
    assetId,
    purpose: "custom-html-image",
    expectedMediaType: "image/*",
  }));
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isDesignable(type: ExperienceType): type is DesignableExperienceType {
  return (designableExperienceTypes as readonly string[]).includes(type);
}

/**
 * The content item ids (and, for a Menú, the section ids `checkDesign` needs
 * as `context.menuSectionIds`; for a Menú or a Catálogo, the dish/product ids
 * it needs as `context.featurableItemIds`, for a `featuredItems` block,
 * motor de 3 bloques 2026-10-03) each designable type's own bound blocks may
 * reference. Links/profile/linkpage check a design's ids against their link
 * (and, for a link page, social) ids; menu and catalog check it against
 * their own sections/dishes or products; form, document and image have no
 * per-item content to check against at all.
 */
function designCheckInput(
  type: DesignableExperienceType,
  content: ExperienceContent,
): { itemIds: string[]; context: DesignCheckContext } {
  switch (type) {
    case "links":
    case "profile": {
      const c = content as { links?: { id: string }[] };
      return { itemIds: (c.links ?? []).map((link) => link.id), context: {} };
    }
    case "linkpage": {
      const c = content as ExperienceContentByType["linkpage"];
      return {
        itemIds: [
          ...c.links.map((link) => link.id),
          ...c.socials.map((social) => social.id),
        ],
        context: {},
      };
    }
    case "menu": {
      const c = content as ExperienceContentByType["menu"];
      const menuSectionIds = c.sections.map((section) => section.id);
      const menuItemIds = c.sections.flatMap((section) =>
        section.items.map((item) => item.id),
      );
      return {
        itemIds: [...menuSectionIds, ...menuItemIds],
        context: { menuSectionIds, featurableItemIds: menuItemIds },
      };
    }
    case "catalog": {
      const c = content as ExperienceContentByType["catalog"];
      const catalogItemIds = c.items.map((item) => item.id);
      return {
        itemIds: catalogItemIds,
        context: { featurableItemIds: catalogItemIds },
      };
    }
    case "form":
    case "document":
    case "image":
      return { itemIds: [], context: {} };
  }
}

/** Estudio de Experiences (ADR 018, addendum 3): the design must be allowed
 * for the type, follow the shared rules (`checkDesign`, with the type's own
 * item ids and context), reference library images by asset id — in flow
 * columns, canvases and backgrounds, and inside an `html` block's own
 * `kardo-asset:` tokens (best-effort scan; the block's actual safety comes
 * from the modo HTML sanitizer, run again at preview/publish/serve time) —
 * and only link to safe HTTPS URLs (normalized in place). */
function enforceDesignRules(
  type: ExperienceType,
  content: ExperienceContent,
): AssetReference[] {
  const design = getDesign(content);
  if (!design) return [];
  if (!isDesignable(type)) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "This type of Experience cannot be designed in the Estudio yet.",
    );
  }
  const { itemIds, context } = designCheckInput(type, content);
  const issues = checkDesign(type, design, itemIds, context);
  if (issues.length > 0) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      `The design is not valid: ${issues[0]?.message ?? "unknown rule"}`,
    );
  }
  for (const block of designBlocks(design)) {
    if (block.kind === "button" || block.kind === "brandButton")
      block.href = normalizeUrlOrThrow(block.href);
    if (block.kind === "image" && block.href)
      block.href = normalizeUrlOrThrow(block.href);
    if (block.kind === "text")
      for (const run of block.runs)
        if (run.href) run.href = normalizeUrlOrThrow(run.href);
  }
  const imageRefs = new Set([
    ...designImageRefs(design),
    ...designHtmlAssetRefs(design),
  ]);
  return [...imageRefs].map((ref) => {
    if (!uuidPattern.test(ref)) {
      throw new ContentValidationError(
        "INVALID_EXPERIENCE_CONTENT",
        "Design images must come from your asset library.",
      );
    }
    return {
      assetId: ref,
      purpose: "design-image",
      expectedMediaType: "image/*",
    };
  });
}

/** Estudio de Experiences (ADR 018, addendum 3): "viewer" needs its pages
 * drawn already — the client draws each PDF page as an image and uploads it
 * before saving, so a viewer with none is always a mistake, never a valid
 * in-progress draft. */
function enforceDocumentViewerRules(
  type: ExperienceType,
  content: ExperienceContent,
): void {
  if (type !== "document") return;
  const c = content as ExperienceContentByType["document"];
  if (c.display === "viewer" && (!c.pages || c.pages.length === 0)) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "El visor de PDF necesita al menos una página.",
    );
  }
  // The PDF file itself is only needed to download it: a viewer shows its
  // pages and may go without it (e.g. a PDF rejected for active content).
  const needsFile = c.display !== "viewer" || c.allowDownload === true;
  if (needsFile && !c.assetId) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "Para descargar el documento hace falta el archivo PDF.",
    );
  }
  if (c.pages && c.pages.length > DOCUMENT_VIEWER_MAX_PAGES) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      `El visor de PDF admite hasta ${DOCUMENT_VIEWER_MAX_PAGES} páginas.`,
    );
  }
}

/** Icon networks must point to their own domain, so an Instagram icon can
 * never lead somewhere else. `website` accepts any safe HTTPS URL. */
const socialDomains: Record<string, readonly string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  whatsapp: ["wa.me", "whatsapp.com"],
  threads: ["threads.net", "threads.com"],
  pinterest: ["pinterest.com", "pinterest.com.mx", "pin.it"],
  spotify: ["spotify.com"],
  telegram: ["t.me", "telegram.me"],
};

function hostMatches(url: string, domains: readonly string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

export function normalizeSocialValue(network: string, value: string): string {
  const trimmed = value.trim();
  if (network === "email") {
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(trimmed)) {
      throw new ContentValidationError(
        "INVALID_EXPERIENCE_CONTENT",
        "The email address in your social links is not valid.",
      );
    }
    return trimmed.toLowerCase();
  }
  if (network === "phone") {
    const digits = trimmed.replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{6,15}$/.test(digits)) {
      throw new ContentValidationError(
        "INVALID_EXPERIENCE_CONTENT",
        "The phone number in your social links is not valid.",
      );
    }
    return digits;
  }
  const url = normalizeUrlOrThrow(trimmed);
  const domains = socialDomains[network];
  if (domains && !hostMatches(url, domains)) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      `The ${network} link must point to ${domains[0]}.`,
    );
  }
  return url;
}

function enforceLinkPageRules(
  type: ExperienceType,
  content: ExperienceContent,
): void {
  if (type !== "linkpage") return;
  const c = content as ExperienceContentByType["linkpage"];
  if (c.links.length === 0 && c.socials.length === 0) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "A link page needs at least one button or social network.",
    );
  }
}

function enforceThemeRules(content: ExperienceContent): void {
  const theme = (
    content as { theme?: ExperienceContentByType["menu"]["theme"] }
  ).theme;
  if (!theme) return;
  const { background } = theme;
  if (background.kind === "gradient" && !background.colorTo) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "A gradient background needs a second color.",
    );
  }
  if (background.kind === "image" && !background.imageAssetId) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "An image background needs an image from your library.",
    );
  }
}

function collectThemeAssetReferences(
  content: ExperienceContent,
): AssetReference[] {
  const theme = (
    content as { theme?: ExperienceContentByType["menu"]["theme"] }
  ).theme;
  const assetId =
    theme?.background.kind === "image"
      ? theme.background.imageAssetId
      : undefined;
  return assetId
    ? [{ assetId, purpose: "background", expectedMediaType: "image/*" }]
    : [];
}

function normalizeUrlOrThrow(value: string): string {
  const normalized = normalizePublicHttpsUrl(value);
  if (!normalized) {
    throw new ContentValidationError(
      "INVALID_REDIRECT_DESTINATION",
      "Every public URL must be a complete HTTPS address without embedded credentials.",
    );
  }
  return normalized;
}

function normalizeUrls(type: ExperienceType, content: ExperienceContent): void {
  switch (type) {
    case "redirect": {
      const c = content as ExperienceContentByType["redirect"];
      c.destinationUrl = normalizeUrlOrThrow(c.destinationUrl);
      return;
    }
    case "links": {
      const c = content as ExperienceContentByType["links"];
      c.links = c.links.map((link) => ({
        ...link,
        url: normalizeUrlOrThrow(link.url),
      }));
      return;
    }
    case "profile": {
      const c = content as ExperienceContentByType["profile"];
      c.links = c.links.map((link) => ({
        ...link,
        url: normalizeUrlOrThrow(link.url),
      }));
      return;
    }
    case "catalog": {
      const c = content as ExperienceContentByType["catalog"];
      c.items = c.items.map((item) =>
        item.url ? { ...item, url: normalizeUrlOrThrow(item.url) } : item,
      );
      return;
    }
    case "linkpage": {
      const c = content as ExperienceContentByType["linkpage"];
      c.links = c.links.map((link) => ({
        ...link,
        url: normalizeUrlOrThrow(link.url),
      }));
      c.socials = c.socials.map((social) => ({
        ...social,
        value: normalizeSocialValue(social.network, social.value),
      }));
      return;
    }
    case "form": {
      // The business's own privacy notice (it controls its leads' data).
      const c = content as ExperienceContentByType["form"];
      if (c.privacyNoticeUrl) {
        c.privacyNoticeUrl = normalizeUrlOrThrow(c.privacyNoticeUrl);
      }
      return;
    }
    default:
      return;
  }
}

function assertUniqueIds(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      "Item ids must be unique within their list.",
    );
  }
}

function enforceItemIdUniqueness(
  type: ExperienceType,
  content: ExperienceContent,
): void {
  switch (type) {
    case "links": {
      const c = content as ExperienceContentByType["links"];
      assertUniqueIds(c.links.map((item) => item.id));
      return;
    }
    case "profile": {
      const c = content as ExperienceContentByType["profile"];
      assertUniqueIds(c.links.map((item) => item.id));
      return;
    }
    case "menu": {
      const c = content as ExperienceContentByType["menu"];
      assertUniqueIds(c.sections.map((section) => section.id));
      for (const section of c.sections) {
        assertUniqueIds(section.items.map((item) => item.id));
      }
      // Choices (relevo 37, D1) share the availability keys with the dishes:
      // no choice may repeat another choice or any dish of the menu.
      const choiceIds = c.sections.flatMap((section) =>
        section.items.flatMap((item) =>
          (item.choices ?? []).map((choice) => choice.id),
        ),
      );
      if (choiceIds.length > 0) {
        const dishIds = new Set(
          c.sections.flatMap((section) => section.items.map((item) => item.id)),
        );
        assertUniqueIds(choiceIds);
        if (choiceIds.some((id) => dishIds.has(id)))
          throw new ContentValidationError(
            "INVALID_EXPERIENCE_CONTENT",
            "A choice id cannot repeat a dish id.",
          );
      }
      return;
    }
    case "catalog": {
      const c = content as ExperienceContentByType["catalog"];
      assertUniqueIds(c.items.map((item) => item.id));
      return;
    }
    case "linkpage": {
      const c = content as ExperienceContentByType["linkpage"];
      assertUniqueIds(c.links.map((item) => item.id));
      assertUniqueIds(c.socials.map((item) => item.id));
      return;
    }
    default:
      return;
  }
}

function enforceMenuItemLimit(
  type: ExperienceType,
  content: ExperienceContent,
): void {
  if (type !== "menu") return;
  const c = content as ExperienceContentByType["menu"];
  const total = c.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  if (total > MAX_MENU_ITEMS_TOTAL) {
    throw new ContentValidationError(
      "INVALID_EXPERIENCE_CONTENT",
      `A menu cannot list more than ${MAX_MENU_ITEMS_TOTAL} items in total.`,
    );
  }
}

function collectAssetReferences(
  type: ExperienceType,
  content: ExperienceContent,
): AssetReference[] {
  switch (type) {
    case "image": {
      const c = content as ExperienceContentByType["image"];
      return [
        {
          assetId: c.assetId,
          purpose: "image",
          expectedMediaType: "image/*",
        },
      ];
    }
    case "document": {
      const c = content as ExperienceContentByType["document"];
      return [
        ...(c.assetId
          ? [
              {
                assetId: c.assetId,
                purpose: "document" as const,
                expectedMediaType: "application/pdf" as const,
              },
            ]
          : []),
        // Visor de PDF (addendum 3): each page the client already drew from
        // the PDF and uploaded as its own image asset.
        ...(c.pages ?? []).map((page) => ({
          assetId: page.assetId,
          purpose: "document-page" as const,
          expectedMediaType: "image/*" as const,
        })),
      ];
    }
    case "profile": {
      const c = content as ExperienceContentByType["profile"];
      return c.avatarAssetId
        ? [
            {
              assetId: c.avatarAssetId,
              purpose: "avatar",
              expectedMediaType: "image/*",
            },
          ]
        : [];
    }
    case "menu": {
      const c = content as ExperienceContentByType["menu"];
      const references: AssetReference[] = [];
      for (const section of c.sections) {
        for (const item of section.items) {
          if (item.imageAssetId) {
            references.push({
              assetId: item.imageAssetId,
              purpose: "menu-image",
              expectedMediaType: "image/*",
            });
          }
        }
      }
      return references;
    }
    case "catalog": {
      const c = content as ExperienceContentByType["catalog"];
      const references: AssetReference[] = [];
      for (const item of c.items) {
        if (item.imageAssetId) {
          references.push({
            assetId: item.imageAssetId,
            purpose: "catalog-image",
            expectedMediaType: "image/*",
          });
        }
      }
      return references;
    }
    case "linkpage": {
      const c = content as ExperienceContentByType["linkpage"];
      return c.avatarAssetId
        ? [
            {
              assetId: c.avatarAssetId,
              purpose: "avatar",
              expectedMediaType: "image/*",
            },
          ]
        : [];
    }
    default:
      return [];
  }
}
