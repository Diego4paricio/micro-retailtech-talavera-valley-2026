import { panelActivationPath, siteRedirects } from "../../config/redirects.mjs";

// Public values from the allowlist in next.config.ts (validated by
// config/site-env.mjs), inlined at build time.
const websiteUrl = process.env.PUBLIC_WEBSITE_URL ?? "http://localhost:5177";
const customerAppUrl =
  process.env.PUBLIC_CUSTOMER_APP_URL ?? "http://localhost:5175";
// Temporary commercial contact. Deployments may override this through
// PUBLIC_WHATSAPP when Kardo has its dedicated number.
const whatsapp = process.env.PUBLIC_WHATSAPP ?? "522221913975";

export const site = {
  name: "Kardo",
  url: websiteUrl,
  description:
    "Kardo conecta tus códigos QR, tus etiquetas NFC y tus links con páginas que editas desde tu panel: tu menú, tu catálogo, tu perfil o un formulario. Cambias lo que muestran sin reimprimir y ves cuántas visitas llegan, por dónde y a qué hora.",
  contactEmail: process.env.PUBLIC_CONTACT_EMAIL || null,
} as const;

/** The website only links into the Customer App; it shares nothing else. */
export const panel = {
  signIn: `${customerAppUrl}/`,
  signUp: `${customerAppUrl}/registro`,
  plan: `${customerAppUrl}/settings/plan`,
  /** Kit activation: «Producto de Kardo» with the code of the box. */
  activate: `${customerAppUrl}${panelActivationPath}`,
} as const;

/** Short addresses of the site (/registro/, /activar/…), config/redirects.mjs. */
export const shortcuts = siteRedirects(customerAppUrl);

/** A WhatsApp chat with Kardo, with the first message already written. */
export function whatsappLink(message: string): string {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, websiteUrl).toString();
}
