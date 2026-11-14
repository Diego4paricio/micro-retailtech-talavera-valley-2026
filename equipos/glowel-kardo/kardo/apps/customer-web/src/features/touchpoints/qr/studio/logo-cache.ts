import type { LogoRaster } from "../engine/index.js";

/**
 * Local cache of rasterized logos by library asset id. A logo uploaded from
 * the studio is rasterized in the browser before it is sent, so it keeps
 * working even when the library read endpoint is not available (demo mode,
 * storage outage). Only metadata-free PNG data URLs produced by the engine
 * are stored; anything else read back is ignored.
 */

const storagePrefix = "kardo.qr-logo.v1.";
/** Keeps a single entry well under the ~5 MB localStorage quota. */
const maxCachedHrefLength = 1_500_000;
const memory = new Map<string, LogoRaster>();

export function isLogoRaster(value: unknown): value is LogoRaster {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LogoRaster>;
  return (
    typeof candidate.href === "string" &&
    candidate.href.startsWith("data:image/png;base64,") &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.width > 0 &&
    candidate.height > 0
  );
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedLogo(assetId: string): LogoRaster | null {
  const cached = memory.get(assetId);
  if (cached) return cached;
  try {
    const raw = storage()?.getItem(storagePrefix + assetId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isLogoRaster(parsed)) return null;
    memory.set(assetId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function cacheLogo(assetId: string, raster: LogoRaster): void {
  memory.set(assetId, raster);
  if (raster.href.length > maxCachedHrefLength) return;
  try {
    storage()?.setItem(
      storagePrefix + assetId,
      JSON.stringify({
        href: raster.href,
        width: raster.width,
        height: raster.height,
      }),
    );
  } catch {
    // Quota exceeded or storage blocked: the memory copy still works.
  }
}

/** The PNG data URL of a legacy (v1, browser-only) logo, if it is usable. */
export function legacyLogoHref(value: unknown): string | null {
  if (typeof value === "string")
    return value.startsWith("data:image/png;base64,") ? value : null;
  return isLogoRaster(value) ? value.href : null;
}

/**
 * Turns a PNG data URL into a File ready for the asset upload flow. Decoded
 * by hand: the production CSP does not allow `fetch("data:…")`.
 */
export function dataUrlToFile(href: string, filename: string): File {
  const base64 = href.slice(href.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return new File([bytes], filename, { type: "image/png" });
}
