import { tapResolverUrl } from "../supabase.js";
import { linksBaseLabel, linksBaseUrl } from "./business-address.js";

/*
 * Every public address the panel shows, in one place (domain audit A9-22):
 * a QR's or tag's, which never changes, and a link's.
 */

/**
 * The public ID never changes. The `src` marker only measures the channel of
 * the link; it does not prove how the visit physically happened.
 */
export function touchpointUrls(publicId: string) {
  const direct = `${tapResolverUrl}/t/${encodeURIComponent(publicId)}`;
  return {
    direct,
    nfc: `${direct}?src=nfc`,
    qr: `${direct}?src=qr`,
    /** «Ver página» from the panel: the Resolver does not count it (relevo 36). */
    preview: `${direct}?src=preview`,
  };
}

/**
 * The URL a Link shares: kardo.com.mx/<negocio>/<link> once both addresses
 * exist; before that, the older handle route or `/t/:publicId`.
 */
export function linkPublicUrl(
  link: {
    handle?: string | null | undefined;
    slug?: string | null | undefined;
    publicId: string;
  },
  businessSlug?: string | null | undefined,
): string {
  if (link.slug && businessSlug)
    return `${linksBaseUrl}/${businessSlug}/${link.slug}`;
  if (link.handle) return `${tapResolverUrl}/@${link.handle}`;
  return `${tapResolverUrl}/t/${encodeURIComponent(link.publicId)}`;
}

/** «kardo.com.mx/cafe-nube/menu», without the scheme. */
export function linkAddressLabel(
  businessSlug: string | null | undefined,
  linkSlug: string,
): string {
  return `${linksBaseLabel}${businessSlug ?? "tu-negocio"}/${linkSlug}`;
}
