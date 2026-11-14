import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  canvasItem,
  canvasSection,
  catalogBlock,
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
    background: "#fdf2f6",
    surface: "#ffffff",
    text: "#3d2b30",
    muted: "#a98a95",
    accent: "#c46b8f",
  },
  fonts: { heading: "lora", body: "dm-sans" },
  radius: 24,
  buttonStyle: "soft",
  buttonShape: "pill",
  shadow: "soft",
  maxWidth: 620,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#fdf2f6" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#fdf2f6",
    colorTo: "#f6d9e4",
    angle: 160,
  },
};

const onDark = { color: "background" as const };

export const floreriaLinks: StudioTemplate = {
  id: "floreria-catalogo-contacto",
  name: "Catálogo floral y contacto",
  giro: "florería",
  types: ["links"],
  description:
    "Página de enlaces romántica en rosa pastel, con un cierre en degradado intenso para el contacto.",
  design: pageDesign(linksStyle, [
    section(
      "t-flo-l-hero",
      "1",
      [
        [
          heading("t-flo-l-h1", "Flores para cada ocasión", 1),
          contentTitleBlock("t-flo-l-title"),
          paragraph(
            "t-flo-l-tag",
            "Arreglos frescos hechos a mano, con cariño y detalle.",
          ),
        ],
      ],
      { paddingTop: 68, paddingBottom: 36 },
    ),
    section(
      "t-flo-l-links",
      "1",
      [
        [
          heading("t-flo-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-flo-l-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-flo-l-highlights",
      "1-1-1",
      [
        [
          heading("t-flo-l-h3a", "Arreglos", 3),
          paragraph(
            "t-flo-l-p3a",
            "Ramos, centros de mesa y detalles personalizados.",
          ),
        ],
        [
          heading("t-flo-l-h3b", "Entrega", 3),
          paragraph(
            "t-flo-l-p3b",
            "Coordina la entrega o recoge tu pedido con nosotros.",
          ),
        ],
        [
          heading("t-flo-l-h3c", "Ocasiones", 3),
          paragraph(
            "t-flo-l-p3c",
            "Cumpleaños, aniversarios y cualquier motivo para regalar flores.",
          ),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-flo-l-cta",
      "1",
      [
        [
          heading("t-flo-l-h4", "Escríbenos por WhatsApp", 2, onDark),
          paragraph(
            "t-flo-l-p4",
            "Cuéntanos qué ocasión estás celebrando y te ayudamos a elegir.",
            onDark,
          ),
          button("t-flo-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      {
        background: {
          kind: "gradient",
          color: "#c46b8f",
          colorTo: "#3d2b30",
          angle: 135,
        },
        paddingTop: 56,
        paddingBottom: 56,
      },
    ),
  ]),
};

export const floreriaBio: StudioTemplate = {
  id: "floreria-perfil-redes",
  name: "Perfil floral",
  giro: "florería",
  types: ["linkpage"],
  description:
    "Perfil tipo Linktree romántico, con degradado suave y redes sociales al pie.",
  design: pageDesign(bioStyle, [
    section(
      "t-flo-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-flo-b-header-block", "stacked", "circle"),
          paragraph(
            "t-flo-b-bio",
            "Diseños florales frescos para regalar o para ti.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-flo-b-links",
      "1",
      [
        [
          heading("t-flo-b-h2", "Explora", 2),
          contentLinksBlock("t-flo-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-flo-b-socials",
      "1",
      [
        [
          heading("t-flo-b-h3", "Síguenos", 3),
          contentSocialsBlock("t-flo-b-soc", "medium"),
        ],
      ],
      { paddingTop: 24, paddingBottom: 24 },
    ),
    section(
      "t-flo-b-cta",
      "1-1",
      [
        [
          heading("t-flo-b-h4", "Escríbenos por WhatsApp", 3),
          paragraph(
            "t-flo-b-p4",
            "Para pedidos personalizados, cuéntanos los detalles.",
          ),
        ],
        [button("t-flo-b-btn", "Escríbenos por WhatsApp", whatsapp)],
      ],
      { align: "start" },
    ),
  ]),
};

export const floreriaCatalog: StudioTemplate = {
  id: "floreria-catalogo",
  name: "Catálogo de arreglos",
  giro: "florería",
  types: ["catalog"],
  description:
    "Catálogo en tarjetas altas, pensado para fotos verticales de ramos y arreglos.",
  design: pageDesign(linksStyle, [
    section(
      "t-flo-c-hero",
      "1",
      [
        [
          heading("t-flo-c-h1", "Nuestros arreglos", 1),
          contentTitleBlock("t-flo-c-title"),
          paragraph(
            "t-flo-c-tag",
            "Ramos y arreglos frescos hechos a mano, para cada ocasión.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 24 },
    ),
    section(
      "t-flo-c-catalog",
      "1",
      [
        [
          catalogBlock("t-flo-c-catalog-block", {
            layout: "cards",
            columns: 2,
            imageAspect: "3:4",
            descriptions: true,
            priceStyle: "pill",
          }),
        ],
      ],
      { paddingTop: 24, paddingBottom: 40 },
    ),
    section(
      "t-flo-c-cta",
      "1",
      [
        [
          heading("t-flo-c-h4", "Escríbenos por WhatsApp", 2, onDark),
          paragraph(
            "t-flo-c-p4",
            "Cuéntanos qué ocasión estás celebrando y te ayudamos a elegir.",
            onDark,
          ),
          button("t-flo-c-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      {
        background: {
          kind: "gradient",
          color: "#c46b8f",
          colorTo: "#3d2b30",
          angle: 135,
        },
        paddingTop: 56,
        paddingBottom: 56,
      },
    ),
  ]),
};

/**
 * A Canva-style cover: a canvas section with two decorative shapes and the
 * page's own title placed freely, instead of a plain stacked hero. Shows off
 * the Estudio's canvas freedom right away for Enlaces.
 */
export const floreriaLinksCover: StudioTemplate = {
  id: "floreria-portada-lienzo",
  name: "Portada de espacio libre floral",
  giro: "florería",
  types: ["links"],
  description:
    "Portada de espacio libre con formas y tu título en grande, seguida de tus enlaces en tarjeta.",
  design: pageDesign({ ...linksStyle, pagePadding: 20 }, [
    canvasSection(
      "t-flo-p-hero",
      520,
      [
        canvasItem(
          shapeBlock("t-flo-p-shape1", "blob", "accent", {
            fillTo: "surface",
            angle: 135,
          }),
          -60,
          -50,
          260,
          { h: 260, r: -6 },
        ),
        canvasItem(
          shapeBlock("t-flo-p-shape2", "ellipse", "surface", {
            stroke: "accent",
            strokeWidth: 3,
          }),
          252,
          360,
          150,
          { h: 150 },
        ),
        canvasItem(
          heading("t-flo-p-h1", "Flores para cada momento", 1),
          24,
          210,
          342,
        ),
        canvasItem(contentTitleBlock("t-flo-p-title"), 24, 320, 342),
      ],
      { kind: "solid", color: "#fdf2f6" },
    ),
    section(
      "t-flo-p-links",
      "1",
      [
        [
          heading("t-flo-p-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-flo-p-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-flo-p-cta",
      "1",
      [
        [
          paragraph(
            "t-flo-p-p3",
            "Cuéntanos qué ocasión estás celebrando por WhatsApp.",
          ),
          button("t-flo-p-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const floreriaTemplates: StudioTemplate[] = [
  floreriaLinks,
  floreriaBio,
  floreriaCatalog,
  floreriaLinksCover,
];
