import type { ExperienceType } from "@kardo/contracts";
import { touchpointExperienceTypes } from "@kardo/contracts";
import { experienceTypeLabels } from "./labels.js";

/**
 * The one catalog of page types to create (domain audit A2-28): each type's
 * title in the picker, its default name, the example content it starts with
 * and the order a giro recommends. «Nueva página» (Páginas) and the page
 * step of Primeros pasos both read it, so the two ways of creating a page
 * can no longer give different names, order or content.
 */

/** What the catalog needs to know of a giro (`FirstStepsPlan`, structurally). */
export type PageTypePlan = {
  type: "menu" | "catalog";
  noun: { one: string; many: string };
  /** The new page's name in the panel ("Menú", "Servicios"…). */
  pageName: string;
  /** A consultorio lives on appointments: the form goes first, as «Para
   * ti» (relevo 37, round 3: Paola took the services tile and her patients
   * had nowhere to leave their details). */
  formFirst?: boolean | undefined;
};

// Panadería is food but sells over a counter, not table by table (owner,
// relevo 37 §4 C9/E4: Javier's panadería is a Catálogo of panes, not a
// Menú); it stays out of this set on purpose.
const foodIndustries = new Set(["restaurante", "cafeteria", "bar"]);

const nouns: Record<string, { one: string; many: string }> = {
  restaurante: { one: "platillo", many: "platillos" },
  bar: { one: "platillo o bebida", many: "platillos y bebidas" },
  cafeteria: { one: "producto", many: "productos" },
  panaderia: { one: "pan", many: "panes" },
  retail: { one: "producto", many: "productos" },
  floreria: { one: "producto", many: "productos" },
  papeleria: { one: "producto", many: "productos" },
  belleza: { one: "servicio", many: "servicios" },
  salud: { one: "servicio", many: "servicios" },
  servicios: { one: "servicio", many: "servicios" },
  agencia: { one: "servicio", many: "servicios" },
  educacion: { one: "curso", many: "cursos" },
  eventos: { one: "paquete", many: "paquetes" },
  inmobiliaria: { one: "propiedad", many: "propiedades" },
  hotel: { one: "habitación", many: "habitaciones" },
};

/**
 * The page a giro gets first (Menú for food served at the table, a
 * Catálogo otherwise; a consultorio puts its form first) and how it calls
 * what it sells. Moved from Primeros pasos (domain audit A2-28): «Nueva
 * página» uses it too.
 */
export function pagePlanFor(industry?: string | null): PageTypePlan {
  const noun = (industry && nouns[industry]) || {
    one: "producto o servicio",
    many: "productos o servicios",
  };
  if (industry && foodIndustries.has(industry))
    return { type: "menu", noun, pageName: "Menú" };
  const many = noun.many.split(" ")[0] ?? "Productos";
  return {
    type: "catalog",
    noun,
    pageName: many.charAt(0).toUpperCase() + many.slice(1),
    ...(industry === "salud" ? { formFirst: true } : {}),
  };
}

/** The example content a new page of this type starts with. */
export { seedContentForCreation } from "./content.js";

/**
 * The pages step 2 offers, all at once and in tiles (owner, 2026-10-04:
 * «todos los Experiences, acomodados en cuadros»; first «que escoja el
 * experience»: a menu in PDF should not have to be rebuilt from zero). The
 * giro's own come first; the first one is the recommended one.
 */
export type PageChoice = {
  type: Exclude<ExperienceType, "links">;
  title: string;
};

export function pageChoices(plan: PageTypePlan): PageChoice[] {
  const isMenu = plan.type === "menu";
  const titles: Record<PageChoice["type"], string> = {
    menu: isMenu ? "Escribe tu menú" : "Un menú",
    catalog: isMenu ? "Un catálogo" : `Escribe tus ${plan.noun.many}`,
    document: isMenu ? "Sube tu menú en PDF" : "Sube tu catálogo en PDF",
    image: isMenu ? "Una foto de tu menú" : "Una imagen",
    profile: "Tarjeta de presentación",
    linkpage: "Tus enlaces",
    form: plan.formFirst ? "Formulario para citas" : "Formulario de contacto",
    redirect: "Ir a tu sitio web",
  };
  const order: PageChoice["type"][] = isMenu
    ? [
        "menu",
        "document",
        "image",
        "linkpage",
        "profile",
        "catalog",
        "form",
        "redirect",
      ]
    : [
        "catalog",
        "document",
        "profile",
        "linkpage",
        "form",
        "image",
        "menu",
        "redirect",
      ];
  const sorted = plan.formFirst
    ? ["form" as const, ...order.filter((type) => type !== "form")]
    : order;
  return sorted.map((type) => ({ type, title: titles[type] }));
}

/** Words that name nothing of the business, however they are spelled
 * ("documento", "escaneo", "sin título"…): a PDF named this way falls
 * back to the giro's name instead (relevo 37 C9c). */
const genericFileWords = new Set([
  "documento",
  "document",
  "doc",
  "pdf",
  "archivo",
  "file",
  "scan",
  "escaneo",
  "escaner",
  "digitalizacion",
  "untitled",
  "sintitulo",
  "nuevo",
  "img",
  "imagen",
  "menu",
  "catalogo",
]);

/**
 * A page's name from the PDF the owner uploaded (relevo 37 C9c): its first
 * word, cleaned and capitalized ("paquetes-salon-los-arcos.pdf" →
 * "Paquetes"), short and real enough to be the business's own word. `null`
 * for a generic or empty name ("documento.pdf", "scan001.pdf"), so the
 * caller falls back to the giro's.
 */
export function titleFromFileName(fileName: string): string | null {
  const stem = fileName.replace(/\.[a-z0-9]{1,5}$/i, "");
  const first = stem.split(/[-_\s]+/).find((word) => word.trim());
  if (!first) return null;
  const folded = first
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (folded.length < 3 || /^\d+$/.test(folded) || genericFileWords.has(folded))
    return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** The page's name in the panel when Primeros pasos creates it. A PDF
 * (`fileName`, the file the owner uploaded) is named from it, or from the
 * giro, never the generic «Catálogo en PDF» (relevo 37 C9c). */
export function pageNameFor(
  type: ExperienceType,
  plan: PageTypePlan,
  fileName?: string | null,
): string {
  switch (type) {
    case "menu":
      return "Menú";
    case "catalog":
      return plan.type === "catalog" ? plan.pageName : "Catálogo";
    case "document":
      return (fileName && titleFromFileName(fileName)) || plan.pageName;
    case "image":
      return plan.type === "menu" ? "Foto del menú" : "Imagen";
    case "profile":
      return "Perfil";
    case "links":
      return "Enlaces";
    case "linkpage":
      return "Mis enlaces";
    case "form":
      return "Formulario de contacto";
    case "redirect":
      return "Mi sitio web";
  }
}

/** Every type «Nueva página» can create, the giro's recommendation first
 * (relevo 37, S5: Carmen, of a nail salon, made a «Menú» and it said
 * «Platillo 1»), then the rest. */
export function creationTypesFor(
  plan: PageTypePlan | null,
): readonly ExperienceType[] {
  if (!plan) return touchpointExperienceTypes;
  const recommended = pageChoices(plan).map((choice) => choice.type);
  return [
    ...recommended.filter((type) => touchpointExperienceTypes.includes(type)),
    ...touchpointExperienceTypes.filter(
      (type) => !recommended.includes(type as never),
    ),
  ];
}

/** The name a type starts with when nothing better is known. */
export function defaultPageName(
  type: ExperienceType,
  plan: PageTypePlan | null,
): string {
  return plan ? pageNameFor(type, plan) : experienceTypeLabels[type];
}
