import { type DesignBrand, whatsappUrlFromPhone } from "@kardo/contracts";

/**
 * Pure helpers that turn what a business owner naturally has at hand (a
 * phone number, an "@usuario" handle, a pasted profile URL) into the https
 * URL a `brandButton` block links to. No React, no `@kardo/page-render`
 * import: `BrandButtonFields.tsx` is the only caller.
 */

/** Suggested button text per brand (Spanish, MX) — a starting point the
 * business owner can still edit freely; it never overwrites a label they
 * already customized. Shared by `BrandButtonFields.tsx` (the single-button
 * field) and `AddBlockPanel.tsx`'s "Redes en círculo" bulk insert. */
export const suggestedBrandLabel: Record<DesignBrand, string> = {
  whatsapp: "Escríbenos por WhatsApp",
  instagram: "Síguenos en Instagram",
  facebook: "Síguenos en Facebook",
  messenger: "Escríbenos por Messenger",
  tiktok: "Síguenos en TikTok",
  youtube: "Ve nuestro canal de YouTube",
  x: "Síguenos en X",
  threads: "Síguenos en Threads",
  pinterest: "Síguenos en Pinterest",
  telegram: "Escríbenos por Telegram",
  spotify: "Escúchanos en Spotify",
  waze: "Llega con Waze",
  ubereats: "Pide en Uber Eats",
  mercadopago: "Paga con Mercado Pago",
  tripadvisor: "Déjanos tu reseña en Tripadvisor",
  booking: "Reserva en Booking.com",
  calendly: "Agenda una cita",
};

// ---------------------------------------------------------------------------
// WhatsApp: a phone number (+ optional message) → https://wa.me/...
// ---------------------------------------------------------------------------

const MX_COUNTRY_CODE = "52";
const WA_ME = "https://wa.me/";

/**
 * Normalizes a phone number to the plain digit string `wa.me` expects.
 * A complete number follows the one rule of `whatsappUrlFromPhone`
 * (`@kardo/contracts`, the same one the AI and the pages use): 10 digits are
 * a Mexican number and get "52"; 11 to 15 digits already carry their country
 * code. A leading "+" keeps the digits exactly as typed. A number still
 * being typed (too short for WhatsApp to open) keeps "52" in front so the
 * field does not erase what the person is writing.
 */
export function normalizeWhatsAppPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return digits;
  const complete = whatsappUrlFromPhone(digits);
  if (complete) return complete.slice(WA_ME.length);
  return digits.startsWith(MX_COUNTRY_CODE) && digits.length >= 12
    ? digits
    : `${MX_COUNTRY_CODE}${digits}`;
}

export type WhatsAppLinkInput = { phone: string; message?: string | undefined };

/** `https://wa.me/52XXXXXXXXXX` (+`?text=...` when there's a message), or
 * `""` when there is no usable phone number yet. */
export function buildWhatsAppLink({
  phone,
  message,
}: WhatsAppLinkInput): string {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return "";
  const text = message?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** The inverse of `buildWhatsAppLink`, so reopening the inspector shows the
 * phone number and message it was built from instead of the raw URL. Only
 * understands its own `wa.me` shape; anything else parses as empty. */
export function parseWhatsAppLink(href: string): WhatsAppLinkInput {
  const match = /^https:\/\/wa\.me\/(\d+)(?:\?(.*))?$/.exec(href.trim());
  if (!match?.[1]) return { phone: "", message: "" };
  const params = new URLSearchParams(match[2] ?? "");
  return { phone: match[1], message: params.get("text") ?? "" };
}

// ---------------------------------------------------------------------------
// "@usuario" or a full URL → the brand's own profile URL.
// ---------------------------------------------------------------------------

/** Brands whose link is either a handle or a profile URL, per the owner's
 * decision on the panel's per-brand link helpers. */
export const profileHandleBrands = [
  "instagram",
  "tiktok",
  "x",
  "threads",
  "facebook",
  "youtube",
  "telegram",
] as const;
export type ProfileHandleBrand = (typeof profileHandleBrands)[number];

export function isProfileHandleBrand(
  brand: DesignBrand,
): brand is ProfileHandleBrand {
  return (profileHandleBrands as readonly string[]).includes(brand);
}

// Threads' web profiles still resolve at threads.net (its original domain,
// kept live alongside the newer threads.com after Meta's 2025 rename).
const profileUrl: Record<ProfileHandleBrand, (handle: string) => string> = {
  instagram: (handle) => `https://instagram.com/${handle}`,
  tiktok: (handle) => `https://www.tiktok.com/@${handle}`,
  x: (handle) => `https://x.com/${handle}`,
  threads: (handle) => `https://www.threads.net/@${handle}`,
  facebook: (handle) => `https://facebook.com/${handle}`,
  youtube: (handle) => `https://www.youtube.com/@${handle}`,
  telegram: (handle) => `https://t.me/${handle}`,
};

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Strips a leading "@" and a trailing slash a pasted handle might carry. */
function cleanHandle(value: string): string {
  return value.replace(/^@/, "").replace(/\/+$/, "");
}

/** Builds `brand`'s profile URL from either a full URL (used as-is, upgraded
 * to https) or an "@usuario" handle. `""` when there is nothing usable yet. */
export function buildProfileLink(
  brand: ProfileHandleBrand,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (looksLikeUrl(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  const handle = cleanHandle(trimmed);
  return handle ? profileUrl[brand](handle) : "";
}

const profileHrefPattern: Record<ProfileHandleBrand, RegExp> = {
  instagram: /^https:\/\/(?:www\.)?instagram\.com\/([^/?#]+)\/?$/i,
  tiktok: /^https:\/\/(?:www\.)?tiktok\.com\/@([^/?#]+)\/?$/i,
  x: /^https:\/\/(?:www\.)?x\.com\/([^/?#]+)\/?$/i,
  threads: /^https:\/\/(?:www\.)?threads\.net\/@([^/?#]+)\/?$/i,
  facebook: /^https:\/\/(?:www\.)?facebook\.com\/([^/?#]+)\/?$/i,
  youtube: /^https:\/\/(?:www\.)?youtube\.com\/@([^/?#]+)\/?$/i,
  telegram: /^https:\/\/t\.me\/([^/?#]+)\/?$/i,
};

/** The inverse of `buildProfileLink`: a bare handle when `href` matches the
 * brand's own URL shape, otherwise `href` itself (still a valid value for
 * the same "handle or URL" field, just shown as the full URL). Empty input
 * stays empty. */
export function parseProfileLink(
  brand: ProfileHandleBrand,
  href: string,
): string {
  if (!href) return "";
  const match = profileHrefPattern[brand].exec(href.trim());
  return match?.[1] ?? href;
}

// ---------------------------------------------------------------------------
// Every other brand: a plain https URL (menu, listing, booking page...).
// ---------------------------------------------------------------------------

/** Trims and upgrades a pasted `http://` URL to `https://`; `""` when
 * empty. Used for brands with no handle/phone shorthand (Messenger,
 * Pinterest, Spotify, Waze, Uber Eats, Mercado Pago, Tripadvisor,
 * Booking.com, Calendly). */
export function buildPlainLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^http:\/\//i, "https://");
}

// ---------------------------------------------------------------------------
// Which link editor a brand needs.
// ---------------------------------------------------------------------------

export type BrandLinkKind = "whatsapp" | "profile" | "url";

export function brandLinkKind(brand: DesignBrand): BrandLinkKind {
  if (brand === "whatsapp") return "whatsapp";
  if (isProfileHandleBrand(brand)) return "profile";
  return "url";
}
