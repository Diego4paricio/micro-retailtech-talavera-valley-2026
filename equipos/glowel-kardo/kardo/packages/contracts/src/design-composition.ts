import type { DesignableExperienceType } from "./design.js";

// ---------------------------------------------------------------------------
// Composition of a page made with Kardo's blocks (relevo 29, 2026-10-03).
// The owner saw the AI misplace photos and buttons and fall back on a
// menu-shaped page for every type. This module says, in the guide's words:
// - how any professional page is put together (`compositionRules`);
// - how each Experience type is put together (`typeCompositions`, only the
//   type being designed goes into the prompt);
// - where things go on a canvas, in numbers Kardo can check
//   (`placementRules`, enforced by the API's layout review);
// - how photos fill their box or shape, and the three photo modes the
//   customer picks (`photoRules`, `photoModeRules`);
// - what gives a page away as made by AI (`aiTellRules`).
//
// Some rules are adapted from public design guidance: "frontend-design" by
// Anthropic (anthropics/skills, Apache-2.0) and the Web Interface
// Guidelines by Vercel Labs (MIT). Only what fits Kardo's blocks and its
// guide was kept, rewritten in Spanish. Pure data, no customer text.
// House style: no em dash or en dash.
// ---------------------------------------------------------------------------

/** What every page shares, whatever its type. */
export const compositionRules: readonly string[] = [
  "Portada primero: en la primera pantalla se entiende qué es el negocio y qué hacer ahí. Ábrela con lo más característico del negocio (su platillo estrella, su lugar, su trabajo, la cara de quien atiende), no con una frase genérica. Tres formas: foto a sangre (sección lienzo de 440 a 560 de alto con la foto de fondo, overlay de 40 a 60, h1 de 40 a 56 en blanco en el tercio de abajo, una frase y el botón principal); partida (foto con máscara a un lado o arriba y el texto sobre un fondo de color); tipográfica (sin foto, el nombre muy grande en la tipografía de títulos, una frase y uno o dos botones).",
  "El logo, si existe, va chico (de 72 a 120 en una sección lienzo) sobre la portada o justo arriba de ella, en una esquina o centrado, nunca deformado ni recortado.",
  "Un solo elemento memorable por página (la foto de portada, un título enorme o una forma de color) y todo lo demás tranquilo. Antes de responder, quita un adorno que no aporte: una etiqueta, una forma, una franja o un bloque repetido.",
  "Etiquetas cortas sobre un título: como máximo dos en toda la página, solo cuando dicen algo útil («Abierto hoy», «Desde 1998», «Lo más pedido»), en oración normal (mayúscula inicial), 13 a 14 px, peso 600, color del acento y letterSpacing de 0 a 4. Nunca una etiqueta sobre cada título.",
  "Ritmo: alterna secciones con el fondo de la página y franjas con la superficie o un tinte del acento (fondo sólido de la sección y 40 a 56 de relleno arriba y abajo). Máximo dos colores de franja en toda la página.",
  "No todo va en tarjetas: las tarjetas son para lo que se toca o se compara (platillos, productos, el formulario, el cierre). Títulos, textos y datos clave van directo sobre el fondo. Dentro de una tarjeta, el radio de lo que va adentro nunca es mayor que el de la tarjeta.",
  "Nada dicho dos veces: si un bloque ya trae su etiqueta (featuredItems con label «Lo más pedido») no pongas encima otra etiqueta o título que diga lo mismo; si contentTitle ya dibuja el nombre y la descripción, no los repitas en otro texto.",
  "Datos clave (features) cerca de la portada, en franja (row), píldoras (chips) o lista: horario, ubicación, entrega, formas de pago, lo que incluye. Solo datos que el negocio te dio o que salen de su contenido; nunca inventes un horario, una dirección ni un servicio.",
  "Cierre: si la página no termina ya en su acción (los botones, el formulario), una sección con tarjeta, un título corto, una frase y un solo botón principal (WhatsApp, reservar, agendar).",
  "Escala: h1 de 40 a 56 en portadas con foto y de 32 a 44 sin foto, h2 de 24 a 30, cuerpo de 15 a 17 (nunca menos de 15 en párrafos). Interlineado de títulos grandes 11 o 12, de párrafos 15 o 16.",
];

/** How each Experience type is put together, in reading order. Only the
 * type being designed goes into the prompt. */
export const typeCompositions: Record<
  DesignableExperienceType,
  readonly string[]
> = {
  links: [
    "Es una página corta de acciones: se lee en una o dos pantallas.",
    "1. Portada compacta (partida o tipográfica, 280 a 420 de alto; foto a sangre solo si hay una foto buena del negocio): nombre, una frase de qué hace el negocio y nada más. La acción vive en los botones de abajo, no repitas un botón en la portada.",
    "2. contentLinks justo después, sin nada en medio: es el contenido de la página. El primer enlace es la acción principal.",
    "3. Opcional: datos clave en píldoras (horario, zona de entrega) o una frase de confianza. Sin galería larga ni cierre: los botones ya son el cierre.",
  ],
  profile: [
    "La cara de la página es el profileHeader real (foto, nombre y frase): nunca lo quites ni armes el nombre con títulos sueltos.",
    "1. Opcional: una portada en lienzo arriba (200 a 300 de alto, foto del lugar o forma de color) que no repite el nombre; el profileHeader va justo debajo.",
    "2. profileHeader (stacked centrado o inline) y enseguida contentLinks, con la acción principal primero (agendar, llamar, WhatsApp).",
    "3. Debajo, lo que da confianza: datos clave en lista (especialidad, horario, ubicación) o un texto breve «Sobre mí» de dos o tres líneas.",
    "4. Cierre con un solo botón principal solo si los enlaces quedaron lejos.",
  ],
  linkpage: [
    "Se comparte en redes: se lee completa en una pantalla y media, sin franjas ni secciones de más.",
    "1. profileHeader (stacked, avatar circular) arriba, con un fondo con personalidad (color de marca, degradado suave de la marca o la portada difuminada con overlay).",
    "2. contentSocials justo debajo del nombre, en tamaño medium.",
    "3. contentLinks: el primero puede destacar con el acento. Nada de galerías ni cierre.",
    "Esta página no tiene platillos, productos ni precios. Si el dueño los pide, no los inventes ni los escribas en textos: si entre sus enlaces hay uno a su menú o catálogo, ponlo primero y destacado.",
  ],
  menu: [
    "1. Portada según las fotos: foto a sangre si hay una foto buena del platillo o del lugar; partida o tipográfica si no.",
    "2. Datos clave (horario, entrega, formas de pago) en franja o píldoras, sin pegarlos en una banda blanca contra la foto de portada (ver colocación).",
    "3. Destacados (featuredItems) solo con fotos: platillos reales con foto o fotos que subió el dueño. Con layout cards usa 2 o 4 platillos (o 3 en carrusel); con hero, 1 o 3.",
    "4. El menú (bloque menu) con las secciones en el orden en que se sirven. Con fotos: layout cards y photos large, o list con photos small. Sin fotos: layout list o compact, photos none, sectionStyle line o pill y priceStyle accent; la tipografía y los precios alineados cargan el diseño.",
    "5. Cierre para pedir o reservar.",
  ],
  catalog: [
    "1. Portada partida o con foto del producto estrella; tipográfica si no hay fotos.",
    "2. Opcional: destacados con productos reales con foto (2 o 4 en cards).",
    "3. El catálogo: grid de 2 columnas con imageAspect 1:1 o 3:4 para productos, 4:3 para inmuebles o lugares; list si casi ningún producto tiene foto. buttonLabel con un verbo (Pedir, Comprar, Apartar).",
    "4. Datos clave de compra (envíos, formas de pago, apartado) y cierre por WhatsApp.",
  ],
  form: [
    "El formulario es la acción de la página: nada compite con él.",
    "1. Portada corta (tipográfica o partida, 240 a 380 de alto): qué pides y qué pasa después de enviar («Te llamamos en menos de un día»).",
    "2. leadForm justo después, con look card o boxed, visible al terminar la primera pantalla.",
    "3. Opcional debajo: datos clave de confianza (tiempo de respuesta, horario, ubicación) o dos o tres pasos de qué sigue. Sin cierre con otro botón.",
  ],
  document: [
    "1. Portada breve (tipográfica o partida, 220 a 360 de alto): el título del documento, para quién es y una frase de qué trae.",
    "2. Si se muestra como visor: documentPages enseguida, con pageStyle shadow o border y gap de 16 a 24, para que se lean grandes. Si es descarga: un botón claro de descarga como única acción.",
    "3. Opcional: datos clave (vigencia, horario, contacto) y un cierre con WhatsApp para preguntas.",
  ],
  image: [
    "La imagen es la protagonista: casi toda la página es ella.",
    "1. Opcional: un título corto o el logo arriba, chico.",
    "2. imageMain a todo el ancho, con frame none o shadow; fit contain si es un póster o un flyer (que no se recorte), cover si es una foto. Fondo sólido tomado de la imagen o de la marca.",
    "3. Opcional: una sola llamada a la acción corta debajo. Nada de franjas, datos clave, galerías ni cierre.",
  ],
};

/** Where things go on a canvas, in numbers the API's layout review checks
 * (`services/customer-api/src/custom-html/design-layout.ts`). */
export const placementRules: readonly string[] = [
  "Márgenes del lienzo: todo texto y todo botón queda dentro de x de 24 a 366 (x mayor o igual a 24 y x + w menor o igual a 366). Solo una foto o una forma decorativa puede salirse del borde a propósito.",
  "Alineación: en una portada, el título, la frase y el botón comparten el mismo x (alineados a la izquierda) o el mismo centro (x + w/2 = 195). Nunca un botón corrido unos px del borde del texto.",
  "Alto real del texto: un renglón mide fontSize x lineHeight/10 (si no pones lineHeight, 1.2 en títulos y 1.5 en textos); un texto ocupa los renglones que hagan falta para su ancho (unos fontSize x 0.55 px por letra). Deja 8 a 16 entre título y frase y 20 a 28 entre la frase y el botón, contando ese alto.",
  "Botones en un lienzo: h de 48 a 56, y un w que deje caber la etiqueta en una línea (unos 9 px por letra más 48) o a todo el ancho útil (342). Uno solo primario por pantalla.",
  "El lienzo termina donde termina su contenido: no dejes más de 40 px vacíos abajo del último elemento (salvo una portada con foto a sangre, que se ve completa).",
  "Una portada con foto a sangre lleva el texto en su tercio de abajo y el overlay suficiente para leerlo; no le pongas una tarjeta blanca encima ni una franja blanca pegada abajo. Si los datos clave van justo después, ponlos sobre el fondo de la página con 24 o más de relleno arriba, o dentro del mismo lienzo sobre la foto.",
  "Elementos que se tocan: entre dos botones o enlaces deja al menos 8 px.",
];

/** How a photo fills its box or its shape. */
export const photoRules: readonly string[] = [
  "Una foto siempre llena su caja (fit cover); contain solo para logos, pósters o flyers que no se deben recortar.",
  "Foto dentro de una forma: usa la máscara de la imagen (mask: circle, rounded, arch, blob, diamond, hexagon) en vez de poner la foto encima de una figura. Si quieres un marco o un halo detrás, la figura es del mismo tamaño que la foto o la rodea parejo (8 a 16 px por lado), con el mismo centro; nunca una foto más chica que su figura en un solo eje.",
  "Foto en una tarjeta: en una sección con card, una imagen al principio de la columna va de borde a borde arriba de la tarjeta y toma su radio (Kardo la dibuja así); no le pongas relleno ni otra máscara.",
  "Fotos del mismo tipo con la misma proporción y la misma máscara en toda la página.",
];

/** The three photo modes the customer picks (`DesignPhotoMode`). */
export const photoModeRules: Record<"auto" | "with" | "without", string> = {
  auto: "Fotos: decide tú según el negocio y su contenido. Si tiene fotos o su giro vive de ellas (comida, productos, trabajos), úsalas; si casi no tiene, un diseño tipográfico se ve mejor que una página llena de espacios vacíos.",
  with: "Fotos: el dueño pidió un diseño CON fotos. La portada lleva foto (la suya, o un espacio para foto con alt que diga cuál subir), el menú o catálogo muestra fotos (menu con photos large o small) y puedes usar destacados y galería. Usa las fotos que te dio y deja espacios para las que falten.",
  without:
    "Fotos: el dueño pidió un diseño SIN fotos. No uses bloques image (salvo su logo), gallery, fondos de imagen ni espacios para foto; el menú va con photos none y nada de featuredItems. Portada tipográfica o con formas de color; la tipografía, el color y el orden hacen el diseño. Esto manda sobre lo que diga la dirección de arte.",
};

/** What gives a page away as made by AI. */
export const aiTellRules: readonly string[] = [
  "Una etiqueta pequeña sobre cada título, en MAYÚSCULAS espaciadas.",
  "Resaltar una sola palabra del título con otro color, cursiva o negrita.",
  "Todo partido en tarjetas iguales con el mismo radio y la misma sombra.",
  "Textos unidos con puntos medios («Tacos · Tortas · Aguas») o botones con flecha («Reservar →»).",
  "El fondo crema con acento terracota de cualquier página «cálida», o el negro con un solo verde ácido: úsalos solo si la marca o el negocio los piden.",
  "Números de pasos (01, 02, 03) en algo que no es una secuencia.",
  "Frases de relleno que podrían ser de cualquier negocio («Calidad y servicio», «Tu mejor opción»): escribe lo específico de este negocio.",
];
