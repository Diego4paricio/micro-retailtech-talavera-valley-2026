import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  canvasItem,
  canvasSection,
  contentLinksBlock,
  contentSocialsBlock,
  contentTitleBlock,
  heading,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
  shapeBlock,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

const base = {
  palette: {
    background: "#f2efe9",
    surface: "#fffdf9",
    text: "#2c2a24",
    muted: "#948c7c",
    accent: "#1f6f6a",
  },
  fonts: { heading: "playfair", body: "dm-sans" },
  radius: 20,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "soft",
  maxWidth: 660,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#f2efe9" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#f2efe9",
    colorTo: "#dde7e2",
    angle: 150,
  },
};

const onDark = { color: "background" as const };

export const hotelLinks: StudioTemplate = {
  id: "hotel-hospedaje-contacto",
  name: "Hospedaje y contacto",
  giro: "hotel",
  types: ["links"],
  description:
    "Página de enlaces de estilo boutique en arena y verde azulado, con un cierre en degradado para el contacto.",
  design: pageDesign(linksStyle, [
    section(
      "t-htl-l-hero",
      "1",
      [
        [
          heading("t-htl-l-h1", "Bienvenido a tu estancia", 1),
          contentTitleBlock("t-htl-l-title"),
          paragraph(
            "t-htl-l-tag",
            "Un espacio pensado para que descanses y te sientas como en casa.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-htl-l-links",
      "1",
      [
        [
          heading("t-htl-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-htl-l-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-htl-l-highlights",
      "1-1-1",
      [
        [
          heading("t-htl-l-h3a", "Habitaciones", 3),
          paragraph(
            "t-htl-l-p3a",
            "Espacios cómodos, pensados para tu descanso.",
          ),
        ],
        [
          heading("t-htl-l-h3b", "Ubicación", 3),
          paragraph(
            "t-htl-l-p3b",
            "Cerca de los puntos más visitados de la zona.",
          ),
        ],
        [
          heading("t-htl-l-h3c", "Atención", 3),
          paragraph(
            "t-htl-l-p3c",
            "Estamos para apoyarte durante toda tu estancia.",
          ),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-htl-l-cta",
      "1",
      [
        [
          heading("t-htl-l-h4", "Escríbenos por WhatsApp", 2, onDark),
          paragraph(
            "t-htl-l-p4",
            "Para dudas sobre tu estancia, mándanos un mensaje.",
            onDark,
          ),
          button("t-htl-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      {
        background: {
          kind: "gradient",
          color: "#1f6f6a",
          colorTo: "#2c2a24",
          angle: 135,
        },
        paddingTop: 56,
        paddingBottom: 56,
      },
    ),
  ]),
};

export const hotelBio: StudioTemplate = {
  id: "hotel-perfil-redes",
  name: "Perfil del hotel",
  giro: "hotel",
  types: ["linkpage"],
  description:
    "Perfil tipo Linktree en tonos arena y verde azulado, con redes sociales al pie.",
  design: pageDesign(bioStyle, [
    section(
      "t-htl-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-htl-b-header-block", "stacked", "circle"),
          paragraph(
            "t-htl-b-bio",
            "Tu descanso, en un espacio pensado para ti.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-htl-b-links",
      "1",
      [
        [
          heading("t-htl-b-h2", "Explora", 2),
          contentLinksBlock("t-htl-b-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-htl-b-socials",
      "1",
      [
        [
          heading("t-htl-b-h3", "Síguenos", 3),
          contentSocialsBlock("t-htl-b-soc", "medium"),
        ],
      ],
      { paddingTop: 24, paddingBottom: 24 },
    ),
    section(
      "t-htl-b-cta",
      "1-1",
      [
        [
          heading("t-htl-b-h4", "Escríbenos por WhatsApp", 3),
          paragraph(
            "t-htl-b-p4",
            "Con gusto resolvemos tus dudas sobre tu próxima estancia.",
          ),
        ],
        [button("t-htl-b-btn", "Escríbenos por WhatsApp", whatsapp)],
      ],
      { align: "start" },
    ),
  ]),
};

/**
 * A Canva-style cover: a canvas section with the profile header (the
 * business's own photo and name) and a decorative arch behind it, instead of
 * a plain stacked hero.
 */
export const hotelLinkpageCover: StudioTemplate = {
  id: "hotel-portada-lienzo",
  name: "Portada de espacio libre boutique",
  giro: "hotel",
  types: ["linkpage"],
  description:
    "Portada de espacio libre con un arco decorativo y tu foto de perfil, en los tonos arena del hotel.",
  design: pageDesign({ ...bioStyle, pagePadding: 20 }, [
    canvasSection(
      "t-htl-p-hero",
      540,
      [
        canvasItem(
          shapeBlock("t-htl-p-shape1", "arch", "surface", {
            stroke: "accent",
            strokeWidth: 2,
          }),
          75,
          -20,
          240,
          { h: 320 },
        ),
        canvasItem(
          heading("t-htl-p-h1", "Bienvenido a tu estancia", 1),
          24,
          40,
          342,
        ),
        canvasItem(
          profileHeaderBlock("t-htl-p-profile", "stacked", "circle"),
          24,
          280,
          342,
        ),
      ],
      { kind: "solid", color: "#f2efe9" },
    ),
    section(
      "t-htl-p-socials",
      "1",
      [
        [
          heading("t-htl-p-h3", "Síguenos", 3),
          contentSocialsBlock("t-htl-p-soc", "medium"),
        ],
      ],
      { paddingTop: 24, paddingBottom: 12 },
    ),
    section(
      "t-htl-p-links",
      "1",
      [
        [
          heading("t-htl-p-h2", "Explora", 2),
          contentLinksBlock("t-htl-p-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-htl-p-cta",
      "1-1",
      [
        [
          heading("t-htl-p-h4", "Escríbenos por WhatsApp", 3),
          paragraph("t-htl-p-p4", "Con gusto resolvemos tus dudas."),
        ],
        [button("t-htl-p-btn", "Escríbenos por WhatsApp", whatsapp)],
      ],
      { align: "start" },
    ),
  ]),
};

export const hotelTemplates: StudioTemplate[] = [
  hotelLinks,
  hotelBio,
  hotelLinkpageCover,
];
