import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  contentLinksBlock,
  contentSocialsBlock,
  contentTitleBlock,
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
    background: "#fbf1e6",
    surface: "#ffffff",
    text: "#2b1c14",
    muted: "#8a7362",
    accent: "#c1481d",
  },
  fonts: { heading: "playfair", body: "lora" },
  radius: 20,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "soft",
  maxWidth: 640,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#fbf1e6" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#fbf1e6",
    colorTo: "#f4d9bd",
    angle: 160,
  },
};

const onDark = { color: "background" as const };

export const restauranteLinks: StudioTemplate = {
  id: "restaurante-carta-contacto",
  name: "Carta y contacto",
  giro: "restaurante",
  types: ["links"],
  description:
    "Página de enlaces cálida en tonos terracota, con la carta y el contacto por WhatsApp a la vista.",
  design: pageDesign(linksStyle, [
    section(
      "t-rst-l-hero",
      "1",
      [
        [
          heading("t-rst-l-h1", "Bienvenido", 1),
          contentTitleBlock("t-rst-l-title"),
          paragraph(
            "t-rst-l-tag",
            "Cocina de temporada preparada cada día con ingredientes frescos.",
          ),
        ],
      ],
      { paddingTop: 72, paddingBottom: 40 },
    ),
    section(
      "t-rst-l-links",
      "1",
      [
        [
          heading("t-rst-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-rst-l-content-links", "list"),
        ],
      ],
      { card: true, paddingTop: 32, paddingBottom: 32 },
    ),
    section(
      "t-rst-l-highlights",
      "1-1-1",
      [
        [
          heading("t-rst-l-h3a", "Horario", 3),
          paragraph("t-rst-l-p3a", "Martes a domingo, de la comida a la cena."),
        ],
        [
          heading("t-rst-l-h3b", "Ubicación", 3),
          paragraph(
            "t-rst-l-p3b",
            "En el corazón de la ciudad, fácil de encontrar.",
          ),
        ],
        [
          heading("t-rst-l-h3c", "Contacto", 3),
          paragraph(
            "t-rst-l-p3c",
            "Escríbenos por WhatsApp para cualquier duda.",
          ),
        ],
      ],
      { paddingTop: 40, paddingBottom: 40, align: "start" },
    ),
    section(
      "t-rst-l-cta",
      "1",
      [
        [
          heading("t-rst-l-h4", "Escríbenos por WhatsApp", 2, onDark),
          paragraph(
            "t-rst-l-p4",
            "Con gusto resolvemos tus preguntas sobre el menú y el lugar.",
            onDark,
          ),
          button("t-rst-l-btn", "Escríbenos por WhatsApp", whatsapp, "primary"),
        ],
      ],
      {
        background: {
          kind: "gradient",
          color: "#2b1c14",
          colorTo: "#c1481d",
          angle: 135,
        },
        paddingTop: 56,
        paddingBottom: 56,
      },
    ),
  ]),
};

export const restauranteBio: StudioTemplate = {
  id: "restaurante-perfil-redes",
  name: "Perfil para redes",
  giro: "restaurante",
  types: ["linkpage"],
  description:
    "Página de perfil tipo Linktree para redes, con degradado cálido y redes sociales al pie.",
  design: pageDesign(bioStyle, [
    section(
      "t-rst-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-rst-b-header-block", "stacked", "circle"),
          paragraph(
            "t-rst-b-bio",
            "Sabores de temporada y buena compañía, todos los días de la semana.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-rst-b-links",
      "1",
      [
        [
          heading("t-rst-b-h2", "Explora", 2),
          contentLinksBlock("t-rst-b-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-rst-b-socials",
      "1",
      [
        [
          heading("t-rst-b-h3", "Síguenos", 3),
          contentSocialsBlock("t-rst-b-soc", "medium"),
        ],
      ],
      { paddingTop: 24, paddingBottom: 24 },
    ),
    section(
      "t-rst-b-cta",
      "1-1",
      [
        [
          heading("t-rst-b-h4", "Escríbenos por WhatsApp", 3),
          paragraph(
            "t-rst-b-p4",
            "Para dudas sobre el menú o el lugar, mándanos un mensaje.",
          ),
        ],
        [button("t-rst-b-btn", "Escríbenos por WhatsApp", whatsapp, "primary")],
      ],
      { align: "start" },
    ),
  ]),
};

export const restauranteMenu: StudioTemplate = {
  id: "restaurante-menu",
  name: "Menú del restaurante",
  giro: "restaurante",
  types: ["menu"],
  description:
    "Menú en tarjetas con fotos de los platillos y precios destacados, en los mismos tonos terracota de la carta.",
  design: pageDesign(linksStyle, [
    section(
      "t-rst-m-hero",
      "1",
      [
        [
          heading("t-rst-m-h1", "Nuestro menú", 1),
          contentTitleBlock("t-rst-m-title"),
          paragraph(
            "t-rst-m-tag",
            "Platillos preparados cada día con ingredientes frescos de temporada.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-rst-m-menu",
      "1",
      [
        [
          menuBlock("t-rst-m-menu-block", {
            layout: "cards",
            photos: "small",
            photoShape: "rounded",
            descriptions: true,
            sectionStyle: "line",
            priceStyle: "accent",
          }),
        ],
      ],
      { card: true, paddingTop: 24, paddingBottom: 40 },
    ),
    section(
      "t-rst-m-cta",
      "1",
      [
        [
          paragraph(
            "t-rst-m-p",
            "Si tienes alguna duda sobre un platillo, escríbenos por WhatsApp.",
          ),
          button("t-rst-m-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

/**
 * A menu the restaurant already has, in PDF or in a photo (Primeros pasos,
 * owner 2026-10-04: «puede querer subir un PDF de su menú»). Neutral words
 * only: the business's name comes from the page's title.
 */
export const restauranteDocument: StudioTemplate = {
  id: "restaurante-menu-pdf",
  name: "Menú en PDF",
  giro: "restaurante",
  types: ["document"],
  description:
    "Tu menú en PDF, página por página en tarjetas, en los tonos terracota de la carta.",
  design: pageDesign(linksStyle, [
    section(
      "t-rst-d-hero",
      "1",
      [
        [
          heading("t-rst-d-h1", "Nuestro menú", 1),
          contentTitleBlock("t-rst-d-title"),
        ],
      ],
      { paddingTop: 56, paddingBottom: 16, align: "center" },
    ),
    section(
      "t-rst-d-pages",
      "1",
      [[documentPagesBlock("t-rst-d-pages-block", "shadow", 24)]],
      { paddingTop: 8, paddingBottom: 32 },
    ),
    section(
      "t-rst-d-cta",
      "1",
      [[button("t-rst-d-btn", "Pide por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48, align: "center" },
    ),
  ]),
};

export const restauranteImage: StudioTemplate = {
  id: "restaurante-menu-foto",
  name: "Foto del menú",
  giro: "restaurante",
  types: ["image"],
  description:
    "La foto de tu menú o tu pizarrón, completa y en grande, con tu WhatsApp abajo.",
  design: pageDesign(linksStyle, [
    section("t-rst-i-hero", "1", [[heading("t-rst-i-h1", "Nuestro menú", 1)]], {
      paddingTop: 56,
      paddingBottom: 16,
      align: "center",
    }),
    section(
      "t-rst-i-image",
      "1",
      [
        [
          imageMainBlock("t-rst-i-image-block", {
            fit: "contain",
            frame: "card",
            aspect: "auto",
          }),
        ],
      ],
      { paddingTop: 8, paddingBottom: 32 },
    ),
    section(
      "t-rst-i-cta",
      "1",
      [[button("t-rst-i-btn", "Pide por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48, align: "center" },
    ),
  ]),
};

export const restauranteTemplates: StudioTemplate[] = [
  restauranteLinks,
  restauranteBio,
  restauranteMenu,
  restauranteDocument,
  restauranteImage,
];
