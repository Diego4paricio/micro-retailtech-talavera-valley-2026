/**
 * Official-logo registry for `brandButton` blocks and `contentSocials`'
 * "brand" look (ADR 018 addendum, 2026-09-29 — "botones de marca").
 *
 * Every glyph `path` below is copied verbatim (single `<path d="...">`,
 * `viewBox="0 0 24 24"`) from Simple Icons 16.33.0
 * (https://simpleicons.org, CC0-1.0 — https://creativecommons.org/publicdomain/zero/1.0/).
 * Simple Icons is a monochrome-icon set: it does not distribute Meta's,
 * Google's, TikTok's, etc. full-color artwork, only a single-path glyph
 * traced from each brand's own logo. Kardo customers never upload these
 * marks; the button only ever links to the customer's own account on that
 * network or app and never implies sponsorship by the brand.
 *
 * Every brand name, logo and color below belongs to its respective owner
 * (Meta, Google/YouTube, ByteDance/TikTok, X Corp, Pinterest, Telegram,
 * Spotify, Waze, Uber, Mercado Libre, Tripadvisor, Booking Holdings,
 * Calendly). Nothing here is an endorsement.
 *
 * `guidelineUrl` is the official brand/press page this file's author opened
 * to confirm each `color`. Most of those pages name the color ("Facebook
 * Blue", "Spotify Green"...) but do not publish its hex value as page text
 * — the exact hex normally ships only inside a downloadable logo pack, which
 * a text fetch cannot read. Where that happened (marked `// color: Simple
 * Icons (not confirmed on the official page)` below), the hex is Simple
 * Icons' own curated value instead, which its maintainers source from the
 * same official kits. See this package's `brands.ts` test file and the
 * owning agent's handoff report for the full per-brand source list.
 */

import {
  type DesignBlock,
  type DesignBrand,
  designBrands,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";

type BrandEntry = {
  /** Display name shown next to the logo. */
  label: string;
  /** The brand's official color (`#rrggbb`). See the file header: not every
   * one of these is confirmed against a literal hex on the official page. */
  color: string;
  /** Simple Icons 16.33.0 glyph path, `viewBox="0 0 24 24"`. */
  path: string;
  /** The glyph's color when drawn on `brandBackground` — normally
   * `#FFFFFF`/`#000000` per the brand's own guideline; Spotify is the one
   * exception (its guideline shows the green glyph on a black tile). */
  glyphOnBrand: string;
  /** Background for the "brand" look. Equal to `color` except for the
   * brands whose guideline only allows a black-and-white mark: TikTok, X and
   * Threads (color already is black) and Spotify (whose black tile keeps
   * its green glyph rather than turning white/black). */
  brandBackground: string;
  /** Official brand/press page opened to confirm `color`. */
  guidelineUrl: string;
};

const white = "#FFFFFF";

const registry: Record<DesignBrand, BrandEntry> = {
  whatsapp: {
    label: "WhatsApp",
    // color: Simple Icons (not confirmed on the official page) — Meta's
    // WhatsApp brand page names "WhatsApp Green" but its text has no hex;
    // the value lives in the downloadable logo pack.
    color: "#25D366",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
    glyphOnBrand: white,
    brandBackground: "#25D366",
    guidelineUrl:
      "https://www.meta.com/brand/resources/whatsapp/whatsapp-brand/",
  },
  instagram: {
    label: "Instagram",
    // color: Simple Icons (not confirmed on the official page) — Meta's
    // Instagram brand page names no single primary color for the (owner-
    // mandated) solid, non-gradient logo variant.
    color: "#FF0069",
    path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
    glyphOnBrand: white,
    brandBackground: "#FF0069",
    guidelineUrl:
      "https://www.meta.com/brand/resources/instagram/instagram-brand/",
  },
  facebook: {
    label: "Facebook",
    // color: Simple Icons (not confirmed on the official page) — Meta's
    // Facebook logo page names "Facebook Blue" but publishes no literal hex
    // as page text.
    color: "#0866FF",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
    glyphOnBrand: white,
    brandBackground: "#0866FF",
    guidelineUrl: "https://www.meta.com/brand/resources/facebook/logo/",
  },
  messenger: {
    label: "Messenger",
    // color: Simple Icons (not confirmed on the official page) — Meta's
    // Messenger page states "the primary version of the icon is in Facebook
    // Blue" (matching this hex) but, again, without literal hex text.
    color: "#0866FF",
    path: "M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.008a.7.7 0 0 1 .364-.13",
    glyphOnBrand: white,
    brandBackground: "#0866FF",
    guidelineUrl:
      "https://www.meta.com/brand/resources/facebook/messenger-icon/",
  },
  tiktok: {
    label: "TikTok",
    // color: Simple Icons (not confirmed on the official page) — TikTok's
    // "/about/branding" page returned 404 when fetched; no public brand
    // guideline page with a literal hex was reachable.
    color: "#000000",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
    glyphOnBrand: white,
    brandBackground: "#000000",
    guidelineUrl: "https://tiktok.com",
  },
  youtube: {
    label: "YouTube",
    // color: Simple Icons (not confirmed on the official page) —
    // brand.youtube renders its logo/colors as images, not page text.
    color: "#FF0000",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    glyphOnBrand: white,
    brandBackground: "#FF0000",
    guidelineUrl: "https://brand.youtube/",
  },
  x: {
    label: "X",
    // color: Simple Icons (not confirmed on the official page) — X's brand
    // toolkit returned HTTP 402 (blocked) on every fetch attempt. Widely and
    // consistently reported elsewhere as pure black, matching this value.
    color: "#000000",
    path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    glyphOnBrand: white,
    brandBackground: "#000000",
    guidelineUrl: "https://about.x.com/en/who-we-are/brand-toolkit",
  },
  threads: {
    label: "Threads",
    // color: Simple Icons (not confirmed on the official page) — Meta's
    // Threads brand page covers clear space/lockup rules only, no hex text.
    color: "#000000",
    path: "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
    glyphOnBrand: white,
    brandBackground: "#000000",
    guidelineUrl: "https://www.meta.com/brand/resources/instagram/threads/",
  },
  pinterest: {
    label: "Pinterest",
    // color: Simple Icons (not confirmed on the official page) — Pinterest's
    // brand-guidelines page names "red"/"Primary red logo" but keeps the hex
    // in its gated asset library, not on the page itself.
    color: "#BD081C",
    path: "M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z",
    glyphOnBrand: white,
    brandBackground: "#BD081C",
    guidelineUrl: "https://business.pinterest.com/en/brand-guidelines",
  },
  telegram: {
    label: "Telegram",
    // color: Simple Icons (not confirmed on the official page) — Telegram
    // has no public formal brand-guidelines page; SI sources this from
    // telegram.org/tour/screenshots, and telegram.org/press (checked here)
    // has no hex either.
    color: "#26A5E4",
    path: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
    glyphOnBrand: white,
    brandBackground: "#26A5E4",
    guidelineUrl: "https://telegram.org/press",
  },
  spotify: {
    label: "Spotify",
    // color: Simple Icons (not confirmed on the official page) —
    // developer.spotify.com names "Spotify Green" as the resting/primary
    // logo color but gives no hex for it in page text (only an unrelated
    // #191414 fallback for album-art backgrounds).
    color: "#1ED760",
    path: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z",
    // Exception (owner + guideline): Spotify's dark/monochrome tile keeps the
    // brand green glyph rather than turning it black or white.
    glyphOnBrand: "#1ED760",
    brandBackground: "#000000",
    guidelineUrl:
      "https://developer.spotify.com/documentation/general/design-and-branding/#using-our-logo",
  },
  waze: {
    label: "Waze",
    // color: Simple Icons (not confirmed on the official page) — Waze has no
    // public brand-guidelines page; SI's only source is waze.com itself.
    color: "#33CCFF",
    path: "M13.218 0C9.915 0 6.835 1.49 4.723 4.148c-1.515 1.913-2.31 4.272-2.31 6.706v1.739c0 .894-.62 1.738-1.862 1.813-.298.025-.547.224-.547.522-.05.82.82 2.31 2.012 3.502.82.844 1.788 1.515 2.832 2.036a3 3 0 0 0 2.955 3.528 2.966 2.966 0 0 0 2.931-2.385h2.509c.323 1.689 2.086 2.856 3.974 2.21 1.64-.546 2.36-2.409 1.763-3.924a12.84 12.84 0 0 0 1.838-1.465 10.73 10.73 0 0 0 3.18-7.65c0-2.882-1.118-5.589-3.155-7.625A10.899 10.899 0 0 0 13.218 0zm0 1.217c2.558 0 4.967.994 6.78 2.807a9.525 9.525 0 0 1 2.807 6.78A9.526 9.526 0 0 1 20 17.585a9.647 9.647 0 0 1-6.78 2.807h-2.46a3.008 3.008 0 0 0-2.93-2.41 3.03 3.03 0 0 0-2.534 1.367v.024a8.945 8.945 0 0 1-2.41-1.788c-.844-.844-1.316-1.614-1.515-2.11a2.858 2.858 0 0 0 1.441-.846 2.959 2.959 0 0 0 .795-2.036v-1.789c0-2.11.696-4.197 2.012-5.861 1.863-2.385 4.62-3.726 7.6-3.726zm-2.41 5.986a1.192 1.192 0 0 0-1.191 1.192 1.192 1.192 0 0 0 1.192 1.193A1.192 1.192 0 0 0 12 8.395a1.192 1.192 0 0 0-1.192-1.192zm7.204 0a1.192 1.192 0 0 0-1.192 1.192 1.192 1.192 0 0 0 1.192 1.193 1.192 1.192 0 0 0 1.192-1.193 1.192 1.192 0 0 0-1.192-1.192zm-7.377 4.769a.596.596 0 0 0-.546.845 4.813 4.813 0 0 0 4.346 2.757 4.77 4.77 0 0 0 4.347-2.757.596.596 0 0 0-.547-.845h-.025a.561.561 0 0 0-.521.348 3.59 3.59 0 0 1-3.254 2.061 3.591 3.591 0 0 1-3.254-2.061.64.64 0 0 0-.546-.348z",
    glyphOnBrand: white,
    brandBackground: "#33CCFF",
    guidelineUrl: "https://www.waze.com",
  },
  ubereats: {
    label: "Uber Eats",
    // color: Simple Icons (not confirmed on the official page) — Uber's
    // brand asset portal (assets.uber.com) requires a login; it couldn't be
    // fetched.
    color: "#06C167",
    path: "M0 2.8645v4.9972c0 1.8834 1.3315 3.1297 3.0835 3.1297a2.9652 2.9652 0 0 0 2.1502-.876v.7425H6.445V2.8645H5.223v4.9339c0 1.2642-.8696 2.1198-1.9954 2.122-1.1386-.0023-1.997-.834-1.997-2.122V2.8645zm7.3625 0v7.9934h1.163v-.7318a2.9915 2.9915 0 0 0 2.1177.876c1.714.048 3.1295-1.3283 3.1295-3.0429s-1.4155-3.091-3.1295-3.0429a2.9674 2.9674 0 0 0-2.107.876V2.8645zm9.8857 2.0561c-1.6752-.0074-3.0369 1.3492-3.0356 3.0245 0 1.7366 1.3732 3.0373 3.1537 3.0373a3.123 3.123 0 0 0 2.5578-1.2438l-.8495-.6177a2.0498 2.0498 0 0 1-1.7083.8585c-.9763.0126-1.8147-.6915-1.971-1.6553h4.818v-.379c0-1.734-1.254-3.0238-2.9638-3.0245zm6.1632.0667a1.5943 1.5943 0 0 0-1.376.7657v-.7186h-1.163v5.8235h1.1741V7.5465c0-.9023.5581-1.4847 1.3268-1.4847h.4949V4.9886c-.1576.0013-.3186-.0009-.4568-.0013zm-6.2034.944a1.844 1.844 0 0 1 1.8337 1.486H15.424a1.844 1.844 0 0 1 1.784-1.486zm-6.6589.0056c1.1223-.0084 2.0365.8992 2.0364 2.0215-.0026 1.1203-.914 2.0258-2.0343 2.021a2.0151 2.0151 0 0 1-1.4159-.5987A2.0152 2.0152 0 0 1 8.55 7.9592a2.0152 2.0152 0 0 1 .5838-1.422 2.0152 2.0152 0 0 1 1.4153-.6003zM0 12.9864v7.9716h5.7222v-1.3666H1.5458v-1.971h4.0647v-1.314H1.5458v-1.9556h4.1764v-1.3644zm14.5608.4097v1.6861h-1.1519v1.338h1.1545v3.143c0 .7927.5712 1.4209 1.6005 1.4209h1.6425L17.8 19.646h-1.1412c-.3482 0-.5714-.1509-.5714-.464v-2.7683H17.8v-1.3316h-1.7062v-1.686zm-5.2974 1.5275c-1.7348-.0103-3.141 1.4035-3.1214 3.1382.0196 1.7346 1.4575 3.1163 3.1915 3.0668a2.9915 2.9915 0 0 0 1.912-.6655v.532h1.5175v-5.9129h-1.509v.5257a3.0047 3.0047 0 0 0-1.9205-.6835c-.0244-.0007-.0492-.0006-.0701-.0008zm11.771.0077c-1.5855 0-2.7002.6437-2.7002 1.8854 0 .8607.6132 1.4213 1.936 1.695l1.4478.3286c.5694.1095.7224.2585.7224.4906 0 .3701-.438.6022-1.1279.6022-.876 0-1.3774-.1907-1.5723-.8477h-1.533c.219 1.2307 1.1563 2.05 3.0484 2.05h.0022c1.752 0 2.7422-.819 2.7422-1.9534 0-.8059-.5847-1.4084-1.8089-1.6668l-1.2943-.2605c-.7511-.1358-.988-.2738-.988-.5454 0-.357.3616-.5757 1.0295-.5757.7227 0 1.2527.1925 1.406.8473h1.5175c-.0854-1.2286-.9899-2.0497-2.8273-2.0497zM9.467 16.1815c1.0092.0096 1.8188.8369 1.8067 1.8461.0014 1.0046-.8198 1.816-1.8243 1.8025-1.0075-.0048-1.8203-.8256-1.8155-1.833.0048-1.0076.8255-1.8204 1.833-1.8156z",
    glyphOnBrand: white,
    brandBackground: "#06C167",
    guidelineUrl: "https://assets.uber.com/d/k4nuxdZ8MC7E/logos/collection/150",
  },
  mercadopago: {
    label: "Mercado Pago",
    // color: Simple Icons (not confirmed on the official page) — both
    // mercadopago.com.ar/mp/logo-oficial and mercadopago.com/ayuda/nuestra-marca
    // returned HTTP 403 (blocked) on every fetch attempt. This is the
    // long-standing light-blue "coin" mark's hex, not Mercado Libre's
    // separate 2025 rebrand yellow.
    color: "#00B1EA",
    path: "M11.115 16.479a.93.927 0 0 1-.939-.886c-.002-.042-.006-.155-.103-.155-.04 0-.074.023-.113.059-.112.103-.254.206-.46.206a.816.814 0 0 1-.305-.066c-.535-.214-.542-.578-.521-.725.006-.038.007-.08-.02-.11l-.032-.03h-.034c-.027 0-.055.012-.093.039a.788.786 0 0 1-.454.16.7.699 0 0 1-.253-.05c-.708-.27-.65-.928-.617-1.126.005-.041-.005-.072-.03-.092l-.05-.04-.047.043a.728.726 0 0 1-.505.203.73.728 0 0 1-.732-.725c0-.4.328-.722.732-.722.364 0 .675.27.721.63l.026.195.11-.165c.01-.018.307-.46.852-.46.102 0 .21.016.316.05.434.13.508.52.519.68.008.094.075.1.09.1.037 0 .064-.024.083-.045a.746.744 0 0 1 .54-.225c.128 0 .263.03.402.09.69.293.379 1.158.374 1.167-.058.144-.061.207-.005.244l.027.013h.02c.03 0 .07-.014.134-.035.093-.032.235-.08.367-.08a.944.942 0 0 1 .94.93.936.934 0 0 1-.94.928zm7.302-4.171c-1.138-.98-3.768-3.24-4.481-3.77-.406-.302-.685-.462-.928-.533a1.559 1.554 0 0 0-.456-.07c-.182 0-.376.032-.58.095-.46.145-.918.505-1.362.854l-.023.018c-.414.324-.84.66-1.164.73a1.986 1.98 0 0 1-.43.049c-.362 0-.687-.104-.81-.258-.02-.025-.007-.066.04-.125l.008-.008 1-1.067c.783-.774 1.525-1.506 3.23-1.545h.085c1.062 0 2.12.469 2.24.524a7.03 7.03 0 0 0 3.056.724c1.076 0 2.188-.263 3.354-.795a9.135 9.11 0 0 0-.405-.317c-1.025.44-2.003.66-2.946.66-.962 0-1.925-.229-2.858-.68-.05-.022-1.22-.567-2.44-.57-.032 0-.065 0-.096.002-1.434.033-2.24.536-2.782.976-.528.013-.982.138-1.388.25-.361.1-.673.186-.979.185-.125 0-.35-.01-.37-.012-.35-.01-2.115-.437-3.518-.962-.143.1-.28.203-.415.31 1.466.593 3.25 1.053 3.812 1.089.157.01.323.027.491.027.372 0 .744-.103 1.104-.203.213-.059.446-.123.692-.17l-.196.194-1.017 1.087c-.08.08-.254.294-.14.557a.705.703 0 0 0 .268.292c.243.162.677.27 1.08.271.152 0 .297-.015.43-.044.427-.095.874-.448 1.349-.82.377-.296.913-.672 1.323-.782a1.494 1.49 0 0 1 .37-.05.611.61 0 0 1 .095.005c.27.034.533.125 1.003.472.835.62 4.531 3.815 4.566 3.846.002.002.238.203.22.537-.007.186-.11.352-.294.466a.902.9 0 0 1-.484.15.804.802 0 0 1-.428-.124c-.014-.01-1.28-1.157-1.746-1.543-.074-.06-.146-.115-.22-.115a.122.122 0 0 0-.096.045c-.073.09.01.212.105.294l1.48 1.47c.002 0 .184.17.204.395.012.244-.106.447-.35.606a.957.955 0 0 1-.526.171.766.764 0 0 1-.42-.127l-.214-.206a21.035 20.978 0 0 0-1.08-1.009c-.072-.058-.148-.112-.221-.112a.127.127 0 0 0-.094.038c-.033.037-.056.103.028.212a.698.696 0 0 0 .075.083l1.078 1.198c.01.01.222.26.024.511l-.038.048a1.18 1.178 0 0 1-.1.096c-.184.15-.43.164-.527.164a.8.798 0 0 1-.147-.012c-.106-.018-.178-.048-.212-.089l-.013-.013c-.06-.06-.602-.609-1.054-.98-.059-.05-.133-.11-.21-.11a.128.128 0 0 0-.096.042c-.09.096.044.24.1.293l.92 1.003a.204.204 0 0 1-.033.062c-.033.044-.144.155-.479.196a.91.907 0 0 1-.122.007c-.345 0-.712-.164-.902-.264a1.343 1.34 0 0 0 .13-.576 1.368 1.365 0 0 0-1.42-1.357c.024-.342-.025-.99-.697-1.274a1.455 1.452 0 0 0-.575-.125c-.146 0-.287.025-.42.075a1.153 1.15 0 0 0-.671-.564 1.52 1.515 0 0 0-.494-.085c-.28 0-.537.08-.767.242a1.168 1.165 0 0 0-.903-.43 1.173 1.17 0 0 0-.82.335c-.287-.217-1.425-.93-4.467-1.613a17.39 17.344 0 0 1-.692-.189 4.822 4.82 0 0 0-.077.494l.67.157c3.108.682 4.136 1.391 4.309 1.525a1.145 1.142 0 0 0-.09.442 1.16 1.158 0 0 0 1.378 1.132c.096.467.406.821.879 1.003a1.165 1.162 0 0 0 .415.08c.09 0 .179-.012.266-.034.086.22.282.493.722.668a1.233 1.23 0 0 0 .457.094c.122 0 .241-.022.355-.063a1.373 1.37 0 0 0 1.269.841c.37.002.726-.147.985-.41.221.121.688.341 1.163.341.06 0 .118-.002.175-.01.47-.059.689-.24.789-.382a.571.57 0 0 0 .048-.078c.11.032.234.058.373.058.255 0 .501-.086.75-.265.244-.174.418-.424.444-.637v-.01c.083.017.167.026.251.026.265 0 .527-.082.773-.242.48-.31.562-.715.554-.98a1.28 1.279 0 0 0 .978-.194 1.04 1.04 0 0 0 .502-.808 1.088 1.085 0 0 0-.16-.653c.804-.342 2.636-1.003 4.795-1.483a4.734 4.721 0 0 0-.067-.492 27.742 27.667 0 0 0-5.049 1.62zm5.123-.763c0 4.027-5.166 7.293-11.537 7.293-6.372 0-11.538-3.266-11.538-7.293 0-4.028 5.165-7.293 11.539-7.293 6.371 0 11.537 3.265 11.537 7.293zm.46.004c0-4.272-5.374-7.755-12-7.755S.002 7.277.002 11.55L0 12.004c0 4.533 4.695 8.203 11.999 8.203 7.347 0 12-3.67 12-8.204z",
    glyphOnBrand: white,
    brandBackground: "#00B1EA",
    guidelineUrl: "https://www.mercadopago.com.ar/mp/logo-oficial",
  },
  tripadvisor: {
    label: "Tripadvisor",
    // color: Simple Icons (not confirmed on the official page) —
    // tripadvisor.mediaroom.com/logo-guidelines names the green owl logo but
    // keeps the hex in a gated asset-library link, not on the page.
    color: "#34E0A1",
    path: "M12.006 4.295c-2.67 0-5.338.784-7.645 2.353H0l1.963 2.135a5.997 5.997 0 0 0 4.04 10.43 5.976 5.976 0 0 0 4.075-1.6L12 19.705l1.922-2.09a5.972 5.972 0 0 0 4.072 1.598 6 6 0 0 0 6-5.998 5.982 5.982 0 0 0-1.957-4.432L24 6.648h-4.35a13.573 13.573 0 0 0-7.644-2.353zM12 6.255c1.531 0 3.063.303 4.504.903C13.943 8.138 12 10.43 12 13.1c0-2.671-1.942-4.962-4.504-5.942A11.72 11.72 0 0 1 12 6.256zM6.002 9.157a4.059 4.059 0 1 1 0 8.118 4.059 4.059 0 0 1 0-8.118zm11.992.002a4.057 4.057 0 1 1 .003 8.115 4.057 4.057 0 0 1-.003-8.115zm-11.992 1.93a2.128 2.128 0 0 0 0 4.256 2.128 2.128 0 0 0 0-4.256zm11.992 0a2.128 2.128 0 0 0 0 4.256 2.128 2.128 0 0 0 0-4.256z",
    glyphOnBrand: white,
    brandBackground: "#34E0A1",
    guidelineUrl: "https://tripadvisor.mediaroom.com/logo-guidelines",
  },
  booking: {
    label: "Booking.com",
    // color: Simple Icons (not confirmed on the official page) —
    // bookingholdings.com/media-room/ mentions a downloadable "Logo and
    // Brand Guidelines" file but the page itself has no hex text.
    color: "#003A9A",
    path: "M24 0H0v24h24ZM8.575 6.563h2.658c2.108 0 3.473 1.15 3.473 2.898 0 1.15-.575 1.82-.91 2.108l-.287.263.335.192c.815.479 1.318 1.389 1.318 2.395 0 1.988-1.51 3.257-3.857 3.257H7.449V7.713c0-.623.503-1.126 1.126-1.15zm1.7 1.868c-.479.024-.694.264-.694.79v1.893h1.676c.958 0 1.294-.743 1.294-1.365 0-.815-.503-1.318-1.318-1.318zm-.096 4.36c-.407.071-.598.31-.598.79v2.251h1.868c.934 0 1.509-.55 1.509-1.533 0-.934-.599-1.509-1.51-1.509zm7.737 2.394c.743 0 1.341.599 1.341 1.342a1.34 1.34 0 0 1-1.341 1.341 1.355 1.355 0 0 1-1.341-1.341c0-.743.598-1.342 1.34-1.342z",
    glyphOnBrand: white,
    brandBackground: "#003A9A",
    guidelineUrl: "https://www.bookingholdings.com/media-room/",
  },
  calendly: {
    label: "Calendly",
    // color: Simple Icons (not confirmed on the official page) —
    // calendly.com/newsroom has no hex text either; Calendly's real
    // wordmark is a blue-to-turquoise gradient, so this is its flat blue.
    color: "#006BFF",
    path: "M19.655 14.262c.281 0 .557.023.828.064 0 .005-.005.01-.005.014-.105.267-.234.534-.381.786l-1.219 2.106c-1.112 1.936-3.177 3.127-5.411 3.127h-2.432c-2.23 0-4.294-1.191-5.412-3.127l-1.218-2.106a6.251 6.251 0 0 1 0-6.252l1.218-2.106C6.736 4.832 8.8 3.641 11.035 3.641h2.432c2.23 0 4.294 1.191 5.411 3.127l1.219 2.106c.147.252.271.519.381.786 0 .004.005.009.005.014-.267.041-.543.064-.828.064-1.816 0-2.501-.607-3.291-1.306-.764-.676-1.711-1.517-3.44-1.517h-1.029c-1.251 0-2.387.455-3.2 1.278-.796.805-1.233 1.904-1.233 3.099v1.411c0 1.196.437 2.295 1.233 3.099.813.823 1.949 1.278 3.2 1.278h1.034c1.729 0 2.676-.841 3.439-1.517.791-.703 1.471-1.306 3.287-1.301Zm.005-3.237c.399 0 .794-.036 1.179-.11-.002-.004-.002-.01-.002-.014-.073-.414-.193-.823-.349-1.218.731-.12 1.407-.396 1.986-.819 0-.004-.005-.013-.005-.018-.331-1.085-.832-2.101-1.489-3.03-.649-.915-1.435-1.719-2.331-2.395-1.867-1.398-4.088-2.138-6.428-2.138-1.448 0-2.855.28-4.175.841-1.273.543-2.423 1.315-3.407 2.299S2.878 6.552 2.341 7.83c-.557 1.324-.842 2.726-.842 4.175 0 1.448.281 2.855.842 4.174.542 1.274 1.314 2.423 2.298 3.407s2.129 1.761 3.407 2.299c1.324.556 2.727.841 4.175.841 2.34 0 4.561-.74 6.428-2.137a10.815 10.815 0 0 0 2.331-2.396c.652-.929 1.158-1.949 1.489-3.03 0-.004.005-.014.005-.018-.579-.423-1.255-.699-1.986-.819.161-.395.276-.804.349-1.218.005-.009.005-.014.005-.023.869.166 1.692.506 2.404 1.035.685.505.552 1.075.446 1.416C22.184 20.437 17.619 24 12.221 24c-6.625 0-12-5.375-12-12s5.37-12 12-12c5.398 0 9.963 3.563 11.471 8.464.106.341.239.915-.446 1.421-.717.529-1.535.873-2.404 1.034.128.716.128 1.45 0 2.166-.387-.074-.782-.11-1.182-.11-4.184 0-3.968 2.823-6.736 2.823h-1.029c-1.899 0-3.15-1.357-3.15-3.095v-1.411c0-1.738 1.251-3.094 3.15-3.094h1.034c2.768 0 2.552 2.823 6.731 2.827Z",
    glyphOnBrand: white,
    brandBackground: "#006BFF",
    guidelineUrl: "https://calendly.com/newsroom",
  },
};

/** The subset also usable by `contentSocials`' "brand" look: networks Kardo
 * already collects as a social link, matched by name to a brand here. */
export const socialBrandNetworks = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "whatsapp",
  "threads",
  "pinterest",
  "spotify",
  "telegram",
] as const;

/** Public shape for the panel: the registry fields it needs to draw a chip
 * and preview a button, without `guidelineUrl` (documentation only, not
 * rendered anywhere). */
export type BrandInfo = {
  label: string;
  color: string;
  path: string;
  glyphOnBrand: string;
  brandBackground: string;
};

export function designBrandInfo(brand: DesignBrand): BrandInfo {
  const { guidelineUrl: _guidelineUrl, ...info } = registry[brand];
  return info;
}

/** All brands, each with its `brand` key, in `designBrands`' (contract)
 * order — ready for the panel's brand-picker grid. */
export const designBrandList: readonly (BrandInfo & { brand: DesignBrand })[] =
  designBrands.map((brand) => ({ brand, ...designBrandInfo(brand) }));

// ---------------------------------------------------------------------------
// Legibility: a real WCAG contrast-ratio pick, not the simpler
// luminance-only shortcut `onAccentColor` (css.ts) uses for the page's own
// accent-colored buttons. Some brand colors sit close enough to the 0.5
// luminance line that the shortcut picks the wrong one — WhatsApp green,
// for instance, has luminance ≈0.48 (just under 0.5, so the shortcut would
// pick white) but white-on-WhatsApp-green is only a 1.98:1 contrast, while
// black-on-it is 9:1. This picks whichever of white/near-black actually
// clears 4.5:1, falling back to the higher-contrast one for the rare brand
// color (pure red) where neither quite reaches it.
// ---------------------------------------------------------------------------

const labelLight = "#FFFFFF";
/** Near-black, not pure black — mirrors the softer dark ink this codebase
 * already favors for on-light text (`onAccentColor`'s own dark pick is a
 * similar near-black, `#16232e`). */
const labelDark = "#0B1A14";

function srgbChannel(byte: number): number {
  const v = byte / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hexColor: string): number {
  const value = Number.parseInt(hexColor.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (
    0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b)
  );
}

function contrastRatio(luminanceA: number, luminanceB: number): number {
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Whether `color` reads at `ratio` on every one of `grounds` (all
 * `#rrggbb`). */
export function readsOn(
  color: string,
  grounds: readonly string[],
  ratio: number,
): boolean {
  const own = relativeLuminance(color);
  return grounds.every(
    (ground) => contrastRatio(own, relativeLuminance(ground)) >= ratio,
  );
}

/** The label color (white or near-black) for the "brand" look, picked for
 * the best real contrast against `background` (a `#rrggbb` brand color). */
export function brandLabelColor(background: string): string {
  const bgLuminance = relativeLuminance(background);
  const lightContrast = contrastRatio(
    relativeLuminance(labelLight),
    bgLuminance,
  );
  const darkContrast = contrastRatio(relativeLuminance(labelDark), bgLuminance);
  return darkContrast > lightContrast ? labelDark : labelLight;
}

/** Brands whose own `color` is black — TikTok, X and Threads. Their
 * "neutral" look can't use `color` as the glyph fill (invisible on a dark
 * surface), so it inherits the page's own text color instead (see
 * `brands.ts`' header and `blocks.ts`' `renderBrandButton`). */
const blackOnlyBrands = new Set<DesignBrand>(["tiktok", "x", "threads"]);

/** Glyph fill for the "neutral" look: the brand's real color, except for
 * the black-only brands, which use `currentColor` (the button already sets
 * `color: var(--kd-text)` for its label, so the glyph reads correctly
 * whether the page is light or dark) — this is the CSS-only stand-in for
 * "black or white by the surface luminance" the block itself can't compute
 * (`RenderContext` carries no palette). */
export function neutralGlyphFill(brand: DesignBrand): string {
  return blackOnlyBrands.has(brand) ? "currentColor" : registry[brand].color;
}

// ---------------------------------------------------------------------------
// CSS. Added to the page stylesheet only when a design actually uses a
// `brandButton` or a brand-look `contentSocials` (see the one-line addition
// in `render.ts`). Sizes/gaps loosely follow `.kd-btn`'s own numbers so a
// brand button reads like a sibling of the plain button block; the corner
// radius can't reach the page's own computed `style.radius`/`buttonShape`
// (this block has no access to `DesignStyle`, only `RenderContext`), so it
// uses a fixed, moderate rounding instead — documented here rather than
// silently guessing.
// ---------------------------------------------------------------------------
export const brandCss = `
.kd-brand{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:14px 18px;border-radius:16px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;border:2px solid transparent;text-align:center}
.kd-brand svg{width:22px;height:22px;flex:none;display:block}
.kd-brand-label{min-width:0;overflow-wrap:break-word}
.kd-brand--neutral{background:var(--kd-surface);border-color:color-mix(in srgb, var(--kd-text) 18%, transparent);color:var(--kd-text)}
.kd-brand--outline{background:transparent;border:1.5px solid var(--kd-text);color:var(--kd-text)}
.kd-brand:focus-visible{outline:3px solid var(--kd-accent);outline-offset:2px}
.kd-ci .kd-brand{padding:calc(14 * var(--u)) calc(18 * var(--u));gap:calc(10 * var(--u));border-radius:calc(16 * var(--u));border-width:calc(2 * var(--u))}
.kd-ci .kd-brand--outline{border-width:calc(1.5 * var(--u))}
.kd-ci .kd-brand svg{width:calc(22 * var(--u));height:calc(22 * var(--u))}
.kd-brand--circle{width:56px;height:56px;padding:0;gap:0;border-radius:50%;flex:none}
.kd-brand--circle svg{width:26px;height:26px}
.kd-brand-row{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;width:100%}
.kd-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.kd-ci .kd-brand--circle{width:100%;height:auto;aspect-ratio:1 / 1;padding:0;border-radius:50%}
.kd-ci .kd-brand--circle svg{width:46%;height:46%}
`;

function blockUsesBrandCss(block: DesignBlock): boolean {
  return (
    block.kind === "brandButton" ||
    (block.kind === "contentSocials" && block.look === "brand")
  );
}

/** Whether `design` renders anything `brandCss` styles — a `brandButton` or
 * a brand-look `contentSocials`, in a flow or a canvas section — so
 * `render.ts` only ever ships that stylesheet to pages that use it. */
export function designUsesBrandCss(design: PageDesign): boolean {
  return design.sections.some((section) => {
    const blocks = isCanvasSection(section)
      ? section.items.map((item) => item.block)
      : section.columns.flat();
    return blocks.some(blockUsesBrandCss);
  });
}
