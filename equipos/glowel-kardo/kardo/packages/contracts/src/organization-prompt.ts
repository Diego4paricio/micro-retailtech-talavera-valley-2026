import { giroForIndustry, giroRecipeSection } from "./design-guide.js";
import type { Industry, WorkspaceProfile } from "./index.js";

// ---------------------------------------------------------------------------
// The organization's own brand, handed to Kardo's AI on every generation
// (2026-10-02): giro, city, "Sobre tu negocio", brand colors, logo and
// cover, read from `WorkspaceProfile` by the API so the customer never
// types them again. It goes in the user message, inside the same delimited
// data block as the rest of the customer's words (it is customer text too),
// together with the giro's recipe: the system prompt stays identical, and
// cached, for every organization.
//
// House style: no em dash or en dash anywhere in this Spanish text.
// ---------------------------------------------------------------------------

export type OrganizationPromptData = {
  /** `WorkspaceProfile.industry`. */
  industry?: string;
  city?: string;
  /** "Sobre tu negocio". */
  about?: string;
  /** "Horario", in the owner's own words. */
  hours?: string;
  brand?: { primary: string; accent: string };
  /** The logo's image ref, when the logo is among the prompt's images. */
  logoRef?: string;
  /** The cover's image ref, when the cover is among the prompt's images. */
  coverRef?: string;
  /** A WhatsApp link built from the profile's phone (`whatsappUrlFromPhone`)
   * and the profile's website: the only links the model may use for an
   * "order or book" button the page does not have yet. */
  whatsappUrl?: string;
  website?: string;
};

/**
 * `https://wa.me/<digits>` for a profile phone. Mexican numbers are written
 * with 10 digits, so those get the country code 52; a number that already
 * carries a country code (11 to 15 digits) is kept as written. Anything
 * shorter is not a phone WhatsApp can open.
 */
export function whatsappUrlFromPhone(
  phone: string | undefined,
  country = "MX",
): string | undefined {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length === 10 && country === "MX")
    return `https://wa.me/52${digits}`;
  if (digits.length >= 11 && digits.length <= 15)
    return `https://wa.me/${digits}`;
  return undefined;
}

/** How the prompt names each giro: one per `industries` entry, so a giro
 * added there cannot be forgotten here (domain audit A2-5). */
const industryLabels: Record<Industry, string> = {
  restaurante: "restaurante",
  cafeteria: "cafetería",
  bar: "bar",
  hotel: "hotel",
  retail: "tienda o comercio",
  salud: "salud y bienestar",
  belleza: "belleza",
  servicios: "servicios profesionales",
  eventos: "eventos",
  educacion: "educación",
  inmobiliaria: "inmobiliaria",
  floreria: "florería",
  panaderia: "panadería",
  agencia: "agencia (marketing, diseño o viajes)",
  papeleria: "papelería",
  otro: "otro",
};

/**
 * The business profile as prompt data: the one builder for Kardo's AI (the
 * API) and «Copiar prompt» (the panel), so both give the model the same
 * business (domain audit A2-43: the panel's copy left out the hours, the
 * WhatsApp and the website). `logoRef`/`coverRef` only when the prompt
 * really carries those images.
 */
export function organizationPromptData(
  profile: WorkspaceProfile | null | undefined,
  refs: { logoRef?: string | undefined; coverRef?: string | undefined } = {},
): OrganizationPromptData {
  const whatsappUrl = whatsappUrlFromPhone(profile?.phone, profile?.country);
  return {
    ...(profile?.industry ? { industry: profile.industry } : {}),
    ...(profile?.city ? { city: profile.city } : {}),
    ...(profile?.about ? { about: profile.about } : {}),
    ...(profile?.hours ? { hours: profile.hours } : {}),
    ...(profile?.brand ? { brand: profile.brand } : {}),
    ...(refs.logoRef ? { logoRef: refs.logoRef } : {}),
    ...(refs.coverRef ? { coverRef: refs.coverRef } : {}),
    ...(whatsappUrl ? { whatsappUrl } : {}),
    ...(profile?.website ? { website: profile.website } : {}),
  };
}

/**
 * The "Perfil de la organización" part of the user message plus the giro's
 * recipe (or the whole recipe table when the giro is unknown). Pure and
 * deterministic.
 */
export function organizationPromptSection(
  organization: OrganizationPromptData,
  options: { recipe?: boolean } = {},
): string {
  const lines: string[] = [];
  if (organization.industry) {
    lines.push(
      `- Giro: ${(industryLabels as Record<string, string>)[organization.industry] ?? organization.industry}`,
    );
  }
  if (organization.city?.trim()) {
    lines.push(`- Ciudad: ${organization.city.trim()}`);
  }
  if (organization.about?.trim()) {
    lines.push(`- Sobre el negocio: "${organization.about.trim()}"`);
  }
  if (organization.hours?.trim()) {
    lines.push(
      `- Horario: "${organization.hours.trim()}". Si la página muestra un horario (en datos clave, por ejemplo), usa este, tal cual; no inventes otro.`,
    );
  }
  if (organization.brand) {
    lines.push(
      `- Colores de marca: principal ${organization.brand.primary}, acento ${organization.brand.accent}. Construye la paleta con ellos (ajusta solo el tono que haga falta para cumplir el contraste); no inventes otros colores de marca. Si en lo que pide el dueño elige otros colores para esta página, en esta página mandan los que pide; el logo nunca se recolorea ni se le pone filtro.`,
    );
  }
  if (organization.logoRef) {
    lines.push(
      `- Logo: la imagen ${organization.logoRef}. Ponlo arriba, completo y sin deformarlo (en círculo solo si es un logo cuadrado o redondo); para que quede chico, ponlo en una sección lienzo con w y h de 72 a 120.`,
    );
  }
  if (organization.coverRef) {
    lines.push(
      `- Portada: la imagen ${organization.coverRef}, una foto horizontal del negocio. Úsala en la primera pantalla, con el nombre y la acción principal encima o justo debajo, y que el texto se lea sobre ella.`,
    );
  }

  const contact = [
    organization.whatsappUrl ? `WhatsApp ${organization.whatsappUrl}` : null,
    organization.website ? `sitio web ${organization.website}` : null,
  ].filter(Boolean);
  if (contact.length) {
    lines.push(
      `- Contacto del negocio: ${contact.join(", ")}. Si la página no tiene un botón para pedir, reservar o contactar (un menú, un catálogo, un PDF o una imagen casi nunca lo traen), agrega uno al final de la primera pantalla o al cierre, con uno de estos enlaces exactos. No inventes ningún otro enlace.`,
    );
  }

  const profile = lines.length
    ? [
        "Perfil de la organización (lo llenó el negocio en Kardo; úsalo aunque la descripción no lo repita):",
        ...lines,
      ].join("\n")
    : "Perfil de la organización: el negocio todavía no llena su giro, sus colores ni su logo.";

  // What the business has not filled in yet, so the model leaves it out
  // instead of writing an example a customer would take as true.
  const missing = [
    organization.hours?.trim()
      ? null
      : "El negocio no ha puesto su horario en su perfil: no inventes uno ni pongas uno de ejemplo. Si el dueño escribe su horario en lo que pide, ese sí úsalo tal cual.",
    contact.length
      ? null
      : "El negocio no ha puesto teléfono ni sitio web: no agregues botones de WhatsApp ni enlaces inventados, ni textos que inviten a escribir por WhatsApp.",
  ].filter(Boolean);
  const known = [profile, ...missing].join("\n");

  if (options.recipe === false) return known;
  return [
    known,
    giroRecipeSection(giroForIndustry(organization.industry)),
  ].join("\n\n");
}
