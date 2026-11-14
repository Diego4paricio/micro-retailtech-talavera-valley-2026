import type {
  CanvasSection,
  DesignableExperienceType,
  DesignBlock,
  DesignSection,
  Industry,
  PageDesign,
  PageSection,
} from "@kardo/contracts";
import { inkOn } from "./color.js";
import { CoverKit, type NewId, type Theme } from "./kit.js";
import { type Look, lookById, looks } from "./looks.js";
import { wrapLines } from "./text.js";

/**
 * Plantillas de primera impresión (relevo 33, owner 2026-10-04): the page
 * a new owner sees in «Cómo se ve», finished with only what they gave
 * (name, giro, city, hours, WhatsApp and what they sell), no photos. It is
 * built, not stored: the look, the color and the two texts are parameters,
 * so they change in place; what is kept is a normal Estudio design.
 *
 * Each Experience type is put together its own way (design guide,
 * `typeCompositions`): a Menú or a Catálogo opens with the cover, then the
 * facts, the list and a closing to write by WhatsApp; a PDF shows its pages
 * right after a short cover; an Imagen is almost only the image; a
 * Formulario puts the form first; a Perfil or a Página de enlaces are the
 * person's own header with their links.
 */

export type Family =
  | "comida"
  | "cafe"
  | "bar"
  | "belleza"
  | "salud"
  | "profesional"
  | "tienda"
  | "escuela"
  | "eventos"
  | "hotel"
  | "inmobiliaria"
  | "otro";

/** Exhaustive on purpose (domain audit A2-5): a giro added to the catalog
 * cannot be forgotten here. */
const familyByIndustry: Record<Industry, Family> = {
  restaurante: "comida",
  cafeteria: "cafe",
  bar: "bar",
  belleza: "belleza",
  salud: "salud",
  servicios: "profesional",
  retail: "tienda",
  educacion: "escuela",
  eventos: "eventos",
  hotel: "hotel",
  inmobiliaria: "inmobiliaria",
  floreria: "tienda",
  panaderia: "cafe",
  agencia: "profesional",
  papeleria: "tienda",
  otro: "otro",
};

export function familyFor(industry: string | null | undefined): Family {
  return industry && industry in familyByIndustry
    ? familyByIndustry[industry as Industry]
    : "otro";
}

/** The looks that fit each giro best, first; the rest follow. */
const bestByFamily: Record<Family, string[]> = {
  comida: ["bloque", "letra-grande", "ticket", "sello", "diagonal", "retro"],
  cafe: ["firma", "retro", "sello", "burbuja", "ticket", "halo"],
  bar: ["marco", "profundo", "letra-grande", "diagonal", "revista", "bloque"],
  belleza: ["halo", "ventana", "aurora", "marco", "burbuja", "firma"],
  salud: ["burbuja", "esquina", "aurora", "minimal", "circulos", "halo"],
  profesional: [
    "revista",
    "minimal",
    "esquina",
    "dos-tonos",
    "profundo",
    "cuadros",
  ],
  tienda: [
    "cuadros",
    "dos-tonos",
    "bloque",
    "patron",
    "burbuja",
    "letra-grande",
  ],
  escuela: ["circulos", "burbuja", "cuadros", "dos-tonos", "retro", "patron"],
  eventos: ["marco", "ventana", "profundo", "diagonal", "halo", "letra-grande"],
  hotel: ["marco", "halo", "ventana", "revista", "profundo", "aurora"],
  inmobiliaria: [
    "revista",
    "esquina",
    "minimal",
    "dos-tonos",
    "profundo",
    "cuadros",
  ],
  otro: ["cuadros", "burbuja", "revista", "halo", "dos-tonos", "minimal"],
};

/** Every look, the giro's best first. */
export function looksFor(family: Family): Look[] {
  const best = bestByFamily[family];
  return [
    ...best.map(lookById),
    ...looks.filter((look) => !best.includes(look.id)),
  ];
}

/** Quick colors offered next to the brand's own. */
export const quickColors = [
  "#b42318",
  "#8e3b4e",
  "#2346a0",
  "#1f6f5c",
  "#b7791f",
  "#1f2328",
];

const closings: Record<Family, { title: string; button: string }> = {
  comida: { title: "Haz tu pedido", button: "Pedir por WhatsApp" },
  cafe: { title: "Haz tu pedido", button: "Pedir por WhatsApp" },
  bar: { title: "Aparta tu mesa", button: "Reservar por WhatsApp" },
  belleza: { title: "Agenda tu cita", button: "Agendar por WhatsApp" },
  salud: { title: "Agenda tu consulta", button: "Agendar por WhatsApp" },
  profesional: { title: "Agenda una cita", button: "Escribir por WhatsApp" },
  tienda: { title: "Haz tu pedido", button: "Pedir por WhatsApp" },
  escuela: { title: "Pide informes", button: "Pedir informes" },
  eventos: { title: "Cotiza tu evento", button: "Cotizar por WhatsApp" },
  hotel: { title: "Reserva tu estancia", button: "Reservar por WhatsApp" },
  inmobiliaria: { title: "Agenda una visita", button: "Agendar por WhatsApp" },
  otro: { title: "Escríbenos", button: "Escribir por WhatsApp" },
};

export type FirstImpressionInput = {
  type: DesignableExperienceType;
  family: Family;
  look: string;
  accent: string;
  /** The page's title (the business's name, for a new page). A Perfil or a
   * Página de enlaces show their own name from the content instead. */
  title: string;
  phrase: string;
  /** «Servicios», «Productos»… above a Catálogo's list. */
  listTitle?: string | undefined;
  hours?: string | undefined;
  city?: string | undefined;
  whatsappUrl?: string | undefined;
  logoAssetId?: string | undefined;
  /** Its dishes or products already have photos: the list shows them. */
  hasPhotos?: boolean | undefined;
  /** Perfil and Página de enlaces: the name and the line under it, to
   * size their cover. */
  profileName?: string | undefined;
  profileBio?: string | undefined;
  newId: NewId;
};

function flow(
  id: string,
  blocks: DesignBlock[],
  options: Partial<DesignSection> = {},
): DesignSection {
  return {
    id,
    layout: "1",
    columns: [blocks],
    paddingTop: 24,
    paddingBottom: 24,
    gap: 16,
    align: "start",
    ...options,
  };
}

function cover(
  input: FirstImpressionInput,
  look: Look,
  theme: Theme,
  compact: boolean,
): CanvasSection {
  const kit = new CoverKit(input, theme, compact);
  const height = look.cover(kit);
  return {
    id: input.newId("s"),
    kind: "canvas",
    height: Math.max(80, Math.round(height)),
    ...(theme.coverBackground ? { background: theme.coverBackground } : {}),
    items: kit.items,
  };
}

/** An Imagen opens small: the business's mark and name, then the image. */
function imageHeader(input: FirstImpressionInput, theme: Theme): CanvasSection {
  const onPage: Theme = {
    ...theme,
    coverText: theme.style.palette.text,
    coverMuted: theme.style.palette.muted,
  };
  const kit = new CoverKit(input, onPage, true);
  const accent = theme.style.palette.accent;
  kit.mark(169, 24, 52, { fill: accent, ink: inkOn(accent) });
  const box = kit.measureTitle([32, 28, 24], 330);
  kit.title(box, 195, 92, "center");
  const phraseY = 92 + box.h + 8;
  // A handwritten phrase reads too small here: the body face instead.
  const body = { font: theme.style.fonts.body, weight: 400 as const };
  kit.phrase(16, 45, phraseY, 300, "center", onPage.coverMuted, body);
  return {
    id: input.newId("s"),
    kind: "canvas",
    height: phraseY + kit.measurePhrase(16, 300, body) + 16,
    items: kit.items,
  };
}

/** Perfil and Página de enlaces: the person's own header (photo, name and
 * line) over the look's shapes. */
function profileCover(
  input: FirstImpressionInput,
  look: Look,
  theme: Theme,
): CanvasSection {
  const name = input.profileName?.trim() || input.title;
  const bio = input.profileBio?.trim() ?? "";
  const headingKey = `${theme.title.font}-${theme.title.weight}`;
  const nameLines = wrapLines(name, headingKey, 30, 326, theme.title.spacing);
  const bioLines = bio
    ? wrapLines(bio, `${theme.style.fonts.body}-400`, 16, 326)
    : 0;
  const height = Math.round(
    48 + 96 + 16 + nameLines * 33 + (bio ? 4 + bioLines * 24 : 0) + 32,
  );
  const kit = new CoverKit(input, theme, false);
  look.avatarDecor(kit, height);
  kit.items.push({
    block: {
      id: input.newId("b"),
      kind: "profileHeader",
      layout: "stacked",
      avatarShape: "circle",
      style: {
        align: "center",
        fontSize: 30,
        lineHeight: 11,
        color: theme.style.palette.text,
      },
    } as DesignBlock,
    x: 32,
    y: 48,
    w: 326,
    z: 5,
  });
  return { id: input.newId("s"), kind: "canvas", height, items: kit.items };
}

function facts(input: FirstImpressionInput, look: Look): DesignSection | null {
  const items: { icon: "clock" | "map-pin"; title: string; text: string }[] =
    [];
  if (input.hours?.trim())
    items.push({
      icon: "clock",
      title: "Horario",
      text: input.hours.trim().slice(0, 120),
    });
  if (input.city?.trim())
    items.push({
      icon: "map-pin",
      title: "Ubicación",
      text: input.city.trim().slice(0, 120),
    });
  if (!items.length) return null;
  const { layout, icons } = look.content.facts;
  return flow(
    input.newId("s"),
    [
      {
        id: input.newId("b"),
        kind: "features",
        layout: layout === "grid" && items.length > 1 ? "grid" : "list",
        iconStyle: icons,
        ...(layout === "grid" && items.length > 1 ? { columns: 2 } : {}),
        items,
      } as DesignBlock,
    ],
    { paddingTop: 16, paddingBottom: 8 },
  );
}

function contentBlocks(input: FirstImpressionInput, look: Look): DesignBlock[] {
  const id = input.newId;
  const style = look.content;
  switch (input.type) {
    case "menu":
      return [
        {
          id: id("b"),
          kind: "menu",
          layout: input.hasPhotos ? "list" : style.menuLayout,
          photos: input.hasPhotos ? "small" : "none",
          photoShape: "rounded",
          descriptions: true,
          sectionStyle: style.menuSections,
          priceStyle: style.price,
        } as DesignBlock,
      ];
    case "catalog":
      return [
        ...(input.listTitle
          ? [
              {
                id: id("b"),
                kind: "heading",
                level: 2,
                text: input.listTitle,
                style: { fontSize: 26 },
              } as DesignBlock,
            ]
          : []),
        input.hasPhotos
          ? ({
              id: id("b"),
              kind: "catalog",
              layout: "grid",
              columns: 2,
              imageAspect: "1:1",
              descriptions: false,
              priceStyle: style.price,
            } as DesignBlock)
          : ({
              id: id("b"),
              kind: "catalog",
              layout: "list",
              columns: 1,
              descriptions: true,
              priceStyle: style.price,
            } as DesignBlock),
      ];
    case "document":
      return [
        {
          id: id("b"),
          kind: "documentPages",
          pageStyle: style.document,
          gap: 20,
        } as DesignBlock,
      ];
    case "image":
      return [
        {
          id: id("b"),
          kind: "imageMain",
          fit: "contain",
          frame: style.document === "shadow" ? "shadow" : "none",
          aspect: "auto",
        } as DesignBlock,
      ];
    case "form":
      return [
        {
          id: id("b"),
          kind: "leadForm",
          look: style.form,
          buttonWidth: "full",
        } as DesignBlock,
      ];
    default:
      return [
        { id: id("b"), kind: "contentLinks", layout: "list" } as DesignBlock,
      ];
  }
}

function closing(
  input: FirstImpressionInput,
  look: Look,
  theme: Theme,
): DesignSection | null {
  if (!input.whatsappUrl) return null;
  const words = closings[input.family];
  const kind = look.content.closing;
  const band = kind === "band";
  const accent = theme.style.palette.accent;
  return flow(
    input.newId("s"),
    [
      {
        id: input.newId("b"),
        kind: "heading",
        level: 2,
        text: words.title,
        style: {
          fontSize: 28,
          align: "center",
          ...(band ? { color: inkOn(accent) } : {}),
        },
      } as DesignBlock,
      {
        id: input.newId("b"),
        kind: "brandButton",
        brand: "whatsapp",
        label: words.button,
        href: input.whatsappUrl,
        look: look.content.button,
        style: { width: "full" },
      } as DesignBlock,
    ],
    {
      ...(kind === "card" ? { card: true } : {}),
      ...(band
        ? { background: { kind: "solid" as const, color: accent } }
        : {}),
      paddingTop: kind === "plain" ? 24 : 36,
      paddingBottom: kind === "plain" ? 40 : 36,
      align: "center",
    },
  );
}

/** A first-impression design for one page. */
export function firstImpressionDesign(input: FirstImpressionInput): PageDesign {
  const look = lookById(input.look);
  const theme = look.theme(input.accent);
  const sections: PageSection[] = [];
  const list = () =>
    flow(input.newId("s"), contentBlocks(input, look), {
      ...(look.content.card &&
      (input.type === "menu" || input.type === "catalog")
        ? { card: true, paddingTop: 20, paddingBottom: 20 }
        : { paddingTop: 16, paddingBottom: 24 }),
    });
  const add = (section: PageSection | null) => {
    if (section) sections.push(section);
  };
  switch (input.type) {
    case "menu":
    case "catalog":
      add(cover(input, look, theme, false));
      add(facts(input, look));
      add(list());
      add(closing(input, look, theme));
      break;
    case "document":
      add(cover(input, look, theme, true));
      add(list());
      add(facts(input, look));
      add(closing(input, look, theme));
      break;
    case "form":
      add(cover(input, look, theme, true));
      add(list());
      add(facts(input, look));
      break;
    case "image":
      add(imageHeader(input, theme));
      add(list());
      add(closing(input, look, theme));
      break;
    case "profile":
      add(profileCover(input, look, theme));
      add(list());
      add(facts(input, look));
      break;
    case "linkpage":
      add(profileCover(input, look, theme));
      add(
        flow(
          input.newId("s"),
          [
            {
              id: input.newId("b"),
              kind: "contentSocials",
              size: "medium",
              look: "brand",
              style: { align: "center" },
            } as DesignBlock,
          ],
          { paddingTop: 0, paddingBottom: 0, align: "center" },
        ),
      );
      add(list());
      break;
    case "links":
      add(cover(input, look, theme, true));
      add(list());
      add(facts(input, look));
      break;
  }
  return { schema: 2, style: theme.style, sections };
}
