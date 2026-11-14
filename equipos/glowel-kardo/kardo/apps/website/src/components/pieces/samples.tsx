import type { PieceId } from "@/content/pieces";
import {
  CafeDeOlla,
  Cappuccino,
  ConchaSmall,
  Espresso,
} from "../kardo-page/illustrations";
import type { PageContent } from "../kardo-page/KardoPage";
import type { PageTheme } from "../kardo-page/theme";
import { type Design, defaultDesign } from "../personalizar/design";

/*
  The made-up businesses of the pieces block: the Stand's design (drawn
  with the templates of /personalizar/) and, for every piece, the page it
  opens (the port of the Resolver's templates). The Card, the Magnet and
  the Sticker match the businesses of their print artwork (arte-<id>).
  None is a real brand or a Kardo customer.
*/

function mark(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const cafeMark = mark(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="#E9E2D0" stroke-width="1.6"><path d="M20 3 37 20 20 37 3 20Z"/><path d="M20 10 30 20 20 30 10 20Z"/><path d="M20 3v34M3 20h34"/></g></svg>',
);

function design(patch: {
  piece: PieceId;
  brand: Partial<Design["brand"]>;
  texts?: Partial<{
    [K in keyof Design["texts"]]: Partial<Design["texts"][K]>;
  }>;
}): Design {
  const base = defaultDesign;
  return {
    piece: patch.piece,
    brand: { ...base.brand, ...patch.brand },
    texts: {
      stand: { ...base.texts.stand, ...patch.texts?.stand },
      card: { ...base.texts.card, ...patch.texts?.card },
      magnet: { ...base.texts.magnet, ...patch.texts?.magnet },
      sticker: { ...base.texts.sticker, ...patch.texts?.sticker },
    },
  };
}

export const sampleDesigns: Pick<Record<PieceId, Design>, "stand"> = {
  stand: design({
    piece: "stand",
    brand: {
      name: "Café Central",
      upper: true,
      font: "geist",
      background: "#1E2A32",
      accent: "#4EC3CE",
      logo: cafeMark,
      logoRatio: 1,
      logoScale: 0.62,
    },
    texts: {
      stand: {
        tagline: "Café de especialidad",
        call: "Acerca tu celular o escanea el menú",
      },
    },
  }),
};

export const samplePages: Record<
  PieceId,
  { content: PageContent; theme: PageTheme }
> = {
  stand: {
    content: {
      type: "menu",
      title: "Café Central",
      description: "Café de especialidad y pan de la casa.",
      currency: "MXN",
      sections: [
        {
          id: "cafe",
          name: "Café",
          items: [
            {
              id: "espresso",
              name: "Espresso",
              description: "Café de Veracruz, tueste medio.",
              price: 38,
              image: <Espresso />,
            },
            {
              id: "capuchino",
              name: "Capuchino",
              description: "Con leche entera o de avena.",
              price: 52,
              image: <Cappuccino />,
            },
            {
              id: "olla",
              name: "Café de olla",
              description: "Con piloncillo y canela.",
              price: 45,
              image: <CafeDeOlla />,
            },
          ],
        },
        {
          id: "pan",
          name: "Para acompañar",
          items: [
            {
              id: "concha",
              name: "Concha",
              description: "Vainilla o chocolate.",
              price: 28,
              image: <ConchaSmall />,
              availability: { soldOut: true, remaining: null },
            },
          ],
        },
      ],
    },
    theme: {
      background: { kind: "solid", color: "#1E2A32" },
      surface: "dark",
      accent: "#4EC3CE",
      buttonStyle: "pill",
      font: "sans",
    },
  },
  card: {
    content: {
      type: "profile",
      displayName: "Javier Arista",
      headline: "Arista & Asociados, arquitectura",
      biography: "Casas, locales y oficinas.",
      links: [
        "Escríbeme por WhatsApp",
        "Ver proyectos",
        "Cómo llegar al despacho",
      ],
    },
    theme: {
      background: { kind: "solid", color: "#F4F1EA" },
      surface: "light",
      accent: "#2A2A2A",
      buttonStyle: "square",
      font: "sans",
    },
  },
  magnet: {
    content: {
      type: "links",
      title: "Veterinaria & Urgencias",
      description: "Atención las 24 horas para perros y gatos.",
      links: [
        "Pedir una urgencia por WhatsApp",
        "Servicios y precios",
        "Cómo llegar",
      ],
    },
    theme: {
      background: { kind: "solid", color: "#EEF5F3" },
      surface: "light",
      accent: "#1E7A60",
      buttonStyle: "rounded",
      font: "rounded",
    },
  },
  sticker: {
    content: {
      type: "menu",
      title: "La Terraza",
      description: "Cocina de temporada.",
      currency: "MXN",
      sections: [
        {
          id: "entradas",
          name: "Entradas",
          items: [
            {
              id: "guacamole",
              name: "Guacamole de la casa",
              description: "Aguacate, chile serrano y totopos.",
              price: 145,
            },
            {
              id: "tostadas",
              name: "Tostadas de atún",
              description: "Atún aleta amarilla y mayonesa de chipotle.",
              price: 189,
              availability: { soldOut: true, remaining: null },
            },
            {
              id: "esquites",
              name: "Esquites tatemados",
              description: "Elote, mayonesa de limón y chile piquín.",
              price: 95,
            },
          ],
        },
        {
          id: "fuertes",
          name: "Platos fuertes",
          items: [
            {
              id: "tacos",
              name: "Tacos de pescado",
              description: "Estilo Ensenada, con col morada.",
              price: 210,
            },
          ],
        },
      ],
    },
    theme: {
      background: { kind: "solid", color: "#1F2B33" },
      surface: "dark",
      accent: "#8CE0DC",
      buttonStyle: "pill",
      font: "sans",
    },
  },
};
