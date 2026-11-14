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
  imageMainBlock,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

const base = {
  palette: {
    background: "#f6f5f2",
    surface: "#ffffff",
    text: "#1c1c1c",
    muted: "#767676",
    accent: "#1f6f5c",
  },
  fonts: { heading: "space-grotesk", body: "dm-sans" },
  radius: 8,
  buttonStyle: "solid",
  buttonShape: "square",
  shadow: "soft",
  maxWidth: 680,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#f6f5f2" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#f6f5f2",
    colorTo: "#e3ece8",
    angle: 145,
  },
};

export const tiendaLinks: StudioTemplate = {
  id: "tienda-catalogo-contacto",
  name: "Catálogo y contacto",
  giro: "tienda",
  types: ["links"],
  description:
    "Página de enlaces moderna y directa, esquinas cuadradas y un bloque de dos columnas para horario y contacto.",
  design: pageDesign(linksStyle, [
    section(
      "t-tnd-l-hero",
      "1",
      [
        [
          heading("t-tnd-l-h1", "Bienvenido a la tienda", 1),
          contentTitleBlock("t-tnd-l-title"),
          paragraph(
            "t-tnd-l-tag",
            "Encuentra nuestros productos y entérate de las novedades.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-tnd-l-links",
      "1",
      [
        [
          heading("t-tnd-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-tnd-l-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-tnd-l-info",
      "2-1",
      [
        [
          heading("t-tnd-l-h3a", "Cómo pedir", 3),
          paragraph(
            "t-tnd-l-p3a",
            "Escríbenos por WhatsApp para conocer más sobre nuestros productos.",
          ),
        ],
        [
          heading("t-tnd-l-h3b", "Horario", 3),
          paragraph("t-tnd-l-p3b", "Atendemos de lunes a sábado."),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-tnd-l-cta",
      "1",
      [
        [
          divider("t-tnd-l-div"),
          paragraph(
            "t-tnd-l-p4",
            "¿Buscas algo en especial? Pregúntanos por WhatsApp.",
          ),
          button("t-tnd-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const tiendaBio: StudioTemplate = {
  id: "tienda-perfil",
  name: "Perfil de tienda",
  giro: "tienda",
  types: ["profile", "linkpage"],
  description:
    "Perfil minimalista que funciona igual como bio de redes o como Página de enlaces, con cabecera y enlaces en tarjeta.",
  design: pageDesign(bioStyle, [
    section(
      "t-tnd-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-tnd-b-header-block", "stacked", "rounded"),
          paragraph("t-tnd-b-bio", "Todo lo que buscas, en un solo lugar."),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-tnd-b-links",
      "1",
      [
        [
          heading("t-tnd-b-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-tnd-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-tnd-b-cta",
      "1",
      [
        [
          paragraph(
            "t-tnd-b-p3",
            "Para pedidos o dudas, escríbenos por WhatsApp.",
          ),
          button("t-tnd-b-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const tiendaCatalog: StudioTemplate = {
  id: "tienda-catalogo",
  name: "Catálogo de la tienda",
  giro: "tienda",
  types: ["catalog"],
  description:
    "Cuadrícula de dos columnas para tus productos, con esquinas rectas y precios destacados.",
  design: pageDesign(linksStyle, [
    section(
      "t-tnd-c-hero",
      "1",
      [
        [
          heading("t-tnd-c-h1", "Nuestro catálogo", 1),
          contentTitleBlock("t-tnd-c-title"),
          paragraph(
            "t-tnd-c-tag",
            "Descubre nuestros productos y entérate de las novedades.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-tnd-c-catalog",
      "1",
      [
        [
          catalogBlock("t-tnd-c-catalog-block", {
            layout: "grid",
            columns: 2,
            imageAspect: "1:1",
            descriptions: true,
            priceStyle: "accent",
            buttonLabel: "Ver más",
          }),
        ],
      ],
      { paddingTop: 24, paddingBottom: 40 },
    ),
    section(
      "t-tnd-c-cta",
      "1",
      [
        [
          divider("t-tnd-c-div"),
          paragraph(
            "t-tnd-c-p",
            "¿Buscas algo en especial? Pregúntanos por WhatsApp.",
          ),
          button("t-tnd-c-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const tiendaImage: StudioTemplate = {
  id: "tienda-imagen",
  name: "Foto de portada",
  giro: "tienda",
  types: ["image"],
  description:
    "Una sola foto a pantalla completa dentro de una tarjeta, ideal para una promoción o una novedad.",
  design: pageDesign(linksStyle, [
    section(
      "t-tnd-i-hero",
      "1",
      [[heading("t-tnd-i-h1", "Lo nuevo de la tienda", 1)]],
      { paddingTop: 56, paddingBottom: 16, align: "center" },
    ),
    section(
      "t-tnd-i-image",
      "1",
      [
        [
          imageMainBlock("t-tnd-i-image-block", {
            fit: "cover",
            frame: "card",
            aspect: "4:3",
          }),
        ],
      ],
      { paddingTop: 8, paddingBottom: 40 },
    ),
    section(
      "t-tnd-i-cta",
      "1",
      [
        [
          paragraph("t-tnd-i-p", "Escríbenos por WhatsApp para más detalles."),
          button("t-tnd-i-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 24, paddingBottom: 48 },
    ),
  ]),
};

export const tiendaDocument: StudioTemplate = {
  id: "tienda-catalogo-pdf",
  // Giro's own word (relevo 37 C9c), not the generic «Catálogo en PDF»
  // that read wrong for a florería's or a papelería's PDF too.
  name: "Productos en PDF",
  giro: "tienda",
  types: ["document"],
  description:
    "Tu catálogo en PDF, página por página, con un botón para preguntar por WhatsApp.",
  design: pageDesign(linksStyle, [
    section(
      "t-tnd-d-hero",
      "1",
      [
        [
          heading("t-tnd-d-h1", "Nuestro catálogo", 1),
          contentTitleBlock("t-tnd-d-title"),
        ],
      ],
      { paddingTop: 56, paddingBottom: 16 },
    ),
    section(
      "t-tnd-d-pages",
      "1",
      [[documentPagesBlock("t-tnd-d-pages-block", "shadow", 24)]],
      { paddingTop: 8, paddingBottom: 32 },
    ),
    section(
      "t-tnd-d-cta",
      "1",
      [[button("t-tnd-d-btn", "Pregunta por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48 },
    ),
  ]),
};

export const tiendaTemplates: StudioTemplate[] = [
  tiendaLinks,
  tiendaBio,
  tiendaCatalog,
  tiendaImage,
  tiendaDocument,
];
