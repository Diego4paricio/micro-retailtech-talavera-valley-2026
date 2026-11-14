import type { PieceId } from "./pieces";

// Copy of the two zones of the home: the platform (what you pay each month)
// and the pieces (what you buy once). Same rules as landing.ts: "tú", short
// sentences, no dashes, no "·", nothing the product does not do today.
// The example businesses are made up; none is a Kardo customer.

/** Right after the hero: the two things Kardo sells, side by side. */
export const twoWays = {
  title: "Dos partes que trabajan juntas.",
  lead: "Lo que tus clientes tocan o escanean se queda donde está. Lo que les abre, lo cambias tú cuando quieras.",
  platform: {
    name: "La plataforma",
    title: "Tu panel de Kardo",
    text: "Editas tu menú, tu catálogo, tu perfil o un formulario, eliges qué abre cada QR, NFC o link, y ves cuántas visitas llegan y a qué hora.",
    points: [
      "Ocho tipos de página",
      "Lo agotado se marca sin volver a publicar",
      "Visitas por día, hora y canal",
    ],
    link: "Conoce la plataforma",
  },
  pieces: {
    name: "Las piezas",
    title: "Stand, Card, Magnet y Sticker",
    text: "Impresas con tu marca, con QR y NFC. Las pones en el mostrador, la mesa o el refri, y abren lo que eliges en tu panel.",
    points: [
      "Diseñadas con tu logo y tus colores",
      "Se activan con un código en tu panel",
      "Lo que abren lo cambias cuando quieras",
    ],
    link: "Ver las piezas",
  },
};

/**
 * The parts of the panel, each with a real screen of the panel in demo mode
 * (Docs/renders/sitio/panel-<image>.png). Every line was checked against
 * that screen. The home shows the first six; /plataforma/ shows them all.
 */
export interface PlatformPart {
  id: string;
  /** The panel's own name for the section. */
  name: string;
  title: string;
  text: string;
  points: string[];
  /** panel-<image> in src/content/media.json. */
  image: string;
  alt: string;
}

export const platformParts: PlatformPart[] = [
  {
    id: "resumen",
    name: "Resumen",
    title: "Tus visitas de un vistazo.",
    text: "Accesos, clics y solicitudes de la semana contra la anterior, el reparto entre NFC, QR y URL directa, y lo que más se mueve.",
    points: ["Lo armas con los widgets que te sirven", "Por 7, 30 o 90 días"],
    image: "panel-resumen",
    alt: "Panel de Kardo, Resumen: accesos, clics en acciones, solicitudes, tasa de conversión, accesos por día y reparto por canal",
  },
  {
    id: "qr-etiquetas",
    name: "QR y etiquetas",
    title: "Cada punto, en su lugar.",
    text: "Tus QR, tus NFC y tus piezas Kardo, ordenados por local, zona y mesa. Publicas una página en todo un grupo o en una sola mesa.",
    points: [
      "Grupos dentro de grupos",
      "Ves cuáles faltan por colocar o activar",
    ],
    image: "panel-qr-etiquetas",
    alt: "Panel de Kardo, QR y etiquetas: el local Centro con su tarjeta NFC, su etiqueta QR, un Stand de Kardo y el grupo Terraza",
  },
  {
    id: "paginas",
    name: "Páginas",
    title: "Lo que abre cada punto.",
    text: "Menú, catálogo, perfil, enlaces, imagen, PDF, formulario o redirección. La dejas en borrador y la publicas cuando esté lista.",
    points: ["Ocho tipos de página", "Ves dónde se ve cada una"],
    image: "panel-paginas",
    alt: "Panel de Kardo, Páginas: la lista con menús, catálogo, perfil, formulario, imagen, PDF y enlaces, cada una con su estado",
  },
  {
    id: "disponibilidad",
    name: "Disponibilidad",
    title: "Lo que se acabó, al momento.",
    text: "Marcas un platillo o un producto como disponible, agotado u oculto, o cuentas cuántas piezas quedan. No vuelves a publicar la página.",
    points: ["Para menús y catálogos", "Tus clientes ven «Agotado»"],
    image: "panel-disponibilidad",
    alt: "Panel de Kardo, Disponibilidad: el Menú Terraza con cada platillo marcado como disponible, agotado u oculto",
  },
  {
    id: "diseno-qr",
    name: "Diseño del QR",
    title: "Tus QR, con tu marca.",
    text: "Una biblioteca de diseños para toda tu organización y un diseño por grupo. Cambiar el diseño no cambia la dirección de los QR que ya imprimiste.",
    points: ["Colores, logo y marco", "Listos para imprenta"],
    image: "panel-diseno-qr",
    alt: "Panel de Kardo, Diseño del QR: la biblioteca con dos diseños de la organización y el diseño por grupo",
  },
  {
    id: "solicitudes",
    name: "Solicitudes",
    title: "Lo que te dejan en tus formularios.",
    text: "Cada solicitud llega con el permiso de quien la deja. La contestas por WhatsApp o por correo y la marcas como atendida.",
    points: ["Las exportas a CSV", "Por QR o etiqueta de origen"],
    image: "panel-solicitudes",
    alt: "Panel de Kardo, Solicitudes: una solicitud con fecha, nombre, mensaje, la etiqueta de origen y botones para contestar",
  },
  {
    id: "ficha",
    name: "Ficha de cada punto",
    title: "Lo conectas y lo pruebas.",
    text: "Cada NFC, QR o pieza tiene su ficha: la grabas, la pruebas con tu celular y ves sus visitas. Si un celular no lee NFC, su QR de respaldo abre lo mismo.",
    points: ["Pasos que no se pierden", "Visitas por NFC y por QR"],
    image: "panel-ficha",
    alt: "Panel de Kardo, ficha de la Tarjeta de bienvenida: los pasos Grabar, Probar, Respaldo y Colocar, la página que muestra y sus visitas",
  },
  {
    id: "analitica",
    name: "Analítica",
    title: "Por canal, día y hora.",
    text: "NFC, QR y URL directa, cada uno con sus accesos y contra el periodo anterior. Contamos visitas, no personas: sin IP ni datos del celular.",
    points: ["Filtras por QR o etiqueta", "Cada gráfica con su tabla"],
    image: "panel-analitica",
    alt: "Panel de Kardo, Analítica: accesos totales, por NFC, por QR, por URL directa, clics y solicitudes",
  },
  {
    id: "links",
    name: "Links",
    title: "Tu página para redes, aparte.",
    text: "Una dirección con tu nombre para Instagram, TikTok o WhatsApp, con sus propias visitas. Es otro producto de Kardo: vive aparte de tus QR y etiquetas.",
    points: ["Varias páginas en un mismo link", "Las pausas cuando quieras"],
    image: "panel-links",
    alt: "Panel de Kardo, Links: el link del negocio con tres páginas y sus visitas",
  },
];

/** The home's look inside the panel: the first six parts. */
export const panelPreview = {
  title: "Tu panel por dentro.",
  lead: "Así se ve el panel donde cambias lo que abren tus QR, tus NFC y tus piezas. Pantallas reales con datos de ejemplo.",
  more: "Ver todo lo que hace el panel",
  note: "Pantallas del panel de Kardo con datos de ejemplo.",
};

/** /plataforma/ */
export const platformPage = {
  metaTitle: "La plataforma",
  metaDescription:
    "El panel de Kardo: páginas, QR y etiquetas, Disponibilidad, Diseño del QR, Resumen, Analítica, Solicitudes y Links, con pantallas reales.",
  title: "Tu panel de Kardo.",
  lead: "Desde aquí cambias lo que abren tus QR, tus NFC, tus piezas y tus links, y ves qué funciona. Sin reimprimir nada.",
  pagesTitle: "Lo que ve tu cliente.",
  pagesLead:
    "Ocho tipos de página. Eliges uno, lo llenas y lo adaptas a tu marca: fondo, color de acento, botones y tipo de letra.",
  tryTitle: "Pruébalo aquí mismo.",
  tryLead:
    "Elige un café, una florería o un salón. Cambia un precio, marca algo agotado y publica: lo ves en el celular de un cliente.",
  piecesTitle: "¿Quieres algo listo para el mostrador?",
  piecesText:
    "Las piezas Kardo llegan impresas con tu marca, con QR y NFC, y se activan en tu panel con un código.",
  piecesLink: "Ver las piezas",
};

/** The pieces block of the home (ADR 025). */
export const piecesShowcase = {
  title: "Cuatro piezas con tu marca.",
  lead: "Todas llevan QR y NFC con la misma dirección. Toca una para ver lo que abre en el celular de tu cliente.",
  customize: "Personaliza la tuya",
  customizeThis: "Personalizar",
  more: "Ver medidas y materiales",
  scaleNote: "Tamaño real, junto a un celular. Diseños de ejemplo.",
  photosTitle: "Así se ven en su lugar",
  photosNote:
    "Escenas ilustrativas generadas. No son clientes ni instalaciones de Kardo.",
};

export interface SampleBusiness {
  piece: PieceId;
  business: string;
  opens: string;
}

/** What each sample piece opens, said in one line under the strip. */
export const pieceSamples: Record<PieceId, SampleBusiness> = {
  stand: {
    piece: "stand",
    business: "Café Central",
    opens: "El Stand de la barra abre su menú, con lo agotado marcado.",
  },
  card: {
    piece: "card",
    business: "Arista & Asociados",
    opens: "La Card de Javier abre su perfil con sus botones.",
  },
  magnet: {
    piece: "magnet",
    business: "Veterinaria & Urgencias",
    opens:
      "El Magnet del refri abre sus enlaces: WhatsApp para urgencias, servicios y ubicación.",
  },
  sticker: {
    piece: "sticker",
    business: "La Terraza",
    opens: "El Sticker de la mesa 12 abre el menú, con lo agotado marcado.",
  },
};
