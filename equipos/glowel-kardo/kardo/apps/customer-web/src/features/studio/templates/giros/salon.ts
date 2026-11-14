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
  divider,
  heading,
  imageMainBlock,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
  shapeBlock,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

// A dark, chic palette: the page background itself is dark, so the default
// (light) `palette.text` already reads well everywhere, no per block color
// overrides needed.
const base = {
  palette: {
    background: "#1c1418",
    surface: "#241a1f",
    text: "#f3e9ec",
    muted: "#b79aa3",
    accent: "#d9a441",
  },
  fonts: { heading: "playfair", body: "system" },
  radius: 28,
  buttonStyle: "outline",
  buttonShape: "pill",
  shadow: "strong",
  maxWidth: 600,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#1c1418" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#1c1418",
    colorTo: "#2c1e22",
    angle: 160,
  },
};

export const salonLinks: StudioTemplate = {
  id: "salon-servicios-contacto",
  name: "Servicios y contacto",
  giro: "salón",
  types: ["links"],
  description:
    "Página de enlaces chic en tonos oscuros con acentos dorados, tres columnas para los servicios.",
  design: pageDesign(linksStyle, [
    section(
      "t-sal-l-hero",
      "1",
      [
        [
          heading("t-sal-l-h1", "Belleza y cuidado personal", 1),
          contentTitleBlock("t-sal-l-title"),
          paragraph(
            "t-sal-l-tag",
            "Servicios de salón pensados para que te sientas increíble.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-sal-l-links",
      "1",
      [
        [
          heading("t-sal-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-sal-l-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-sal-l-highlights",
      "1-1-1",
      [
        [
          heading("t-sal-l-h3a", "Cabello", 3),
          paragraph("t-sal-l-p3a", "Cortes, color y tratamientos a tu medida."),
        ],
        [
          heading("t-sal-l-h3b", "Uñas", 3),
          paragraph(
            "t-sal-l-p3b",
            "Manicure y pedicure con acabados impecables.",
          ),
        ],
        [
          heading("t-sal-l-h3c", "Piel", 3),
          paragraph(
            "t-sal-l-p3c",
            "Faciales y tratamientos para consentir tu piel.",
          ),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-sal-l-cta",
      "1",
      [
        [
          divider("t-sal-l-div"),
          paragraph(
            "t-sal-l-p4",
            "Escríbenos por WhatsApp para conocer nuestros servicios.",
          ),
          button("t-sal-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const salonBio: StudioTemplate = {
  id: "salon-perfil-redes",
  name: "Perfil de salón",
  giro: "salón",
  types: ["linkpage"],
  description:
    "Perfil tipo Linktree oscuro y elegante, con acentos dorados y redes sociales grandes.",
  design: pageDesign(bioStyle, [
    section(
      "t-sal-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-sal-b-header-block", "stacked", "circle"),
          paragraph("t-sal-b-bio", "Tu espacio de belleza y cuidado personal."),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-sal-b-links",
      "1",
      [
        [
          heading("t-sal-b-h2", "Explora", 2),
          contentLinksBlock("t-sal-b-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-sal-b-socials",
      "1",
      [
        [
          heading("t-sal-b-h3", "Síguenos", 3),
          contentSocialsBlock("t-sal-b-soc", "large"),
        ],
      ],
      { paddingTop: 24, paddingBottom: 24 },
    ),
    section(
      "t-sal-b-cta",
      "1-1",
      [
        [
          heading("t-sal-b-h4", "Escríbenos por WhatsApp", 3),
          paragraph("t-sal-b-p4", "Cuéntanos qué servicio te interesa."),
        ],
        [button("t-sal-b-btn", "Escríbenos por WhatsApp", whatsapp)],
      ],
      { align: "start" },
    ),
  ]),
};

export const salonImage: StudioTemplate = {
  id: "salon-imagen",
  name: "Promoción destacada",
  giro: "salón",
  types: ["image"],
  description:
    "Una foto a pantalla completa recortada en arco, con sombra marcada y fondo oscuro.",
  design: pageDesign(linksStyle, [
    section(
      "t-sal-i-hero",
      "1",
      [[heading("t-sal-i-h1", "Nuestra promoción del mes", 1)]],
      { paddingTop: 56, paddingBottom: 16, align: "center" },
    ),
    section(
      "t-sal-i-image",
      "1",
      [
        [
          imageMainBlock("t-sal-i-image-block", {
            fit: "cover",
            frame: "shadow",
            aspect: "1:1",
            mask: "arch",
          }),
        ],
      ],
      { paddingTop: 8, paddingBottom: 40 },
    ),
    section(
      "t-sal-i-cta",
      "1",
      [
        [
          paragraph("t-sal-i-p", "Agenda tu cita por WhatsApp."),
          button("t-sal-i-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 24, paddingBottom: 48 },
    ),
  ]),
};

/**
 * A Canva-style cover: a canvas section with the profile header (a real,
 * masked photo from the business's own content, never a placeholder asset)
 * and decorative shapes placed freely, instead of a plain stacked hero.
 */
export const salonProfileCover: StudioTemplate = {
  id: "salon-portada-lienzo",
  name: "Portada de espacio libre",
  giro: "salón",
  types: ["profile"],
  description:
    "Portada de espacio libre con formas doradas y tu foto de perfil en círculo, en el mismo estilo oscuro y elegante.",
  design: pageDesign({ ...bioStyle, pagePadding: 20 }, [
    canvasSection(
      "t-sal-p-hero",
      560,
      [
        canvasItem(
          shapeBlock("t-sal-p-shape1", "hexagon", "accent", {
            fillTo: "surface",
            angle: 120,
          }),
          -70,
          -60,
          240,
          { h: 240, r: 10 },
        ),
        canvasItem(
          heading("t-sal-p-h1", "Belleza y cuidado personal", 1),
          24,
          200,
          342,
        ),
        canvasItem(
          profileHeaderBlock("t-sal-p-profile", "stacked", "circle"),
          24,
          300,
          342,
        ),
      ],
      bioStyle.background,
    ),
    section(
      "t-sal-p-links",
      "1",
      [
        [
          heading("t-sal-p-h2", "Explora", 2),
          contentLinksBlock("t-sal-p-content-links", "grid"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-sal-p-cta",
      "1-1",
      [
        [
          heading("t-sal-p-h4", "Escríbenos por WhatsApp", 3),
          paragraph("t-sal-p-p4", "Cuéntanos qué servicio te interesa."),
        ],
        [button("t-sal-p-btn", "Escríbenos por WhatsApp", whatsapp)],
      ],
      { align: "start" },
    ),
  ]),
};

/**
 * The salon's services with their prices, as a list: services rarely have a
 * photo each, so no photo slots (Primeros pasos, 2026-10-04: «Descubre
 * nuestros productos» and empty photos on an estética's services).
 */
export const salonCatalog: StudioTemplate = {
  id: "salon-servicios-lista",
  name: "Lista de servicios",
  giro: "salón",
  types: ["catalog"],
  description:
    "Tus servicios y precios en lista, sobre fondo oscuro, con un botón para agendar por WhatsApp.",
  design: pageDesign(linksStyle, [
    section(
      "t-sal-c-hero",
      "1",
      [
        [
          heading("t-sal-c-h1", "Nuestros servicios", 1),
          contentTitleBlock("t-sal-c-title"),
        ],
      ],
      { paddingTop: 56, paddingBottom: 16, align: "center" },
    ),
    section(
      "t-sal-c-catalog",
      "1",
      [
        [
          catalogBlock("t-sal-c-catalog-block", {
            layout: "list",
            columns: 1,
            descriptions: true,
            priceStyle: "accent",
          }),
        ],
      ],
      { card: true, paddingTop: 16, paddingBottom: 32 },
    ),
    section(
      "t-sal-c-cta",
      "1",
      [[button("t-sal-c-btn", "Agenda por WhatsApp", whatsapp)]],
      { paddingTop: 16, paddingBottom: 48, align: "center" },
    ),
  ]),
};

export const salonTemplates: StudioTemplate[] = [
  salonLinks,
  salonBio,
  salonImage,
  salonProfileCover,
  salonCatalog,
];
