import type { DesignableContent, RenderContext } from "@kardo/page-render";
import {
  documentViewerDesign,
  footerCss,
  htmlBlockRenderer,
  kardoLogoSvg,
  renderCustomHtmlDocument,
  renderDesignedDocument,
  renderKardoFooter,
  socialIcon,
  socialLabel,
} from "@kardo/page-render";
import {
  type AnnotatedCatalogItem,
  type AnnotatedMenuItem,
  applyItemAvailability,
  type CatalogRenderData,
  type ItemAvailabilityOverlay,
  type MenuRenderData,
} from "./item-availability.js";
import type {
  AssetRef,
  ExperiencePayload,
  PublishedSnapshot,
  SnapshotTheme,
} from "./snapshot.js";
import { isImageMediaType } from "./snapshot.js";

// Single shared inline stylesheet. The Resolver's CSP forbids external
// stylesheets and fonts (style-src 'unsafe-inline' only, no font-src), so
// "DM Sans" is listed only as a preference: devices that already have it
// render it, everyone else gets the system sans-serif stack.
const brandCss = `
:root{color-scheme:light;--bg:#f7f5f0;--text:#16232e;--text-secondary:#52646d;--accent:#0a6c78;--accent-light:#4ec3ce;--surface:#fffdf8;--border:#d9ded8;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5;-webkit-text-size-adjust:100%}
.page{min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:28px 16px 20px;background:var(--t-bg, var(--bg));background-size:var(--t-bg-size, auto);background-position:center;background-repeat:no-repeat}
.card{width:100%;max-width:36rem;background:var(--t-surface, var(--surface));color:var(--t-text, var(--text));border:1px solid var(--t-border, var(--border));border-radius:20px;padding:28px 24px;box-shadow:0 1px 2px rgba(22,35,46,.06)}
h1{font-size:1.5rem;margin:0 0 4px;font-weight:700;letter-spacing:-.01em}
h2{font-size:1.05rem;margin:0}
p{margin:0}
.headline,.description{color:var(--t-text-secondary, var(--text-secondary));margin:0 0 20px;font-size:.95rem}
.promo-banner{background:linear-gradient(135deg,#ea580c 0%,#e11d48 100%);color:#fff;border-radius:16px;padding:16px 18px;margin:10px 0 22px;box-shadow:0 10px 24px -6px rgba(225,29,72,.42);border:1px solid rgba(255,255,255,.22)}
.promo-badge{display:inline-block;background:rgba(255,255,255,.22);color:#fff;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:6px}
.promo-title{font-size:1.22rem;font-weight:800;line-height:1.28;letter-spacing:-.01em;color:#fff}
.bio{white-space:pre-wrap;color:var(--t-text, var(--text));margin:0 0 20px;font-size:.95rem}
.links{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
a.link-button,button.primary{display:block;width:100%;box-sizing:border-box;text-align:center;background:var(--t-accent, var(--accent));color:var(--t-on-accent, #fff);border:none;border-radius:12px;padding:14px 16px;font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer;font-family:inherit}
a.link-button:hover,button.primary:hover{background:var(--accent-light);color:var(--t-text, var(--text))}
a.link-button:focus-visible,button.primary:focus-visible,input:focus-visible,textarea:focus-visible,.social-icon:focus-visible{outline:3px solid var(--accent-light);outline-offset:2px}
.avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:1px solid var(--t-border, var(--border));margin-bottom:16px;background:var(--t-surface, var(--bg))}
.avatar-initials{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.7rem;color:var(--t-text, var(--text));letter-spacing:.02em}
.hero-image{width:100%;border-radius:14px;display:block;margin-bottom:4px;background:var(--bg)}
.menu-section{margin-top:22px}
.menu-section h2{border-bottom:1px solid var(--t-border, var(--border));padding-bottom:6px;margin-bottom:10px}
.menu-items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.menu-item{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--t-border, var(--border))}
.menu-item:last-child{border-bottom:none}
.menu-item .name{font-weight:600}
.menu-item .desc{color:var(--t-text-secondary, var(--text-secondary));font-size:.85rem;margin-top:2px}
.menu-item .price{font-weight:600;white-space:nowrap}
.menu-thumb{width:64px;height:64px;border-radius:12px;object-fit:cover;flex:none;background:var(--t-surface, var(--surface))}
.menu-text{flex:1;min-width:0}
.menu-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;white-space:nowrap}
.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;margin-top:6px}
.catalog-card{border:1px solid var(--t-border, var(--border));border-radius:14px;overflow:hidden;background:var(--t-bg, var(--bg));display:flex;flex-direction:column}
.catalog-card img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:var(--t-surface, var(--surface))}
.catalog-card .catalog-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;flex:1}
.catalog-card .name{font-weight:600;font-size:.92rem}
.catalog-card .desc{color:var(--t-text-secondary, var(--text-secondary));font-size:.8rem}
.catalog-card .price{font-weight:700;margin-top:auto}
.catalog-card a.link-button{margin-top:8px;padding:9px;font-size:.85rem}
.badge{display:inline-block;font-size:.72rem;font-weight:600;line-height:1.4;padding:2px 8px;border-radius:999px}
.catalog-body .badge{align-self:flex-start}
.badge-sold-out{background:rgba(22,35,46,.08);color:var(--t-text-secondary, var(--text-secondary))}
.choices{margin-top:6px;font-size:.85rem}
.choices-label{display:block;color:var(--t-text-secondary, var(--text-secondary));margin-bottom:2px}
.choices ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px}
.choice.is-sold-out{text-decoration:line-through;opacity:.6}
.choice-state{text-decoration:none;font-size:.75rem}
.badge-low{background:color-mix(in srgb,var(--t-accent, var(--accent)) 14%,transparent);color:var(--t-accent, var(--accent))}
.theme-dark .badge-sold-out{background:rgba(244,246,245,.14)}
.is-sold-out .name,.is-sold-out .desc,.is-sold-out .price{opacity:.55}
.is-sold-out img{filter:grayscale(1);opacity:.6}
.doc-icon{width:56px;height:56px;border-radius:14px;background:var(--t-accent, var(--accent));color:var(--t-on-accent, #fff);display:flex;align-items:center;justify-content:center;font-weight:700;margin-bottom:16px;font-size:.8rem;letter-spacing:.04em}
.doc-pages{display:flex;flex-direction:column;gap:12px;width:100%;margin:4px 0 4px}
.doc-page{width:100%;height:auto;display:block;border-radius:10px;background:var(--t-surface, var(--surface))}
form{display:flex;flex-direction:column;gap:14px;margin-top:4px}
label{font-size:.85rem;font-weight:600;display:flex;flex-direction:column;gap:6px}
input[type=text],input[type=email],input[type=tel],textarea{font:inherit;padding:11px 12px;border:1px solid var(--t-border, var(--border));border-radius:10px;background:var(--t-surface, var(--surface));color:var(--t-text, var(--text))}
textarea{resize:vertical;min-height:88px}
.consent{flex-direction:row;align-items:flex-start;gap:8px;font-weight:400;font-size:.85rem;color:var(--t-text-secondary, var(--text-secondary))}
.consent input{margin-top:3px}
.consent-notice{margin:-4px 0 0 26px;font-size:.85rem}
.consent-notice a{color:inherit;text-decoration:underline}
.hp{position:absolute;opacity:0;height:0;width:0;overflow:hidden;pointer-events:none}
.notice{background:var(--t-surface, var(--surface));border:1px solid var(--t-border, var(--border));border-radius:14px;padding:34px 26px;text-align:center}
.notice-logo{margin-bottom:16px}
.notice-logo svg{height:24px;width:auto;margin:0 auto;display:block}
.notice p{color:var(--t-text-secondary, var(--text-secondary));font-size:.95rem;line-height:1.6;margin-top:4px}
.linkpage-card{text-align:center}
.socials{list-style:none;display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:4px 0 20px;padding:0}
.social-icon{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--t-accent, var(--accent));color:var(--t-on-accent, #fff);text-decoration:none}
.social-icon svg{width:18px;height:18px}
.link-button--highlight{box-shadow:0 0 0 2px var(--t-accent, var(--accent)) inset;font-weight:700}
.theme-light{--t-surface:#fffdf8;--t-text:#16232e;--t-text-secondary:#52646d;--t-border:#d9ded8}
.theme-dark{--t-surface:#1c232b;--t-text:#f4f6f5;--t-text-secondary:#aab4bb;--t-border:#333d47}
.btn-pill a.link-button,.btn-pill button.primary,.btn-pill .social-icon{border-radius:999px}
.btn-rounded a.link-button,.btn-rounded button.primary{border-radius:14px}
.btn-square a.link-button,.btn-square button.primary{border-radius:4px}
.btn-square .social-icon{border-radius:8px}
.btn-outline a.link-button,.btn-outline button.primary{background:transparent;color:var(--t-accent, var(--accent));border:2px solid var(--t-accent, var(--accent))}
.btn-outline a.link-button:hover,.btn-outline button.primary:hover{background:var(--t-accent, var(--accent));color:var(--t-on-accent, #fff)}
.font-sans{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.font-serif{font-family:Georgia,"Times New Roman",serif}
.font-rounded{font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,sans-serif}
.font-mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace}
@media (max-width: 360px){
.menu-thumb{width:56px;height:56px}
}
@media (prefers-reduced-motion: no-preference){
.linkpage-animate>li{opacity:0;transform:translateY(8px);animation:kardo-fade-in .5s ease forwards}
.linkpage-animate>li:nth-child(1){animation-delay:.05s}
.linkpage-animate>li:nth-child(2){animation-delay:.1s}
.linkpage-animate>li:nth-child(3){animation-delay:.15s}
.linkpage-animate>li:nth-child(4){animation-delay:.2s}
.linkpage-animate>li:nth-child(5){animation-delay:.25s}
.linkpage-animate>li:nth-child(6){animation-delay:.3s}
.linkpage-animate>li:nth-child(n+7){animation-delay:.35s}
@keyframes kardo-fade-in{to{opacity:1;transform:none}}
}
`;

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

export function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/**
 * Computes the page div's theme class list and inline custom-property style
 * from a validated `SnapshotTheme`. Every value folded in here is either a
 * closed enum (safe to use as a literal CSS class name), a `#rrggbb` color or
 * an integer (both format-constrained by `snapshot.ts`'s validation, so
 * neither can carry HTML/CSS metacharacters), or — for an image background —
 * a path built only from the already-validated `publicId` and `imageSha256`
 * (never from request-derived data such as the Host header), so it never
 * needs to reach for `origin`. The resulting style string is still run
 * through `escapeHtml` before being embedded, as defense in depth.
 */
function themeAttributes(
  theme: SnapshotTheme | undefined,
  publicId: string | undefined,
): { classes: string; style: string } {
  if (!theme) return { classes: "", style: "" };
  const background = theme.background;
  const vars: string[] = [
    `--t-accent:${theme.accent}`,
    `--t-on-accent:${onAccentColor(theme.accent)}`,
  ];
  if (background.kind === "solid") {
    vars.push(`--t-bg:${background.color}`);
  } else if (background.kind === "gradient") {
    const angle = background.angle ?? 180;
    vars.push(
      `--t-bg:linear-gradient(${angle}deg, ${background.color}, ${background.colorTo})`,
    );
  } else {
    const overlay = (background.overlay ?? 0) / 100;
    const path = `/t/${encodeURIComponent(publicId ?? "")}/assets/${background.imageSha256}`;
    vars.push(
      `--t-bg:linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})),url(${path})`,
    );
    vars.push("--t-bg-size:cover");
  }
  const classes = [
    `theme-${theme.surface}`,
    `btn-${theme.buttonStyle}`,
    `font-${theme.font}`,
  ].join(" ");
  return { classes, style: vars.join(";") };
}

/** Text/icon color on top of the accent: whichever of ink (#16232e) or white
 * has the higher WCAG contrast against it (same rule as `@kardo/page-render`'s
 * `onAccentColor` and the panel preview's `prefersInkText`). Until
 * 2026-10-02 this split at luminance 0.5, leaving white text at about 2:1 on
 * mid-tone accents; the real crossover sits near 0.21. */
export function onAccentColor(accent: string): string {
  const value = Number.parseInt(accent.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255);
  const onInk = (luminance + 0.05) / (0.0158 + 0.05);
  const onWhite = 1.05 / (luminance + 0.05);
  return onInk > onWhite ? "#16232e" : "#fff";
}

/**
 * The footer tone for a page with no design (a themed template, or the
 * fixed neutral look): the theme's own `surface` when it is known, `"chip"`
 * over an image background (its luminance is not known ahead of time), and
 * `"light"` — the fixed neutral background's own tone — when there is no
 * theme at all (status/notice pages, a legacy asset-only snapshot).
 */
function footerToneFor(
  theme: SnapshotTheme | undefined,
): "light" | "dark" | "chip" {
  if (!theme) return "light";
  if (theme.background.kind === "image") return "chip";
  return theme.surface;
}

/** A themed or neutral (no design) page: the fixed `brandCss` shell, with the
 * Kardo footer as the last child of `.page` (`margin-top:auto` pushes it to
 * the bottom of a short screen). Designed and modo HTML pages never call
 * this — they are `@kardo/page-render`'s own complete documents instead (see
 * `renderExperiencePage`), so what the Estudio designs is exactly what this
 * route serves. */
function page(input: {
  title: string;
  bodyHtml: string;
  /** Set on branded status pages (unpublished/paused/retired/suspended) so
   * search engines never index a Touchpoint's temporary or terminal state. */
  noindex?: boolean;
  theme?: SnapshotTheme | undefined;
  publicId?: string;
}): string {
  const { classes, style } = themeAttributes(input.theme, input.publicId);
  const pageClass = ["page", classes].filter(Boolean).join(" ");
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${input.noindex ? '<meta name="robots" content="noindex">\n' : ""}<title>${escapeHtml(input.title)}</title>
<style>${brandCss}${footerCss}</style>
</head>
<body>
<div class="${pageClass}"${styleAttr}>
${input.bodyHtml}
${renderKardoFooter(footerToneFor(input.theme))}
</div>
</body>
</html>`;
}

export function renderNoticePage(input: {
  title: string;
  message: string;
  noindex?: boolean;
}): string {
  return page({
    title: input.title,
    ...(input.noindex !== undefined ? { noindex: input.noindex } : {}),
    bodyHtml: `<div class="card notice"><div class="notice-logo">${kardoLogoSvg}</div><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.message)}</p></div>`,
  });
}

/** Font files the Resolver serves through Workers Static Assets — see
 * `wrangler.jsonc`'s `assets` binding and `publicHtmlHeaders`'s `font-src`. */
const fontBaseUrl = "/_fonts/";

function trackedHref(
  publicId: string,
  itemId: string,
  channel: string,
): string {
  return `/t/${encodeURIComponent(publicId)}/go/${encodeURIComponent(itemId)}?src=${encodeURIComponent(channel)}`;
}
function assetHref(origin: string, publicId: string, sha256: string): string {
  return `${origin}/t/${encodeURIComponent(publicId)}/assets/${sha256}`;
}

// ---------------------------------------------------------------------------
// Estudio de Experiences (ADR 018, addendum 3): every designable type maps
// to `@kardo/page-render`'s `DesignableContent`, and the whole page is served
// by that same package's `renderDesignedDocument` — the exact document the
// panel's preview also builds, so what the customer designs is exactly what
// this route serves.
// ---------------------------------------------------------------------------

/** Maps a `links`/`profile`/`linkpage` snapshot payload to
 * `@kardo/page-render`'s `DesignableContent` shape — nearly identical, but
 * this module's `avatarSha256` becomes page-render's generic `avatarRef`
 * (which the panel's preview instead points at a workspace asset id). Shared
 * by both the design and the modo HTML paths. */
function toLinkLikeContent(
  experience: Extract<
    ExperiencePayload,
    { type: "links" | "profile" | "linkpage" }
  >,
): DesignableContent {
  if (experience.type === "links") {
    return {
      type: "links",
      title: experience.title,
      ...(experience.description !== undefined
        ? { description: experience.description }
        : {}),
      links: experience.links,
    };
  }
  if (experience.type === "profile") {
    return {
      type: "profile",
      displayName: experience.displayName,
      ...(experience.headline !== undefined
        ? { headline: experience.headline }
        : {}),
      ...(experience.biography !== undefined
        ? { biography: experience.biography }
        : {}),
      ...(experience.avatarSha256 !== undefined
        ? { avatarRef: experience.avatarSha256 }
        : {}),
      links: experience.links,
    };
  }
  return {
    type: "linkpage",
    displayName: experience.displayName,
    ...(experience.bio !== undefined ? { bio: experience.bio } : {}),
    ...(experience.avatarSha256 !== undefined
      ? { avatarRef: experience.avatarSha256 }
      : {}),
    socials: experience.socials,
    links: experience.links,
  };
}

function toDesignableMenuContent(
  data: MenuRenderData,
): Extract<DesignableContent, { type: "menu" }> {
  return {
    type: "menu",
    title: data.title,
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    currency: data.currency,
    sections: data.sections.map((section) => ({
      id: section.id,
      name: section.name,
      items: section.items.map((item) => ({
        id: item.id,
        name: item.name,
        ...(item.description !== undefined
          ? { description: item.description }
          : {}),
        ...(item.price !== undefined ? { price: item.price } : {}),
        ...(item.imageSha256 !== undefined
          ? { imageRef: item.imageSha256 }
          : {}),
        ...(item.availability !== undefined
          ? { availability: item.availability }
          : {}),
        ...(item.choices ? { choices: item.choices } : {}),
        ...(item.choicesLabel !== undefined
          ? { choicesLabel: item.choicesLabel }
          : {}),
      })),
    })),
  };
}

function toDesignableCatalogContent(
  data: CatalogRenderData,
): Extract<DesignableContent, { type: "catalog" }> {
  return {
    type: "catalog",
    title: data.title,
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    currency: data.currency,
    items: data.items.map((item) => ({
      id: item.id,
      name: item.name,
      ...(item.description !== undefined
        ? { description: item.description }
        : {}),
      ...(item.price !== undefined ? { price: item.price } : {}),
      ...(item.url !== undefined ? { url: item.url } : {}),
      ...(item.imageSha256 !== undefined ? { imageRef: item.imageSha256 } : {}),
      ...(item.availability !== undefined
        ? { availability: item.availability }
        : {}),
    })),
  };
}

function toDesignableFormContent(
  experience: Extract<ExperiencePayload, { type: "form" }>,
): Extract<DesignableContent, { type: "form" }> {
  return {
    type: "form",
    title: experience.title,
    ...(experience.description !== undefined
      ? { description: experience.description }
      : {}),
    fields: experience.fields,
    submitLabel: experience.submitLabel,
    successMessage: experience.successMessage,
    consentText: experience.consentText,
    ...(experience.privacyNoticeUrl !== undefined
      ? { privacyNoticeUrl: experience.privacyNoticeUrl }
      : {}),
  };
}

function toDesignableDocumentContent(
  experience: Extract<ExperiencePayload, { type: "document" }>,
): Extract<DesignableContent, { type: "document" }> {
  return {
    type: "document",
    title: experience.title,
    ...(experience.description !== undefined
      ? { description: experience.description }
      : {}),
    display: experience.display ?? "download",
    pages: (experience.pages ?? []).map((docPage) => ({
      ref: docPage.sha256,
      width: docPage.width,
      height: docPage.height,
    })),
    allowDownload: experience.allowDownload ?? false,
  };
}

function toDesignableImageContent(
  experience: Extract<ExperiencePayload, { type: "image" }>,
  snapshot: PublishedSnapshot,
): Extract<DesignableContent, { type: "image" }> {
  const ref = snapshot.assets?.[0] ?? snapshot.asset;
  return { type: "image", alt: experience.alt, imageRef: ref?.sha256 ?? "" };
}

/** The `RenderContext` every designed/modo HTML page renders with: images and
 * tracked clicks resolve through this Touchpoint's own routes, webfonts come
 * from the Resolver's own `/_fonts/*`, and an `html` block is sanitized and
 * rendered the same way the panel's preview does. */
function designRenderContext(input: {
  origin: string;
  publicId: string;
  channel: string;
  formAction?: string;
  turnstileSiteKey?: string;
  documentHref?: string;
}): RenderContext {
  const { origin, publicId, channel } = input;
  const resolveImage = (sha256: string) => assetHref(origin, publicId, sha256);
  return {
    resolveImage,
    linkHref: (itemId) => trackedHref(publicId, itemId, channel),
    fontBaseUrl,
    renderHtmlBlock: htmlBlockRenderer(resolveImage),
    ...(input.formAction !== undefined ? { formAction: input.formAction } : {}),
    ...(input.turnstileSiteKey !== undefined
      ? { turnstileSiteKey: input.turnstileSiteKey }
      : {}),
    ...(input.documentHref !== undefined
      ? { documentHref: input.documentHref }
      : {}),
  };
}

const turnstileScript =
  '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>';

/**
 * Serves the one designed document for any of the 8 designable Experience
 * types — the same `renderDesignedDocument` (`@kardo/page-render`) the
 * panel's preview builds, so what the Estudio designs is exactly what this
 * route serves. `itemAvailability` only matters for menu/catalog.
 */
function renderDesignedExperiencePage(input: {
  experience: Exclude<ExperiencePayload, { type: "redirect" }>;
  snapshot: PublishedSnapshot;
  origin: string;
  channel: string;
  turnstileSiteKey?: string;
  itemAvailability?: ItemAvailabilityOverlay;
}): string {
  const { experience, snapshot, origin, channel } = input;
  const publicId = snapshot.publicId;
  const design = experience.design;
  if (!design) throw new Error("renderDesignedExperiencePage: no design");

  switch (experience.type) {
    case "links":
      return renderDesignedDocument(
        toLinkLikeContent(experience),
        design,
        designRenderContext({ origin, publicId, channel }),
        { title: experience.title },
      );
    case "profile":
      return renderDesignedDocument(
        toLinkLikeContent(experience),
        design,
        designRenderContext({ origin, publicId, channel }),
        { title: experience.displayName },
      );
    case "linkpage":
      return renderDesignedDocument(
        toLinkLikeContent(experience),
        design,
        designRenderContext({ origin, publicId, channel }),
        { title: experience.displayName },
      );
    case "menu": {
      const html = renderDesignedDocument(
        toDesignableMenuContent(
          applyItemAvailability(experience, input.itemAvailability ?? {}),
        ),
        design,
        designRenderContext({ origin, publicId, channel }),
        { title: experience.title },
      );
      if (experience.description?.trim().startsWith("🔥")) {
        const cleanPromo = experience.description.trim().replace(/^🔥\s*/, "");
        const bannerInline = `<div style="max-width:36rem;margin:16px auto 0;padding:0 16px;box-sizing:border-box"><div style="background:linear-gradient(135deg,#ea580c 0%,#e11d48 100%);color:#fff;border-radius:16px;padding:16px 18px;box-shadow:0 10px 24px -6px rgba(225,29,72,.42);font-family:system-ui,-apple-system,sans-serif"><span style="display:inline-block;background:rgba(255,255,255,.22);color:#fff;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:6px">🔥 PROMOCIÓN EN VIVO</span><div style="font-size:1.22rem;font-weight:800;line-height:1.28;color:#fff">${escapeHtml(cleanPromo)}</div></div></div>`;
        return html.replace(/<body([^>]*)>/i, `<body$1>${bannerInline}`);
      }
      return html;
    }
    case "catalog":
      return renderDesignedDocument(
        toDesignableCatalogContent(
          applyItemAvailability(experience, input.itemAvailability ?? {}),
        ),
        design,
        designRenderContext({ origin, publicId, channel }),
        { title: experience.title },
      );
    case "form": {
      const formAction = `/t/${encodeURIComponent(publicId)}/leads?src=${encodeURIComponent(channel)}`;
      return renderDesignedDocument(
        toDesignableFormContent(experience),
        design,
        designRenderContext({
          origin,
          publicId,
          channel,
          formAction,
          ...(input.turnstileSiteKey !== undefined
            ? { turnstileSiteKey: input.turnstileSiteKey }
            : {}),
        }),
        {
          title: experience.title,
          ...(input.turnstileSiteKey !== undefined
            ? { bodyEnd: turnstileScript }
            : {}),
        },
      );
    }
    case "document": {
      const ref = documentFile(snapshot);
      const documentHref = ref
        ? assetHref(origin, publicId, ref.sha256)
        : undefined;
      return renderDesignedDocument(
        toDesignableDocumentContent(experience),
        design,
        designRenderContext({
          origin,
          publicId,
          channel,
          ...(documentHref !== undefined ? { documentHref } : {}),
        }),
        { title: experience.title },
      );
    }
    case "image":
      return renderDesignedDocument(
        toDesignableImageContent(experience, snapshot),
        design,
        designRenderContext({ origin, publicId, channel }),
        { title: experience.alt },
      );
  }
}

/**
 * Serves a `links`/`profile`/`linkpage` experience's modo HTML (ADR 018,
 * extended 2026-09-29), if it has one, with the exact same renderer
 * (`@kardo/page-render`'s `renderCustomHtmlDocument`) the panel's preview
 * uses — same shared-nothing declarative shadow root, same "chip" footer.
 * Returns `null` when the experience carries no `customHtml`, so the caller
 * falls back to `design`, then the fixed theme template — `customHtml` takes
 * precedence over both when present.
 */
function renderCustomHtmlExperiencePage(
  experience: Extract<
    ExperiencePayload,
    { type: "links" | "profile" | "linkpage" }
  >,
  publicId: string,
  channel: string,
  origin: string,
): string | null {
  if (!experience.customHtml) return null;
  const content = toLinkLikeContent(experience);
  const ctx = designRenderContext({ origin, publicId, channel });
  const title =
    experience.type === "links" ? experience.title : experience.displayName;
  return renderCustomHtmlDocument(content, experience.customHtml, ctx, {
    title,
  });
}

export function renderExperiencePage(input: {
  snapshot: PublishedSnapshot;
  origin: string;
  channel: string;
  /** Cloudflare Turnstile site key, only ever passed when Turnstile is
   * configured (both the site key and secret key are set); only rendered on
   * a form experience's page. */
  turnstileSiteKey?: string;
  /** Live Menu/Catalog item availability, looked up by the caller from
   * `ItemAvailabilityState` (see index.ts). Absent/undefined renders exactly
   * as if every item were available — the caller passes nothing on a DO
   * failure (fail open) or when the snapshot carries no `experienceId`.
   * Applied here through the pure `applyItemAvailability`, keeping this
   * module itself free of any I/O. */
  itemAvailability?: ItemAvailabilityOverlay;
}): string {
  const { snapshot, origin, channel } = input;
  const experience = snapshot.experience;
  if (!experience)
    return page({
      title: "Kardo",
      bodyHtml: renderLegacyAssetOnly(snapshot, origin),
    });

  const publicId = snapshot.publicId;
  const theme = experience.theme;

  switch (experience.type) {
    case "redirect":
      return "";
    case "links":
    case "profile":
    case "linkpage": {
      const customHtml = renderCustomHtmlExperiencePage(
        experience,
        publicId,
        channel,
        origin,
      );
      if (customHtml) return customHtml;
      if (experience.design)
        return renderDesignedExperiencePage({
          experience,
          snapshot,
          origin,
          channel,
        });
      if (experience.type === "links")
        return page({
          title: experience.title,
          bodyHtml: renderLinks(experience, publicId, channel),
          theme,
          publicId,
        });
      if (experience.type === "profile")
        return page({
          title: experience.displayName,
          bodyHtml: renderProfile(experience, publicId, channel, origin),
          theme,
          publicId,
        });
      return page({
        title: experience.displayName,
        bodyHtml: renderLinkPage(experience, publicId, channel, origin),
        theme,
        publicId,
      });
    }
    case "image":
      if (experience.design)
        return renderDesignedExperiencePage({
          experience,
          snapshot,
          origin,
          channel,
        });
      return page({
        title: experience.alt,
        bodyHtml: renderImage(experience, snapshot, origin),
        theme,
        publicId,
      });
    case "document":
      if (experience.design)
        return renderDesignedExperiencePage({
          experience,
          snapshot,
          origin,
          channel,
        });
      // A Documento PDF viewer without a design of its own shows only its
      // pages, full width (the same default the Estudio starts from).
      if (experience.display === "viewer" && experience.pages?.length)
        return renderDesignedExperiencePage({
          experience: { ...experience, design: documentViewerDesign() },
          snapshot,
          origin,
          channel,
        });
      return page({
        title: experience.title,
        bodyHtml: renderDocument(experience, snapshot, origin),
        theme,
        publicId,
      });
    case "menu":
      if (experience.design)
        return renderDesignedExperiencePage({
          experience,
          snapshot,
          origin,
          channel,
          ...(input.itemAvailability !== undefined
            ? { itemAvailability: input.itemAvailability }
            : {}),
        });
      return page({
        title: experience.title,
        bodyHtml: renderMenu(
          applyItemAvailability(experience, input.itemAvailability ?? {}),
          publicId,
          origin,
        ),
        theme,
        publicId,
      });
    case "catalog":
      if (experience.design)
        return renderDesignedExperiencePage({
          experience,
          snapshot,
          origin,
          channel,
          ...(input.itemAvailability !== undefined
            ? { itemAvailability: input.itemAvailability }
            : {}),
        });
      return page({
        title: experience.title,
        bodyHtml: renderCatalog(
          applyItemAvailability(experience, input.itemAvailability ?? {}),
          publicId,
          channel,
          origin,
        ),
        theme,
        publicId,
      });
    case "form":
      if (experience.design)
        return renderDesignedExperiencePage({
          experience,
          snapshot,
          origin,
          channel,
          ...(input.turnstileSiteKey !== undefined
            ? { turnstileSiteKey: input.turnstileSiteKey }
            : {}),
        });
      return page({
        title: experience.title,
        bodyHtml: renderForm(
          experience,
          publicId,
          channel,
          input.turnstileSiteKey,
        ),
        theme,
        publicId,
      });
  }
}

function renderLinksList(
  links: { id: string; label: string; url: string }[],
  publicId: string,
  channel: string,
): string {
  return links
    .map(
      (link) =>
        `<li><a class="link-button" href="${escapeHtml(trackedHref(publicId, link.id, channel))}">${escapeHtml(link.label)}</a></li>`,
    )
    .join("");
}

function renderLinks(
  experience: Extract<ExperiencePayload, { type: "links" }>,
  publicId: string,
  channel: string,
): string {
  return `<div class="card">
<h1>${escapeHtml(experience.title)}</h1>
${experience.description ? `<p class="description">${escapeHtml(experience.description)}</p>` : ""}
<ul class="links">${renderLinksList(experience.links, publicId, channel)}</ul>
</div>`;
}

function renderProfile(
  experience: Extract<ExperiencePayload, { type: "profile" }>,
  publicId: string,
  channel: string,
  origin: string,
): string {
  const avatar = experience.avatarSha256
    ? `<img class="avatar" src="${escapeHtml(assetHref(origin, publicId, experience.avatarSha256))}" alt="${escapeHtml(experience.displayName)}">`
    : "";
  const links = experience.links.length
    ? `<ul class="links">${renderLinksList(experience.links, publicId, channel)}</ul>`
    : "";
  return `<div class="card">
${avatar}
<h1>${escapeHtml(experience.displayName)}</h1>
${experience.headline ? `<p class="headline">${escapeHtml(experience.headline)}</p>` : ""}
${experience.biography ? `<p class="bio">${escapeHtml(experience.biography)}</p>` : ""}
${links}
</div>`;
}

/** First letter of up to the first two words of a display name, uppercased —
 * used as the avatar placeholder when no avatar image was published. Applied
 * to already length-bounded, validated text and always HTML-escaped by the
 * caller before being embedded, so no further sanitizing is needed here. */
function initials(displayName: string): string {
  const letters = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return (letters || displayName.slice(0, 1)).toUpperCase();
}

function renderLinkPage(
  experience: Extract<ExperiencePayload, { type: "linkpage" }>,
  publicId: string,
  channel: string,
  origin: string,
): string {
  const avatar = experience.avatarSha256
    ? `<img class="avatar" src="${escapeHtml(assetHref(origin, publicId, experience.avatarSha256))}" alt="${escapeHtml(experience.displayName)}">`
    : `<div class="avatar avatar-initials" aria-hidden="true">${escapeHtml(initials(experience.displayName))}</div>`;
  const bio = experience.bio
    ? `<p class="bio">${escapeHtml(experience.bio)}</p>`
    : "";
  const socials = experience.socials.length
    ? `<ul class="socials linkpage-animate" aria-label="Redes sociales">${experience.socials
        .map((social) => {
          // Only an https destination is safe to open directly in a new
          // tab; email/phone resolve to mailto:/tel: at the go route, which
          // should navigate the current tab instead of leaving a blank one.
          const opensNewTab =
            social.network !== "email" && social.network !== "phone";
          return `<li><a class="social-icon" href="${escapeHtml(trackedHref(publicId, social.id, channel))}" aria-label="${escapeHtml(socialLabel(social.network))}"${opensNewTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${socialIcon(social.network)}</a></li>`;
        })
        .join("")}</ul>`
    : "";
  const links = experience.links.length
    ? `<ul class="links linkpage-animate">${experience.links
        .map(
          (link) =>
            `<li><a class="link-button${link.highlight ? " link-button--highlight" : ""}" href="${escapeHtml(trackedHref(publicId, link.id, channel))}">${escapeHtml(link.label)}</a></li>`,
        )
        .join("")}</ul>`
    : "";
  return `<div class="card linkpage-card">
${avatar}
<h1>${escapeHtml(experience.displayName)}</h1>
${bio}
${socials}
${links}
</div>`;
}

function renderImage(
  experience: Extract<ExperiencePayload, { type: "image" }>,
  snapshot: PublishedSnapshot,
  origin: string,
): string {
  const ref = snapshot.assets?.[0] ?? snapshot.asset;
  if (!ref)
    return `<div class="card notice"><p>${escapeHtml(experience.alt)}</p></div>`;
  return `<div class="card">
<img class="hero-image" src="${escapeHtml(assetHref(origin, snapshot.publicId, ref.sha256))}" alt="${escapeHtml(experience.alt)}">
</div>`;
}

/** The PDF file a document can download, when it has one: a viewer may be
 * published with only its page images (e.g. a PDF rejected for active
 * content), and then neither the legacy `asset` nor `assets[0]` is a PDF. */
function documentFile(snapshot: PublishedSnapshot): AssetRef | undefined {
  const candidate = snapshot.asset ?? snapshot.assets?.[0];
  return candidate?.mediaType === "application/pdf" ? candidate : undefined;
}

function renderDocument(
  experience: Extract<ExperiencePayload, { type: "document" }>,
  snapshot: PublishedSnapshot,
  origin: string,
): string {
  const ref = documentFile(snapshot);
  const title = experience.title;
  // Visor de PDF (addendum 3), without a page design: every page drawn as an
  // image, one below the other, and the download button only if allowed —
  // Chrome for Android does not show an embedded PDF, so this never uses a
  // browser viewer or any script.
  if (
    experience.display === "viewer" &&
    experience.pages &&
    experience.pages.length > 0
  ) {
    const pagesHtml = experience.pages
      .map(
        (docPage, index) =>
          `<img class="doc-page" src="${escapeHtml(assetHref(origin, snapshot.publicId, docPage.sha256))}" width="${docPage.width}" height="${docPage.height}" loading="lazy" alt="Página ${index + 1} de ${escapeHtml(title)}">`,
      )
      .join("");
    const download =
      experience.allowDownload && ref
        ? `<a class="link-button" href="${escapeHtml(assetHref(origin, snapshot.publicId, ref.sha256))}">Descargar PDF</a>`
        : "";
    return `<div class="card">
<h1>${escapeHtml(title)}</h1>
${experience.description ? `<p class="description">${escapeHtml(experience.description)}</p>` : ""}
<div class="doc-pages">${pagesHtml}</div>
${download}
</div>`;
  }
  const href = ref ? assetHref(origin, snapshot.publicId, ref.sha256) : "#";
  return `<div class="card">
<div class="doc-icon" aria-hidden="true">PDF</div>
<h1>${escapeHtml(title)}</h1>
${experience.description ? `<p class="description">${escapeHtml(experience.description)}</p>` : ""}
<a class="link-button" href="${escapeHtml(href)}">Descargar PDF</a>
</div>`;
}

const noItemsAvailableHtml =
  '<p class="description">Por ahora no hay artículos disponibles.</p>';

/** Shared by menu and catalog rendering: sold-out/low-stock badges, stacked
 * in `.menu-meta`/right under the name, in this fixed order (price-adjacent
 * badge state first). */
function availabilityBadgeHtml(availability?: {
  soldOut: boolean;
  remaining: number | null;
}): string {
  if (!availability) return "";
  if (availability.soldOut)
    return '<span class="badge badge-sold-out">Agotado</span>';
  if (availability.remaining !== null) {
    const label =
      availability.remaining === 1
        ? "Queda 1"
        : `Quedan ${availability.remaining}`;
    return `<span class="badge badge-low">${escapeHtml(label)}</span>`;
  }
  return "";
}

/** «Elige tu guisado: Mole · Chicharrón (agotado)» (relevo 37, D1). */
function menuChoicesHtml(item: AnnotatedMenuItem): string {
  if (!item.choices || item.choices.length === 0) return "";
  const label = item.choicesLabel?.trim() || "A elegir";
  const choices = item.choices
    .map((choice) =>
      choice.soldOut
        ? `<li class="choice is-sold-out">${escapeHtml(choice.name)} <span class="choice-state">agotado</span></li>`
        : `<li class="choice">${escapeHtml(choice.name)}</li>`,
    )
    .join("");
  return `<div class="choices"><span class="choices-label">${escapeHtml(label)}</span><ul>${choices}</ul></div>`;
}

function renderMenuItem(
  item: AnnotatedMenuItem,
  currency: string,
  publicId: string,
  origin: string,
): string {
  const soldOut = item.availability?.soldOut === true;
  const thumb = item.imageSha256
    ? `<img class="menu-thumb" src="${escapeHtml(assetHref(origin, publicId, item.imageSha256))}" alt="" loading="lazy" width="64" height="64">`
    : "";
  const textInner = `<span class="name">${escapeHtml(item.name)}</span>${
    item.description
      ? `<div class="desc">${escapeHtml(item.description)}</div>`
      : ""
  }${menuChoicesHtml(item)}`;
  const text = item.imageSha256
    ? `<span class="menu-text">${textInner}</span>`
    : `<span>${textInner}</span>`;
  const price =
    item.price !== undefined
      ? `<span class="price">${escapeHtml(formatPrice(item.price, currency))}</span>`
      : "";
  const badge = availabilityBadgeHtml(item.availability);
  const meta =
    price || badge ? `<span class="menu-meta">${price}${badge}</span>` : "";
  const classes = `menu-item${soldOut ? " is-sold-out" : ""}`;
  return `<li class="${classes}">${thumb}${text}${meta}</li>`;
}

function renderMenuDescriptionHtml(description: string | undefined): string {
  if (!description) return "";
  const trimmed = description.trim();
  if (trimmed.startsWith("🔥")) {
    const cleanText = trimmed.replace(/^🔥\s*/, "").trim();
    return `<div class="promo-banner" role="status"><span class="promo-badge">🔥 PROMOCIÓN EN VIVO</span><div class="promo-title">${escapeHtml(cleanText)}</div></div>`;
  }
  return `<p class="description">${escapeHtml(description)}</p>`;
}

function renderMenu(
  data: MenuRenderData,
  publicId: string,
  origin: string,
): string {
  const sections = data.sections.length
    ? data.sections
        .map((section) => {
          const items = section.items
            .map((item) =>
              renderMenuItem(item, data.currency, publicId, origin),
            )
            .join("");
          return `<div class="menu-section"><h2>${escapeHtml(section.name)}</h2><ul class="menu-items">${items}</ul></div>`;
        })
        .join("")
    : noItemsAvailableHtml;
  return `<div class="card">
<h1>${escapeHtml(data.title)}</h1>
${renderMenuDescriptionHtml(data.description)}
${sections}
</div>`;
}

function renderCatalogCard(
  item: AnnotatedCatalogItem,
  currency: string,
  publicId: string,
  channel: string,
  origin: string,
): string {
  const soldOut = item.availability?.soldOut === true;
  const image = item.imageSha256
    ? `<img src="${escapeHtml(assetHref(origin, publicId, item.imageSha256))}" alt="${escapeHtml(item.name)}">`
    : "";
  const badge = availabilityBadgeHtml(item.availability);
  const price =
    item.price !== undefined
      ? `<div class="price">${escapeHtml(formatPrice(item.price, currency))}</div>`
      : "";
  const cta = item.url
    ? `<a class="link-button" href="${escapeHtml(trackedHref(publicId, item.id, channel))}">Ver más</a>`
    : "";
  const classes = `catalog-card${soldOut ? " is-sold-out" : ""}`;
  return `<div class="${classes}">${image}<div class="catalog-body"><div class="name">${escapeHtml(item.name)}</div>${badge}${
    item.description
      ? `<div class="desc">${escapeHtml(item.description)}</div>`
      : ""
  }${price}${cta}</div></div>`;
}

function renderCatalog(
  data: CatalogRenderData,
  publicId: string,
  channel: string,
  origin: string,
): string {
  const body = data.items.length
    ? `<div class="catalog-grid">${data.items
        .map((item) =>
          renderCatalogCard(item, data.currency, publicId, channel, origin),
        )
        .join("")}</div>`
    : noItemsAvailableHtml;
  return `<div class="card">
<h1>${escapeHtml(data.title)}</h1>
${data.description ? `<p class="description">${escapeHtml(data.description)}</p>` : ""}
${body}
</div>`;
}

function renderForm(
  experience: Extract<ExperiencePayload, { type: "form" }>,
  publicId: string,
  channel: string,
  turnstileSiteKey?: string,
): string {
  const action = `/t/${encodeURIComponent(publicId)}/leads?src=${encodeURIComponent(channel)}`;
  const optionalField = (
    setting: "hidden" | "optional" | "required",
    label: string,
    field: string,
    tag: "input" | "textarea",
    type?: string,
  ): string => {
    if (setting === "hidden") return "";
    const required = setting === "required" ? " required" : "";
    const suffix = setting === "required" ? "" : " (opcional)";
    const control =
      tag === "textarea"
        ? `<textarea name="${field}" maxlength="2000"${required}></textarea>`
        : `<input type="${type}" name="${field}" maxlength="${type === "tel" ? 40 : 120}"${required}>`;
    return `<label>${escapeHtml(label)}${suffix}${control}</label>`;
  };
  return `<div class="card">
<h1>${escapeHtml(experience.title)}</h1>
${experience.description ? `<p class="description">${escapeHtml(experience.description)}</p>` : ""}
<form method="post" action="${escapeHtml(action)}">
<label>Correo electrónico<input type="email" name="email" maxlength="320" required></label>
${optionalField(experience.fields.name, "Nombre", "name", "input", "text")}
${optionalField(experience.fields.phone, "Teléfono", "phone", "input", "tel")}
${optionalField(experience.fields.message, "Mensaje", "message", "textarea")}
<label class="hp" aria-hidden="true">No completar este campo<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
<label class="consent"><input type="checkbox" name="consent" value="yes" required><span>${escapeHtml(experience.consentText)}</span></label>
${experience.privacyNoticeUrl ? `<p class="consent-notice"><a href="${escapeHtml(experience.privacyNoticeUrl)}" target="_blank" rel="noopener noreferrer">Aviso de privacidad</a></p>` : ""}
${turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(turnstileSiteKey)}"></div>` : ""}
<button class="primary" type="submit">${escapeHtml(experience.submitLabel)}</button>
</form>
${turnstileSiteKey ? turnstileScript : ""}
</div>`;
}

function renderLegacyAssetOnly(
  snapshot: PublishedSnapshot,
  origin: string,
): string {
  const asset = snapshot.asset;
  if (!asset)
    return `<div class="card notice"><p>Este Touchpoint de Kardo no está disponible.</p></div>`;
  const href = assetHref(origin, snapshot.publicId, asset.sha256);
  if (isImageMediaType(asset.mediaType))
    return `<div class="card"><img class="hero-image" src="${escapeHtml(href)}" alt="${escapeHtml(asset.title)}"></div>`;
  return `<div class="card"><div class="doc-icon" aria-hidden="true">PDF</div><h1>${escapeHtml(asset.title)}</h1><a class="link-button" href="${escapeHtml(href)}">Descargar PDF</a></div>`;
}
