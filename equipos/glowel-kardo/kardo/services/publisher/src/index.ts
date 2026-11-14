import {
  CustomHtmlSchema,
  checkDesign,
  type DesignableExperienceType,
  type DesignBlock,
  type DesignCheckContext,
  DOCUMENT_VIEWER_MAX_PAGES,
  designableExperienceTypes,
  designBlocks,
  designImageRefs,
  type PageDesign,
  PageDesignSchema,
  sectionBlocks,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import { prepareCustomHtml } from "@kardo/page-render";
import { Value } from "@sinclair/typebox/value";
import postgres, { type Sql, type TransactionSql } from "postgres";
// Side-effect only: registers the `uri` format `Value.Check` needs to
// evaluate `PageDesignSchema`. Must be imported before the first
// `Value.Check` call below (see `buildDesign`).
import "./design-formats.js";

// ---------------------------------------------------------------------------
// Published snapshot shapes (mirrors the per-type contracts in
// @kardo/contracts; duplicated here because the Publisher validates content
// itself before it becomes a public, HTML-rendering Resolver snapshot).
// ---------------------------------------------------------------------------

export type ExperienceKind =
  | "redirect"
  | "links"
  | "profile"
  | "image"
  | "document"
  | "menu"
  | "catalog"
  | "form"
  | "linkpage";

export type LinkItem = { id: string; label: string; url: string };

export type MenuChoice = { id: string; name: string };
export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  imageSha256?: string;
  /** «Menú del día» (relevo 37, D1): dishes to choose from, each sold out
   * on its own by the Resolver's live availability. */
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

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export type AssetRef = {
  sha256: string;
  mediaType: ImageMediaType | "application/pdf";
};

/** What a content field accepts: any sanitized image, or a PDF. */
type ExpectedAssetKind = "image" | "application/pdf";

function matchesKind(
  mediaType: AssetRef["mediaType"],
  kind: ExpectedAssetKind,
): boolean {
  return kind === "image"
    ? mediaType === "image/png" ||
        mediaType === "image/jpeg" ||
        mediaType === "image/webp"
    : mediaType === "application/pdf";
}

/** Page theme as published: closed choices and `#rrggbb` colors only; an
 * image background is referenced by the asset's content hash. */
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

/** Estudio de Experiences — "modo HTML" (ADR 018, extended 2026-09-29).
 * Already `prepareCustomHtml`'s (`@kardo/page-render`) sanitized/tokenized
 * output: every `kardo-asset:<uuid>` has been rewritten to its content
 * hash — exactly like a design's `imageRef` — by `buildCustomHtml`. */
export type SnapshotCustomHtml = {
  html: string;
  css: string;
  links: { id: string; url: string }[];
};

export type SocialLink = {
  id: string;
  network:
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
  /** HTTPS URL, or an email address / phone digits for those networks. */
  value: string;
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
      /** Estudio de Experiences (ADR 018); every `imageRef` is already a
       * content hash by the time it reaches the snapshot — see
       * `buildDesign`. Ignored by the Resolver's `theme` rendering when
       * present. */
      design?: PageDesign;
      /** "modo HTML" (ADR 018, extended 2026-09-29) — see `buildCustomHtml`.
       * Precedence over `design`/`theme` when present. */
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
      fields: {
        name: FormFieldSetting;
        phone: FormFieldSetting;
        message: FormFieldSetting;
      };
      submitLabel: string;
      successMessage: string;
      consentText: string;
      /** The business's own privacy notice (it controls its leads' data). */
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

export type PublishedSnapshot = {
  schemaVersion: 1;
  publicId: string;
  revision: number;
  status: "active";
  experience: ExperiencePayload;
  /** Legacy single-asset compatibility field, kept for image/document only. */
  asset?: AssetRef & { title: string };
  /** Canonical list of every asset the experience references. */
  assets?: AssetRef[];
  /** The Experience this snapshot was published from, as a canonical
   * (lowercase) uuid. `buildSnapshot` sets this on every snapshot it builds
   * (every publication job is tied to an Experience); it stays optional on
   * the type only for `buildRedirectSnapshot`, a standalone helper with no
   * job/Experience behind it. Lets the Resolver key its
   * `ItemAvailabilityState` Durable Object — live Menu/Catalog item
   * availability, which is deliberately NOT part of this immutable snapshot
   * and never goes through publishing (Postgres, owned by the Customer API,
   * is its source of truth). */
  experienceId?: string;
};

// ---------------------------------------------------------------------------
// Publication errors: a stable, closed set of codes so `last_error` can be
// mapped to customer-safe text without depending on free-form detail. Content
// and asset problems are never worth retrying; Resolver failures are retried
// unless the attempt budget is exhausted.
// ---------------------------------------------------------------------------

export type PublicationErrorCode =
  | "CONTENT_INVALID"
  | "ASSET_UNAVAILABLE"
  | "RESOLVER_REJECTED"
  | "RESOLVER_UNAVAILABLE"
  // The job was claimed but what it needs could not be read (a database
  // error loading its assets); retryable, and recorded so the panel shows
  // it instead of a publication that stays pending forever.
  | "INPUT_UNAVAILABLE"
  // The Resolver accepted the snapshot but recording it in Postgres failed;
  // retryable, and distinct so it is never mistaken for a Resolver outage.
  | "STATE_SYNC_FAILED";

export class PublicationError extends Error {
  readonly code: PublicationErrorCode;

  constructor(code: PublicationErrorCode, message: string) {
    super(message);
    this.name = "PublicationError";
    this.code = code;
  }

  /** CONTENT_INVALID and ASSET_UNAVAILABLE never succeed on retry. */
  get immediatelyFinal(): boolean {
    return this.code === "CONTENT_INVALID" || this.code === "ASSET_UNAVAILABLE";
  }
}

function invalidContent(message: string): PublicationError {
  return new PublicationError("CONTENT_INVALID", message);
}
function assetUnavailable(message: string): PublicationError {
  return new PublicationError("ASSET_UNAVAILABLE", message);
}

export type PublicationJob = {
  id: string;
  publicationId: string;
  workspaceId: string;
  publicId: string;
  /** The Experience this publication is a version of, as a canonical
   * (lowercase) uuid — carried onto the built snapshot as `experienceId` so
   * the Resolver can key its `ItemAvailabilityState` Durable Object. */
  experienceId: string;
  revision: number;
  type: ExperienceKind;
  content: unknown;
  /** Validated, same-workspace assets referenced by `content`, keyed by assetId. */
  assets: Record<string, AssetRef & { filename: string }>;
  attempts: number;
};

export type PublicationProjection = {
  publish(snapshot: PublishedSnapshot): Promise<"activated" | "stale">;
};

export type PublicationJobRepository = {
  claimNext(): Promise<PublicationJob | null>;
  markSucceeded(job: PublicationJob): Promise<void>;
  markFailed(job: PublicationJob, error: PublicationError): Promise<void>;
};

export function buildRedirectSnapshot(input: {
  publicId: string;
  revision: number;
  destinationUrl: string;
}): PublishedSnapshot {
  return {
    schemaVersion: 1,
    publicId: input.publicId,
    revision: input.revision,
    status: "active",
    experience: {
      type: "redirect",
      destinationUrl: requireSafeUrl(input.destinationUrl, "destinationUrl"),
    },
  };
}

/**
 * Every assetId an Experience type can reference, extracted best-effort from
 * unvalidated content so the caller can resolve them (workspace-scoped,
 * validated) before full content validation runs.
 */
export function referencedAssetIds(type: string, content: unknown): string[] {
  if (!isRecord(content)) return [];
  const ids = new Set<string>();
  if (
    (type === "image" || type === "document") &&
    typeof content.assetId === "string"
  )
    ids.add(content.assetId);
  // Visor de PDF (addendum 3): each drawn page is its own image asset,
  // best-effort over unvalidated content, same as every other scan here.
  if (type === "document" && Array.isArray(content.pages)) {
    for (const page of content.pages) {
      if (isRecord(page) && typeof page.assetId === "string")
        ids.add(page.assetId);
    }
  }
  if (type === "profile" && typeof content.avatarAssetId === "string")
    ids.add(content.avatarAssetId);
  if (type === "catalog" && Array.isArray(content.items)) {
    for (const item of content.items) {
      if (isRecord(item) && typeof item.imageAssetId === "string")
        ids.add(item.imageAssetId);
    }
  }
  if (type === "menu" && Array.isArray(content.sections)) {
    for (const section of content.sections) {
      if (!isRecord(section) || !Array.isArray(section.items)) continue;
      for (const item of section.items) {
        if (isRecord(item) && typeof item.imageAssetId === "string")
          ids.add(item.imageAssetId);
      }
    }
  }
  if (type === "linkpage" && typeof content.avatarAssetId === "string")
    ids.add(content.avatarAssetId);
  if (
    isRecord(content.theme) &&
    isRecord(content.theme.background) &&
    typeof content.theme.background.imageAssetId === "string"
  )
    ids.add(content.theme.background.imageAssetId);
  // Estudio de Experiences (ADR 018): a design's own image blocks and
  // section/page backgrounds, best-effort (this runs before `content.design`
  // is validated at all, so it must tolerate a malformed shape rather than
  // assume the well-typed `PageDesign` `designImageRefs` from
  // `@kardo/contracts` expects).
  if (designableExperienceTypes.includes(type as DesignableExperienceType)) {
    for (const id of collectDesignAssetIds(content.design)) ids.add(id);
    // "modo HTML" (ADR 018, extended 2026-09-29): scan the raw, unvalidated
    // html/css for every `kardo-asset:<uuid>` token, regardless of `active`
    // — over-resolving a few extra assets for an inactive draft is harmless,
    // and `buildCustomHtml` only ever uses these when it actually publishes.
    for (const id of collectCustomHtmlAssetIds(content.customHtml)) ids.add(id);
  }
  return [...ids];
}

/** Best-effort `kardo-asset:<uuid>` scan over unvalidated "modo HTML"
 * source — a defensive re-scan independent of `prepareCustomHtml`'s own
 * `imageRefs` (which only ever runs on content that has already passed
 * `Value.Check(CustomHtmlSchema, ...)`), mirroring `collectDesignAssetIds`. */
function collectCustomHtmlAssetIds(customHtml: unknown): string[] {
  if (!isRecord(customHtml)) return [];
  const ids = new Set<string>();
  const pattern = /kardo-asset:([0-9a-f-]{32,64})/gi;
  for (const field of [customHtml.html, customHtml.css]) {
    if (typeof field !== "string") continue;
    let match: RegExpExecArray | null = pattern.exec(field);
    while (match) {
      const ref = match[1];
      if (ref) ids.add(ref.toLowerCase());
      match = pattern.exec(field);
    }
  }
  return [...ids];
}

const designHtmlBlockAssetPattern = /kardo-asset:([0-9a-f-]{32,64})/gi;

/**
 * `referencedAssetIds`'s design scan, best-effort over unvalidated content
 * (this runs before `content.design` is checked against `PageDesignSchema`
 * at all). Regression (bug fix, addendum 3): a canvas section keeps its
 * blocks in `items[].block`, not `columns` — an image placed on a canvas
 * used to be invisible here, so its page could never publish (the asset was
 * never resolved into `job.assets`, and `buildDesign` would then reject it
 * with ASSET_UNAVAILABLE). Also scans an `html` block's own source for
 * `kardo-asset:<uuid>` tokens, in both a flow column and a canvas item,
 * mirroring `collectCustomHtmlAssetIds` for the page-level "modo HTML".
 */
function collectDesignAssetIds(design: unknown): string[] {
  if (!isRecord(design)) return [];
  const ids = new Set<string>();
  const addRef = (value: unknown) => {
    if (typeof value === "string") ids.add(value);
  };
  const scanBlock = (block: unknown) => {
    if (!isRecord(block)) return;
    if (block.kind === "image") {
      // "Sin banco de fotos" (2026-10-03): an absent imageRef is a
      // deliberate empty slot, not a bug — `addRef` already no-ops on it.
      addRef(block.imageRef);
      return;
    }
    if (block.kind === "gallery") {
      if (Array.isArray(block.images))
        for (const image of block.images)
          if (isRecord(image)) addRef(image.imageRef);
      return;
    }
    if (block.kind !== "html") return;
    for (const field of [block.html, block.css]) {
      if (typeof field !== "string") continue;
      for (const match of field.matchAll(designHtmlBlockAssetPattern))
        if (match[1]) ids.add(match[1].toLowerCase());
    }
  };
  if (isRecord(design.style) && isRecord(design.style.background))
    addRef(design.style.background.imageRef);
  if (Array.isArray(design.sections)) {
    for (const section of design.sections) {
      if (!isRecord(section)) continue;
      if (isRecord(section.background)) addRef(section.background.imageRef);
      if (Array.isArray(section.columns)) {
        for (const column of section.columns) {
          if (!Array.isArray(column)) continue;
          for (const block of column) scanBlock(block);
        }
      }
      if (Array.isArray(section.items)) {
        for (const item of section.items) {
          if (isRecord(item)) scanBlock(item.block);
        }
      }
    }
  }
  return [...ids];
}

type BuiltExperience = {
  experience: ExperiencePayload;
  assets: AssetRef[];
  legacyAsset?: AssetRef & { title: string };
};

function buildExperience(job: PublicationJob): BuiltExperience {
  const content = job.content;
  if (!isRecord(content))
    throw invalidContent("Experience content must be an object.");

  switch (job.type) {
    case "redirect": {
      if (typeof content.destinationUrl !== "string")
        throw invalidContent("redirect content requires destinationUrl.");
      return {
        experience: {
          type: "redirect",
          destinationUrl: requireSafeUrl(
            content.destinationUrl,
            "destinationUrl",
          ),
        },
        assets: [],
      };
    }
    case "links": {
      if (!isSafeText(content.title))
        throw invalidContent("links content requires a title.");
      if (!isOptionalText(content.description, 500))
        throw invalidContent("links description is too long.");
      const links = buildLinks(content.links, 12);
      if (links.length < 1)
        throw invalidContent("links requires at least one link.");
      const built = buildDesign(
        job,
        "links",
        content.design,
        links.map((link) => link.id),
      );
      const customHtml = buildCustomHtml(job, content.customHtml);
      return {
        experience: {
          type: "links",
          title: content.title,
          ...(typeof content.description === "string"
            ? { description: content.description }
            : {}),
          links,
          ...(built ? { design: built.design } : {}),
          ...(customHtml ? { customHtml: customHtml.customHtml } : {}),
        },
        assets: [...(built?.assets ?? []), ...(customHtml?.assets ?? [])],
      };
    }
    case "profile": {
      if (!isSafeText(content.displayName))
        throw invalidContent("profile content requires a displayName.");
      if (!isOptionalText(content.headline, 160))
        throw invalidContent("profile headline is too long.");
      if (!isOptionalText(content.biography, 1000))
        throw invalidContent("profile biography is too long.");
      const links = buildLinks(content.links ?? [], 8);
      const used: AssetRef[] = [];
      let avatarSha256: string | undefined;
      if (content.avatarAssetId !== undefined) {
        if (
          typeof content.avatarAssetId !== "string" ||
          !isUuid(content.avatarAssetId)
        )
          throw invalidContent("profile avatarAssetId is invalid.");
        const stored = resolveStoredAsset(
          job,
          content.avatarAssetId,
          "image",
          "profile avatarAssetId",
        );
        avatarSha256 = stored.sha256;
        used.push(stored);
      }
      const built = buildDesign(
        job,
        "profile",
        content.design,
        links.map((link) => link.id),
      );
      const customHtml = buildCustomHtml(job, content.customHtml);
      return {
        experience: {
          type: "profile",
          displayName: content.displayName,
          ...(typeof content.headline === "string"
            ? { headline: content.headline }
            : {}),
          ...(typeof content.biography === "string"
            ? { biography: content.biography }
            : {}),
          ...(avatarSha256 ? { avatarSha256 } : {}),
          links,
          ...(built ? { design: built.design } : {}),
          ...(customHtml ? { customHtml: customHtml.customHtml } : {}),
        },
        assets: [
          ...used,
          ...(built?.assets ?? []),
          ...(customHtml?.assets ?? []),
        ],
      };
    }
    case "image": {
      if (typeof content.assetId !== "string" || !isUuid(content.assetId))
        throw invalidContent("image content requires a valid assetId.");
      if (!isSafeText(content.alt, 250))
        throw invalidContent(
          "image content requires alt text up to 250 characters.",
        );
      const stored = resolveStoredAsset(
        job,
        content.assetId,
        "image",
        "image assetId",
      );
      const filename = job.assets[content.assetId]?.filename ?? "Imagen";
      const built = buildDesign(job, "image", content.design, []);
      return {
        experience: {
          type: "image",
          alt: content.alt,
          ...(built ? { design: built.design } : {}),
        },
        assets: [stored, ...(built?.assets ?? [])],
        legacyAsset: { ...stored, title: filename },
      };
    }
    case "document": {
      if (
        content.assetId !== undefined &&
        (typeof content.assetId !== "string" || !isUuid(content.assetId))
      )
        throw invalidContent("document assetId is invalid.");
      if (!isSafeText(content.title))
        throw invalidContent("document content requires a title.");
      if (!isOptionalText(content.description, 500))
        throw invalidContent("document description is too long.");

      // Documento PDF (addendum 3): `display` "download" (default) or
      // "viewer", each page drawn as an image asset, and an optional extra
      // download button under "viewer". Order matters for the snapshot's
      // `assets`: the PDF itself first when there is one (the Resolver
      // downloads the legacy `asset`, which is only set for the PDF), then
      // the pages, then the design's own images.
      let display: "download" | "viewer" | undefined;
      if (content.display !== undefined) {
        if (content.display !== "download" && content.display !== "viewer")
          throw invalidContent(
            'document display must be "download" or "viewer".',
          );
        display = content.display;
      }
      let allowDownload: boolean | undefined;
      if (content.allowDownload !== undefined) {
        if (typeof content.allowDownload !== "boolean")
          throw invalidContent("document allowDownload must be a boolean.");
        allowDownload = content.allowDownload;
      }
      const pageAssets: AssetRef[] = [];
      let pages: SnapshotDocumentPage[] | undefined;
      if (content.pages !== undefined) {
        if (
          !Array.isArray(content.pages) ||
          content.pages.length > DOCUMENT_VIEWER_MAX_PAGES
        )
          throw invalidContent(
            `document pages must contain at most ${DOCUMENT_VIEWER_MAX_PAGES} items.`,
          );
        pages = content.pages.map((page, index) => {
          if (
            !isRecord(page) ||
            typeof page.assetId !== "string" ||
            !isUuid(page.assetId) ||
            !isPageDimension(page.width) ||
            !isPageDimension(page.height)
          )
            throw invalidContent(`document pages[${index}] is invalid.`);
          const pageStored = resolveStoredAsset(
            job,
            page.assetId,
            "image",
            `document pages[${index}] assetId`,
          );
          pageAssets.push(pageStored);
          return {
            sha256: pageStored.sha256,
            width: page.width,
            height: page.height,
          };
        });
      }
      if (display === "viewer" && (!pages || pages.length < 1))
        throw invalidContent(
          "document viewer requires at least one page image.",
        );
      // The PDF file is only needed to download it: a viewer shows its pages
      // and may go without it (e.g. a PDF rejected for active content).
      const fileId =
        typeof content.assetId === "string" ? content.assetId : undefined;
      if (!fileId && (display !== "viewer" || allowDownload === true))
        throw invalidContent("document download requires its PDF assetId.");
      const stored = fileId
        ? resolveStoredAsset(job, fileId, "application/pdf", "document assetId")
        : null;
      const filename = fileId
        ? (job.assets[fileId]?.filename ?? "Documento")
        : "Documento";

      const built = buildDesign(job, "document", content.design, []);
      return {
        experience: {
          type: "document",
          title: content.title,
          ...(typeof content.description === "string"
            ? { description: content.description }
            : {}),
          ...(display ? { display } : {}),
          ...(pages ? { pages } : {}),
          ...(allowDownload !== undefined ? { allowDownload } : {}),
          ...(built ? { design: built.design } : {}),
        },
        assets: [
          ...(stored ? [stored] : []),
          ...pageAssets,
          ...(built?.assets ?? []),
        ],
        ...(stored ? { legacyAsset: { ...stored, title: filename } } : {}),
      };
    }
    case "menu": {
      if (!isSafeText(content.title))
        throw invalidContent("menu content requires a title.");
      if (!isOptionalText(content.description, 500))
        throw invalidContent("menu description is too long.");
      if (!isCurrency(content.currency))
        throw invalidContent("menu requires a valid ISO 4217 currency.");
      if (
        !Array.isArray(content.sections) ||
        content.sections.length < 1 ||
        content.sections.length > 10
      )
        throw invalidContent("menu requires between 1 and 10 sections.");
      let totalItems = 0;
      const usedMenuAssets: AssetRef[] = [];
      const sections: MenuSection[] = content.sections.map(
        (section, sectionIndex) => {
          if (
            !isRecord(section) ||
            !isItemId(section.id) ||
            !isSafeText(section.name)
          )
            throw invalidContent(`menu sections[${sectionIndex}] is invalid.`);
          if (
            !Array.isArray(section.items) ||
            section.items.length < 1 ||
            section.items.length > 30
          )
            throw invalidContent(
              `menu sections[${sectionIndex}] requires between 1 and 30 items.`,
            );
          const items: MenuItem[] = section.items.map((item, itemIndex) => {
            if (!isRecord(item) || !isItemId(item.id) || !isSafeText(item.name))
              throw invalidContent(
                `menu sections[${sectionIndex}].items[${itemIndex}] is invalid.`,
              );
            if (!isOptionalText(item.description, 200))
              throw invalidContent(
                `menu sections[${sectionIndex}].items[${itemIndex}] description is too long.`,
              );
            if (!isPrice(item.price))
              throw invalidContent(
                `menu sections[${sectionIndex}].items[${itemIndex}] price is invalid.`,
              );
            let imageSha256: string | undefined;
            if (item.imageAssetId !== undefined) {
              if (
                typeof item.imageAssetId !== "string" ||
                !isUuid(item.imageAssetId)
              )
                throw invalidContent(
                  `menu sections[${sectionIndex}].items[${itemIndex}] imageAssetId is invalid.`,
                );
              const stored = resolveStoredAsset(
                job,
                item.imageAssetId,
                "image",
                `menu sections[${sectionIndex}].items[${itemIndex}] imageAssetId`,
              );
              imageSha256 = stored.sha256;
              usedMenuAssets.push(stored);
            }
            const choices = menuChoices(
              item,
              `menu sections[${sectionIndex}].items[${itemIndex}]`,
            );
            totalItems += 1;
            return {
              id: item.id,
              name: item.name,
              ...(typeof item.description === "string"
                ? { description: item.description }
                : {}),
              ...(typeof item.price === "number" ? { price: item.price } : {}),
              ...(imageSha256 ? { imageSha256 } : {}),
              ...choices,
            };
          });
          return { id: section.id, name: section.name, items };
        },
      );
      if (totalItems > 150)
        throw invalidContent("menu exceeds the 150 item total limit.");
      const menuSectionIds = sections.map((section) => section.id);
      const menuItemIds = sections.flatMap((section) =>
        section.items.map((item) => item.id),
      );
      // Choices share the live availability keys with the dishes.
      const menuChoiceIds = sections.flatMap((section) =>
        section.items.flatMap((item) =>
          (item.choices ?? []).map((choice) => choice.id),
        ),
      );
      const availabilityKeys = [...new Set(menuItemIds), ...menuChoiceIds];
      if (new Set(availabilityKeys).size !== availabilityKeys.length)
        throw invalidContent("menu choice ids must be unique.");
      const built = buildDesign(
        job,
        "menu",
        content.design,
        [...menuSectionIds, ...menuItemIds],
        { menuSectionIds, featurableItemIds: menuItemIds },
      );
      return {
        experience: {
          type: "menu",
          title: content.title,
          ...(typeof content.description === "string"
            ? { description: content.description }
            : {}),
          currency: content.currency,
          sections,
          ...(built ? { design: built.design } : {}),
        },
        assets: [...usedMenuAssets, ...(built?.assets ?? [])],
      };
    }
    case "catalog": {
      if (!isSafeText(content.title))
        throw invalidContent("catalog content requires a title.");
      if (!isOptionalText(content.description, 500))
        throw invalidContent("catalog description is too long.");
      if (!isCurrency(content.currency))
        throw invalidContent("catalog requires a valid ISO 4217 currency.");
      if (
        !Array.isArray(content.items) ||
        content.items.length < 1 ||
        content.items.length > 48
      )
        throw invalidContent("catalog requires between 1 and 48 items.");
      const used: AssetRef[] = [];
      const items: CatalogItem[] = content.items.map((item, index) => {
        if (!isRecord(item) || !isItemId(item.id) || !isSafeText(item.name))
          throw invalidContent(`catalog items[${index}] is invalid.`);
        if (!isOptionalText(item.description, 300))
          throw invalidContent(
            `catalog items[${index}] description is too long.`,
          );
        if (!isPrice(item.price))
          throw invalidContent(`catalog items[${index}] price is invalid.`);
        let imageSha256: string | undefined;
        if (item.imageAssetId !== undefined) {
          if (
            typeof item.imageAssetId !== "string" ||
            !isUuid(item.imageAssetId)
          )
            throw invalidContent(
              `catalog items[${index}] imageAssetId is invalid.`,
            );
          const stored = resolveStoredAsset(
            job,
            item.imageAssetId,
            "image",
            `catalog items[${index}] imageAssetId`,
          );
          imageSha256 = stored.sha256;
          used.push(stored);
        }
        return {
          id: item.id,
          name: item.name,
          ...(typeof item.description === "string"
            ? { description: item.description }
            : {}),
          ...(typeof item.price === "number" ? { price: item.price } : {}),
          ...(typeof item.url === "string"
            ? { url: requireSafeUrl(item.url, `catalog items[${index}].url`) }
            : {}),
          ...(imageSha256 ? { imageSha256 } : {}),
        };
      });
      const catalogItemIds = items.map((item) => item.id);
      const built = buildDesign(
        job,
        "catalog",
        content.design,
        catalogItemIds,
        {
          featurableItemIds: catalogItemIds,
        },
      );
      return {
        experience: {
          type: "catalog",
          title: content.title,
          ...(typeof content.description === "string"
            ? { description: content.description }
            : {}),
          currency: content.currency,
          items,
          ...(built ? { design: built.design } : {}),
        },
        assets: [...used, ...(built?.assets ?? [])],
      };
    }
    case "form": {
      if (!isSafeText(content.title))
        throw invalidContent("form content requires a title.");
      if (!isOptionalText(content.description, 500))
        throw invalidContent("form description is too long.");
      if (
        !isRecord(content.fields) ||
        !isFieldSetting(content.fields.name) ||
        !isFieldSetting(content.fields.phone) ||
        !isFieldSetting(content.fields.message)
      )
        throw invalidContent("form fields configuration is invalid.");
      if (!isSafeText(content.submitLabel, 40))
        throw invalidContent(
          "form requires a submitLabel up to 40 characters.",
        );
      if (!isSafeText(content.successMessage, 200))
        throw invalidContent(
          "form requires a successMessage up to 200 characters.",
        );
      if (!isSafeText(content.consentText, 300))
        throw invalidContent("form requires consentText up to 300 characters.");
      const built = buildDesign(job, "form", content.design, []);
      return {
        experience: {
          type: "form",
          title: content.title,
          ...(typeof content.description === "string"
            ? { description: content.description }
            : {}),
          fields: {
            name: content.fields.name,
            phone: content.fields.phone,
            message: content.fields.message,
          },
          submitLabel: content.submitLabel,
          successMessage: content.successMessage,
          consentText: content.consentText,
          ...(typeof content.privacyNoticeUrl === "string"
            ? {
                privacyNoticeUrl: requireSafeUrl(
                  content.privacyNoticeUrl,
                  "privacyNoticeUrl",
                ),
              }
            : {}),
          ...(built ? { design: built.design } : {}),
        },
        assets: [...(built?.assets ?? [])],
      };
    }
    case "linkpage": {
      if (!isSafeText(content.displayName))
        throw invalidContent("linkpage requires a displayName.");
      if (!isOptionalText(content.bio, 300))
        throw invalidContent("linkpage bio is too long.");
      const links = buildLinks(content.links, 20).map((link, index) => {
        const raw = Array.isArray(content.links) ? content.links[index] : null;
        return isRecord(raw) && raw.highlight === true
          ? { ...link, highlight: true }
          : link;
      });
      const socials = buildSocials(content.socials);
      if (links.length === 0 && socials.length === 0)
        throw invalidContent("linkpage requires a link or a social network.");
      const used: AssetRef[] = [];
      let avatarSha256: string | undefined;
      if (content.avatarAssetId !== undefined) {
        if (
          typeof content.avatarAssetId !== "string" ||
          !isUuid(content.avatarAssetId)
        )
          throw invalidContent("linkpage avatarAssetId is invalid.");
        const stored = resolveStoredAsset(
          job,
          content.avatarAssetId,
          "image",
          "linkpage avatarAssetId",
        );
        avatarSha256 = stored.sha256;
        used.push(stored);
      }
      const built = buildDesign(job, "linkpage", content.design, [
        ...links.map((link) => link.id),
        ...socials.map((social) => social.id),
      ]);
      const customHtml = buildCustomHtml(job, content.customHtml);
      return {
        experience: {
          type: "linkpage",
          displayName: content.displayName,
          ...(typeof content.bio === "string" ? { bio: content.bio } : {}),
          ...(avatarSha256 ? { avatarSha256 } : {}),
          socials,
          links,
          ...(built ? { design: built.design } : {}),
          ...(customHtml ? { customHtml: customHtml.customHtml } : {}),
        },
        assets: [
          ...used,
          ...(built?.assets ?? []),
          ...(customHtml?.assets ?? []),
        ],
      };
    }
    default:
      throw invalidContent(`Unsupported experience type: ${String(job.type)}.`);
  }
}

const socialNetworkSet = new Set<SocialLink["network"]>([
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

function buildSocials(value: unknown): SocialLink[] {
  if (!Array.isArray(value) || value.length > 12)
    throw invalidContent("linkpage socials must contain at most 12 items.");
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (
      !isRecord(item) ||
      !isItemId(item.id) ||
      typeof item.network !== "string" ||
      !socialNetworkSet.has(item.network as SocialLink["network"]) ||
      typeof item.value !== "string" ||
      seen.has(item.id)
    )
      throw invalidContent(`socials[${index}] is invalid.`);
    seen.add(item.id);
    const network = item.network as SocialLink["network"];
    let socialValue: string;
    if (network === "email") {
      if (!/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[^\s@<>"]{2,}$/.test(item.value))
        throw invalidContent(`socials[${index}] email is invalid.`);
      socialValue = item.value;
    } else if (network === "phone") {
      if (!/^\+?[0-9]{6,15}$/.test(item.value))
        throw invalidContent(`socials[${index}] phone is invalid.`);
      socialValue = item.value;
    } else {
      socialValue = requireSafeUrl(item.value, `socials[${index}]`);
    }
    return { id: item.id, network, value: socialValue };
  });
}

/**
 * Estudio de Experiences (ADR 018). Validates an optional `design` the same
 * way `services/customer-api/src/validation/experience-content.ts` does
 * (structural `Value.Check` against `PageDesignSchema`, then `checkDesign`'s
 * cross-field rules), re-normalizes every href the design carries the same
 * way `requireSafeUrl` treats every other content URL in this module (the
 * Publisher never trusts the Customer API to have already done this), and
 * resolves every `imageRef` to its content hash — exactly like every other
 * image reference in this file — adding each to the returned `assets`.
 * `context` carries the extra content the type needs `checkDesign` to cross
 * -check (today only `menuSectionIds`, for a `menu` block's `sectionIds`).
 * Returns `null` when the content carries no design at all.
 */
function buildDesign(
  job: PublicationJob,
  type: DesignableExperienceType,
  rawDesign: unknown,
  contentItemIds: readonly string[],
  context: DesignCheckContext = {},
): { design: PageDesign; assets: AssetRef[] } | null {
  if (rawDesign === undefined) return null;
  if (!Value.Check(PageDesignSchema, rawDesign))
    throw invalidContent("design does not match the expected shape.");
  // `Value.Check` narrows `rawDesign` only within this call; clone it so the
  // href normalization and imageRef substitution below never mutate
  // caller-owned data (mirrors `validateExperienceContent`'s own clone).
  const design = structuredClone(rawDesign) as PageDesign;
  const issues = checkDesign(type, design, contentItemIds, context);
  if (issues.length > 0)
    throw invalidContent(
      `design is invalid: ${issues[0]?.message ?? "unknown rule"}`,
    );

  for (const block of designBlocks(design)) {
    if (block.kind === "button" || block.kind === "brandButton")
      block.href = requireSafeUrl(block.href, "design button href");
    if (block.kind === "image" && block.href)
      block.href = requireSafeUrl(block.href, "design image href");
    if (block.kind === "text")
      for (const run of block.runs)
        if (run.href) run.href = requireSafeUrl(run.href, "design text href");
  }

  const assets: AssetRef[] = [];
  const shaByRef = new Map<string, string>();
  for (const ref of designImageRefs(design)) {
    if (!isUuid(ref))
      throw invalidContent("design images must come from your asset library.");
    const stored = resolveStoredAsset(job, ref, "image", "design image");
    shaByRef.set(ref, stored.sha256);
    assets.push(stored);
  }
  const resolveRef = (ref: string) => shaByRef.get(ref) ?? ref;
  if (design.style.background.imageRef)
    design.style.background.imageRef = resolveRef(
      design.style.background.imageRef,
    );
  for (const section of design.sections) {
    if (section.background?.imageRef)
      section.background.imageRef = resolveRef(section.background.imageRef);
    for (const block of sectionBlocks(section)) {
      // "Sin banco de fotos" (2026-10-03): an absent imageRef is a
      // deliberate empty slot (an "espacio para foto") — never resolved,
      // never an error. `designImageRefs` already excludes it.
      if (block.kind === "image" && block.imageRef)
        block.imageRef = resolveRef(block.imageRef);
      if (block.kind === "gallery")
        for (const image of block.images)
          if (image.imageRef) image.imageRef = resolveRef(image.imageRef);
    }
  }

  // `html` blocks (addendum 3): sanitized, asset refs resolved to their
  // content hash and links inlined, in place, below.
  for (const block of designBlocks(design))
    if (block.kind === "html") assets.push(...buildHtmlBlock(job, block));

  return { design, assets };
}

/**
 * Estudio de Experiences — `html` design blocks (addendum 3, 2026-09-30).
 * Runs the same modo HTML sanitizer as `buildCustomHtml` on a single block's
 * own `html`/`css`, resolves every `kardo-asset:<uuid>` it finds to its
 * content hash exactly like `buildCustomHtml` does. Unlike the whole-page
 * "modo HTML" — whose plain `<a href="https://…">` links stay tracked
 * through `/go/{id}` via `content.customHtml.links` — a block carries no
 * such table (`DesignBlockSchema`'s `html` variant is only `id`/`html`/`css`/
 * `label`/`style`), so its links are never measured, exactly like a `text`
 * block's `TextRun.href`: `prepareCustomHtml` still tokenizes them (it has no
 * "skip tracking" mode), but every `kardo-link:<id>` token it hands back is
 * inlined here as the link's own normalized, validated URL before the block
 * is stored. Mutates `block.html`/`block.css` in place (the caller already
 * cloned the design); an empty result after cleaning is not an error — it is
 * simply stored as such. Returns every image the block's tokens resolved to.
 */
function buildHtmlBlock(
  job: PublicationJob,
  block: Extract<DesignBlock, { kind: "html" }>,
): AssetRef[] {
  const prepared = prepareCustomHtml({ html: block.html, css: block.css });

  const assets: AssetRef[] = [];
  const shaByRef = new Map<string, string>();
  for (const ref of prepared.imageRefs) {
    if (!isUuid(ref))
      throw invalidContent(
        "design html block images must come from your asset library.",
      );
    const stored = resolveStoredAsset(
      job,
      ref,
      "image",
      "design html block image",
    );
    shaByRef.set(ref, stored.sha256);
    assets.push(stored);
  }
  const rewriteAssetRefs = (text: string): string => {
    let out = text;
    for (const [ref, sha256] of shaByRef)
      out = out.split(`kardo-asset:${ref}`).join(`kardo-asset:${sha256}`);
    return out;
  };

  let html = rewriteAssetRefs(prepared.html);
  const css = rewriteAssetRefs(prepared.css);
  for (const link of prepared.links) {
    const url = normalizePublicHttpsUrl(link.url);
    if (!url)
      throw invalidContent(
        "design html block link must be a public HTTPS URL.",
      );
    html = html.split(`kardo-link:${link.id}`).join(escapeHtmlAttribute(url));
  }

  block.html = html;
  block.css = css;
  return assets;
}

/** Escapes a value for the one place `buildHtmlBlock` ever splices raw text
 * back into already-serialized HTML: a `kardo-link:<id>` token, which
 * `prepareCustomHtml` only ever places as an `<a href="...">` attribute
 * value (always double-quoted by its parse5 serializer). */
function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Estudio de Experiences — "modo HTML" (ADR 018, extended 2026-09-29).
 * Validates the optional `content.customHtml` structurally
 * (`Value.Check(CustomHtmlSchema, ...)`), then — only when `active` — hands
 * the raw `html`/`css` to `@kardo/page-render`'s `prepareCustomHtml` (the
 * same sanitizer the Resolver re-validates against on read), resolves every
 * `kardo-asset:<uuid>` it returned to its content hash exactly like every
 * other image reference in this module (rewriting both `html` and `css`),
 * and re-checks every tracked link URL with `requireSafeUrl` — the same gate
 * every other content URL in this file goes through, since
 * `prepareCustomHtml`'s own href check is deliberately just "is this a
 * parseable https URL" (it cannot depend on `@kardo/domain`; see its own
 * docs). Inactive or absent `customHtml` returns `null`: the caller then
 * publishes `design`/`theme` exactly as it does today.
 */
function buildCustomHtml(
  job: PublicationJob,
  rawCustomHtml: unknown,
): { customHtml: SnapshotCustomHtml; assets: AssetRef[] } | null {
  if (rawCustomHtml === undefined) return null;
  if (!Value.Check(CustomHtmlSchema, rawCustomHtml))
    throw invalidContent("customHtml does not match the expected shape.");
  const customHtml = rawCustomHtml as {
    schema: 1;
    active: boolean;
    html: string;
    css: string;
  };
  if (!customHtml.active) return null;

  const prepared = prepareCustomHtml({
    html: customHtml.html,
    css: customHtml.css,
  });

  const assets: AssetRef[] = [];
  const shaByRef = new Map<string, string>();
  for (const ref of prepared.imageRefs) {
    if (!isUuid(ref))
      throw invalidContent(
        "custom HTML images must come from your asset library.",
      );
    const stored = resolveStoredAsset(job, ref, "image", "custom HTML image");
    shaByRef.set(ref, stored.sha256);
    assets.push(stored);
  }
  const rewriteAssetRefs = (text: string): string => {
    let out = text;
    for (const [ref, sha256] of shaByRef)
      out = out.split(`kardo-asset:${ref}`).join(`kardo-asset:${sha256}`);
    return out;
  };

  // Hand-written links are normalized here (`https://site.mx` gains its
  // trailing slash) instead of failing the publication; anything that is
  // not a public HTTPS address still fails closed.
  const links = prepared.links.map((link) => {
    const url = normalizePublicHttpsUrl(link.url);
    if (!url)
      throw invalidContent("custom HTML link must be a public HTTPS URL.");
    return { id: link.id, url };
  });

  return {
    customHtml: {
      html: rewriteAssetRefs(prepared.html),
      css: rewriteAssetRefs(prepared.css),
      links,
    },
    assets,
  };
}

const hexColor = /^#[0-9a-fA-F]{6}$/;

/** Validates the optional page theme; resolves an image background to its
 * content hash (and adds it to the published assets). */
function buildTheme(
  job: PublicationJob,
  value: unknown,
): { theme: SnapshotTheme; assets: AssetRef[] } | null {
  if (value === undefined) return null;
  if (!isRecord(value) || !isRecord(value.background))
    throw invalidContent("theme is invalid.");
  const background = value.background;
  const kinds = ["solid", "gradient", "image"] as const;
  const surfaces = ["light", "dark"] as const;
  const buttons = ["pill", "rounded", "square", "outline"] as const;
  const fonts = ["sans", "serif", "rounded", "mono"] as const;
  if (
    !kinds.includes(background.kind as (typeof kinds)[number]) ||
    typeof background.color !== "string" ||
    !hexColor.test(background.color) ||
    (background.colorTo !== undefined &&
      (typeof background.colorTo !== "string" ||
        !hexColor.test(background.colorTo))) ||
    (background.angle !== undefined &&
      (!Number.isInteger(background.angle) ||
        (background.angle as number) < 0 ||
        (background.angle as number) > 360)) ||
    (background.overlay !== undefined &&
      (!Number.isInteger(background.overlay) ||
        (background.overlay as number) < 0 ||
        (background.overlay as number) > 80)) ||
    !surfaces.includes(value.surface as (typeof surfaces)[number]) ||
    typeof value.accent !== "string" ||
    !hexColor.test(value.accent) ||
    !buttons.includes(value.buttonStyle as (typeof buttons)[number]) ||
    !fonts.includes(value.font as (typeof fonts)[number])
  )
    throw invalidContent("theme is invalid.");
  const kind = background.kind as SnapshotTheme["background"]["kind"];
  if (kind === "gradient" && background.colorTo === undefined)
    throw invalidContent("A gradient theme needs colorTo.");
  const assets: AssetRef[] = [];
  let imageSha256: string | undefined;
  if (kind === "image") {
    if (
      typeof background.imageAssetId !== "string" ||
      !isUuid(background.imageAssetId)
    )
      throw invalidContent("An image theme needs imageAssetId.");
    const stored = resolveStoredAsset(
      job,
      background.imageAssetId,
      "image",
      "theme background",
    );
    imageSha256 = stored.sha256;
    assets.push(stored);
  }
  return {
    theme: {
      background: {
        kind,
        color: background.color,
        ...(typeof background.colorTo === "string"
          ? { colorTo: background.colorTo }
          : {}),
        ...(typeof background.angle === "number"
          ? { angle: background.angle }
          : {}),
        ...(imageSha256 ? { imageSha256 } : {}),
        ...(typeof background.overlay === "number"
          ? { overlay: background.overlay }
          : {}),
      },
      surface: value.surface as SnapshotTheme["surface"],
      accent: value.accent,
      buttonStyle: value.buttonStyle as SnapshotTheme["buttonStyle"],
      font: value.font as SnapshotTheme["font"],
    },
    assets,
  };
}

function buildSnapshot(job: PublicationJob): PublishedSnapshot {
  const built = buildExperience(job);
  const content = isRecord(job.content) ? job.content : {};
  // Redirects never render a page, so they carry no theme.
  const themed =
    job.type === "redirect" ? null : buildTheme(job, content.theme);
  const experience = themed
    ? { ...built.experience, theme: themed.theme }
    : built.experience;
  const assets = [...built.assets, ...(themed?.assets ?? [])];
  return {
    schemaVersion: 1,
    publicId: job.publicId,
    revision: job.revision,
    status: "active",
    experience,
    ...(built.legacyAsset ? { asset: built.legacyAsset } : {}),
    ...(assets.length ? { assets: dedupeAssets(assets) } : {}),
    experienceId: job.experienceId,
  };
}

function dedupeAssets(list: AssetRef[]): AssetRef[] {
  const bySha256 = new Map<string, AssetRef>();
  for (const asset of list) bySha256.set(asset.sha256, asset);
  return [...bySha256.values()];
}

function resolveStoredAsset(
  job: PublicationJob,
  assetId: string,
  expectedKind: ExpectedAssetKind,
  field: string,
): AssetRef {
  const stored = job.assets[assetId];
  if (!stored)
    throw assetUnavailable(
      `${field} references an asset that is not available in this workspace.`,
    );
  if (!matchesKind(stored.mediaType, expectedKind))
    throw invalidContent(
      `${field} must reference ${expectedKind === "image" ? "an image (PNG, JPEG or WebP)" : "a PDF document"} asset.`,
    );
  return { sha256: stored.sha256, mediaType: stored.mediaType };
}

function buildLinks(value: unknown, max: number): LinkItem[] {
  if (!Array.isArray(value) || value.length > max)
    throw invalidContent(`links must contain at most ${max} items.`);
  return value.map((item, index) => {
    if (!isRecord(item) || !isItemId(item.id) || !isSafeText(item.label))
      throw invalidContent(`links[${index}] is invalid.`);
    if (typeof item.url !== "string")
      throw invalidContent(`links[${index}].url is required.`);
    return {
      id: item.id,
      label: item.label,
      url: requireSafeUrl(item.url, `links[${index}].url`),
    };
  });
}

function requireSafeUrl(value: string, field: string): string {
  const normalized = normalizePublicHttpsUrl(value);
  if (!normalized || normalized !== value)
    throw invalidContent(`${field} must be a normalized HTTPS URL.`);
  return value;
}

/** A job already claimed (its attempt counted) whose inputs could not be
 * loaded. The caller records the failure on it instead of letting the
 * claim roll back, which used to leave the job pending, without an error,
 * and block every run behind it. */
export class ClaimedJobError extends Error {
  readonly job: PublicationJob;

  constructor(job: PublicationJob, cause: unknown) {
    super(errorMessage(cause));
    this.name = "ClaimedJobError";
    this.job = job;
  }
}

export async function processNextPublication(
  repository: PublicationJobRepository,
  projection: PublicationProjection,
): Promise<"idle" | "published" | "failed"> {
  let job: PublicationJob | null;
  try {
    job = await repository.claimNext();
  } catch (error) {
    if (!(error instanceof ClaimedJobError)) throw error;
    await repository.markFailed(
      error.job,
      new PublicationError("INPUT_UNAVAILABLE", error.message),
    );
    return "failed";
  }
  if (!job) return "idle";

  try {
    const snapshot = buildSnapshot(job);
    await projection.publish(snapshot);
    try {
      await repository.markSucceeded(job);
    } catch (error) {
      throw new PublicationError("STATE_SYNC_FAILED", errorMessage(error));
    }
    return "published";
  } catch (error) {
    await repository.markFailed(job, toPublicationError(error));
    return "failed";
  }
}

/**
 * Drains the queue within one invocation. Publishing to a group creates one
 * job per Touchpoint, so handling a single job per scheduled tick would take
 * N minutes for N tables. Bounded by job count and wall-clock budget; the
 * next tick (or an explicit run) continues where this one stopped.
 */
export async function processPendingPublications(
  repository: PublicationJobRepository,
  projection: PublicationProjection,
  limits: { maxJobs?: number; budgetMs?: number; now?: () => number } = {},
): Promise<{ published: number; failed: number; idle: boolean }> {
  const maxJobs = limits.maxJobs ?? 25;
  const budgetMs = limits.budgetMs ?? 25_000;
  const now = limits.now ?? Date.now;
  const started = now();
  let published = 0;
  let failed = 0;
  for (
    let index = 0;
    index < maxJobs && now() - started < budgetMs;
    index += 1
  ) {
    const outcome = await processNextPublication(repository, projection);
    if (outcome === "idle") return { published, failed, idle: true };
    if (outcome === "published") published += 1;
    else failed += 1;
  }
  return { published, failed, idle: false };
}

function toPublicationError(error: unknown): PublicationError {
  if (error instanceof PublicationError) return error;
  return new PublicationError("RESOLVER_UNAVAILABLE", errorMessage(error));
}

export function createHttpResolverProjection(input: {
  publishUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
}): PublicationProjection {
  const endpoint = new URL(input.publishUrl);
  if (endpoint.protocol !== "https:") {
    throw new Error("Resolver publication endpoint must use HTTPS.");
  }
  const fetchFn = input.fetchFn ?? fetch;
  return {
    async publish(snapshot) {
      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.commandKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            publicId: snapshot.publicId,
            revision: snapshot.revision,
            experience: snapshot.experience,
            ...(snapshot.asset ? { asset: snapshot.asset } : {}),
            ...(snapshot.assets ? { assets: snapshot.assets } : {}),
            ...(snapshot.experienceId
              ? { experienceId: snapshot.experienceId }
              : {}),
          }),
        });
      } catch (networkError) {
        throw new PublicationError(
          "RESOLVER_UNAVAILABLE",
          `Resolver request failed: ${errorMessage(networkError)}`,
        );
      }
      if (!response.ok) {
        const code: PublicationErrorCode =
          response.status >= 400 && response.status < 500
            ? "RESOLVER_REJECTED"
            : "RESOLVER_UNAVAILABLE";
        throw new PublicationError(
          code,
          `Resolver projection returned HTTP ${response.status}.`,
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new PublicationError(
          "RESOLVER_UNAVAILABLE",
          "Resolver projection returned an invalid JSON body.",
        );
      }
      if (!isProjectionResult(body)) {
        throw new PublicationError(
          "RESOLVER_UNAVAILABLE",
          "Resolver projection returned an invalid result.",
        );
      }
      return body.result;
    },
  };
}

export function createPostgresPublicationJobRepository(
  databaseUrl: string,
): PublicationJobRepository & { close(): Promise<void> } {
  const sql = postgres(databaseUrl, { max: 2, prepare: false });
  return {
    claimNext: () => claimNext(sql),
    markSucceeded: (job) => markSucceeded(sql, job),
    markFailed: (job, error) => markFailed(sql, job, error),
    close: () => sql.end(),
  };
}

/**
 * Claims the oldest runnable job in its own transaction (the attempt is
 * counted and committed), then loads the assets it references. A failure
 * loading them surfaces as `ClaimedJobError`, so the caller records it on
 * the claimed job instead of rolling the claim back.
 */
async function claimNext(sql: Sql): Promise<PublicationJob | null> {
  const claimed = await withPublisherRole(sql, async (transaction) => {
    const candidates = await transaction<PublicationJobRow[]>`
      select
        job.id,
        job.publication_id,
        experience.workspace_id,
        experience.id as experience_id,
        touchpoint.public_id,
        publication.revision,
        experience.type,
        version.content,
        job.attempts
      from kardo_core.publication_jobs job
      join kardo_core.publications publication on publication.id = job.publication_id
      join kardo_core.experience_versions version on version.id = publication.experience_version_id
      join kardo_core.experiences experience on experience.id = version.experience_id
      join kardo_core.touchpoints touchpoint on touchpoint.id = publication.touchpoint_id
      where publication.status in ('pending', 'processing')
        and (
          job.status = 'pending'
          or (job.status = 'running' and job.updated_at < now() - interval '10 minutes')
        )
      order by job.created_at asc
      limit 1
      for update of job, publication skip locked
    `;
    const job = candidates[0];
    if (!job) return null;

    const updated = await transaction<{ attempts: number }[]>`
      update kardo_core.publication_jobs
      set status = 'running', attempts = attempts + 1, last_error = null, updated_at = now()
      where id = ${job.id}::uuid
      returning attempts
    `;
    const attempts = updated[0]?.attempts;
    if (!attempts) throw new Error("Publication job could not be claimed.");
    return { job, attempts };
  });
  if (!claimed) return null;

  const { job, attempts } = claimed;
  try {
    const assets = await resolveJobAssets(sql, job);
    return toPublicationJob(job, attempts, assets);
  } catch (error) {
    throw new ClaimedJobError(toPublicationJob(job, attempts, {}), error);
  }
}

/** Validated, same-workspace assets a job's content references. */
async function resolveJobAssets(
  sql: Sql,
  job: PublicationJobRow,
): Promise<PublicationJob["assets"]> {
  const assetIds = referencedAssetIds(job.type, job.content);
  const assets: PublicationJob["assets"] = {};
  if (assetIds.length === 0) return assets;
  const rows = await withPublisherRole(
    sql,
    (transaction) => transaction<ResolvedAssetRow[]>`
      select id, sha256, media_type, original_filename
      from kardo_core.assets
      where id = any(${assetIds}::uuid[])
        and workspace_id = ${job.workspace_id}::uuid
        and status = 'validated'
    `,
  );
  for (const row of rows) {
    assets[row.id] = {
      sha256: row.sha256,
      mediaType: row.media_type,
      filename: row.original_filename,
    };
  }
  return assets;
}

async function markSucceeded(sql: Sql, job: PublicationJob): Promise<void> {
  await withPublisherRole(sql, async (transaction) => {
    const publication = await transaction<PublicationStateRow[]>`
      select publication.id, publication.touchpoint_id, publication.revision
      from kardo_core.publication_jobs job
      join kardo_core.publications publication on publication.id = job.publication_id
      where job.id = ${job.id}::uuid and job.status = 'running'
      for update of job, publication
    `;
    const current = publication[0];
    if (!current) throw new Error("Publication job is no longer running.");

    const active = await transaction<{ revision: number }[]>`
      select revision
      from kardo_core.publications
      where touchpoint_id = ${current.touchpoint_id}::uuid
        and status = 'published'
        and superseded_at is null
      for update
    `;
    const activeRevision = active[0]?.revision;
    if (activeRevision !== undefined && activeRevision >= current.revision) {
      await transaction`
        update kardo_core.publications
        set status = 'superseded', published_at = null, superseded_at = now()
        where id = ${current.id}::uuid
      `;
    } else {
      await transaction`
        update kardo_core.publications
        set status = 'superseded', published_at = null, superseded_at = now()
        where touchpoint_id = ${current.touchpoint_id}::uuid
          and status = 'published'
          and superseded_at is null
      `;
      await transaction`
        update kardo_core.publications
        set status = 'published', published_at = now(), superseded_at = null
        where id = ${current.id}::uuid
      `;
    }
    // A publication is only considered visitor-ready once its Resolver
    // projection succeeded. Only lift a Touchpoint out of its initial
    // 'assigned' state: if the customer already paused it, republishing must
    // not silently undo that pause in the database while the Durable Object
    // keeps serving it as paused.
    await transaction`
      update kardo_core.touchpoints
      set status = 'active', updated_at = now()
      where id = ${current.touchpoint_id}::uuid and status = 'assigned'
    `;
    await transaction`
      update kardo_core.publication_jobs
      set status = 'succeeded', updated_at = now()
      where id = ${job.id}::uuid
    `;
    await transaction`
      insert into kardo_audit.events (
        workspace_id, actor_type, action, target_type, target_id, result, metadata
      ) values (
        ${job.workspaceId}::uuid,
        'service',
        'publication.published',
        'publication',
        ${current.id}::uuid,
        'succeeded',
        ${transaction.json({ jobId: job.id, revision: current.revision })}
      )
    `;
  });
}

async function markFailed(
  sql: Sql,
  job: PublicationJob,
  error: PublicationError,
): Promise<void> {
  await withPublisherRole(sql, async (transaction) => {
    const finalFailure = job.attempts >= 5 || error.immediatelyFinal;
    const lastError = `${error.code}: ${error.message}`.slice(0, 500);
    await transaction`
      update kardo_core.publication_jobs
      set
        status = ${finalFailure ? "failed" : "pending"},
        last_error = ${lastError},
        updated_at = now()
      where id = ${job.id}::uuid and status = 'running'
    `;
    if (finalFailure) {
      await transaction`
        update kardo_core.publications
        set status = 'failed'
        where id = ${job.publicationId}::uuid and status in ('pending', 'processing')
      `;
    }
    await transaction`
      insert into kardo_audit.events (
        workspace_id, actor_type, action, target_type, target_id, result, reason, metadata
      ) values (
        ${job.workspaceId}::uuid,
        'service',
        'publication.projection_failed',
        'publication',
        ${job.publicationId}::uuid,
        'failed',
        ${lastError},
        ${transaction.json({ jobId: job.id, attempts: job.attempts, finalFailure, code: error.code })}
      )
    `;
  });
}

async function withPublisherRole<T>(
  sql: Sql,
  action: (transaction: TransactionSql) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async (transaction) => {
    await transaction.unsafe("set local role kardo_publisher");
    return (await action(transaction)) as T;
  })) as T;
}

type PublicationJobRow = {
  id: string;
  publication_id: string;
  workspace_id: string;
  experience_id: string;
  public_id: string;
  revision: number;
  type: ExperienceKind;
  content: unknown;
  attempts: number;
};

type ResolvedAssetRow = {
  id: string;
  sha256: string;
  media_type: AssetRef["mediaType"];
  original_filename: string;
};

type PublicationStateRow = {
  id: string;
  touchpoint_id: string;
  revision: number;
};

function toPublicationJob(
  row: PublicationJobRow,
  attempts: number,
  assets: PublicationJob["assets"],
): PublicationJob {
  return {
    id: row.id,
    publicationId: row.publication_id,
    workspaceId: row.workspace_id,
    experienceId: row.experience_id,
    publicId: row.public_id,
    revision: row.revision,
    type: row.type,
    content: row.content,
    assets,
    attempts,
  };
}

function isProjectionResult(
  value: unknown,
): value is { result: "activated" | "stale"; revision: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "result" in value &&
    (value.result === "activated" || value.result === "stale") &&
    "revision" in value &&
    typeof value.revision === "number"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** A dish's choices (relevo 37, D1), validated like the dishes. */
function menuChoices(
  item: Record<string, unknown>,
  path: string,
): Pick<MenuItem, "choices" | "choicesLabel"> {
  if (item.choices === undefined) return {};
  if (
    !Array.isArray(item.choices) ||
    item.choices.length < 1 ||
    item.choices.length > 12
  )
    throw invalidContent(`${path} requires between 1 and 12 choices.`);
  const choices = item.choices.map((choice, index) => {
    if (!isRecord(choice) || !isItemId(choice.id) || !isSafeText(choice.name))
      throw invalidContent(`${path}.choices[${index}] is invalid.`);
    return { id: choice.id, name: choice.name };
  });
  if (
    item.choicesLabel !== undefined &&
    (typeof item.choicesLabel !== "string" ||
      item.choicesLabel.trim().length === 0 ||
      item.choicesLabel.length > 40)
  )
    throw invalidContent(`${path} choicesLabel is invalid.`);
  return {
    choices,
    ...(typeof item.choicesLabel === "string"
      ? { choicesLabel: item.choicesLabel }
      : {}),
  };
}

function isSafeText(value: unknown, max = 120): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}
function isOptionalText(value: unknown, max: number): boolean {
  return (
    value === undefined || (typeof value === "string" && value.length <= max)
  );
}
function isItemId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}
function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}
function isPrice(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 10_000_000)
  );
}
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function isFieldSetting(value: unknown): value is FormFieldSetting {
  return value === "hidden" || value === "optional" || value === "required";
}
/** A visor de PDF page's drawn `width`/`height`, mirroring
 * `DocumentPageSchema`'s own `Type.Integer({ minimum: 1, maximum: 10_000 })`. */
function isPageDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 10_000
  );
}
