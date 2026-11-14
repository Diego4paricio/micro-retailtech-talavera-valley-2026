import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// The business's public address (Links redesign, owner, 2026-10-04):
// kardo.com.mx/<negocio> and kardo.com.mx/<negocio>/<link>. It is not the
// business's name (names may repeat); it is unique in all of Kardo, with
// «cafe-nube» and «cafenube» counting as the same one, and it never gets a
// number to break a tie: the owner picks it from one free recommendation.
// The database enforces the format and uniqueness
// (`kardo_core.set_workspace_slug`); the reserved list lives here, shared by
// the Customer API and the Resolver (which serves these addresses in front
// of the website).
// ---------------------------------------------------------------------------

export const BUSINESS_SLUG_MIN = 3;
export const BUSINESS_SLUG_MAX = 30;
export const BUSINESS_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** «cafe-nube» and «cafenube» are one address. */
export function businessSlugKey(slug: string): string {
  return slug.replaceAll("-", "");
}

/** First path segments that already belong to the website or the product:
 * a business can never use them (nor anything starting with «kardo»). */
export const reservedBusinessSlugs: readonly string[] = [
  // Website pages and files (apps/website).
  "precios",
  "terminos",
  "privacidad",
  "cancelacion-y-reembolsos",
  "registro",
  "blog",
  "contacto",
  "media",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  // Product surfaces and subdomains.
  "app",
  "api",
  "t",
  "go",
  "ops",
  "operations",
  "staff",
  "status",
  "estado",
  "admin",
  "login",
  "entrar",
  "cuenta",
  "ayuda",
  "help",
  "soporte",
  "support",
  "www",
  "mail",
  "correo",
  "assets",
  "static",
  "links",
  "link",
  "qr",
  "nfc",
  "root",
  "terms",
  "privacy",
  // The Resolver's own routes (it serves kardo.com.mx/<negocio>).
  "health",
  "internal",
];

const reservedKeys = new Set(reservedBusinessSlugs.map(businessSlugKey));

export function isReservedBusinessSlug(slug: string): boolean {
  const key = businessSlugKey(slug);
  return reservedKeys.has(key) || key.startsWith("kardo");
}

/** Spanish, for the field: null when the address reads well. */
export function businessSlugFormatError(slug: string): string | null {
  if (slug.length < BUSINESS_SLUG_MIN || slug.length > BUSINESS_SLUG_MAX)
    return `Usa de ${BUSINESS_SLUG_MIN} a ${BUSINESS_SLUG_MAX} caracteres.`;
  if (!BUSINESS_SLUG_PATTERN.test(slug) || slug.includes("--"))
    return "Solo letras sin acentos, números y guiones; sin espacios ni guion al principio o al final.";
  return null;
}

/** «Café Nube & Co.» → «cafe-nube-y-co»: no accents, spaces or symbols. */
export function slugifyBusinessName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll("&", " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** At most `max` characters, cut at a hyphen when it can. */
function fitSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf("-");
  return (
    lastHyphen >= BUSINESS_SLUG_MIN ? cut.slice(0, lastHyphen) : cut
  ).replace(/-+$/, "");
}

/** One short word per giro, to tell two same-named businesses apart. */
const industryWords: Record<string, string> = {
  restaurante: "restaurante",
  cafeteria: "cafe",
  bar: "bar",
  hotel: "hotel",
  retail: "tienda",
  salud: "salud",
  belleza: "belleza",
  servicios: "servicios",
  eventos: "eventos",
  educacion: "escuela",
  inmobiliaria: "inmobiliaria",
};

/**
 * The addresses Kardo may recommend, best first: the name itself, then the
 * name with the city, then with the giro (after or before it). Words only,
 * never numbers, never a reserved address; the API returns the first one
 * that is free. Empty when the name gives nothing usable.
 */
export function businessSlugCandidates(input: {
  name: string;
  city?: string | null | undefined;
  industry?: string | null | undefined;
}): string[] {
  const base = fitSlug(slugifyBusinessName(input.name), BUSINESS_SLUG_MAX);
  if (!base) return [];
  const city = slugifyBusinessName(input.city ?? "");
  const word = input.industry ? industryWords[input.industry] : undefined;
  const join = (...parts: string[]) => {
    const tail = parts.slice(1).join("-");
    const head = fitSlug(parts[0] ?? "", BUSINESS_SLUG_MAX - tail.length - 1);
    return head ? `${head}-${tail}` : "";
  };
  // The giro word only helps when the name does not already say it.
  const giro = word && !base.split("-").includes(word) ? word : undefined;
  const candidates = [
    base,
    city ? join(base, city) : "",
    giro ? join(base, giro) : "",
    giro ? fitSlug(`${giro}-${base}`, BUSINESS_SLUG_MAX) : "",
    city && giro ? join(base, giro, city) : "",
  ];
  const seen = new Set<string>();
  return candidates.filter((slug) => {
    if (!slug || businessSlugFormatError(slug) || isReservedBusinessSlug(slug))
      return false;
    const key = businessSlugKey(slug);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const BusinessSlugSchema = Type.String({
  minLength: BUSINESS_SLUG_MIN,
  maxLength: BUSINESS_SLUG_MAX,
  pattern: "^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$",
});

export const SetBusinessSlugSchema = Type.Object(
  { slug: BusinessSlugSchema },
  { $id: "SetBusinessSlug", additionalProperties: false },
);
export type SetBusinessSlug = Static<typeof SetBusinessSlugSchema>;

export const BusinessSlugSuggestionSchema = Type.Object(
  {
    /** The recommendation, already free; null when the name gives none. */
    slug: Type.Union([BusinessSlugSchema, Type.Null()]),
  },
  { $id: "BusinessSlugSuggestion", additionalProperties: false },
);
export type BusinessSlugSuggestion = Static<
  typeof BusinessSlugSuggestionSchema
>;

export const BusinessSlugAvailabilitySchema = Type.Object(
  {
    available: Type.Boolean(),
    reason: Type.Optional(
      Type.Union([
        Type.Literal("taken"),
        Type.Literal("reserved"),
        Type.Literal("format"),
      ]),
    ),
    /** A free alternative when this one is not. */
    suggestion: Type.Optional(Type.Union([BusinessSlugSchema, Type.Null()])),
  },
  { $id: "BusinessSlugAvailability", additionalProperties: false },
);
export type BusinessSlugAvailability = Static<
  typeof BusinessSlugAvailabilitySchema
>;

// ---------------------------------------------------------------------------
// The address of each Link, kardo.com.mx/<negocio>/<link>: same format as
// the business's, unique only inside its business (two businesses can both
// have /menu), chosen when the Link is created with its availability checked
// before, renamed at most once every 7 days (`kardo_core.set_link_slug`).
// ---------------------------------------------------------------------------

export const linkSlugFormatError = businessSlugFormatError;

/** One word per Experience type, for a link that only needs to say what it
 * shows. */
const typeWords: Record<string, string> = {
  menu: "menu",
  catalog: "catalogo",
  // A PDF page is the `document` type (relevo 37, C9c: the key was `pdf`
  // and never matched).
  document: "pdf",
  image: "imagen",
  form: "formulario",
  linkpage: "enlaces",
};

/** Linking words left out of a short address («Tarjeta de presentación»
 * → «tarjeta»). */
const joiningWords = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "e",
  "en",
  "para",
  "con",
  "tu",
  "tus",
  "mi",
  "mis",
  "su",
  "sus",
  "a",
  "al",
]);
/** Up to here an address still reads short and easy to dictate. */
const shortLinkSlug = 14;

/**
 * The link addresses Kardo may recommend, best first: short and easy to
 * dictate (the Experience's name when it is short, else its first words),
 * then the whole name, the word for its type, and both. Words only, never
 * numbers; the API returns the first one that is free inside the business.
 */
export function linkSlugCandidates(input: {
  name: string;
  type?: string | null | undefined;
}): string[] {
  const base = fitSlug(slugifyBusinessName(input.name), BUSINESS_SLUG_MAX);
  const words = base
    .split("-")
    .filter((part) => part && !joiningWords.has(part));
  const firstTwo = words.slice(0, 2).join("-");
  const word = input.type ? typeWords[input.type] : undefined;
  const candidates = [
    base.length <= shortLinkSlug ? base : "",
    firstTwo.length <= shortLinkSlug ? firstTwo : "",
    words[0] ?? "",
    base,
    word ?? "",
    word && base && !base.split("-").includes(word)
      ? fitSlug(`${word}-${base}`, BUSINESS_SLUG_MAX)
      : "",
  ];
  const seen = new Set<string>();
  return candidates.filter((slug) => {
    if (!slug || linkSlugFormatError(slug)) return false;
    const key = businessSlugKey(slug);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const LinkSlugSchema = Type.String({
  minLength: BUSINESS_SLUG_MIN,
  maxLength: BUSINESS_SLUG_MAX,
  pattern: "^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$",
});

/** A new Link that already shows an Experience (Links redesign, phase 2). */
export const CreateLinkSchema = Type.Object(
  {
    experienceId: Type.String({ format: "uuid" }),
    slug: LinkSlugSchema,
    /** Ignored: a link is named by its address, «/<slug>» (owner,
     * 2026-10-04). Kept so older callers still validate. */
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  },
  { $id: "CreateLink", additionalProperties: false },
);
export type CreateLink = Static<typeof CreateLinkSchema>;

export const SetLinkSlugSchema = Type.Object(
  { slug: LinkSlugSchema },
  { $id: "SetLinkSlug", additionalProperties: false },
);
export type SetLinkSlug = Static<typeof SetLinkSlugSchema>;

export const SetMainLinkSchema = Type.Object(
  { touchpointId: Type.String({ format: "uuid" }) },
  { $id: "SetMainLink", additionalProperties: false },
);
export type SetMainLink = Static<typeof SetMainLinkSchema>;

export const LinkSlugSuggestionSchema = Type.Object(
  { slug: Type.Union([LinkSlugSchema, Type.Null()]) },
  { $id: "LinkSlugSuggestion", additionalProperties: false },
);
export type LinkSlugSuggestion = Static<typeof LinkSlugSuggestionSchema>;

export const LinkSlugAvailabilitySchema = Type.Object(
  {
    available: Type.Boolean(),
    reason: Type.Optional(
      Type.Union([Type.Literal("taken"), Type.Literal("format")]),
    ),
    suggestion: Type.Optional(Type.Union([LinkSlugSchema, Type.Null()])),
  },
  { $id: "LinkSlugAvailability", additionalProperties: false },
);
export type LinkSlugAvailability = Static<typeof LinkSlugAvailabilitySchema>;
