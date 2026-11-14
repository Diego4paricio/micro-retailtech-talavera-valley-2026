import type { DesignFont } from "@kardo/contracts";
import { safeCssUrl } from "./url-safety.js";

/**
 * Webfonts the Resolver serves itself (all SIL Open Font License), latin
 * subset, weights 400/600/700 as woff2 — see `packages/page-render/fonts/`
 * and `scripts/copy-fonts.mjs`. `null` for the four system stacks: those
 * never need a `@font-face` rule, they always resolve to an OS font.
 */
export type FontFile = { weight: 400 | 600 | 700; file: string };
export type FontFamilyFiles = { family: string; files: FontFile[] };

export const fontFiles: Record<DesignFont, FontFamilyFiles | null> = {
  system: null,
  serif: null,
  rounded: null,
  mono: null,
  geist: {
    family: "Geist",
    files: [
      { weight: 400, file: "geist/Geist-400.woff2" },
      { weight: 600, file: "geist/Geist-600.woff2" },
      { weight: 700, file: "geist/Geist-700.woff2" },
    ],
  },
  "dm-sans": {
    family: "DM Sans",
    files: [
      { weight: 400, file: "dm-sans/DMSans-400.woff2" },
      { weight: 600, file: "dm-sans/DMSans-600.woff2" },
      { weight: 700, file: "dm-sans/DMSans-700.woff2" },
    ],
  },
  poppins: {
    family: "Poppins",
    files: [
      { weight: 400, file: "poppins/Poppins-400.woff2" },
      { weight: 600, file: "poppins/Poppins-600.woff2" },
      { weight: 700, file: "poppins/Poppins-700.woff2" },
    ],
  },
  playfair: {
    family: "Playfair Display",
    files: [
      { weight: 400, file: "playfair-display/PlayfairDisplay-400.woff2" },
      { weight: 600, file: "playfair-display/PlayfairDisplay-600.woff2" },
      { weight: 700, file: "playfair-display/PlayfairDisplay-700.woff2" },
    ],
  },
  lora: {
    family: "Lora",
    files: [
      { weight: 400, file: "lora/Lora-400.woff2" },
      { weight: 600, file: "lora/Lora-600.woff2" },
      { weight: 700, file: "lora/Lora-700.woff2" },
    ],
  },
  "space-grotesk": {
    family: "Space Grotesk",
    files: [
      { weight: 400, file: "space-grotesk/SpaceGrotesk-400.woff2" },
      { weight: 600, file: "space-grotesk/SpaceGrotesk-600.woff2" },
      { weight: 700, file: "space-grotesk/SpaceGrotesk-700.woff2" },
    ],
  },
  cormorant: {
    family: "Cormorant Garamond",
    files: [
      { weight: 400, file: "cormorant-garamond/CormorantGaramond-400.woff2" },
      { weight: 600, file: "cormorant-garamond/CormorantGaramond-600.woff2" },
      { weight: 700, file: "cormorant-garamond/CormorantGaramond-700.woff2" },
    ],
  },
  /** Fontsource publishes only a 400 weight for DM Serif Display: 600 and
   * 700 point at the same file, so the browser never synthesizes a fake
   * bold (see `scripts/download-fonts.mjs`). */
  "dm-serif": {
    family: "DM Serif Display",
    files: [
      { weight: 400, file: "dm-serif-display/DMSerifDisplay-400.woff2" },
      { weight: 600, file: "dm-serif-display/DMSerifDisplay-600.woff2" },
      { weight: 700, file: "dm-serif-display/DMSerifDisplay-700.woff2" },
    ],
  },
  outfit: {
    family: "Outfit",
    files: [
      { weight: 400, file: "outfit/Outfit-400.woff2" },
      { weight: 600, file: "outfit/Outfit-600.woff2" },
      { weight: 700, file: "outfit/Outfit-700.woff2" },
    ],
  },
  manrope: {
    family: "Manrope",
    files: [
      { weight: 400, file: "manrope/Manrope-400.woff2" },
      { weight: 600, file: "manrope/Manrope-600.woff2" },
      { weight: 700, file: "manrope/Manrope-700.woff2" },
    ],
  },
  montserrat: {
    family: "Montserrat",
    files: [
      { weight: 400, file: "montserrat/Montserrat-400.woff2" },
      { weight: 600, file: "montserrat/Montserrat-600.woff2" },
      { weight: 700, file: "montserrat/Montserrat-700.woff2" },
    ],
  },
  bricolage: {
    family: "Bricolage Grotesque",
    files: [
      {
        weight: 400,
        file: "bricolage-grotesque/BricolageGrotesque-400.woff2",
      },
      {
        weight: 600,
        file: "bricolage-grotesque/BricolageGrotesque-600.woff2",
      },
      {
        weight: 700,
        file: "bricolage-grotesque/BricolageGrotesque-700.woff2",
      },
    ],
  },
  /** Fontsource publishes only a 400 weight for Bebas Neue: 600 and 700
   * point at the same file (see `scripts/download-fonts.mjs`). */
  bebas: {
    family: "Bebas Neue",
    files: [
      { weight: 400, file: "bebas-neue/BebasNeue-400.woff2" },
      { weight: 600, file: "bebas-neue/BebasNeue-600.woff2" },
      { weight: 700, file: "bebas-neue/BebasNeue-700.woff2" },
    ],
  },
  oswald: {
    family: "Oswald",
    files: [
      { weight: 400, file: "oswald/Oswald-400.woff2" },
      { weight: 600, file: "oswald/Oswald-600.woff2" },
      { weight: 700, file: "oswald/Oswald-700.woff2" },
    ],
  },
  caveat: {
    family: "Caveat",
    files: [
      { weight: 400, file: "caveat/Caveat-400.woff2" },
      { weight: 600, file: "caveat/Caveat-600.woff2" },
      { weight: 700, file: "caveat/Caveat-700.woff2" },
    ],
  },
};

/** Full `font-family` CSS value (family + generic fallback stack) for a
 * design font, a closed lookup — never built from a free string. */
const fontStacks: Record<DesignFont, string> = {
  system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  serif: 'Georgia,"Times New Roman",serif',
  rounded: 'ui-rounded,"SF Pro Rounded",system-ui,-apple-system,sans-serif',
  mono: 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace',
  geist: '"Geist",system-ui,-apple-system,sans-serif',
  "dm-sans": '"DM Sans",system-ui,-apple-system,sans-serif',
  poppins: '"Poppins",system-ui,-apple-system,sans-serif',
  playfair: '"Playfair Display",Georgia,serif',
  lora: '"Lora",Georgia,serif',
  "space-grotesk": '"Space Grotesk",system-ui,-apple-system,sans-serif',
  cormorant: '"Cormorant Garamond",Georgia,serif',
  "dm-serif": '"DM Serif Display",Georgia,serif',
  outfit: '"Outfit",system-ui,-apple-system,sans-serif',
  manrope: '"Manrope",system-ui,-apple-system,sans-serif',
  montserrat: '"Montserrat",system-ui,-apple-system,sans-serif',
  bricolage: '"Bricolage Grotesque",system-ui,-apple-system,sans-serif',
  bebas: '"Bebas Neue",Impact,sans-serif',
  oswald: '"Oswald",Impact,sans-serif',
  caveat: '"Caveat",cursive',
};

export function fontFamilyStack(font: DesignFont): string {
  return fontStacks[font] ?? fontStacks.system;
}

/**
 * `@font-face` rules for exactly the fonts this design uses (never the whole
 * catalog), each weight served from `fontBaseUrl` + the file's fixed,
 * package-relative path — never a caller-controlled path. `fontBaseUrl`
 * always comes from the caller (a fixed Resolver/panel constant, never
 * request-derived text), but the resulting `url(...)` still goes through
 * `safeCssUrl` as defense in depth: a weight is simply skipped (falling back
 * to the font's generic stack) rather than ever risk breaking out of the
 * generated stylesheet.
 */
export function fontFaceCss(
  fonts: readonly DesignFont[],
  fontBaseUrl: string,
): string {
  const base = fontBaseUrl.endsWith("/") ? fontBaseUrl : `${fontBaseUrl}/`;
  const seen = new Set<DesignFont>();
  const rules: string[] = [];
  for (const font of fonts) {
    if (seen.has(font)) continue;
    seen.add(font);
    const spec = fontFiles[font];
    if (!spec) continue;
    for (const { weight, file } of spec.files) {
      const src = safeCssUrl(`${base}${file}`);
      if (!src) continue;
      rules.push(
        `@font-face{font-family:"${spec.family}";src:${src} format("woff2");font-weight:${weight};font-style:normal;font-display:swap;}`,
      );
    }
  }
  return rules.join("\n");
}
