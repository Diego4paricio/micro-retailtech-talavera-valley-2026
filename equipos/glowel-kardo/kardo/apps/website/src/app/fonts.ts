import localFont from "next/font/local";

// Self-hosted (fontsource): nothing is requested from Google at run or build
// time. Same voices as the panel: Geist for titles and figures, DM Sans for
// reading.
export const geist = localFont({
  src: "../../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const dmSans = localFont({
  src: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

/*
  Faces of the businesses' pages in the hero's phone: the webfonts the
  platform's Estudio offers (packages/page-render/fonts, OFL), copied here.
  Not preloaded: only the hero's pages use them. Lora is the exception: the
  editorial home sets every title in it (the hero's h1 is the largest paint),
  so it is preloaded and its Georgia fallback is sized to match, which keeps
  the title from jumping when the font arrives.
*/
export const playfair = localFont({
  src: [
    { path: "./fonts/PlayfairDisplay-400.woff2", weight: "400" },
    { path: "./fonts/PlayfairDisplay-600.woff2", weight: "600" },
  ],
  variable: "--font-playfair",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "serif"],
});

export const lora = localFont({
  src: [
    { path: "./fonts/Lora-400.woff2", weight: "400" },
    { path: "./fonts/Lora-600.woff2", weight: "600" },
  ],
  variable: "--font-lora",
  display: "swap",
  fallback: ["Georgia", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const spaceGrotesk = localFont({
  src: [
    { path: "./fonts/SpaceGrotesk-400.woff2", weight: "400" },
    { path: "./fonts/SpaceGrotesk-600.woff2", weight: "600" },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

export const poppins = localFont({
  src: [
    { path: "./fonts/Poppins-400.woff2", weight: "400" },
    { path: "./fonts/Poppins-600.woff2", weight: "600" },
  ],
  variable: "--font-poppins",
  display: "swap",
  preload: false,
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});
