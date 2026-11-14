import { customHtmlFontFamilies } from "./custom-html.js";
import type { DesignableExperienceType } from "./design.js";
import { designFonts } from "./design.js";
import {
  aiTellRules,
  compositionRules,
  photoRules,
  placementRules,
  typeCompositions,
} from "./design-composition.js";
import {
  designDirectionIds,
  designDirectionLine,
  designDirections,
} from "./design-directions.js";

// ---------------------------------------------------------------------------
// Kardo design guide ("Estudio tipo Canva", ADR 018 addendum 3, 2026-09-30):
// concrete, checkable rules for a business page on a phone, written once and
// reused everywhere design happens:
// - the fixed, cacheable system prompt of the Kardo AI (both the full-page
//   block design and the modo HTML page, `custom-html-prompt.ts` and
//   `design-prompt.ts`);
// - the `.claude/skills/kardo-disenador` skill the dev-bridge agents load.
//
// Pure and deterministic: same options always produce the same string, no
// customer text ever goes in here. House style: no em dash or en dash
// (— –) anywhere in this Spanish text.
// ---------------------------------------------------------------------------

/** Business types the recipe section can specialize for. Independent of any
 * other "giro" list in the codebase (this file has no other dependency). */
export const kardoDesignGiros = [
  "tienda",
  "restaurante",
  "cafe",
  "floreria",
  "salon",
  "profesional",
  "inmobiliaria",
  "hotel",
  "eventos",
  "escuela",
  "salud",
  "bar",
] as const;
export type KardoDesignGiro = (typeof kardoDesignGiros)[number];

const giroLabels: Record<KardoDesignGiro, string> = {
  tienda: "tienda",
  restaurante: "restaurante",
  cafe: "café",
  floreria: "florería",
  salon: "salón (belleza, barbería, spa)",
  profesional: "profesional independiente (consultorio, despacho, taller)",
  inmobiliaria: "inmobiliaria",
  hotel: "hotel o alojamiento",
  eventos: "eventos y salones de fiesta",
  escuela: "escuela o academia",
  salud: "salud y bienestar (consultorio, clínica, veterinaria, yoga)",
  bar: "bar o cantina",
};

/** The organization profile's `industry` (Configuración → Organización)
 * mapped to the recipe that fits it best. "otro" and a missing industry map
 * to nothing: the model then picks a recipe from the full table. */
const giroByIndustry: Record<string, KardoDesignGiro> = {
  restaurante: "restaurante",
  cafeteria: "cafe",
  bar: "bar",
  hotel: "hotel",
  retail: "tienda",
  salud: "salud",
  belleza: "salon",
  servicios: "profesional",
  eventos: "eventos",
  educacion: "escuela",
  inmobiliaria: "inmobiliaria",
  floreria: "floreria",
  panaderia: "cafe",
  agencia: "profesional",
  papeleria: "tienda",
};

export function giroForIndustry(
  industry: string | undefined,
): KardoDesignGiro | undefined {
  return industry ? giroByIndustry[industry] : undefined;
}

const giroRecipes: Record<KardoDesignGiro, string> = {
  tienda:
    "Fotos de producto cuadradas y consistentes, precio visible, botón directo a comprar o a WhatsApp. Acento en el color de la marca, no en un color genérico.",
  restaurante:
    "Foto grande de un platillo o del lugar arriba, menú con fotos, botones grandes para reservar y pedir. Tipografía con carácter en el nombre, cuerpo muy legible en la carta.",
  cafe: "Tono cálido, fotos con luz natural, tarjetas con esquinas suaves. El menú del día o las bebidas de temporada arriba, redes sociales visibles.",
  floreria:
    "Fotos grandes y saturadas de los arreglos, catálogo en cuadrícula, botón de pedido por WhatsApp siempre visible. Colores tomados de las flores, no morados genéricos.",
  salon:
    "Fotos de resultados (antes y después, cortes, uñas), botón de reservar como acción principal, lista de servicios con precio. Tono personal, fotos del equipo si hay.",
  profesional:
    "Formal y directo: una foto de perfil, una frase de especialidad, credenciales breves, botón de agendar o contactar. Sin relleno, nada de emojis.",
  inmobiliaria:
    "Fotos horizontales grandes de las propiedades, catálogo en tarjetas con precio y ubicación, formulario de contacto corto. Tono confiable, sin colores llamativos.",
  hotel:
    "Foto de portada muy grande (alberca, vista, habitación), botones para reservar y ver ubicación, catálogo de habitaciones con fotos. Acento cálido o dorado, tarjetas con sombra suave.",
  eventos:
    "Fotos con ambiente y luz de noche, botón de cotizar o agendar visita, catálogo de paquetes o servicios. Tipografía con más personalidad en el título.",
  escuela:
    "Tono claro y ordenado, foto de las instalaciones o alumnos, formulario de inscripción o contacto, catálogo de cursos con descripción corta. Colores institucionales.",
  salud:
    "Confiable y tranquilo: colores de la marca en tonos calmados, una frase de especialidad, agendar cita o llamar como acción principal y la urgencia (si existe) muy visible. Horario y ubicación a la vista. Fotos del lugar o del equipo; nada de imágenes clínicas crudas.",
  bar: "Ambiente de noche: fondo oscuro con el acento de la marca, tipografía con carácter en el nombre, la promoción o la bebida de la casa arriba y un botón para reservar o pedir. Fotos con luz cálida.",
};

const pageRecipes: Partial<Record<DesignableExperienceType, string>> = {
  links:
    "Un título corto (el nombre del negocio) y una lista de botones grandes, uno por acción. El primero es la acción más importante (pedir, reservar, comprar); el resto en orden de prioridad. Sin más de 6 u 8 botones visibles sin desplazarse mucho.",
  profile:
    "Cabecera con foto o logo, nombre y una frase de una línea que diga qué hace el negocio. Debajo, los botones. La cabecera es la portada: en un vistazo se entiende qué es el negocio y qué hacer.",
  linkpage:
    "Foto de perfil, nombre, biografía de una o dos líneas, redes sociales arriba (con logo de marca) y botones abajo. Pensada para compartirse en redes: se lee completa sin desplazarse en un celular normal.",
  menu: "Portada breve (nombre y una frase) y las secciones del menú en el orden en que se sirven (entradas antes que postres). Si el negocio tiene o quiere fotos de sus platillos, usa `photos: large` (tarjetas) o `small`: los platillos sin foto muestran en el Estudio un espacio para subirla y en la página publicada simplemente van sin foto. Usa `photos: none` solo si el dueño pide un menú sin fotos o es una carta muy larga sin ninguna foto. Precios alineados y legibles.",
  catalog:
    "Cuadrícula o tarjetas con foto, nombre y precio. Todas las fotos con la misma proporción (recorte consistente). El botón de cada producto usa un verbo (Comprar, Pedir, Ver más), nunca un genérico sin acción.",
  form: "Portada corta que explica qué pasa después de enviar el formulario, y el formulario visible sin desplazarse mucho. Nada de bloques que compitan con el formulario como acción principal de la página.",
  document:
    "Portada breve (de qué trata el documento) antes de las páginas del PDF. Si `display` es visor, deja que las páginas se lean grandes, con espacio entre ellas; si es descarga, un botón de descarga claro como única acción.",
  image:
    "La imagen es la protagonista: fondo simple, sin bloques que compitan. Un máximo de un título o una llamada a la acción corta encima o debajo.",
};

/** Photos the business does not have yet (2026-10-03, owner's request):
 * the AI leaves the space, the owner fills it in the Estudio. */
const photoSpaceRules = [
  "Espacios para foto: si al diseño le hace falta una foto que el negocio no tiene, deja el espacio (un bloque image sin imageRef, o una foto de galería sin imageRef) con su proporción y su tamaño finales, y en alt escribe qué foto subir, hablándole al dueño: «Foto de tus chilaquiles», «Foto del local de día». En el Estudio el dueño toca el espacio y sube su foto; en la página publicada un espacio vacío no se ve, así que el diseño debe seguir bien sin él.",
  "Úsalos con medida: máximo 6 por página, solo donde una foto real del negocio hace la diferencia.",
  "Portada con foto a sangre sin foto todavía: deja el fondo de imagen sin imageRef y pon en color un tono oscuro de la paleta; el texto blanco se lee igual mientras el dueño sube la foto.",
];

function bulletBlock(title: string, lines: readonly string[]): string {
  return [`${title}:`, ...lines.map((line) => `- ${line}`)].join("\n");
}

const fontPairs = [
  "Bricolage Grotesque (títulos) + DM Sans (cuerpo): cálido y con carácter, para cocina casera, fondas y panaderías.",
  "Cormorant Garamond (títulos) + Manrope u Outfit (cuerpo): fino y elegante, para bares de noche, salones, florerías y hoteles.",
  "DM Serif Display (títulos) + Manrope (cuerpo): editorial, para restaurantes de autor, cafés de especialidad y estudios.",
  "Outfit (títulos) + Manrope (cuerpo): limpio y fresco, para cafeterías de día, comida saludable y tiendas.",
  "Bebas Neue u Oswald (títulos cortos) + Montserrat (cuerpo): audaz, para tacos, hamburguesas, bares deportivos y eventos.",
  "Manrope (títulos) + DM Sans (cuerpo): sobrio y confiable, para consultorios, despachos e inmobiliarias.",
  "Lora (títulos) + DM Sans (cuerpo), con Caveat solo en una frase corta: artesanal, para panaderías y productos hechos a mano.",
  "Poppins (títulos) + DM Sans (cuerpo): amable y redondeado, para escuelas, heladerías y veterinarias.",
  "Playfair Display (títulos) + Lora (cuerpo): clásico editorial; Space Grotesk + Geist: técnico y moderno.",
];

/**
 * The giro part of the guide on its own: the named giro's recipe, or the
 * whole table when the giro is unknown. Kardo's AI prompts put it in the
 * user message (next to the organization profile it comes from), so the
 * system prompt stays identical, and cached, across every giro.
 */
export function giroRecipeSection(giro?: KardoDesignGiro): string {
  if (giro) {
    return bulletBlock(`Receta para este giro (${giroLabels[giro]})`, [
      giroRecipes[giro],
    ]);
  }
  return bulletBlock(
    "Recetas por giro (usa la que mejor describa el negocio, a partir de su descripción)",
    kardoDesignGiros.map((item) => `${giroLabels[item]}: ${giroRecipes[item]}`),
  );
}

export type KardoDesignGuideOptions = {
  /** Includes the recipe for this page type, if there is one (from
   * `pageRecipes`). Omit for a guide that does not depend on the type. */
  experienceType?: DesignableExperienceType;
  /** Includes the recipe for this business type. Omit to include a short
   * table covering every giro instead, so the guide still helps the model
   * infer which one applies to the description it receives as data. */
  giro?: KardoDesignGiro;
  /** Leaves the giro part out entirely (no recipe, no table): the caller
   * sends `giroRecipeSection` elsewhere, as Kardo's AI prompts do. */
  omitGiro?: boolean;
  /** Adds the rules written in Kardo's own blocks (composition, photo
   * spaces), for the block design prompt; modo HTML writes its own code
   * and gets the directions without them. */
  forBlocks?: boolean;
  /** "full" (default): every section. "brief": only the universal
   * principles and what to avoid, no recipes, for a smaller prompt (a single
   * `html` block, which does not need the whole-page playbook). */
  detail?: "full" | "brief";
};

/**
 * The Kardo design guide, in Spanish, for a business page read on a phone.
 * Pure and deterministic: same options, same string. Used as the fixed,
 * cacheable part of every AI design prompt (`custom-html-prompt.ts`,
 * `design-prompt.ts`) and by the `kardo-disenador` skill the dev-bridge
 * agents load.
 */
export function kardoDesignGuide(
  options: KardoDesignGuideOptions = {},
): string {
  const detail = options.detail ?? "full";
  const fontFamilyList = Object.values(customHtmlFontFamilies).join(", ");
  const styleFontList = designFonts
    .filter((font) => !(font in customHtmlFontFamilies))
    .join(", ");

  const sections: string[] = [
    "Guía de diseño de Kardo. Son reglas concretas y verificables, no gustos: síguelas siempre que diseñes una página.",

    bulletBlock("Jerarquía", [
      "Un solo h1 por página (el título o el nombre del negocio). Los demás títulos son h2 o h3.",
      "Escala tipográfica con proporción: por ejemplo 32, 24, 18, 16, 14 px. No uses tamaños al azar ni más de 4 o 5 tamaños distintos.",
      "Pesos: 600 para títulos, 400 o 500 para texto normal. Evita el texto muy delgado (300) en tamaños chicos, es difícil de leer en un celular.",
    ]),

    bulletBlock("Espaciado", [
      "Usa múltiplos de 4 u 8 px para separaciones y rellenos (8, 16, 24, 32, 48, 64). Nunca números sueltos como 13 o 22.",
      "Márgenes laterales de la página de 20 a 24 px en celular.",
      "Ancho de lectura: un párrafo no debe pasar de unos 60 a 75 caracteres por línea; en columnas anchas, limita el ancho del texto aunque la sección sea más ancha.",
    ]),

    bulletBlock("Contraste y color", [
      "Contraste medido, no a ojo: al menos 4.5:1 entre texto y fondo en texto normal, y 3:1 en texto grande (19 px o más) o en negritas grandes. Revisa en especial el texto sobre botones y sobre imágenes.",
      "El texto secundario (muted) también es texto: 4.5:1 contra el fondo y contra las tarjetas. Un gris claro sobre blanco casi nunca llega; oscurécelo hasta que llegue.",
      "Texto encima de una foto: oscurece la foto (overlay de 35 a 60, o una figura de color detrás del texto) y escribe el texto en blanco o casi blanco. Sin eso, una foto con zonas claras se come el texto.",
      "El acento debe contrastar 3:1 con las tarjetas para que el botón se vea. Los botones suaves (soft) escriben con el color del acento sobre un tinte del mismo acento: úsalos solo con un acento oscuro (4.5:1 contra las tarjetas); con un acento claro o pastel, usa botones sólidos.",
      "Si el acento escribe texto (precios en el color del acento, enlaces o letras sobre la página), es texto: 4.5:1 contra el fondo y contra las tarjetas. Un rosa o un dorado claro sobre blanco casi nunca llega.",
      "Colores que pide el dueño contra los de su marca: en esta página mandan los que pide para esta página. El logo nunca se recolorea, se le pone filtro ni se deforma; si su color choca, ponlo sobre una superficie neutra.",
      "Fondo difuminado (ambient): en paletas pálidas (crema, blanco, pastel) déjalo apagado (none); úsalo con fondos oscuros o de color fuerte.",
      "Reparte el color 60/30/10: 60% un color dominante (casi siempre un neutro), 30% un color secundario, 10% el acento en lo que debe destacar (el botón principal, un detalle). Un solo acento por página.",
      'Neutros teñidos: un fondo o una superficie "blanca" o "gris" se ve mejor con una pizca del tono de la marca (por ejemplo un blanco cálido si el acento es cálido) que un gris o blanco puro.',
    ]),

    bulletBlock("Tipografía", [
      `Tipografías reales disponibles: ${fontFamilyList}.`,
      `Familias de estilo (cuando no se necesita una tipografía con nombre): ${styleFontList}.`,
      "Combina como máximo dos tipografías: una para títulos, otra para cuerpo. Parejas que funcionan bien:",
      ...fontPairs.map((pair) => `  ${pair}`),
    ]),

    bulletBlock("Botones", [
      'Altura mínima de 44 px (el dedo debe tocarlos sin fallar). El texto usa un verbo de acción: Reservar, Pedir, Comprar, Agendar, nunca solo "Enviar" o "Click aquí".',
      "Un botón primario por pantalla (la acción más importante); el resto, secundarios o de contorno. No pongas dos botones primarios compitiendo uno junto al otro.",
    ]),

    // Block designs get the same, in more detail, in their composition.
    ...(options.forBlocks
      ? []
      : [
          bulletBlock("Portada", [
            "La primera pantalla debe responder dos preguntas sin desplazarse: qué es este negocio y qué puedo hacer aquí. Nombre o logo, una frase corta, y la acción principal a la vista.",
            "Evita que la portada sea solo una imagen grande sin texto: el visitante debe entender el negocio en dos segundos.",
          ]),
        ]),

    bulletBlock("Llamadas a la acción", [
      "Ordena las acciones por prioridad real del negocio (la que más le conviene primero), no por el orden en que se te ocurrieron.",
      "No repitas la misma acción en dos botones distintos de la misma pantalla.",
    ]),

    ...(options.forBlocks
      ? []
      : [
          bulletBlock("Fotos", [
            "Recorta con una proporción consistente entre fotos del mismo tipo (todas 1:1, o todas 4:3): mezclar proporciones se ve descuidado.",
            "Usa máscaras cuando ayuden a la composición: circular para retratos o logos, arco o burbuja para portadas, nunca una máscara distinta en cada foto de una misma cuadrícula.",
            "El fondo difuminado y las tarjetas ya dan profundidad: no le pongas un marco o sombra pesada además de eso.",
          ]),
        ]),

    bulletBlock('Qué evitar (el "look de IA")', [
      "Destellos, brillos o partículas decorativas sin motivo.",
      "Degradados morados o azul y rosa genéricos que no vienen del color de la marca.",
      "Emojis usados como si fueran íconos (usa las formas y los íconos del sistema de diseño, no emojis).",
      'Texto de relleno ("Lorem ipsum", "Título aquí", frases genéricas de plantilla): siempre el contenido real del negocio.',
      "Mayúsculas sostenidas en párrafos completos (está bien en una etiqueta corta, nunca en una oración).",
      "La página genérica: fondo blanco, un título centrado, un párrafo y una pila de botones iguales, con la misma tipografía del sistema. Toda página lleva una portada compuesta, una pareja tipográfica con carácter y al menos un bloque que muestre algo real del negocio (fotos, destacados, datos clave).",
      ...aiTellRules,
    ]),
  ];

  if (detail === "brief") return sections.join("\n\n");

  if (options.forBlocks) {
    sections.push(
      bulletBlock(
        "Composición de una página profesional (síguela con los bloques de Kardo)",
        compositionRules,
      ),
    );
    if (options.experienceType) {
      sections.push(
        bulletBlock(
          "Cómo se arma este tipo de página (en este orden)",
          typeCompositions[options.experienceType],
        ),
      );
    }
    sections.push(
      bulletBlock(
        "Colocación en un lienzo (Kardo la mide y te regresa lo que no cumpla)",
        placementRules,
      ),
    );
    sections.push(
      bulletBlock("Fotos en su caja y en su forma", [
        ...photoRules,
        ...photoSpaceRules,
      ]),
    );
  }

  sections.push(
    bulletBlock(
      "Direcciones de arte. Elige una que le quede al negocio (o la de la idea elegida, si viene) y síguela completa: su paleta como punto de partida (con el color de la marca como acento si contrasta), su pareja tipográfica, sus esquinas, su portada y sus secciones. Una página sin dirección se ve genérica",
      designDirectionIds.map((id) => designDirectionLine(designDirections[id])),
    ),
  );

  // Block designs get the type's full composition above instead.
  const pageRecipe =
    options.experienceType && !options.forBlocks
      ? pageRecipes[options.experienceType]
      : undefined;
  if (pageRecipe) {
    sections.push(bulletBlock(`Receta para este tipo de página`, [pageRecipe]));
  }

  if (!options.omitGiro) sections.push(giroRecipeSection(options.giro));

  return sections.join("\n\n");
}
