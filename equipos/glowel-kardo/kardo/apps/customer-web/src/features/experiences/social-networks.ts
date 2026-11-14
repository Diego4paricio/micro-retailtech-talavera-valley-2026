import {
  SOCIAL_EMAIL_PATTERN,
  SOCIAL_PHONE_PATTERN,
  type SocialNetwork,
  socialNetworkDomains,
  socialUrlMatchesNetwork,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import type { IconName } from "../../components/Icon.js";

export const socialNetworkLabels: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  threads: "Threads",
  pinterest: "Pinterest",
  spotify: "Spotify",
  telegram: "Telegram",
  website: "Sitio web",
  email: "Correo electrónico",
  phone: "Teléfono",
};

// Lucide fallbacks: components/Icon.tsx has no brand icons yet, so every
// network borrows the closest generic shape until a dedicated set exists.
export const socialNetworkIcons: Record<SocialNetwork, IconName> = {
  instagram: "asset",
  facebook: "team",
  tiktok: "play",
  x: "close",
  youtube: "external",
  linkedin: "organization",
  whatsapp: "webhook",
  threads: "link",
  pinterest: "location",
  spotify: "history",
  telegram: "upload",
  website: "globe",
  email: "lead",
  phone: "bell",
};

export const socialNetworkPlaceholders: Record<SocialNetwork, string> = {
  instagram: "https://instagram.com/tu_usuario",
  facebook: "https://facebook.com/tu_pagina",
  tiktok: "https://tiktok.com/@tu_usuario",
  x: "https://x.com/tu_usuario",
  youtube: "https://youtube.com/@tu_canal",
  linkedin: "https://linkedin.com/company/tu_empresa",
  whatsapp: "https://wa.me/521234567890",
  threads: "https://threads.net/@tu_usuario",
  pinterest: "https://pinterest.com/tu_usuario",
  spotify: "https://open.spotify.com/artist/tu_id",
  telegram: "https://t.me/tu_usuario",
  website: "https://tu-sitio.com",
  email: "tucorreo@ejemplo.com",
  phone: "+521234567890",
};

/** Short hint shown under the value field, before the person types anything. */
export const socialNetworkHints: Record<SocialNetwork, string> =
  Object.fromEntries(
    (Object.keys(socialNetworkLabels) as SocialNetwork[]).map((network) => {
      if (network === "email")
        return [network, "Una dirección de correo válida."];
      if (network === "phone")
        return [network, "Solo números; incluye el código de país."];
      const domains = socialNetworkDomains[network];
      return [
        network,
        domains
          ? `Un enlace https:// que apunte a ${domains[0]}.`
          : "Un enlace completo que empiece con https://.",
      ];
    }),
  ) as Record<SocialNetwork, string>;

/**
 * The per-network rule, read from `@kardo/contracts` (the same table and
 * patterns the API enforces; domain audit A2-29), so the customer sees a
 * Spanish error before saving instead of the generic "revisa el contenido"
 * message from a 400. Returns `null` when the value is acceptable.
 */
export function validateSocialValue(
  network: SocialNetwork,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Este campo es obligatorio.";
  if (network === "email")
    return SOCIAL_EMAIL_PATTERN.test(trimmed)
      ? null
      : "Correo electrónico no válido.";
  if (network === "phone") {
    const digits = trimmed.replace(/[\s()-]/g, "");
    return SOCIAL_PHONE_PATTERN.test(digits)
      ? null
      : "Usa solo números (6 a 15 dígitos), con espacios, guiones o paréntesis opcionales.";
  }
  const normalized = normalizePublicHttpsUrl(trimmed);
  if (!normalized)
    return "Usa una URL completa que empiece con https:// (sin usuario ni contraseña).";
  const domains = socialNetworkDomains[network];
  if (domains && !socialUrlMatchesNetwork(network, normalized))
    return `El enlace de ${socialNetworkLabels[network]} debe apuntar a ${domains[0]}.`;
  return null;
}

/** Best-effort normalization for a value already accepted by `validateSocialValue`. */
export function normalizeSocialValue(
  network: SocialNetwork,
  value: string,
): string {
  const trimmed = value.trim();
  if (network === "email") return trimmed.toLowerCase();
  if (network === "phone") return trimmed.replace(/[\s()-]/g, "");
  return normalizePublicHttpsUrl(trimmed) ?? trimmed;
}
