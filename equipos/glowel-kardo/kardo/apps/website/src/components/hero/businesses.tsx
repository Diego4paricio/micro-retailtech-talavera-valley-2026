import type { ComponentType } from "react";
import {
  AristaPage,
  CifraPage,
  JacarandaPage,
  NacarPage,
  TamarindoPage,
} from "./HeroPages";
import {
  AristaMark,
  CifraMark,
  JacarandaMark,
  NacarMark,
  TamarindoMark,
} from "./logos";

/*
  The businesses the hero cycles through: the word in the title, the panel
  of that business and the page its customers open. Kardo is for any
  business, not only restaurants. The businesses, their logos and photos
  are made up for the landing. Their pages are designed the way the
  Estudio's HTML mode allows (HeroPages.tsx), and each one stands for a real
  Experience type: Catálogo, Página de enlaces, Menú, Formulario and Perfil.
  The panel shows only what it really has (checked with the panel session on
  2026-09-29): the Resumen holds its own widgets (KPIs "Accesos" and "Clics
  en acciones", "Reparto por canal", the Ranking "Touchpoints con más
  accesos"); Disponibilidad and Leads are sections of their own, drawn as
  windows over it with the columns the panel shows. Channels are NFC, QR and
  URL directa; an "Otro" Touchpoint (an ad, a map listing, an email
  signature) counts as URL directa. Numbers are examples.
*/

type ItemState = "available" | "low" | "soldOut";

/** A row of the Resumen's Ranking widget ("Touchpoints con más accesos"). */
export interface RankingRow {
  name: string;
  channel: "NFC" | "QR" | "URL directa";
  visits: number;
}

/**
 * A window of another section of the panel, drawn over the Resumen: live
 * availability (Contenido, Disponibilidad) or the Leads table (Resultados,
 * Leads), with the columns the panel shows.
 */
export type SectionWindow =
  | {
      kind: "availability";
      items: { name: string; state: ItemState; remaining?: number }[];
    }
  | {
      kind: "leads";
      rows: {
        name: string;
        touchpoint: string;
        date: string;
        status: "Nueva" | "Atendida";
      }[];
    };

export interface HeroBusiness {
  id: string;
  /** Completes "Tu …, en un solo panel." */
  word: string;
  /** The organization in the panel's switcher, and its kind. */
  org: string;
  kind: string;
  /** Its logo mark, and the colors of its tile in the switcher. */
  Mark: ComponentType<{ className?: string }>;
  tile: { background: string; color: string };
  /** The page its customers open, and the Experience type it stands for. */
  Page: ComponentType;
  pageKind: "catalog" | "links" | "menu" | "form" | "profile";
  /** Light status bar text over a dark top of the page. */
  statusLight: boolean;
  visits: number;
  visitsDelta: number;
  clicks: number;
  clicksDelta: number;
  /** Last 14 days, for the KPI sparklines. */
  visitSeries: number[];
  clickSeries: number[];
  /** Share of visits, in percent: NFC, QR and URL directa. */
  channels: [nfc: number, qr: number, direct: number];
  ranking: RankingRow[];
  /** The section this business lives on, when it is not the Resumen. */
  section?: SectionWindow;
}

/** A deterministic 14-day series around `base`, rising by `trend`. */
function series(base: number, trend: number, seed: number): number[] {
  return Array.from({ length: 14 }, (_, day) => {
    const weekly = Math.sin(((day + seed) / 7) * Math.PI * 2) * 0.16;
    const noise = (((day * 7 + seed * 13) % 11) - 5) / 60;
    return Math.round(base * (1 + weekly + noise + (trend * day) / 13));
  });
}

export const heroBusinesses: HeroBusiness[] = [
  {
    id: "floreria",
    word: "florería",
    org: "Jacaranda",
    kind: "Taller floral",
    Mark: JacarandaMark,
    tile: { background: "#4b3470", color: "#d9c8f5" },
    Page: JacarandaPage,
    pageKind: "catalog",
    statusLight: true,
    visits: 1284,
    visitsDelta: 18,
    clicks: 356,
    clicksDelta: 12,
    visitSeries: series(40, 0.2, 1),
    clickSeries: series(11, 0.14, 4),
    channels: [22, 41, 37],
    ranking: [
      { name: "Tarjeta en cada arreglo", channel: "QR", visits: 498 },
      { name: "Anuncio en redes", channel: "URL directa", visits: 441 },
      { name: "Placa del mostrador", channel: "NFC", visits: 282 },
    ],
    section: {
      kind: "availability",
      items: [
        { name: "Ramo de temporada", state: "low", remaining: 2 },
        { name: "Caja de rosas", state: "available" },
        { name: "Suculenta en barro", state: "available" },
      ],
    },
  },
  {
    id: "salon",
    word: "salón",
    org: "Nácar",
    kind: "Estudio de uñas",
    Mark: NacarMark,
    tile: { background: "#2a201c", color: "#d8b49a" },
    Page: NacarPage,
    pageKind: "links",
    statusLight: true,
    visits: 962,
    visitsDelta: 11,
    clicks: 431,
    clicksDelta: 15,
    visitSeries: series(30, 0.12, 3),
    clickSeries: series(14, 0.16, 2),
    channels: [48, 30, 22],
    ranking: [
      { name: "Placa de recepción", channel: "NFC", visits: 412 },
      { name: "Espejo del tocador", channel: "QR", visits: 238 },
      { name: "Ficha en mapas", channel: "URL directa", visits: 156 },
    ],
  },
  {
    id: "restaurante",
    word: "restaurante",
    org: "Tamarindo",
    kind: "Cocina de barrio",
    Mark: TamarindoMark,
    tile: { background: "#b5452b", color: "#f3e9d8" },
    Page: TamarindoPage,
    pageKind: "menu",
    statusLight: false,
    visits: 3418,
    visitsDelta: 9,
    clicks: 612,
    clicksDelta: 4,
    visitSeries: series(110, 0.09, 5),
    clickSeries: series(20, 0.05, 6),
    channels: [35, 58, 7],
    ranking: [
      { name: "Barra", channel: "NFC", visits: 522 },
      { name: "Mesa 4", channel: "QR", visits: 318 },
      { name: "Mesa 7", channel: "QR", visits: 301 },
    ],
    section: {
      kind: "availability",
      items: [
        { name: "Capuchino", state: "soldOut" },
        { name: "Concha con nata", state: "low", remaining: 3 },
        { name: "Enchiladas verdes", state: "available" },
      ],
    },
  },
  {
    id: "inmobiliaria",
    word: "inmobiliaria",
    org: "Arista",
    kind: "Bienes raíces",
    Mark: AristaMark,
    tile: { background: "#1d2327", color: "#d9b779" },
    Page: AristaPage,
    pageKind: "form",
    statusLight: true,
    visits: 746,
    visitsDelta: 23,
    clicks: 188,
    clicksDelta: 19,
    visitSeries: series(22, 0.24, 2),
    clickSeries: series(6, 0.2, 5),
    channels: [12, 64, 24],
    ranking: [
      { name: "Letrero Lomas de Angelópolis", channel: "QR", visits: 286 },
      { name: "Anuncio en portales", channel: "URL directa", visits: 164 },
      { name: "Folleto Depa en el centro", channel: "QR", visits: 151 },
    ],
    section: {
      kind: "leads",
      rows: [
        {
          name: "Mariana López",
          touchpoint: "Letrero Lomas de Angelópolis",
          date: "29 sep, 12:04",
          status: "Nueva",
        },
        {
          name: "Jorge Méndez",
          touchpoint: "Letrero Lomas de Angelópolis",
          date: "29 sep, 10:41",
          status: "Nueva",
        },
        {
          name: "Lucía Torres",
          touchpoint: "Folleto Depa en el centro",
          date: "28 sep, 18:22",
          status: "Atendida",
        },
      ],
    },
  },
  {
    id: "despacho",
    word: "despacho",
    org: "Cifra",
    kind: "Despacho contable",
    Mark: CifraMark,
    tile: { background: "#1f3a5f", color: "#cfe8dc" },
    Page: CifraPage,
    pageKind: "profile",
    statusLight: false,
    visits: 418,
    visitsDelta: 6,
    clicks: 164,
    clicksDelta: 8,
    visitSeries: series(13, 0.06, 6),
    clickSeries: series(5, 0.08, 1),
    channels: [61, 14, 25],
    ranking: [
      { name: "Tarjeta de presentación", channel: "NFC", visits: 188 },
      { name: "Firma de correo", channel: "URL directa", visits: 97 },
      { name: "Folleto de servicios", channel: "QR", visits: 54 },
    ],
  },
];
