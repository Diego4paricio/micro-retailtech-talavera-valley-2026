import type { DesignStyle } from "@kardo/contracts";
import { TEMPLATE_WHATSAPP } from "../../model/business-contact.js";
import {
  button,
  contentLinksBlock,
  contentTitleBlock,
  divider,
  heading,
  pageDesign,
  paragraph,
  profileHeaderBlock,
  section,
} from "../blocks.js";
import type { StudioTemplate } from "../types.js";

const whatsapp = TEMPLATE_WHATSAPP;

const base = {
  palette: {
    background: "#f4f7f2",
    surface: "#ffffff",
    text: "#1e2a22",
    muted: "#6f7d72",
    accent: "#3d7a5c",
  },
  fonts: { heading: "rounded", body: "dm-sans" },
  radius: 16,
  buttonStyle: "soft",
  buttonShape: "rounded",
  shadow: "soft",
  maxWidth: 640,
  ambient: { kind: "auto" } as const,
  pagePadding: 20,
} as const;

const linksStyle: DesignStyle = {
  ...base,
  background: { kind: "solid", color: "#f4f7f2" },
};

const bioStyle: DesignStyle = {
  ...base,
  background: {
    kind: "gradient",
    color: "#f4f7f2",
    colorTo: "#e1ede4",
    angle: 150,
  },
};

export const escuelaLinks: StudioTemplate = {
  id: "escuela-informacion-contacto",
  name: "Información y contacto",
  giro: "escuela",
  types: ["links"],
  description:
    "Página de enlaces amable en tonos verdes suaves, con un bloque de dos columnas para programas e inscripciones.",
  design: pageDesign(linksStyle, [
    section(
      "t-esc-l-hero",
      "1",
      [
        [
          heading("t-esc-l-h1", "Bienvenido a nuestra comunidad educativa", 1),
          contentTitleBlock("t-esc-l-title"),
          paragraph(
            "t-esc-l-tag",
            "Información para familias, estudiantes y quienes quieren conocernos.",
          ),
        ],
      ],
      { paddingTop: 64, paddingBottom: 36 },
    ),
    section(
      "t-esc-l-links",
      "1",
      [
        [
          heading("t-esc-l-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-esc-l-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-esc-l-info",
      "1-1",
      [
        [
          heading("t-esc-l-h3a", "Programas", 3),
          paragraph(
            "t-esc-l-p3a",
            "Conoce los programas y niveles que ofrecemos.",
          ),
        ],
        [
          heading("t-esc-l-h3b", "Inscripciones", 3),
          paragraph(
            "t-esc-l-p3b",
            "Escríbenos por WhatsApp para resolver tus dudas sobre el proceso.",
          ),
        ],
      ],
      { align: "start" },
    ),
    section(
      "t-esc-l-cta",
      "1",
      [
        [
          divider("t-esc-l-div"),
          paragraph(
            "t-esc-l-p4",
            "Escríbenos por WhatsApp, con gusto te apoyamos.",
          ),
          button("t-esc-l-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 40, paddingBottom: 56 },
    ),
  ]),
};

export const escuelaBio: StudioTemplate = {
  id: "escuela-perfil",
  name: "Perfil educativo",
  giro: "escuela",
  types: ["profile", "linkpage"],
  description:
    "Perfil amable en tonos verdes suaves, funciona igual como bio de redes o como Página de enlaces.",
  design: pageDesign(bioStyle, [
    section(
      "t-esc-b-header",
      "1",
      [
        [
          profileHeaderBlock("t-esc-b-header-block", "stacked", "rounded"),
          paragraph(
            "t-esc-b-bio",
            "Formación cercana, pensada para acompañar a cada estudiante.",
          ),
        ],
      ],
      { paddingTop: 56, paddingBottom: 24 },
    ),
    section(
      "t-esc-b-links",
      "1",
      [
        [
          heading("t-esc-b-h2", "Nuestros enlaces", 2),
          contentLinksBlock("t-esc-b-content-links", "list"),
        ],
      ],
      { card: true },
    ),
    section(
      "t-esc-b-cta",
      "1",
      [
        [
          paragraph(
            "t-esc-b-p3",
            "Escríbenos por WhatsApp para conocer más sobre nuestros programas.",
          ),
          button("t-esc-b-btn", "Escríbenos por WhatsApp", whatsapp),
        ],
      ],
      { paddingTop: 32, paddingBottom: 48 },
    ),
  ]),
};

export const escuelaTemplates: StudioTemplate[] = [escuelaLinks, escuelaBio];
