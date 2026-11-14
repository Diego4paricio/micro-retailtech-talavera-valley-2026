import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  contentLinksBlock,
  contentTitleBlock,
  divider,
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
    background: "#f6f5f1",
    surface: "#ffffff",
    text: "#1c2b36",
    muted: "#74838d",
    accent: "#a9822f",
  },
  fonts: { heading: "geist", body: "dm-sans" },
  radius: 12,
  buttonStyle: "solid",
  buttonShape: "rounded",
  shadow: "soft",
  maxWidth: 720,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#f6f5f1" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#f6f5f1",
    colorTo: "#e9e4d6",
    angle: 150,
  },
};

export const inmobiliariaLinks: StudioTemplate = {
  id: "inmobiliaria-propiedades-contacto",
  name: "Propiedades y contacto",
  giro: "inmobiliaria",
  types: ["links"],
  description:
    "Página de enlaces corporativa en tonos arena y bronce, ancha para leerse bien en escritorio.",
  design: pageDesign(linksStyle, [
    section(
      "t-inm-l-hero",
      "1",
      [
        [
          heading("t-inm-l-h1", "Encuentra tu próximo espacio", 1),
          contentTitleBlock("t-inm-l-title"),
          paragraph(
            "t-inm-l-tag",
            "Acompañamiento cercano en cada paso de tu búsqueda.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-inm-l-links",
      "1",
      [
        [
          heading("t-inm-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-inm-l-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-inm-l-info",
      "1-1",
      [
        [
          heading("t-inm-l-h3a", "Zonas", 3),
          paragraph(
            "t-inm-l-p3a",
            "Trabajamos en distintas zonas de la ciudad.",
          ),
        ],
        [
          heading("t-inm-l-h3b", "Asesoría", 3),
          paragraph(
            "t-inm-l-p3b",
            "Te acompañamos a resolver tus dudas en cada visita.",
          ),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-inm-l-cta",
      "1",
      [
        [
          divider("t-inm-l-div"),
          paragraph(
            "t-inm-l-p4",
            "Escríbenos por WhatsApp y con gusto te asesoramos.",
          ),
          button("t-inm-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const inmobiliariaBio: StudioTemplate = {
  id: "inmobiliaria-perfil",
  name: "Perfil profesional inmobiliario",
  giro: "inmobiliaria",
  types: ["profile"],
  description:
    "Perfil profesional sobrio en tonos arena y bronce, pensado para un asesor o agencia.",
  design: pageDesign(bioStyle, [
    section(
      "t-inm-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-inm-b-header-block", "stacked", "circle"),
          paragraph("t-inm-b-bio", "Asesoría inmobiliaria cercana y honesta."),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-inm-b-links",
      "1",
      [
        [
          heading("t-inm-b-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-inm-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-inm-b-cta",
      "1",
      [
        [
          paragraph(
            "t-inm-b-p3",
            "Escríbenos por WhatsApp para platicar sobre tu próximo espacio.",
          ),
          button("t-inm-b-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const inmobiliariaForm: StudioTemplate = {
  id: "inmobiliaria-formulario",
  name: "Formulario para prospectos",
  giro: "inmobiliaria",
  types: ["form"],
  description:
    "Formulario de contacto en tarjeta, en los mismos tonos arena y bronce.",
  design: pageDesign(linksStyle, [
    section(
      "t-inm-f-hero",
      "1",
      [
        [
          heading("t-inm-f-h1", "Cuéntanos qué buscas", 1),
          contentTitleBlock("t-inm-f-title"),
          paragraph(
            "t-inm-f-tag",
            "Déjanos tus datos y te contactamos para agendar una visita.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-inm-f-form",
      "1",
      [[leadFormBlock("t-inm-f-form-block", "card", "full")]],
      { paddingTop: 16, paddingBottom: 40 },
    ),
    section(
      "t-inm-f-cta",
      "1",
      [
        [
          divider("t-inm-f-div"),
          paragraph(
            "t-inm-f-p",
            "También puedes escribirnos directamente por WhatsApp.",
          ),
          button("t-inm-f-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const inmobiliariaTemplates: StudioTemplate[] = [
  inmobiliariaLinks,
  inmobiliariaBio,
  inmobiliariaForm,
];
