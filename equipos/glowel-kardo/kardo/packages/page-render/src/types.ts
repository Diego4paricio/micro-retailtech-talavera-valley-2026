// ---------------------------------------------------------------------------
// Public types for @kardo/page-render (ADR 018 — Estudio de Experiences).
//
// This package is pure TypeScript: no DOM, no Node/Workers globals. It knows
// how to turn a validated `PageDesign` (from `@kardo/contracts`) plus the
// bound content of a `links`/`profile`/`linkpage` Experience into HTML and
// CSS. It never decides whether a URL, image or id is safe — the Resolver's
// `parsePublishedDesign` (this package's `validate.ts`) and the Publisher
// each do that before anything here ever sees the data. Every string this
// package DOES interpolate into CSS is still re-checked defensively (hex
// colors, bounded integers, closed enums) so a malformed object can never
// smuggle a CSS/HTML injection through — see `css.ts`.
// ---------------------------------------------------------------------------

/** Mirrors the closed `SocialNetwork` union used across `@kardo/contracts`,
 * the Publisher and the Resolver. Duplicated here deliberately: this package
 * must not depend on any service, and every layer in this codebase
 * re-declares this same small closed set rather than share it. */
export const socialNetworks = [
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
] as const;
export type SocialNetwork = (typeof socialNetworks)[number];

export type DesignableLinkItem = { id: string; label: string; url: string };

/** The bound content a designed page renders through its bound blocks
 * (`contentTitle`, `profileHeader`, `contentLinks`, `contentSocials`,
 * `menu`, `catalog`, `leadForm`, `documentPages`, `imageMain`). Shaped like
 * the Resolver's `ExperiencePayload` variants
 * (content hashes already resolved, never asset ids) but kept independent so
 * this package never depends on a service. */
export type DesignableContent =
  | {
      type: "links";
      title: string;
      description?: string;
      links: DesignableLinkItem[];
    }
  | {
      type: "profile";
      displayName: string;
      headline?: string;
      biography?: string;
      avatarRef?: string;
      links: DesignableLinkItem[];
    }
  | {
      type: "linkpage";
      displayName: string;
      bio?: string;
      avatarRef?: string;
      socials: { id: string; network: SocialNetwork; value: string }[];
      links: (DesignableLinkItem & { highlight?: boolean })[];
    }
  | {
      type: "menu";
      title: string;
      description?: string;
      currency: string;
      sections: DesignableMenuSection[];
    }
  | {
      type: "catalog";
      title: string;
      description?: string;
      currency: string;
      items: DesignableCatalogItem[];
    }
  | {
      type: "form";
      title: string;
      description?: string;
      fields: {
        name: DesignableFormField;
        phone: DesignableFormField;
        message: DesignableFormField;
      };
      submitLabel: string;
      successMessage: string;
      consentText: string;
      privacyNoticeUrl?: string;
    }
  | {
      type: "document";
      title: string;
      description?: string;
      /** "viewer" draws `pages`; "download" shows the download card. */
      display: "download" | "viewer";
      pages: DesignableDocumentPage[];
      /** Viewer: also offer the download button. */
      allowDownload: boolean;
    }
  | {
      type: "image";
      alt: string;
      /** The main image (asset id in the panel, sha256 on the Resolver). */
      imageRef: string;
    };

export type DesignableExperienceKind = DesignableContent["type"];

/** Live state of an item (ADR 017), applied by the Resolver before
 * rendering; hidden items never reach the renderer. */
export type DesignableAvailability = {
  soldOut: boolean;
  /** "Quedan N" when set. */
  remaining: number | null;
};

/** A choice of a dish (relevo 37, D1), already filtered by the Resolver:
 * hidden choices never arrive, sold-out ones carry `soldOut`. */
export type DesignableMenuChoice = { id: string; name: string; soldOut?: true };

export type DesignableMenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  imageRef?: string;
  availability?: DesignableAvailability;
  /** «Menú del día»: the dishes to choose from, and their line's label. */
  choices?: DesignableMenuChoice[];
  choicesLabel?: string;
};

export type DesignableMenuSection = {
  id: string;
  name: string;
  items: DesignableMenuItem[];
};

export type DesignableCatalogItem = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  /** Destination of "Ver más"; tracked through `linkHref`. */
  url?: string;
  imageRef?: string;
  availability?: DesignableAvailability;
};

export type DesignableFormField = "hidden" | "optional" | "required";

export type DesignableDocumentPage = {
  ref: string;
  width: number;
  height: number;
};

export type RenderContext = {
  /** URL for an imageRef (an asset id in the panel, a sha256 on the
   * Resolver). `null` skips the image entirely (renders nothing, or a
   * placeholder for a bound avatar). */
  resolveImage: (ref: string) => string | null;
  /** Href for a tracked item: a content link, a social entry or a design
   * `button` block. The Resolver ignores `url` and always returns its own
   * `/go/{itemId}` route; a preview context may return `url` unchanged. */
  linkHref: (itemId: string, url: string) => string;
  /** Base URL where the webfont files this design uses live, e.g.
   * `"/_fonts/"` on the Resolver. Always ends with `/`. */
  fontBaseUrl: string;
  /** How a length in design px is written. Plain `px` by default; a canvas
   * section writes it in its own scalable unit (see `canvas.ts`). Only ever
   * receives clamped integers. */
  px?: (value: number) => string;
  /**
   * Renders an `html` block: sanitizes `html`/`css` with the modo HTML
   * cleaner and returns the markup (a host element with its declarative
   * shadow root), or `null` while the cleaner is not loaded (the panel
   * loads it lazily; the block then draws a placeholder). Injected by the
   * caller so the block renderer never bundles parse5/css-tree itself.
   */
  renderHtmlBlock?: (html: string, css: string) => string | null;
  /** Formulario: where the form posts (the Resolver's leads route). Absent
   * in the panel's preview, which draws the form without submitting. */
  formAction?: string;
  /** Formulario: Cloudflare Turnstile site key, when configured. */
  turnstileSiteKey?: string;
  /** PDF: the download URL of the document itself. */
  documentHref?: string;
  /**
   * "Sin banco de fotos" (2026-10-03): when a design has no photo yet for an
   * `image`/`gallery` block, a Menú dish, a Catálogo product or a
   * `featuredItems` item, draw a dashed "espacio para foto" placeholder in
   * its exact spot instead of nothing. `true` only in the panel's own
   * preview; absent or `false` (the Publisher, the Resolver, the public
   * page) never draws one — the slot is simply empty, exactly as before.
   */
  imagePlaceholders?: boolean;
};

export const plainPx = (value: number): string => `${value}px`;
