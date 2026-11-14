import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  contentLinksBlock,
  contentTitleBlock,
  divider,
  documentPagesBlock,
  heading,
  imageMainBlock,
  menuBlock,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

const base = {
  palette: {
    background: "#f5ece0",
    surface: "#fffaf3",
    text: "#3a2a1e",
    muted: "#9c8a76",
    accent: "#b06a34",
  },
  fonts: { heading: "poppins", body: "system" },
  radius: 18,
  buttonStyle: "soft",
  buttonShape: "rounded",
  shadow: "none",
  maxWidth: 600,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#f5ece0" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#f5ece0",
    colorTo: "#ead9c2",
    angle: 150,
  },
};

export const cafeLinks: StudioTemplate = {
  id: "cafe-menu-contacto",
  name: "Menú de café y contacto",
  giro: "café",
  types: ["links"],
  description:
    "Página de enlaces acogedora en tonos café con leche, con el menú y el contacto a un toque.",
  design: pageDesign(linksStyle, [
    section(
      "t-caf-l-hero",
      "1",
      [
        [
          heading("t-caf-l-h1", "Hola, qué gusto verte", 1),
          contentTitleBlock("t-caf-l-title"),
          paragraph(
            "t-caf-l-tag",
            "Café de grano recién tostado y algo dulce para acompañar.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-caf-l-links",
      "1",
      [
        [
          heading("t-caf-l-h2", "Encuéntranos aquí", 2),
          contentLinksBlock("t-caf-l-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-caf-l-info",
      "1-1",
      [
        [
          heading("t-caf-l-h3a", "Horario", 3),
          paragraph(
            "t-caf-l-p3a",
            "Abrimos temprano y cerramos al atardecer, todos los días.",
          ),
        ],
        [
          heading("t-caf-l-h3b", "Cómo llegar", 3),
          paragraph("t-caf-l-p3b", "Búscanos cerca de la plaza principal."),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-caf-l-cta",
      "1",
      [
        [
          divider("t-caf-l-div"),
          paragraph(
            "t-caf-l-p4",
            "Escríbenos por WhatsApp si tienes alguna pregunta.",
          ),
          button("t-caf-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const cafeBio: StudioTemplate = {
  id: "cafe-perfil",
  name: "Perfil de café",
  giro: "café",
  types: ["profile"],
  description:
    "Perfil sencillo tipo bio, con degradado suave y los enlaces del negocio en una tarjeta.",
  design: pageDesign(bioStyle, [
    section(
      "t-caf-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-caf-b-header-block", "stacked", "circle"),
          paragraph(
            "t-caf-b-bio",
            "Un rincón para tomarte una pausa con un buen café.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-caf-b-links",
      "1",
      [
        [
          heading("t-caf-b-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-caf-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-caf-b-cta",
      "1",
      [
        [
          paragraph(
            "t-caf-b-p3",
            "Para pedidos especiales o eventos pequeños, escríbenos por WhatsApp.",
          ),
          button("t-caf-b-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const cafeMenu: StudioTemplate = {
  id: "cafe-menu",
  name: "Menú del café",
  giro: "café",
  types: ["menu"],
  description:
    "Menú en lista, ligero y fácil de leer, con precios discretos y el mismo tono café con leche.",
  design: pageDesign(linksStyle, [
    section(
      "t-caf-m-hero",
      "1",
      [
        [
          heading("t-caf-m-h1", "Nuestro menú", 1),
          contentTitleBlock("t-caf-m-title"),
          paragraph(
            "t-caf-m-tag",
            "Café de grano recién tostado, algo dulce y opciones para llevar.",
          ),
        ],
      ],
      { paddingTop: 60, paddingBottom: 20 },
    ),
    section(
      "t-caf-m-menu",
      "1",
      [
        [
          menuBlock("t-caf-m-menu-block", {
            layout: "list",
            photos: "small",
            descriptions: true,
            sectionStyle: "pill",
            priceStyle: "plain",
          }),
        ],
      ],
      { card: true, paddingTop: 24, paddingBottom: 32 },
    ),
    section(
      "t-caf-m-cta",
      "1",
      [
        [
          divider("t-caf-m-div"),
          paragraph(
            "t-caf-m-p",
            "¿Preguntas sobre algún producto? Escríbenos por WhatsApp.",
          ),
          button("t-caf-m-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const cafeDocument: StudioTemplate = {
  id: "cafe-carta-pdf",
  name: "Carta en PDF",
  giro: "café",
  types: ["document"],
  description:
    "Tu carta en PDF con bordes finos sobre tonos café, página por página.",
  design: pageDesign(linksStyle, [
    section(
      "t-caf-d-hero",
      "1",
      [
        [
          heading("t-caf-d-h1", "Nuestra carta", 1),
          contentTitleBlock("t-caf-d-title"),
        ],
      ],
      { paddingTop: 56, paddingBottom: 16 },
    ),
    section(
      "t-caf-d-pages",
      "1",
      [[documentPagesBlock("t-caf-d-pages-block", "border", 16)]],
      { paddingTop: 8, paddingBottom: 32 },
    ),
    section(
      "t-caf-d-cta",
      "1",
      [[button("t-caf-d-btn", "Escríbenos por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48 },
    ),
  ]),
};

export const cafeImage: StudioTemplate = {
  id: "cafe-carta-foto",
  name: "Foto de la carta",
  giro: "café",
  types: ["image"],
  description:
    "La foto de tu carta o tu pizarrón en una tarjeta clara, con tu WhatsApp abajo.",
  design: pageDesign(bioStyle, [
    section(
      "t-caf-i-hero",
      "1",
      [[heading("t-caf-i-h1", "Nuestra carta", 1)]],
      { paddingTop: 56, paddingBottom: 16 },
    ),
    section(
      "t-caf-i-image",
      "1",
      [
        [
          imageMainBlock("t-caf-i-image-block", {
            fit: "contain",
            frame: "shadow",
            aspect: "auto",
          }),
        ],
      ],
      { paddingTop: 8, paddingBottom: 32 },
    ),
    section(
      "t-caf-i-cta",
      "1",
      [[button("t-caf-i-btn", "Escríbenos por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48 },
    ),
  ]),
};

export const cafeTemplates: StudioTemplate[] = [
  cafeLinks,
  cafeBio,
  cafeMenu,
  cafeDocument,
  cafeImage,
];
