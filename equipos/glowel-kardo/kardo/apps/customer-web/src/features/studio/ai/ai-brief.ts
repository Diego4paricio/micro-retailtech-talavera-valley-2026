import {
  briefAsksForPrices,
  type ConceptBrief,
  customHtmlExperienceTypes,
  type DesignableExperienceType,
  type DesignPhotoMode,
} from "@kardo/contracts";
import type { IconName } from "../../../components/Icon.js";
import { togglePhrase } from "../html/objectives.js";

// ---------------------------------------------------------------------------
// "Diseñar con IA" by type (relevo 29, 2026-10-03): the form speaks of the
// Experience being designed (a Menú, a Formulario, an Imagen…), not of a
// generic page. Each type has its own question, its own example requests
// and its own quick additions, and the photo choice only shows where it
// means something.
// ---------------------------------------------------------------------------

export type AiExample = { label: string; text: string };
export type AiShortcut = {
  id: string;
  label: string;
  icon: IconName;
  /** Appended to (or removed from) the description. */
  phrase: string;
};

export type AiTypeCopy = {
  /** "tu menú", "tu formulario"… */
  noun: string;
  question: string;
  placeholder: string;
  examples: readonly AiExample[];
  shortcuts: readonly AiShortcut[];
  /** Whether the "Fotos" choice applies (an Imagen is its photo). */
  photoChoice: boolean;
};

const whatsapp: AiShortcut = {
  id: "whatsapp",
  label: "Pedir por WhatsApp",
  icon: "send",
  phrase: "Un botón claro para escribirnos por WhatsApp.",
};

export const aiTypeCopy: Record<DesignableExperienceType, AiTypeCopy> = {
  links: {
    noun: "tus enlaces",
    question: "¿Cómo quieres tu página de enlaces?",
    placeholder:
      "Ej.: Para el QR del mostrador. Primero WhatsApp, luego el catálogo y cómo llegar. Que se vea como mi logo.",
    examples: [
      {
        label: "Para Instagram",
        text: "Una página corta para el link de mi Instagram: WhatsApp primero, luego mis productos y cómo llegar.",
      },
      {
        label: "Para el mostrador",
        text: "Para el QR del mostrador: que el primer botón sea dejar una reseña y después seguirnos en redes.",
      },
    ],
    shortcuts: [
      {
        id: "first-whatsapp",
        label: "WhatsApp primero",
        icon: "send",
        phrase: "El primer botón es escribirnos por WhatsApp.",
      },
      {
        id: "location",
        label: "Cómo llegar",
        icon: "location",
        phrase: "Que se vea cómo llegar y el horario.",
      },
      {
        id: "reviews",
        label: "Reseñas",
        icon: "star",
        phrase: "Pide dejar una reseña.",
      },
    ],
    photoChoice: true,
  },
  profile: {
    noun: "tu perfil",
    question: "¿Cómo quieres tu perfil?",
    placeholder:
      "Ej.: Mi perfil profesional con mi foto, mi especialidad en una línea y un botón para agendar cita.",
    examples: [
      {
        label: "Profesional",
        text: "Mi perfil profesional: mi foto, mi especialidad en una línea y un botón para agendar cita.",
      },
      {
        label: "Cercano",
        text: "Que se sienta cercano y de confianza, con mi horario y cómo llegar.",
      },
    ],
    shortcuts: [
      {
        id: "book",
        label: "Agendar cita",
        icon: "calendar",
        phrase: "La acción principal es agendar una cita.",
      },
      {
        id: "hours",
        label: "Horario",
        icon: "history",
        phrase: "Que se vea mi horario de atención.",
      },
      {
        id: "location",
        label: "Ubicación",
        icon: "location",
        phrase: "Que se vea dónde estoy.",
      },
    ],
    photoChoice: true,
  },
  linkpage: {
    noun: "tu página de link",
    question: "¿Cómo quieres tu página de link?",
    placeholder:
      "Ej.: Para la bio de Instagram y TikTok: mis redes arriba y abajo mis enlaces más importantes.",
    examples: [
      {
        label: "Para redes",
        text: "Para la bio de Instagram y TikTok: mis redes arriba y mis enlaces importantes abajo.",
      },
      {
        label: "Lo nuevo primero",
        text: "Que lo más nuevo (mi último lanzamiento o promoción) sea el primer enlace y destaque.",
      },
    ],
    shortcuts: [
      {
        id: "socials",
        label: "Redes arriba",
        icon: "share",
        phrase: "Mis redes sociales arriba, junto a mi nombre.",
      },
      whatsapp,
    ],
    photoChoice: true,
  },
  menu: {
    noun: "tu menú",
    question: "¿Cómo quieres tu menú?",
    placeholder:
      "Ej.: Que se antoje, con la comida del día arriba, lo más pedido y un botón para pedir por WhatsApp.",
    examples: [
      {
        label: "Que se antoje",
        text: "Que se antoje: el platillo estrella arriba, lo más pedido y un botón para pedir por WhatsApp.",
      },
      {
        label: "Sencillo",
        text: "Un menú sencillo que se lea rápido en el celular, con los precios claros.",
      },
      {
        label: "Para las mesas",
        text: "Para el QR de las mesas: las secciones en el orden en que se sirven y la promoción del día arriba.",
      },
    ],
    shortcuts: [
      whatsapp,
      {
        id: "featured",
        label: "Lo más pedido",
        icon: "star",
        phrase: "Destaca lo más pedido arriba del menú.",
      },
      {
        id: "promo",
        label: "Promoción del día",
        icon: "gift",
        phrase: "Resalta la promoción del día arriba.",
      },
      {
        id: "book",
        label: "Reservar",
        icon: "calendar",
        phrase: "Un botón para reservar mesa.",
      },
    ],
    photoChoice: true,
  },
  catalog: {
    noun: "tu catálogo",
    question: "¿Cómo quieres tu catálogo?",
    placeholder:
      "Ej.: Mis productos con foto y precio, lo nuevo primero y un botón para pedir por WhatsApp.",
    examples: [
      {
        label: "Para vender",
        text: "Mis productos con foto y precio, y un botón para pedir cada uno por WhatsApp.",
      },
      {
        label: "Lo nuevo arriba",
        text: "Que lo nuevo y lo más vendido aparezcan primero.",
      },
    ],
    shortcuts: [
      whatsapp,
      {
        id: "best",
        label: "Lo más vendido",
        icon: "star",
        phrase: "Destaca lo más vendido arriba.",
      },
      {
        id: "shipping",
        label: "Envíos y pagos",
        icon: "cart",
        phrase: "Que se vean los envíos y las formas de pago.",
      },
    ],
    photoChoice: true,
  },
  form: {
    noun: "tu formulario",
    question: "¿Cómo quieres tu formulario?",
    placeholder:
      "Ej.: Para pedir cita. Que diga qué pasa después de enviarlo y en cuánto tiempo respondemos.",
    examples: [
      {
        label: "Citas",
        text: "Un formulario para pedir cita: que diga qué pasa después de enviarlo y en cuánto tiempo respondemos.",
      },
      {
        label: "Cotizaciones",
        text: "Para pedir una cotización: claro, confiable y sin distracciones.",
      },
    ],
    shortcuts: [
      {
        id: "next",
        label: "Qué pasa después",
        icon: "checklist",
        phrase: "Explica qué pasa después de enviar el formulario.",
      },
      {
        id: "response",
        label: "Tiempo de respuesta",
        icon: "history",
        phrase: "Di en cuánto tiempo respondemos.",
      },
    ],
    photoChoice: true,
  },
  document: {
    noun: "tu PDF",
    question: "¿Cómo quieres tu PDF?",
    placeholder:
      "Ej.: Mi lista de precios. Que se entienda de qué trata y se lea grande en el celular.",
    examples: [
      {
        label: "Lista de precios",
        text: "Mi lista de precios en PDF, que se lea grande en el celular.",
      },
      {
        label: "Para descargar",
        text: "Que se entienda de qué trata el documento y se pueda descargar fácil.",
      },
    ],
    shortcuts: [
      {
        id: "about",
        label: "De qué trata",
        icon: "info",
        phrase: "Una portada corta que diga de qué trata el documento.",
      },
      whatsapp,
    ],
    photoChoice: true,
  },
  image: {
    noun: "tu imagen",
    question: "¿Cómo quieres mostrar tu imagen?",
    placeholder:
      "Ej.: Que mi póster se vea completo y grande, con un botón para escribirnos.",
    examples: [
      {
        label: "Póster",
        text: "Que mi póster se vea completo y grande, con un botón para escribirnos.",
      },
      {
        label: "Foto de trabajo",
        text: "Una foto de nuestro trabajo que se vea elegante, sin nada que distraiga.",
      },
    ],
    shortcuts: [whatsapp],
    photoChoice: false,
  },
};

export const photoModeOptions: readonly {
  mode: DesignPhotoMode;
  label: string;
  hint: string;
}[] = [
  {
    mode: "auto",
    label: "La IA decide",
    hint: "La IA usa fotos si tu negocio las tiene o le van.",
  },
  {
    mode: "with",
    label: "Con fotos",
    hint: "Fotos grandes. Donde falte una, deja un espacio para que la subas.",
  },
  {
    mode: "without",
    label: "Sin fotos",
    hint: "Un diseño de letras y color, sin fotos ni espacios para foto.",
  },
];

export const toneIdeas = [
  "elegante",
  "cálido",
  "moderno",
  "sencillo",
  "divertido",
  "artesanal",
] as const;

/** The words of a comma-separated tone, trimmed and without blanks. */
export function toneWordsOf(tone: string | undefined): string[] {
  return (tone ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
}

/** Whether the shortcut's phrase is already in the description. */
export function shortcutActive(
  brief: Pick<ConceptBrief, "description">,
  shortcut: AiShortcut,
): boolean {
  return brief.description.includes(shortcut.phrase);
}

/** Adds or removes the shortcut's phrase (a toggle). */
export function toggleShortcut(
  brief: ConceptBrief,
  shortcut: AiShortcut,
  max: number,
): ConceptBrief {
  return togglePhrase(brief, shortcut.phrase, max);
}

// ---------------------------------------------------------------------------
// The draft of the form, kept in this browser per Experience, so a reload
// before generating does not lose what the customer wrote. A convenience
// only: storage may be missing or full, and then nothing is kept.
// ---------------------------------------------------------------------------

export type AiDraft = { brief: ConceptBrief; photos: DesignPhotoMode };

function draftKey(experienceId: string): string {
  return `kardo:ai-draft:${experienceId}`;
}

export function readAiDraft(experienceId: string): AiDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(experienceId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<AiDraft>;
    const brief = value.brief;
    if (!brief || typeof brief.description !== "string") return null;
    return {
      brief: {
        description: brief.description,
        ...(typeof brief.tone === "string" ? { tone: brief.tone } : {}),
        colors: Array.isArray(brief.colors) ? brief.colors : [],
        imageRefs: Array.isArray(brief.imageRefs) ? brief.imageRefs : [],
        fonts: Array.isArray(brief.fonts) ? brief.fonts : [],
      },
      photos:
        value.photos === "with" || value.photos === "without"
          ? value.photos
          : "auto",
    };
  } catch {
    return null;
  }
}

export function saveAiDraft(experienceId: string, draft: AiDraft): void {
  try {
    window.localStorage.setItem(draftKey(experienceId), JSON.stringify(draft));
  } catch {
    // Private mode or full storage: the draft simply is not kept.
  }
}

// ---------------------------------------------------------------------------
// IA4 (relevo 37): a "página de enlaces" has no platillos nor precios of
// its own — Chema asked for "mis platillos y precios" on one of these, a
// pedido the type cannot deliver no matter what the IA designs.
// ---------------------------------------------------------------------------

export const noPricesPageTypes = new Set<DesignableExperienceType>(
  customHtmlExperienceTypes,
);

/** Whether to offer a Menú/Catálogo instead of designing a type that will
 * never show the prices the pedido asks for. */
export function pedidoAsksForPricesOnPageWithout(
  type: DesignableExperienceType,
  description: string,
): boolean {
  return noPricesPageTypes.has(type) && briefAsksForPrices(description);
}
