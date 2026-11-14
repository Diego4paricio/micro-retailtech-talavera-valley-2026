import type { ExperienceType, PublicationStatus } from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";

/** Names, short names and descriptions of the page types, and the badge of
 * a publication (moved from `lib/format.ts`, domain audit A2-72). */
export const experienceTypeLabels: Record<ExperienceType, string> = {
  redirect: "Redirección",
  // Two types, two names (domain audit A9-21): «Enlaces» is the simple list,
  // «Página de enlaces» the link-in-bio page.
  links: "Enlaces",
  profile: "Perfil",
  image: "Imagen",
  document: "Documento PDF",
  menu: "Menú",
  catalog: "Catálogo",
  form: "Formulario de contacto",
  linkpage: "Página de enlaces",
};

/** Short type names for tiles and filters («PDF», «Formulario»). */
export const experienceTypeShortLabels: Record<ExperienceType, string> = {
  menu: "Menú",
  catalog: "Catálogo",
  document: "PDF",
  image: "Imagen",
  form: "Formulario",
  profile: "Perfil",
  linkpage: "Página de enlaces",
  links: "Enlaces",
  redirect: "Redirección",
};

export const experienceTypeDescriptions: Record<ExperienceType, string> = {
  redirect: "Envía a las personas directamente a una URL HTTPS.",
  links: "Una página con tus enlaces más importantes.",
  profile: "Tu tarjeta de presentación digital con foto y enlaces.",
  image: "Muestra una imagen PNG validada de tu biblioteca.",
  document: "Tu PDF se ve en la página, sin descargarlo.",
  menu: "Secciones, platillos y precios fáciles de actualizar.",
  catalog: "Productos o servicios con precio, imagen y enlace.",
  form: "Recibe contactos con consentimiento explícito.",
  linkpage:
    "Tu página para compartir en redes: foto, redes sociales y botones.",
};

export function publicationStatusView(status: PublicationStatus): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "published":
      return { label: "Publicada", tone: "success" };
    case "pending":
    case "processing":
      return { label: "Publicando", tone: "info" };
    case "failed":
      return { label: "Falló", tone: "danger" };
    case "superseded":
      return { label: "Reemplazada", tone: "neutral" };
    default:
      return { label: "Borrador", tone: "neutral" };
  }
}
