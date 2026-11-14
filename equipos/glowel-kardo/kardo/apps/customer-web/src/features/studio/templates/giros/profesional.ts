import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  catalogBlock,
  contentLinksBlock,
  contentTitleBlock,
  divider,
  documentPagesBlock,
  heading,
  leadFormBlock,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

const base = {
  palette: {
    background: "#ffffff",
    surface: "#f5f5f5",
    text: "#111111",
    muted: "#6e6e6e",
    accent: "#3454d1",
  },
  fonts: { heading: "geist", body: "system" },
  radius: 10,
  buttonStyle: "outline",
  buttonShape: "rounded",
  shadow: "none",
  maxWidth: 640,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#ffffff" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#f8f7f4" },
};

export const profesionalLinks: StudioTemplate = {
  id: "profesional-servicios-contacto",
  name: "Servicios y contacto",
  giro: "profesional",
  types: ["links"],
  description:
    "Página de enlaces minimalista en blanco y azul, con tres columnas para presentar el trabajo.",
  design: pageDesign(linksStyle, [
    section(
      "t-pro-l-hero",
      "1",
      [
        [
          heading("t-pro-l-h1", "Mucho gusto", 1),
          contentTitleBlock("t-pro-l-title"),
          paragraph(
            "t-pro-l-tag",
            "Apoyo profesional cercano, pensado para resolver lo que necesitas.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-pro-l-links",
      "1",
      [
        [
          heading("t-pro-l-h2", "Mis enlaces", 2),
          contentLinksBlock("t-pro-l-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-pro-l-highlights",
      "1-1-1",
      [
        [
          heading("t-pro-l-h3a", "Experiencia", 3),
          paragraph(
            "t-pro-l-p3a",
            "Años de trabajo acompañando a personas y negocios.",
          ),
        ],
        [
          heading("t-pro-l-h3b", "Cercanía", 3),
          paragraph("t-pro-l-p3b", "Comunicación clara en cada paso."),
        ],
        [
          heading("t-pro-l-h3c", "Disponibilidad", 3),
          paragraph("t-pro-l-p3c", "Escríbeme y te respondo a la brevedad."),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-pro-l-cta",
      "1",
      [
        [
          divider("t-pro-l-div"),
          paragraph(
            "t-pro-l-p4",
            "Escríbeme por WhatsApp para contarme en qué te puedo ayudar.",
          ),
          button("t-pro-l-btn", "Escríbeme por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const profesionalBio: StudioTemplate = {
  id: "profesional-perfil",
  name: "Perfil profesional",
  giro: "profesional",
  types: ["profile"],
  description:
    "Perfil personal minimalista en blanco y azul, para un consultor o profesional independiente.",
  design: pageDesign(bioStyle, [
    section(
      "t-pro-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-pro-b-header-block", "stacked", "circle"),
          paragraph(
            "t-pro-b-bio",
            "Ayudo a personas y negocios a resolver lo que necesitan, con cercanía y claridad.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-pro-b-links",
      "1",
      [
        [
          heading("t-pro-b-h2", "Mis enlaces", 2),
          contentLinksBlock("t-pro-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-pro-b-cta",
      "1",
      [
        [
          paragraph(
            "t-pro-b-p3",
            "Escríbeme por WhatsApp y platicamos sobre tu proyecto.",
          ),
          button("t-pro-b-btn", "Escríbeme por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const profesionalForm: StudioTemplate = {
  id: "profesional-formulario",
  name: "Formulario de contacto",
  giro: "profesional",
  types: ["form"],
  description:
    "Formulario minimalista con línea inferior en los campos, en blanco y azul.",
  design: pageDesign(linksStyle, [
    section(
      "t-pro-f-hero",
      "1",
      [
        [
          heading("t-pro-f-h1", "Cuéntame en qué te ayudo", 1),
          contentTitleBlock("t-pro-f-title"),
          paragraph(
            "t-pro-f-tag",
            "Escribe tus datos y te respondo a la brevedad.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-pro-f-form",
      "1",
      [[leadFormBlock("t-pro-f-form-block", "underline", "full")]],
      { card: true, paddingTop: 32, paddingBottom: 40 },
    ),
  ]),
};

export const profesionalDocument: StudioTemplate = {
  id: "profesional-portafolio",
  name: "Portafolio en PDF",
  giro: "profesional",
  types: ["document"],
  description:
    "Documento PDF con sombra suave bajo cada página, ideal para un portafolio o una presentación.",
  design: pageDesign(linksStyle, [
    section(
      "t-pro-d-hero",
      "1",
      [
        [
          heading("t-pro-d-h1", "Mi portafolio", 1),
          contentTitleBlock("t-pro-d-title"),
          paragraph(
            "t-pro-d-tag",
            "Un vistazo a mi trabajo más reciente, página por página.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-pro-d-pages",
      "1",
      [[documentPagesBlock("t-pro-d-pages-block", "shadow", 32)]],
      { paddingTop: 16, paddingBottom: 40 },
    ),
    section(
      "t-pro-d-cta",
      "1",
      [
        [
          divider("t-pro-d-div"),
          paragraph("t-pro-d-p", "¿Te interesa trabajar juntos? Escríbeme."),
          button("t-pro-d-btn", "Escríbeme por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

const servicesStyle: DesignStyle = {
  ...base,
  palette: {
    background: "#f4f6f8",
    surface: "#ffffff",
    text: "#14213d",
    muted: "#5b6878",
    accent: "#2b5f9e",
  },
  radius: 14,
  buttonStyle: "solid",
  shadow: "soft",
  background: {
    kind: "gradient",
    color: "#f4f6f8",
    colorTo: "#e6ecf3",
    angle: 180,
  },
};

/**
 * «Servicios» (owner decision, 2026-10-03, B3): a Formulario that first
 * says what the business offers, in free blocks the owner rewrites, and
 * then asks for the visitor's data. A despacho, a consultorio or a coach
 * gets one page that explains and receives prospects (2026-10-03 study,
 * finding 6). Primeros pasos uses it for the professional giros, by id.
 * The three services are placeholders that say so, never invented offers.
 */
export const profesionalServicios: StudioTemplate = {
  id: "servicios-formulario",
  name: "Servicios",
  giro: "profesional",
  types: ["form"],
  description:
    "Tus servicios arriba, cada uno con lo que incluye, y el formulario para pedir informes justo debajo.",
  design: pageDesign(servicesStyle, [
    section("t-pro-s-hero", "1", [[contentTitleBlock("t-pro-s-title")]], {
      paddingTop: 56,
      paddingBottom: 8,
    }),
    section(
      "t-pro-s-services",
      "1",
      [
        [
          heading("t-pro-s-h2", "Servicios", 2),
          {
            id: "t-pro-s-list",
            kind: "features",
            layout: "list",
            iconStyle: "circle",
            items: [
              {
                icon: "star",
                title: "Tu primer servicio",
                text: "Qué incluye y desde cuánto cuesta. Cámbialo por el tuyo.",
              },
              {
                icon: "calendar",
                title: "Tu segundo servicio",
                text: "Cuánto dura o cada cuánto se hace. Cámbialo por el tuyo.",
              },
              {
                icon: "shield",
                title: "Tu tercer servicio",
                text: "Para quién es. Bórralo si no lo necesitas.",
              },
            ],
          },
        ],
      ],
      { paddingTop: 16, paddingBottom: 24, gap: 16, align: "start" },
    ),
    section(
      "t-pro-s-form",
      "1",
      [
        [
          heading("t-pro-s-h3", "Pide informes", 2),
          paragraph(
            "t-pro-s-p3",
            "Déjanos tus datos y cuéntanos qué necesitas.",
          ),
          leadFormBlock("t-pro-s-form-block", "boxed", "full"),
        ],
      ],
      {
        card: true,
        paddingTop: 28,
        paddingBottom: 36,
        gap: 14,
        align: "start",
      },
    ),
  ]),
};

/** A practice's services and fees as a plain list, with a button to ask
 * by WhatsApp (Primeros pasos: professionals' services go to Catálogo). */
export const profesionalCatalog: StudioTemplate = {
  id: "profesional-servicios-lista",
  name: "Servicios y honorarios",
  giro: "profesional",
  types: ["catalog"],
  description:
    "Tus servicios con su precio en una lista sobria, con un botón para consultar por WhatsApp.",
  design: pageDesign(linksStyle, [
    section(
      "t-pro-c-hero",
      "1",
      [
        [
          heading("t-pro-c-h1", "Servicios", 1),
          contentTitleBlock("t-pro-c-title"),
        ],
      ],
      { paddingTop: 56, paddingBottom: 16 },
    ),
    section(
      "t-pro-c-catalog",
      "1",
      [
        [
          catalogBlock("t-pro-c-catalog-block", {
            layout: "list",
            columns: 1,
            descriptions: true,
            priceStyle: "plain",
          }),
        ],
      ],
      { card: true, paddingTop: 16, paddingBottom: 32 },
    ),
    section(
      "t-pro-c-cta",
      "1",
      [[button("t-pro-c-btn", "Consulta por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48 },
    ),
  ]),
};

export const profesionalTemplates: StudioTemplate[] = [
  profesionalLinks,
  profesionalBio,
  profesionalServicios,
  profesionalForm,
  profesionalDocument,
  profesionalCatalog,
];
