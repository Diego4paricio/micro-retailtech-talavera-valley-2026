// Public legal pages (no file access here: safe for any component). The
// texts come from Docs/legal through ./legal.ts at build time. Paths are the
// ones the panel, Stripe Checkout and the billing emails link to.

export const legalDocuments = {
  terminos: {
    file: "terminos-y-condiciones-de-suscripcion.md",
    title: "Términos y Condiciones de Suscripción",
    description:
      "Condiciones para usar Kardo y contratar sus planes: prueba gratuita, renovación, cancelación, reembolsos y datos.",
  },
  "cancelacion-y-reembolsos": {
    file: "politica-de-cancelacion-y-reembolsos.md",
    title: "Política de Cancelación y Reembolsos",
    description:
      "Cómo cancelar tu plan de Kardo, cuándo surte efecto y en qué casos hay reembolso.",
  },
  privacidad: {
    file: "aviso-de-privacidad-clientes.md",
    title: "Aviso de Privacidad",
    description:
      "Cómo trata Kardo los datos personales de sus clientes y de las personas que visitan sus páginas.",
  },
} as const;

export type LegalSlug = keyof typeof legalDocuments;
export const legalSlugs = Object.keys(legalDocuments) as LegalSlug[];
