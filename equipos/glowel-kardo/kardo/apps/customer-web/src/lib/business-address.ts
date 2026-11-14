import { tapResolverUrl } from "../supabase.js";

/**
 * Where Links live: kardo.com.mx/<negocio>/<link> in production (owner,
 * 2026-10-04), set there with `VITE_LINKS_BASE_URL`. The same Resolver
 * Worker serves them on any of its hosts, so without it (development) the
 * links use the Resolver's own address, the one the QR codes use, and open
 * for real (owner, 2026-10-04: «en dev, los workers actuales»).
 */
export const linksBaseUrl = (
  import.meta.env.VITE_LINKS_BASE_URL || tapResolverUrl
).replace(/\/+$/, "");

/** «kardo.com.mx/» as people read it: without the scheme. */
export const linksBaseLabel = `${linksBaseUrl.replace(/^https?:\/\//, "")}/`;

/** «kardo.com.mx/cafe-nube». */
export function businessAddressLabel(slug: string): string {
  return `${linksBaseLabel}${slug}`;
}

/**
 * What the owner types, shaped as an address while typing: lowercase, no
 * accents, spaces as hyphens, nothing else. A trailing hyphen is kept (the
 * owner may still be typing the next word); the format check flags it.
 */
export function typedBusinessAddress(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 30);
}

/** An address changes at most once every 7 days (the first change after
 * choosing it is free). */
export const addressChangeDays = 7;

/**
 * When the address can change again, from its last change: null when it
 * can change now (or never changed).
 */
export function nextAddressChange(
  changedAt: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!changedAt) return null;
  const next = new Date(
    new Date(changedAt).getTime() + addressChangeDays * 24 * 60 * 60 * 1000,
  );
  return next.getTime() > now.getTime() ? next : null;
}

/** «11 de octubre». */
export function dayAndMonth(date: Date): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
  }).format(date);
}
