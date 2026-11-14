import type { DesignFont } from "@kardo/contracts";
import { fontFiles } from "@kardo/page-render";

/**
 * The webfonts `@kardo/page-render` ships (packages/page-render/fonts),
 * bundled by Vite as same-origin assets (the panel CSP allows
 * `font-src 'self'`). The renderer asks for `fontBaseUrl + "<family>/<file>"`;
 * Vite gives every file its own hashed URL, so the preview passes a marker
 * base and swaps each marked path for its real URL.
 */

const urls = import.meta.glob<string>(
  "../../../../../../packages/page-render/fonts/*/*.woff2",
  { query: "?url", import: "default", eager: true },
);

const byFile = new Map(
  Object.entries(urls).map(([path, url]) => [
    path.slice(path.indexOf("/fonts/") + "/fonts/".length),
    url,
  ]),
);

export const fontBaseMarker = "kardo-studio-fonts/";

/** Replaces the marker paths of `@font-face` rules with the bundled URLs. */
export function resolveFontUrls(html: string): string {
  return html.replace(
    /kardo-studio-fonts\/([a-z0-9-]+\/[A-Za-z0-9-]+\.woff2)/g,
    (match, file: string) => byFile.get(file) ?? match,
  );
}

const loaded = new Map<DesignFont, Promise<string | null>>();

/**
 * Loads a design font into the panel itself (for the live samples of the
 * Estilo panel) under a private family name, so it never clashes with the
 * panel's own Geist/DM Sans. Resolves to the family to use, or null.
 */
export function loadPanelFont(font: DesignFont): Promise<string | null> {
  const known = loaded.get(font);
  if (known) return known;
  const spec = fontFiles[font];
  const file = spec?.files.find((item) => item.weight === 600)?.file;
  const url = file ? byFile.get(file) : undefined;
  const promise =
    spec && url && typeof FontFace !== "undefined"
      ? new FontFace(`Kardo Studio ${spec.family}`, `url("${url}")`, {
          weight: "600",
        })
          .load()
          .then((face) => {
            document.fonts.add(face);
            return `Kardo Studio ${spec.family}`;
          })
          .catch(() => null)
      : Promise.resolve(null);
  loaded.set(font, promise);
  return promise;
}
