// ---------------------------------------------------------------------------
// @kardo/page-render — pure TS renderer for a designed page (ADR 018). No
// DOM, no Node/Workers APIs. Used by the Resolver (public pages) and the
// panel (a sandboxed preview iframe of the exact same output).
// ---------------------------------------------------------------------------

export type { KardoOutlines } from "./brand-paths.js";
export {
  KARDO_ICON_WIDTH,
  KARDO_LOGO_HEIGHT,
  KARDO_LOGO_WIDTH,
  kardoBrandColors,
  kardoIconOutlines,
  kardoLogoOutlines,
} from "./brand-paths.js";
// "modo HTML" (ADR 018, extended 2026-09-29) — sanitize/render/validate
// customer-authored HTML+CSS. See packages/page-render/src/custom-html/.
// Official-logo buttons and brand-look socials (ADR 018 addendum,
// 2026-09-29 — "botones de marca"). See brands.ts' header for sources.
export type { BrandInfo } from "./brands.js";
export {
  brandCss,
  brandLabelColor,
  designBrandInfo,
  designBrandList,
  designUsesBrandCss,
} from "./brands.js";
export type { PreparedCustomHtml } from "./custom-html/prepare.js";
export { prepareCustomHtml } from "./custom-html/prepare.js";
export {
  htmlBlockRenderer,
  renderCustomHtmlBody,
  renderCustomHtmlDocument,
} from "./custom-html/render.js";
export type { CssRemoval, SanitizeReport } from "./custom-html/report.js";
export { parsePublishedCustomHtml } from "./custom-html/validate.js";
export { documentViewerDesign } from "./document-viewer.js";
export { featureIconSvg } from "./feature-icons.js";
export type { FontFamilyFiles, FontFile } from "./fonts.js";
export { fontFiles } from "./fonts.js";
export type { FooterTone } from "./footer.js";
export {
  footerCss,
  footerToneForBackground,
  renderKardoFooter,
} from "./footer.js";
export {
  kardoIconSvg,
  kardoLogoDarkSvg,
  kardoLogoMonoSvg,
  kardoLogoSvg,
  socialIcon,
  socialLabel,
} from "./icons.js";
export type { RenderedDesign } from "./render.js";
export { renderDesignedBody } from "./render.js";
export { renderDesignedDocument } from "./shell.js";
export type {
  DesignableContent,
  DesignableExperienceKind,
  DesignableLinkItem,
  RenderContext,
  SocialNetwork,
} from "./types.js";
export { socialNetworks } from "./types.js";
export { parsePublishedDesign } from "./validate.js";
