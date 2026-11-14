import { newItemId } from "../experiences/content.js";

/**
 * «Tus enlaces» and «Tu tarjeta de presentación» in Primeros pasos: a few
 * known buttons instead of a free list of labels and URLs. Instagram,
 * Facebook and TikTok take the @usuario people know; the address is built
 * here. The business's WhatsApp comes from step 1.
 */
export const quickLinkFields = [
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "@tunegocio",
    base: "https://instagram.com/",
  },
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "tunegocio",
    base: "https://facebook.com/",
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "@tunegocio",
    base: "https://www.tiktok.com/@",
  },
  {
    key: "maps",
    label: "Cómo llegar",
    placeholder: "Tu dirección o un link de Google Maps",
    base: null,
  },
  {
    key: "website",
    label: "Sitio web",
    placeholder: "tunegocio.com",
    base: null,
  },
] as const;

export type QuickLinkKey = (typeof quickLinkFields)[number]["key"];
export type QuickLinks = Partial<Record<QuickLinkKey, string>>;
type LinkItem = { id: string; label: string; url: string };

const mapsSearch = "https://www.google.com/maps/search/?api=1&query=";

/** «Cómo llegar» from a written address (relevo 37, C8): Raúl wrote his
 * street and the button turned off without a word. */
export function mapsSearchUrl(address: string): string {
  return `${mapsSearch}${encodeURIComponent(address.trim().replace(/\s+/g, " "))}`;
}

/** The address of what was typed: a @usuario on a network, or a web
 * address with or without https://. «Cómo llegar» also takes a written
 * address. Null when it cannot be one. */
export function quickLinkUrl(key: QuickLinkKey, value: string): string | null {
  const typed = value.trim();
  if (!typed) return null;
  const field = quickLinkFields.find((item) => item.key === key);
  if (/^https?:\/\//i.test(typed)) return typed.replace(/^http:/i, "https:");
  if (key === "maps") {
    if (/^[\w-]+(\.[\w-]+)+\/\S*$/.test(typed)) return `https://${typed}`;
    return /\p{L}/u.test(typed) && typed.length >= 4
      ? mapsSearchUrl(typed)
      : null;
  }
  if (field?.base) {
    const user = typed
      .replace(/^@/, "")
      .replace(/^(?:www\.)?(?:instagram|facebook|tiktok)\.com\/@?/i, "")
      .replace(/\/+$/, "");
    return /^[\w.-]{1,60}$/.test(user) ? `${field.base}${user}` : null;
  }
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(typed) ? `https://${typed}` : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** What to fix in a field, said while typing (relevo 37, C8b). */
export function quickLinkProblem(
  key: QuickLinkKey,
  value: string,
): string | null {
  if (!value.trim() || quickLinkUrl(key, value)) return null;
  if (key === "maps") return "Escribe tu calle y número, o pega el link.";
  if (key === "website") return "Escribe una dirección como tunegocio.com.";
  return "Escribe solo tu usuario, por ejemplo @tunegocio.";
}

/** The buttons, WhatsApp first, in the order of the fields. */
export function linksFromQuick(
  values: QuickLinks,
  whatsappUrl: string | undefined,
  current: readonly LinkItem[] = [],
): LinkItem[] {
  const idFor = (label: string) =>
    current.find((item) => item.label === label)?.id ?? newItemId();
  const links: LinkItem[] = whatsappUrl
    ? [{ id: idFor("WhatsApp"), label: "WhatsApp", url: whatsappUrl }]
    : [];
  for (const field of quickLinkFields) {
    const url = quickLinkUrl(field.key, values[field.key] ?? "");
    if (url) links.push({ id: idFor(field.label), label: field.label, url });
  }
  return links;
}

/** The fields from buttons saved before, to edit them again. */
export function quickFromLinks(links: readonly LinkItem[]): QuickLinks {
  const values: QuickLinks = {};
  for (const field of quickLinkFields) {
    const link = links.find((item) => item.label === field.label);
    if (!link) continue;
    values[field.key] = field.base
      ? `${field.key === "facebook" ? "" : "@"}${link.url.replace(field.base, "")}`
      : field.key === "maps" && link.url.startsWith(mapsSearch)
        ? safeDecode(link.url.slice(mapsSearch.length))
        : link.url.replace(/^https:\/\//, "");
  }
  return values;
}

type SocialItem = {
  id: string;
  network: "instagram" | "facebook" | "tiktok";
  value: string;
};
/** What a saved page may carry: any network, read as-is. */
type SavedPage = {
  socials?:
    | readonly { id: string; network: string; value: string }[]
    | undefined;
  links?: readonly LinkItem[] | undefined;
};
type LinkPageButton = LinkItem & { highlight?: boolean };

const networks = ["instagram", "facebook", "tiktok"] as const;

/**
 * «Tus enlaces» as a Página de enlaces (link-in-bio): the networks as their
 * icons, WhatsApp as the main button, then how to get there and the
 * website.
 */
export function linkPageFromQuick(
  values: QuickLinks,
  whatsappUrl: string | undefined,
  current: SavedPage = {},
): { socials: SocialItem[]; links: LinkPageButton[] } {
  const socials: SocialItem[] = [];
  for (const network of networks) {
    const url = quickLinkUrl(network, values[network] ?? "");
    if (!url) continue;
    const id =
      current.socials?.find((item) => item.network === network)?.id ??
      newItemId();
    socials.push({ id, network, value: url });
  }
  const idFor = (label: string) =>
    current.links?.find((item) => item.label === label)?.id ?? newItemId();
  const links: LinkPageButton[] = whatsappUrl
    ? [
        {
          id: idFor("Escríbenos por WhatsApp"),
          label: "Escríbenos por WhatsApp",
          url: whatsappUrl,
          highlight: true,
        },
      ]
    : [];
  for (const key of ["maps", "website"] as const) {
    const field = quickLinkFields.find((item) => item.key === key);
    const url = quickLinkUrl(key, values[key] ?? "");
    if (field && url)
      links.push({ id: idFor(field.label), label: field.label, url });
  }
  return { socials, links };
}

/** The fields from a Página de enlaces saved before. */
export function quickFromLinkPage(content: SavedPage): QuickLinks {
  const values = quickFromLinks(content.links ?? []);
  for (const social of content.socials ?? []) {
    const field = quickLinkFields.find((item) => item.key === social.network);
    if (field?.base)
      values[field.key] =
        `${field.key === "facebook" ? "" : "@"}${social.value.replace(field.base, "")}`;
  }
  return values;
}
