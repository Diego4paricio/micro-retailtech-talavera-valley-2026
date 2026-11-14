import type { ReactNode } from "react";
import type {
  Availability,
  CatalogContent,
  MenuContent,
  PageContent,
} from "../kardo-page/KardoPage";
import type { PresetName } from "../kardo-page/theme";

/*
  Example data for two businesses of the live demo, each with one group of
  Touchpoints: a café with 20 tables (Menú and Catálogo, both with photos)
  and a florería with its counter and its shop window (Catálogo with "Ver
  más" to its WhatsApp). The same Experience also reaches an ad in social
  networks, which is its own "Otro" Touchpoint with its own address and
  visits (URL directa). Versions hold the content; availability lives
  outside them (ADR 017). The florería also has its Links page, a separate
  product that is not a Touchpoint and uses no group. Plain data: drawings
  are named here and drawn by drawings.tsx.
*/

export type Shows = "menu" | "catalog";

/** How a visit arrived, as the Resolver counts it (`src`). */
export type Channel = "nfc" | "qr" | "link";

export const channelNames: Record<Channel, string> = {
  nfc: "NFC",
  qr: "QR",
  link: "URL directa",
};

export interface ShopState {
  /** Description of the Experience named by `ShopBusiness.describes`. */
  description: string;
  prices: Record<string, number>;
  themeName: PresetName;
  shows: Shows;
}

export interface Version<State> {
  number: number;
  label: string;
  when: string;
  state: State;
}

export type DrawingKey =
  | "espresso"
  | "capuchino"
  | "olla"
  | "concha"
  | "chilaquiles"
  | "grano"
  | "taza"
  | "conchas"
  | "ramo"
  | "rosas"
  | "suculenta";

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  image: DrawingKey;
  /** The "Ver más" address: https only, like the panel asks. */
  link?: string;
}

/** What the phone shows before a page opens, in this business's words. */
export interface PhoneCopy {
  /** Where the NFC is: "a la mesa". */
  place: string;
  /** Where an NFC or QR visit came from: "desde la mesa". */
  from: string;
  /** Every point that opens the page: "Las mesas y el anuncio…". */
  samePage: string;
  /** Frame text printed under the QR, as the Estudio QR adds it. */
  qrCaption: string;
  /** The ad on the phone: the "Otro" point's button (see OtherPoint). */
  ad: { tagline: string; button: string };
  /** Caption under the phone while nothing is open. */
  idle: string;
}

/**
 * An "Otro" Touchpoint (kind other): here an ad in social networks. Like
 * every "Otro" support it is a point of its own, with its own permanent
 * address and its own visits, counted as URL directa. The Experience targets
 * it next to the group, so a publication reaches it too.
 */
export interface OtherPoint {
  kind: "other";
  name: string;
  summary: string;
}

export const socialAd: OtherPoint = {
  kind: "other",
  name: "Anuncio en redes",
  summary: "Punto Otro, con su propia dirección",
};

/** What the caption under the phone says once a page is open. */
export function arrivalCaption(copy: PhoneCopy, via: Channel): string {
  return via === "link"
    ? "Llegó por URL directa, desde el anuncio: un punto propio, con sus visitas por separado."
    : `Llegó por ${channelNames[via]}, ${copy.from}. ${copy.samePage}`;
}

/**
 * Links: the business's page with an @handle for its social networks. A
 * separate product: never a physical piece, never a QR or NFC point, never
 * in a group. Its page type is "Página de Link" (linkpage).
 */
export interface LinksProduct {
  handle: string;
  theme: PresetName;
  visits: number;
  /** The bio of the social profile where the handle is shared. */
  profileBio: string;
  page: {
    displayName: string;
    bio: string;
    socials: ("instagram" | "tiktok" | "whatsapp")[];
    links: { label: string; highlight?: boolean }[];
  };
}

export interface ShopBusiness {
  id: "cafe" | "floreria";
  name: string;
  group: {
    name: string;
    summary: string;
    size: number;
    /** "mesas" in "Publicar en 20 mesas". */
    unit: string;
    /** "las 20 mesas y el anuncio": every point the Experience reaches. */
    everywhere: string;
    /** Badge of the live version in the history. */
    liveBadge: string;
    /** Legend of the Menú/Catálogo switch, when there is one. */
    showsLegend: string;
  };
  /** The Experience whose description the panel edits. */
  describes: Shows;
  menu?: {
    title: string;
    editorName: string;
    sections: { id: string; name: string; items: ShopItem[] }[];
  };
  catalog: {
    title: string;
    editorName: string;
    description: string;
    items: ShopItem[];
  };
  themeChoices: PresetName[];
  /** Newest first, like the panel's history. */
  versions: Version<ShopState>[];
  availability: Record<string, ItemState>;
  /** Visits today: NFC and QR on the group, URL directa on the ad. */
  visits: Record<Channel, number>;
  ad: OtherPoint;
  phone: PhoneCopy;
  links?: LinksProduct;
}

/** Every Touchpoint a publication reaches: the group and its ad. */
export function shopTargets(business: ShopBusiness): {
  count: number;
  label: string;
} {
  return {
    count: business.group.size + 1,
    label: `Publicar en ${business.group.size} ${business.group.unit} y 1 anuncio`,
  };
}

/**
 * Live availability of an item (ADR 017): outside the versions, it reaches
 * every Touchpoint that shows the Experience as soon as it is saved,
 * without publishing.
 */
export interface ItemState {
  status: "available" | "sold_out" | "hidden";
  /** "Quedan N"; 0 reads as sold out. */
  quantity: number | null;
}

const cafePrices = {
  espresso: 38,
  capuchino: 50,
  olla: 45,
  concha: 28,
  chilaquiles: 110,
  grano: 185,
  taza: 220,
  conchas: 150,
};

export const cafe: ShopBusiness = {
  id: "cafe",
  name: "Café Central",
  group: {
    name: "Mesas terraza",
    summary: "Grupo de 20 mesas",
    size: 20,
    unit: "mesas",
    everywhere: "las 20 mesas y el anuncio",
    liveBadge: "Publicada",
    showsLegend: "Qué muestran las mesas y el anuncio",
  },
  describes: "menu",
  menu: {
    title: "Café Central",
    editorName: "Menú de la terraza",
    sections: [
      {
        id: "cafe",
        name: "Café",
        items: [
          {
            id: "espresso",
            name: "Espresso",
            description: "Café de Veracruz, tueste medio.",
            image: "espresso",
          },
          {
            id: "capuchino",
            name: "Capuchino",
            description: "Con leche entera o de avena.",
            image: "capuchino",
          },
          {
            id: "olla",
            name: "Café de olla",
            description: "Con piloncillo y canela.",
            image: "olla",
          },
        ],
      },
      {
        id: "comer",
        name: "Para acompañar",
        items: [
          {
            id: "concha",
            name: "Concha",
            description: "Vainilla o chocolate.",
            image: "concha",
          },
          {
            id: "chilaquiles",
            name: "Chilaquiles verdes",
            description: "Con pollo o huevo estrellado.",
            image: "chilaquiles",
          },
        ],
      },
    ],
  },
  catalog: {
    title: "Tienda del café",
    editorName: "Tienda del café",
    description: "Café en grano, tazas y pan para llevar a casa.",
    items: [
      {
        id: "grano",
        name: "Café de Veracruz en grano",
        description: "Bolsa de 250 g, tueste medio.",
        image: "grano",
      },
      {
        id: "taza",
        name: "Taza Café Central",
        description: "Cerámica, 350 ml.",
        image: "taza",
      },
      {
        id: "conchas",
        name: "Caja de conchas",
        description: "Seis piezas, vainilla y chocolate.",
        image: "conchas",
      },
    ],
  },
  themeChoices: ["Papel editorial", "Kardo claro", "Terracota", "Kardo oscuro"],
  versions: [
    {
      number: 3,
      label: "Tema de la terraza",
      when: "Hoy, 9:12",
      state: {
        description: "Menú de la terraza",
        prices: { ...cafePrices, capuchino: 52, chilaquiles: 115 },
        themeName: "Papel editorial",
        shows: "menu",
      },
    },
    {
      number: 2,
      label: "Precios de septiembre",
      when: "Hace 2 semanas",
      state: {
        description: "Menú de la terraza",
        prices: cafePrices,
        themeName: "Kardo claro",
        shows: "menu",
      },
    },
    {
      number: 1,
      label: "Primera versión",
      when: "Hace 5 semanas",
      state: {
        description: "Menú",
        prices: {
          ...cafePrices,
          espresso: 35,
          capuchino: 48,
          olla: 42,
          concha: 25,
          chilaquiles: 105,
        },
        themeName: "Kardo claro",
        shows: "menu",
      },
    },
  ],
  availability: { concha: { status: "available", quantity: 4 } },
  visits: { nfc: 14, qr: 9, link: 3 },
  ad: socialAd,
  phone: {
    place: "a la mesa",
    from: "desde la mesa",
    samePage: "Las mesas y el anuncio muestran la misma página.",
    qrCaption: "Escanea y ve el menú",
    ad: { tagline: "Desayunos y café de Veracruz.", button: "Ver el menú" },
    idle: "Cada mesa tiene NFC y QR. El anuncio es otro punto, con su propia dirección.",
  },
};

/** The florería's WhatsApp, where "Ver más" leads (an example number). */
const floreriaWhatsApp = "https://wa.me/522220000000";

export const floreria: ShopBusiness = {
  id: "floreria",
  name: "Florería Lila",
  group: {
    name: "Mostrador y aparador",
    summary: "Grupo de 2 puntos",
    size: 2,
    unit: "puntos",
    everywhere: "el mostrador, el aparador y el anuncio",
    liveBadge: "Publicada",
    showsLegend: "Qué muestran",
  },
  describes: "catalog",
  catalog: {
    title: "Florería Lila",
    editorName: "Catálogo de la tienda",
    description: "Arreglos hechos a mano.",
    items: [
      {
        id: "ramo",
        name: "Ramo de temporada",
        description: "Flores de la semana.",
        image: "ramo",
        link: floreriaWhatsApp,
      },
      {
        id: "rosas",
        name: "Caja de rosas",
        description: "Doce rosas rojas.",
        image: "rosas",
        link: floreriaWhatsApp,
      },
      {
        id: "suculenta",
        name: "Suculenta",
        description: "Con maceta de barro.",
        image: "suculenta",
        link: floreriaWhatsApp,
      },
    ],
  },
  themeChoices: [
    "Terracota",
    "Kardo claro",
    "Papel editorial",
    "Bosque nocturno",
  ],
  versions: [
    {
      number: 3,
      label: "Precios de temporada",
      when: "Hoy, 10:05",
      state: {
        description: "Arreglos hechos a mano.",
        prices: { ramo: 450, rosas: 680, suculenta: 180 },
        themeName: "Terracota",
        shows: "catalog",
      },
    },
    {
      number: 2,
      label: "Tema Terracota",
      when: "Hace 1 semana",
      state: {
        description: "Arreglos hechos a mano.",
        prices: { ramo: 420, rosas: 650, suculenta: 180 },
        themeName: "Terracota",
        shows: "catalog",
      },
    },
    {
      number: 1,
      label: "Primera versión",
      when: "Hace 4 semanas",
      state: {
        description: "Arreglos hechos a mano.",
        prices: { ramo: 420, rosas: 650, suculenta: 180 },
        themeName: "Kardo claro",
        shows: "catalog",
      },
    },
  ],
  availability: { ramo: { status: "available", quantity: 2 } },
  visits: { nfc: 4, qr: 12, link: 6 },
  ad: socialAd,
  phone: {
    place: "al mostrador",
    from: "desde la tienda",
    samePage: "La tienda y el anuncio muestran la misma página.",
    qrCaption: "Escanea y ve el catálogo",
    ad: { tagline: "Arreglos hechos a mano.", button: "Ver catálogo" },
    idle: "El mostrador y el aparador tienen NFC y QR. El anuncio es otro punto, con su propia dirección.",
  },
  links: {
    handle: "florerialila",
    theme: "Terracota",
    visits: 27,
    profileBio: "Arreglos hechos a mano. De martes a domingo.",
    page: {
      displayName: "Florería Lila",
      bio: "Arreglos hechos a mano. Abrimos de martes a domingo.",
      socials: ["instagram", "tiktok", "whatsapp"],
      links: [
        { label: "Ver el catálogo", highlight: true },
        { label: "Escríbenos por WhatsApp" },
        { label: "Cómo llegar" },
      ],
    },
  },
};

export const shops = { cafe, floreria } as const;

type Images = Partial<Record<DrawingKey, ReactNode>>;

/** Same rules as the Resolver's resolveItem(): hidden drops the item. */
function resolve(
  availability: Record<string, ItemState>,
  id: string,
): { hidden: true } | { hidden: false; availability?: Availability } {
  const entry = availability[id];
  if (!entry) return { hidden: false };
  if (entry.status === "hidden") return { hidden: true };
  const soldOut = entry.status === "sold_out" || entry.quantity === 0;
  const remaining =
    !soldOut && entry.quantity !== null && entry.quantity > 0
      ? entry.quantity
      : null;
  return { hidden: false, availability: { soldOut, remaining } };
}

function toPageItems(
  items: readonly ShopItem[],
  state: ShopState,
  availability: Record<string, ItemState>,
  images: Images,
) {
  return items.flatMap((item) => {
    const resolved = resolve(availability, item.id);
    if (resolved.hidden) return [];
    return [
      {
        id: item.id,
        name: item.name,
        description: item.description,
        price: state.prices[item.id],
        image: images[item.image],
        hasLink: item.link !== undefined,
        availability: resolved.availability,
      },
    ];
  });
}

export function buildMenu(
  business: ShopBusiness,
  state: ShopState,
  availability: Record<string, ItemState>,
  images: Images = {},
): MenuContent | null {
  if (!business.menu) return null;
  return {
    type: "menu",
    title: business.menu.title,
    description:
      business.describes === "menu"
        ? state.description || undefined
        : undefined,
    currency: "MXN",
    sections: business.menu.sections
      .map((section) => ({
        id: section.id,
        name: section.name,
        items: toPageItems(section.items, state, availability, images),
      }))
      .filter((section) => section.items.length > 0),
  };
}

export function buildCatalog(
  business: ShopBusiness,
  state: ShopState,
  availability: Record<string, ItemState>,
  images: Images = {},
): CatalogContent {
  return {
    type: "catalog",
    title: business.catalog.title,
    description:
      business.describes === "catalog"
        ? state.description || undefined
        : business.catalog.description,
    currency: "MXN",
    items: toPageItems(business.catalog.items, state, availability, images),
  };
}

/** The page the group's Touchpoints open for a published state. */
export function buildShopPage(
  business: ShopBusiness,
  state: ShopState,
  availability: Record<string, ItemState>,
  images: Images = {},
): PageContent {
  return (
    (state.shows === "menu"
      ? buildMenu(business, state, availability, images)
      : null) ?? buildCatalog(business, state, availability, images)
  );
}

/** The Links product's own page: a "Página de Link". */
export function buildLinkPage(links: LinksProduct): PageContent {
  return { type: "linkpage", ...links.page };
}

/** Every product of the business with the name the panel shows. */
export function shopItems(business: ShopBusiness): ShopItem[] {
  return [
    ...(business.menu?.sections.flatMap((section) => section.items) ?? []),
    ...business.catalog.items,
  ];
}

/** Items the panel lists for an Experience. */
export function itemsOf(business: ShopBusiness, shows: Shows): ShopItem[] {
  return shows === "menu" && business.menu
    ? business.menu.sections.flatMap((section) => section.items)
    : business.catalog.items;
}

/** Human summary of what a publication changes, for the version list. */
export function describeChanges(
  business: ShopBusiness,
  from: ShopState,
  to: ShopState,
): string[] {
  const changes: string[] = [];
  if (from.shows !== to.shows)
    changes.push(
      to.shows === "menu"
        ? `${capitalize(business.group.everywhere)} muestran el menú`
        : `${capitalize(business.group.everywhere)} muestran el catálogo`,
    );
  if (from.themeName !== to.themeName) changes.push(`Tema ${to.themeName}`);
  if (from.description !== to.description)
    changes.push(
      business.describes === "menu"
        ? "Descripción del menú"
        : "Descripción del catálogo",
    );
  for (const item of shopItems(business))
    if (from.prices[item.id] !== to.prices[item.id])
      changes.push(`Precio de ${item.name}`);
  return changes;
}

/** Item ids whose price changed, to flash them on the phone. */
export function changedItems(from: ShopState, to: ShopState): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.keys(to.prices))
    if (from.prices[id] !== to.prices[id]) ids.add(id);
  return ids;
}

export function sameState(
  business: ShopBusiness,
  a: ShopState,
  b: ShopState,
): boolean {
  return describeChanges(business, a, b).length === 0;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
