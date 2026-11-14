import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  contentLinksBlock,
  contentSocialsBlock,
  contentTitleBlock,
  divider,
  documentPagesBlock,
  heading,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

// A dark, vibrant palette for a nightlife and events business: the page
// background is dark, so the default (light) `palette.text` reads well
// everywhere without per block overrides.
const base = {
  palette: {
    background: "#170f22",
    surface: "#221733",
    text: "#f4eefb",
    muted: "#a996c0",
    accent: "#ffb648",
  },
  fonts: { heading: "space-grotesk", body: "poppins" },
  radius: 24,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "strong",
  maxWidth: 600,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#170f22" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#170f22",
    colorTo: "#2a1a3d",
    angle: 160,
  },
};

export const eventosLinks: StudioTemplate = {
  id: "eventos-servicios-contacto",
  name: "Servicios para tu evento",
  giro: "eventos",
  types: ["links"],
  description:
    "Página de enlaces vibrante y oscura con acentos ámbar, tres columnas para los tipos de evento.",
  design: pageDesign(linksStyle, [
    section(
      "t-evt-l-hero",
      "1",
      [
        [
          heading("t-evt-l-h1", "Hagamos de tu evento algo inolvidable", 1),
          contentTitleBlock("t-evt-l-title"),
          paragraph(
            "t-evt-l-tag",
            "Planeación y ambientación para tu celebración, con atención a cada detalle.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-evt-l-links",
      "1",
      [
        [
          heading("t-evt-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-evt-l-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-evt-l-highlights",
      "1-1-1",
      [
        [
          heading("t-evt-l-h3a", "Bodas", 3),
          paragraph("t-evt-l-p3a", "Momentos únicos, planeados con cuidado."),
        ],
        [
          heading("t-evt-l-h3b", "Fiestas", 3),
          paragraph(
            "t-evt-l-p3b",
            "Ambientación y música para cualquier celebración.",
          ),
        ],
        [
          heading("t-evt-l-h3c", "Corporativos", 3),
          paragraph("t-evt-l-p3c", "Eventos organizados de principio a fin."),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-evt-l-cta",
      "1",
      [
        [
          divider("t-evt-l-div"),
          paragraph("t-evt-l-p4", "Cuéntanos sobre tu evento por WhatsApp."),
          button("t-evt-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const eventosBio: StudioTemplate = {
  id: "eventos-perfil-redes",
  name: "Perfil de eventos",
  giro: "eventos",
  types: ["linkpage"],
  description:
    "Perfil tipo Linktree oscuro y vibrante, con redes sociales grandes al pie.",
  design: pageDesign(bioStyle, [
    section(
      "t-evt-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-evt-b-header-block", "stacked", "circle"),
          paragraph(
            "t-evt-b-bio",
            "Creamos experiencias memorables para tu celebración.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-evt-b-links",
      "1",
      [
        [
          heading("t-evt-b-h2", "Explora", 2),
          contentLinksBlock("t-evt-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-evt-b-socials",
      "1",
      [
        [
          heading("t-evt-b-h3", "Síguenos", 3),
          contentSocialsBlock("t-evt-b-soc", "large"),
        ],
      ],
      { paddingTop: 24, paddingBottom: 24 },
    ),
    section(
      "t-evt-b-cta",
      "1-1",
      [
        [
          heading("t-evt-b-h4", "Escríbenos por WhatsApp", 3),
          paragraph(
            "t-evt-b-p4",
            "Cuéntanos la fecha y el tipo de evento que tienes en mente.",
          ),
        ],
        [button("t-evt-b-btn", "Escríbenos por WhatsApp", whatsapp)],
      ],
      { align: "start" },
    ),
  ]),
};

export const eventosDocument: StudioTemplate = {
  id: "eventos-programa",
  name: "Programa del evento en PDF",
  giro: "eventos",
  types: ["document"],
  description:
    "Documento PDF con borde alrededor de cada página, en el mismo estilo oscuro y vibrante.",
  design: pageDesign(linksStyle, [
    section(
      "t-evt-d-hero",
      "1",
      [
        [
          heading("t-evt-d-h1", "El programa de tu evento", 1),
          contentTitleBlock("t-evt-d-title"),
          paragraph(
            "t-evt-d-tag",
            "Consulta aquí el itinerario completo, página por página.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-evt-d-pages",
      "1",
      [[documentPagesBlock("t-evt-d-pages-block", "border", 24)]],
      { paddingTop: 16, paddingBottom: 40 },
    ),
    section(
      "t-evt-d-cta",
      "1",
      [
        [
          divider("t-evt-d-div"),
          paragraph("t-evt-d-p", "¿Tienes dudas sobre tu evento? Escríbenos."),
          button("t-evt-d-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 56 },
    ),
  ]),
};

export const eventosTemplates: StudioTemplate[] = [
  eventosLinks,
  eventosBio,
  eventosDocument,
];
