// Kardo AI test bench (scripts/dev/ai-eval, 2026-10-02): the cases.
//
// Each case is one organization (its profile: name, giro, city, "Sobre tu
// negocio", brand colors, logo and an optional cover photo) plus what a
// normal person would type in the Estudio's "¿Cómo quieres tu página?" box,
// written the way people actually write (lowercase, missing accents, no
// design words). One Experience type per case, several giros, never only
// restaurants. `html: true` also runs the modo HTML path (links, profile and
// linkpage only, the three types modo HTML exists for).
//
// `content` is the Experience's real content, in `@kardo/page-render`'s
// `DesignableContent` shape: the prompt only ever sees a summary of it (the
// same summary the API builds), the screenshots draw all of it. Image refs
// in `content` are keys of `photos` (or of the generated assets, see
// `assets.mts`), resolved to local files by the preview.
//
// Photos come from the public website's own media (apps/website/public/
// media), real photos of real-looking businesses; logos, posters and PDF
// pages are drawn by `assets.mts`.

import type { DesignableExperienceType } from "../../../packages/contracts/src/design.ts";
import type { DesignableContent } from "../../../packages/page-render/src/types.ts";

export type EvalIndustry =
  | "restaurante"
  | "cafeteria"
  | "bar"
  | "hotel"
  | "retail"
  | "salud"
  | "belleza"
  | "servicios"
  | "eventos"
  | "educacion"
  | "inmobiliaria"
  | "otro";

export type EvalLogo = {
  /** Big letters inside the mark (initials or a short word). */
  mark: string;
  /** Name under the mark. */
  wordmark: string;
  shape: "circle" | "rounded" | "arch";
  font: "serif" | "sans" | "rounded";
};

export type EvalCase = {
  id: string;
  type: DesignableExperienceType;
  /** Also run modo HTML for this case (links, profile, linkpage only). */
  html?: boolean;
  business: {
    name: string;
    industry: EvalIndustry;
    city: string;
    about: string;
    brand: { primary: string; accent: string };
    logo: EvalLogo;
    /** Repo-relative path of a cover photo, when the business has one. */
    cover?: string;
    /** The profile's phone (Configuración → Organización). */
    phone?: string;
  };
  /** What the person types, as they would type it. */
  request: string;
  /** The "Fotos" choice of the AI form (2026-10-03): with photos, without
   * photos or the AI decides (default). */
  photoMode?: "auto" | "with" | "without";
  /** Repo-relative photo paths used by `content` image refs. */
  photos?: Record<string, string>;
  content: DesignableContent;
};

const MEDIA = "apps/website/public/media";

export const evalCases: EvalCase[] = [
  {
    id: "floreria-links",
    type: "links",
    html: true,
    business: {
      name: "Florería Lila",
      phone: "222 123 4567",
      industry: "retail",
      city: "Puebla",
      about:
        "Arreglos florales para regalar y para eventos. Entregas a domicilio en Puebla.",
      brand: { primary: "#2F5D50", accent: "#E07A93" },
      logo: {
        mark: "L",
        wordmark: "Florería Lila",
        shape: "arch",
        font: "serif",
      },
      cover: `${MEDIA}/hero/floreria-ramo.webp`,
    },
    request:
      "hola, tengo una floreria en puebla y quiero que la gente me pida arreglos por whatsapp. que se vean mis flores y que sea facil pedir",
    content: {
      type: "links",
      title: "Florería Lila",
      links: [
        {
          id: "fl-whatsapp",
          label: "Pedir por WhatsApp",
          url: "https://wa.me/522221234567",
        },
        {
          id: "fl-arreglos",
          label: "Ver arreglos y precios",
          url: "https://florerialila.mx/arreglos",
        },
        {
          id: "fl-envios",
          label: "Entregas a domicilio",
          url: "https://florerialila.mx/envios",
        },
        {
          id: "fl-mapa",
          label: "Cómo llegar",
          url: "https://maps.google.com/?q=Floreria+Lila+Puebla",
        },
        {
          id: "fl-instagram",
          label: "Instagram",
          url: "https://instagram.com/florerialila",
        },
      ],
    },
  },
  {
    id: "veterinaria-links",
    type: "links",
    business: {
      name: "Veterinaria Patitas",
      phone: "722 123 4567",
      industry: "salud",
      city: "Toluca",
      about: "Consultas, vacunas, estética y urgencias para perros y gatos.",
      brand: { primary: "#1D5C8C", accent: "#F2A541" },
      logo: {
        mark: "P",
        wordmark: "Patitas",
        shape: "circle",
        font: "rounded",
      },
    },
    request:
      "Soy veterinaria en Toluca. Necesito una página donde mis clientes encuentren rápido el teléfono de urgencias, cómo agendar consulta y cómo llegar",
    content: {
      type: "links",
      title: "Veterinaria Patitas",
      links: [
        {
          id: "vp-urgencias",
          label: "Urgencias 24 horas",
          url: "https://wa.me/527221234567?text=Urgencia",
        },
        {
          id: "vp-cita",
          label: "Agendar consulta",
          url: "https://wa.me/527221234567",
        },
        {
          id: "vp-vacunas",
          label: "Vacunas y precios",
          url: "https://patitas.mx/vacunas",
        },
        {
          id: "vp-mapa",
          label: "Cómo llegar",
          url: "https://maps.google.com/?q=Veterinaria+Patitas+Toluca",
        },
      ],
    },
  },
  {
    id: "contadora-profile",
    type: "profile",
    html: true,
    business: {
      name: "Sofía Ramírez Contadora",
      phone: "55 1234 5678",
      industry: "servicios",
      city: "Ciudad de México",
      about:
        "Contadora pública. Declaraciones, contabilidad mensual y facturación para personas y negocios pequeños.",
      brand: { primary: "#1F2A44", accent: "#C9A227" },
      logo: {
        mark: "SR",
        wordmark: "Sofía Ramírez",
        shape: "rounded",
        font: "serif",
      },
      cover: `${MEDIA}/hero/despacho-oficina.webp`,
    },
    request:
      "soy contadora, hago declaraciones anuales y llevo la contabilidad de negocios chicos. quiero algo serio pero no aburrido para que me contacten",
    content: {
      type: "profile",
      displayName: "Sofía Ramírez",
      headline: "Contadora pública para negocios pequeños",
      biography:
        "Te ayudo con tu declaración anual, tu contabilidad mensual y tus facturas, sin vueltas.",
      links: [
        {
          id: "sr-whatsapp",
          label: "Escríbeme por WhatsApp",
          url: "https://wa.me/525512345678",
        },
        {
          id: "sr-llamada",
          label: "Agenda una llamada",
          url: "https://cal.com/sofiaramirez",
        },
        {
          id: "sr-servicios",
          label: "Servicios y precios",
          url: "https://sofiaramirez.mx/servicios",
        },
        {
          id: "sr-correo",
          label: "Mándame un correo",
          url: "mailto:hola@sofiaramirez.mx",
        },
      ],
    },
  },
  {
    id: "yoga-linkpage",
    type: "linkpage",
    html: true,
    business: {
      name: "Prana Yoga",
      phone: "442 123 4567",
      industry: "salud",
      city: "Querétaro",
      about: "Clases de yoga para todos los niveles en el centro de Querétaro.",
      brand: { primary: "#5B6B4E", accent: "#D9A066" },
      logo: {
        mark: "P",
        wordmark: "Prana Yoga",
        shape: "circle",
        font: "serif",
      },
    },
    request:
      "pagina para mi estudio de yoga para poner en mi bio de instagram, con los horarios, las reservas y mis redes. algo tranquilo",
    content: {
      type: "linkpage",
      displayName: "Prana Yoga",
      bio: "Clases para todos los niveles. Centro de Querétaro.",
      socials: [
        {
          id: "py-ig",
          network: "instagram",
          value: "https://instagram.com/pranayogaqro",
        },
        {
          id: "py-wa",
          network: "whatsapp",
          value: "https://wa.me/524421234567",
        },
        {
          id: "py-sp",
          network: "spotify",
          value: "https://open.spotify.com/user/pranayoga",
        },
      ],
      links: [
        {
          id: "py-horarios",
          label: "Horarios de la semana",
          url: "https://pranayoga.mx/horarios",
          highlight: true,
        },
        {
          id: "py-reserva",
          label: "Reserva tu clase",
          url: "https://pranayoga.mx/reservar",
        },
        {
          id: "py-prueba",
          label: "Primera clase gratis",
          url: "https://pranayoga.mx/prueba",
        },
        {
          id: "py-mapa",
          label: "Cómo llegar",
          url: "https://maps.google.com/?q=Prana+Yoga+Queretaro",
        },
      ],
    },
  },
  {
    id: "fonda-menu",
    type: "menu",
    business: {
      name: "Fonda Doña Mary",
      phone: "55 2345 6789",
      industry: "restaurante",
      city: "Ciudad de México",
      about: "Comida corrida casera de lunes a sábado en la Narvarte.",
      brand: { primary: "#9C2F1F", accent: "#F2C14E" },
      logo: {
        mark: "DM",
        wordmark: "Fonda Doña Mary",
        shape: "circle",
        font: "serif",
      },
      cover: `${MEDIA}/hero/restaurante-enchiladas.webp`,
    },
    request:
      "es el menu de mi fonda para que lo vean con el qr en las mesas. comida corrida, desayunos y bebidas. que se lea bien y rapido",
    photos: {
      chilaquiles: `${MEDIA}/hero/restaurante-chilaquiles.webp`,
      enchiladas: `${MEDIA}/hero/restaurante-enchiladas.webp`,
    },
    content: {
      type: "menu",
      title: "Fonda Doña Mary",
      description: "Comida corrida casera, de lunes a sábado.",
      currency: "MXN",
      sections: [
        {
          id: "fdm-desayunos",
          name: "Desayunos",
          items: [
            {
              id: "fdm-d1",
              name: "Chilaquiles verdes",
              description: "Con huevo estrellado, crema y queso",
              price: 95,
              imageRef: "chilaquiles",
            },
            {
              id: "fdm-d2",
              name: "Huevos al gusto",
              description: "Con frijoles y tortillas",
              price: 75,
            },
            {
              id: "fdm-d3",
              name: "Molletes",
              description: "Con pico de gallo",
              price: 70,
            },
          ],
        },
        {
          id: "fdm-comida",
          name: "Comida corrida",
          items: [
            {
              id: "fdm-c1",
              name: "Comida del día",
              description: "Sopa, arroz, guisado del día y agua",
              price: 120,
            },
            {
              id: "fdm-c2",
              name: "Enchiladas verdes",
              description: "De pollo, con crema y cebolla",
              price: 110,
              imageRef: "enchiladas",
            },
            {
              id: "fdm-c3",
              name: "Milanesa de res",
              description: "Con ensalada y papas",
              price: 115,
              availability: { soldOut: false, remaining: 4 },
            },
          ],
        },
        {
          id: "fdm-bebidas",
          name: "Bebidas",
          items: [
            { id: "fdm-b1", name: "Agua de jamaica", price: 30 },
            { id: "fdm-b2", name: "Café de olla", price: 35 },
            { id: "fdm-b3", name: "Refresco", price: 30 },
          ],
        },
      ],
    },
  },
  {
    id: "cafe-central-menu",
    type: "menu",
    business: {
      name: "Café Central",
      phone: "33 1234 5678",
      industry: "cafeteria",
      city: "Guadalajara",
      about: "Cafetería de barrio con pan dulce hecho aquí y café de Veracruz.",
      brand: { primary: "#4A2C21", accent: "#D98E4A" },
      logo: {
        mark: "CC",
        wordmark: "Café Central",
        shape: "circle",
        font: "serif",
      },
      cover: `${MEDIA}/hero/restaurante-cafe.webp`,
    },
    request:
      "Menú de Café Central, cafetería de barrio en Guadalajara. Queremos que se vea cálido, con fotos del pan y el café, y que se note la bebida de temporada",
    photos: {
      cafe: `${MEDIA}/hero/restaurante-cafe.webp`,
      concha: `${MEDIA}/hero/restaurante-concha.webp`,
      chilaquiles: `${MEDIA}/hero/restaurante-chilaquiles.webp`,
    },
    content: {
      type: "menu",
      title: "Café Central",
      description: "Pan dulce hecho aquí y café de Veracruz.",
      currency: "MXN",
      sections: [
        {
          id: "cc-calientes",
          name: "Bebidas calientes",
          items: [
            {
              id: "cc-1",
              name: "Latte de calabaza",
              description: "Bebida de temporada, con canela",
              price: 70,
            },
            {
              id: "cc-2",
              name: "Café de olla",
              description: "Con piloncillo y canela",
              price: 45,
              imageRef: "cafe",
            },
            { id: "cc-3", name: "Americano", price: 40 },
            { id: "cc-4", name: "Capuchino", price: 55 },
          ],
        },
        {
          id: "cc-pan",
          name: "Pan dulce",
          items: [
            {
              id: "cc-5",
              name: "Concha",
              description: "De vainilla o chocolate",
              price: 25,
              imageRef: "concha",
            },
            { id: "cc-6", name: "Cuerno", price: 30 },
            {
              id: "cc-7",
              name: "Oreja",
              price: 28,
              availability: { soldOut: true, remaining: null },
            },
          ],
        },
        {
          id: "cc-comer",
          name: "Para comer",
          items: [
            {
              id: "cc-8",
              name: "Chilaquiles",
              description: "Verdes o rojos, con huevo",
              price: 110,
              imageRef: "chilaquiles",
            },
            {
              id: "cc-9",
              name: "Molletes",
              description: "Con frijoles y queso gratinado",
              price: 85,
            },
          ],
        },
      ],
    },
  },
  {
    id: "panaderia-catalog",
    type: "catalog",
    business: {
      name: "Panadería La Espiga",
      phone: "81 1234 5678",
      industry: "retail",
      city: "Monterrey",
      about:
        "Pan dulce y bolillo recién horneado todos los días desde las 7 de la mañana.",
      brand: { primary: "#8C5A2B", accent: "#F4D35E" },
      logo: { mark: "E", wordmark: "La Espiga", shape: "arch", font: "serif" },
      cover: `${MEDIA}/hero/restaurante-concha.webp`,
    },
    request:
      "quiero que mis clientes vean el pan que hacemos y lo encarguen por whatsapp para recoger en la tienda",
    photos: { concha: `${MEDIA}/hero/restaurante-concha.webp` },
    content: {
      type: "catalog",
      title: "Pan para encargar",
      description: "Encarga hoy y recoge mañana en la tienda.",
      currency: "MXN",
      items: [
        {
          id: "le-1",
          name: "Conchas, paquete de 6",
          description: "Vainilla y chocolate",
          price: 120,
          url: "https://wa.me/528112345678?text=Conchas",
          imageRef: "concha",
        },
        {
          id: "le-2",
          name: "Pan de muerto",
          description: "De temporada, con azúcar o ajonjolí",
          price: 180,
          url: "https://wa.me/528112345678?text=Pan+de+muerto",
        },
        {
          id: "le-3",
          name: "Bolillo, docena",
          price: 60,
          url: "https://wa.me/528112345678?text=Bolillo",
        },
        {
          id: "le-4",
          name: "Orejas, 6 piezas",
          price: 90,
          url: "https://wa.me/528112345678?text=Orejas",
        },
        {
          id: "le-5",
          name: "Cuernitos, 6 piezas",
          price: 95,
          url: "https://wa.me/528112345678?text=Cuernitos",
          availability: { soldOut: false, remaining: 3 },
        },
      ],
    },
  },
  {
    id: "inmobiliaria-catalog",
    type: "catalog",
    business: {
      name: "Roble Inmobiliaria",
      phone: "999 123 4567",
      industry: "inmobiliaria",
      city: "Mérida",
      about: "Casas, departamentos y terrenos en venta en el norte de Mérida.",
      brand: { primary: "#1E3D33", accent: "#B08D57" },
      logo: { mark: "R", wordmark: "Roble", shape: "rounded", font: "sans" },
      cover: `${MEDIA}/hero/inmobiliaria-casa.webp`,
    },
    request:
      "Catálogo de casas y departamentos en venta en Mérida. Que se vean las fotos grandes y el precio, y que puedan pedir informes",
    photos: {
      casa: `${MEDIA}/hero/inmobiliaria-casa.webp`,
      sala: `${MEDIA}/hero/inmobiliaria-sala.webp`,
      cocina: `${MEDIA}/hero/inmobiliaria-cocina.webp`,
    },
    content: {
      type: "catalog",
      title: "Propiedades en venta",
      description: "Norte de Mérida. Precios en pesos.",
      currency: "MXN",
      items: [
        {
          id: "rb-1",
          name: "Casa en Temozón Norte",
          description: "3 recámaras, alberca, 280 m² de construcción",
          price: 4850000,
          url: "https://roble.mx/temozon",
          imageRef: "casa",
        },
        {
          id: "rb-2",
          name: "Departamento en Altabrisa",
          description: "2 recámaras, terraza, amenidades",
          price: 2300000,
          url: "https://roble.mx/altabrisa",
          imageRef: "sala",
        },
        {
          id: "rb-3",
          name: "Casa en Cholul",
          description: "3 recámaras, cocina integral",
          price: 3150000,
          url: "https://roble.mx/cholul",
          imageRef: "cocina",
        },
        {
          id: "rb-4",
          name: "Terreno en Conkal",
          description: "450 m², listo para construir",
          price: 950000,
          url: "https://roble.mx/conkal",
        },
      ],
    },
  },
  {
    id: "dentista-form",
    type: "form",
    business: {
      name: "Clínica Dental Sonríe",
      phone: "477 123 4567",
      industry: "salud",
      city: "León",
      about: "Odontología general, limpiezas, ortodoncia y blanqueamiento.",
      brand: { primary: "#0E7C86", accent: "#9AD1D4" },
      logo: {
        mark: "S",
        wordmark: "Sonríe",
        shape: "rounded",
        font: "rounded",
      },
    },
    request:
      "formulario para que mis pacientes pidan cita, que dejen su nombre y telefono y nosotros les marcamos. consultorio dental en leon",
    content: {
      type: "form",
      title: "Agenda tu cita",
      description: "Déjanos tus datos y te llamamos para confirmar el horario.",
      fields: { name: "required", phone: "required", message: "optional" },
      submitLabel: "Pedir cita",
      successMessage: "Gracias. Te llamamos hoy mismo para confirmar.",
      consentText:
        "Acepto que Clínica Dental Sonríe use mis datos para agendar mi cita.",
    },
  },
  {
    id: "academia-form",
    type: "form",
    business: {
      name: "Academia Lumen",
      phone: "222 765 4321",
      industry: "educacion",
      city: "Puebla",
      about: "Cursos de inglés para niños, jóvenes y adultos. Grupos pequeños.",
      brand: { primary: "#23395B", accent: "#F6AE2D" },
      logo: {
        mark: "AL",
        wordmark: "Academia Lumen",
        shape: "rounded",
        font: "serif",
      },
    },
    request:
      "inscripciones abiertas para cursos de ingles para niños y adultos, quiero que dejen sus datos para mandarles informes",
    content: {
      type: "form",
      title: "Inscripciones abiertas",
      description:
        "Déjanos tus datos y te mandamos horarios y precios por WhatsApp.",
      fields: { name: "required", phone: "required", message: "optional" },
      submitLabel: "Quiero informes",
      successMessage: "Listo. Te escribimos por WhatsApp en menos de un día.",
      consentText: "Acepto que Academia Lumen me contacte para darme informes.",
    },
  },
  {
    id: "hotel-document",
    type: "document",
    business: {
      name: "Casa Jacaranda",
      phone: "951 123 4567",
      industry: "hotel",
      city: "Oaxaca",
      about: "Hotel boutique de 12 habitaciones en el centro de Oaxaca.",
      brand: { primary: "#5E3A6E", accent: "#E3B04B" },
      logo: {
        mark: "CJ",
        wordmark: "Casa Jacaranda",
        shape: "arch",
        font: "serif",
      },
      cover: `${MEDIA}/hotel.webp`,
    },
    request:
      "guia para los huespedes del hotel: horarios del desayuno, wifi, reglas de la alberca. que se lea en el cel sin descargar nada",
    content: {
      type: "document",
      title: "Guía del huésped",
      description: "Todo lo que necesitas durante tu estancia.",
      display: "viewer",
      pages: [
        { ref: "hotel-page-1", width: 1240, height: 1754 },
        { ref: "hotel-page-2", width: 1240, height: 1754 },
        { ref: "hotel-page-3", width: 1240, height: 1754 },
      ],
      allowDownload: false,
    },
  },
  {
    id: "taller-document",
    type: "document",
    business: {
      name: "Taller Barro",
      phone: "55 8765 4321",
      industry: "otro",
      city: "Ciudad de México",
      about:
        "Talleres de cerámica para principiantes y piezas hechas a mano en Coyoacán.",
      brand: { primary: "#A0522D", accent: "#E9D8C4" },
      logo: {
        mark: "TB",
        wordmark: "Taller Barro",
        shape: "arch",
        font: "sans",
      },
      cover: `${MEDIA}/eventos.webp`,
    },
    request:
      "calendario de talleres de ceramica de este mes en pdf, para compartir en el qr de la tienda",
    content: {
      type: "document",
      title: "Talleres de octubre",
      description: "Fechas, horarios y precios de los talleres del mes.",
      display: "viewer",
      pages: [
        { ref: "taller-page-1", width: 1240, height: 1754 },
        { ref: "taller-page-2", width: 1240, height: 1754 },
      ],
      allowDownload: true,
    },
  },
  {
    id: "barberia-image",
    type: "image",
    business: {
      name: "Barbería El Bigote",
      phone: "33 9876 5432",
      industry: "belleza",
      city: "Zapopan",
      about: "Cortes clásicos, fade y arreglo de barba.",
      brand: { primary: "#111111", accent: "#C8102E" },
      logo: {
        mark: "EB",
        wordmark: "El Bigote",
        shape: "circle",
        font: "sans",
      },
    },
    request:
      "promo del mes de la barberia: corte + barba en 199. es un cartel que ya tengo hecho, solo quiero que se vea bien cuando escaneen el qr",
    content: {
      type: "image",
      alt: "Cartel: corte y barba por 199 pesos en Barbería El Bigote, todo octubre",
      imageRef: "barberia-poster",
    },
  },
  {
    id: "unas-image",
    type: "image",
    business: {
      name: "Estudio Noa",
      phone: "81 8765 4321",
      industry: "belleza",
      city: "Monterrey",
      about: "Uñas, pestañas y manicure spa en San Pedro.",
      brand: { primary: "#3B2F4A", accent: "#E7B7C8" },
      logo: {
        mark: "N",
        wordmark: "Estudio Noa",
        shape: "arch",
        font: "serif",
      },
    },
    request:
      "foto de nuestro trabajo de uñas para el qr del mostrador, que se vea elegante",
    photos: { unas: `${MEDIA}/hero/salon-unas.webp` },
    content: {
      type: "image",
      alt: "Manicure en tono nude hecho en Estudio Noa",
      imageRef: "unas",
    },
  },
  // 2026-10-03 (relevo 29): the "Fotos" choice of the AI form.
  {
    id: "taqueria-menu-sinfotos",
    type: "menu",
    business: {
      name: "Tacos El Güero",
      phone: "55 4321 8765",
      industry: "restaurante",
      city: "Ciudad de México",
      about: "Tacos de canasta y de guisado desde 1998 en la Portales.",
      brand: { primary: "#1F4E79", accent: "#F2A900" },
      logo: {
        mark: "EG",
        wordmark: "Tacos El Güero",
        shape: "rounded",
        font: "sans",
      },
    },
    request:
      "un menu sencillo sin fotos, nomas los tacos y los precios, que se lea rapido en el cel cuando escanean el qr",
    photoMode: "without",
    content: {
      type: "menu",
      title: "Tacos El Güero",
      description: "Tacos de canasta y de guisado.",
      currency: "MXN",
      sections: [
        {
          id: "teg-tacos",
          name: "Tacos",
          items: [
            {
              id: "teg-t1",
              name: "Taco de canasta",
              description: "Papa, frijol, chicharrón o adobo",
              price: 15,
            },
            {
              id: "teg-t2",
              name: "Taco de guisado",
              description:
                "Chicharrón en salsa verde, papa con chorizo o rajas",
              price: 22,
            },
            { id: "teg-t3", name: "Taco de suadero", price: 20 },
            {
              id: "teg-t4",
              name: "Gringa",
              description: "Pastor con queso en tortilla de harina",
              price: 45,
            },
            { id: "teg-t5", name: "Orden de 5 de canasta", price: 65 },
          ],
        },
        {
          id: "teg-extras",
          name: "Extras",
          items: [
            { id: "teg-e1", name: "Queso extra", price: 10 },
            { id: "teg-e2", name: "Nopales asados", price: 15 },
          ],
        },
        {
          id: "teg-bebidas",
          name: "Bebidas",
          items: [
            { id: "teg-b1", name: "Agua de horchata", price: 25 },
            { id: "teg-b2", name: "Agua de jamaica", price: 25 },
            { id: "teg-b3", name: "Refresco", price: 25 },
            { id: "teg-b4", name: "Café de olla", price: 20 },
          ],
        },
      ],
    },
  },
  {
    id: "antojitos-menu-confotos",
    type: "menu",
    business: {
      name: "Antojitos Lupita",
      phone: "222 345 6789",
      industry: "restaurante",
      city: "Puebla",
      about: "Antojitos poblanos y desayunos caseros cerca del centro.",
      brand: { primary: "#7A1F3D", accent: "#3E8E5E" },
      logo: {
        mark: "AL",
        wordmark: "Antojitos Lupita",
        shape: "circle",
        font: "rounded",
      },
      cover: `${MEDIA}/hero/restaurante-chilaquiles.webp`,
    },
    request:
      "quiero mi menu con fotos grandes de los platillos para que se antojen, las que no tengo foto que quede el espacio para subirla",
    photoMode: "with",
    photos: {
      chilaquiles: `${MEDIA}/hero/restaurante-chilaquiles.webp`,
      enchiladas: `${MEDIA}/hero/restaurante-enchiladas.webp`,
      concha: `${MEDIA}/hero/restaurante-concha.webp`,
    },
    content: {
      type: "menu",
      title: "Antojitos Lupita",
      description: "Antojitos poblanos y desayunos caseros.",
      currency: "MXN",
      sections: [
        {
          id: "al-desayunos",
          name: "Desayunos",
          items: [
            {
              id: "al-d1",
              name: "Chilaquiles rojos",
              description: "Con pollo, crema y queso de rancho",
              price: 90,
              imageRef: "chilaquiles",
            },
            {
              id: "al-d2",
              name: "Molotes",
              description: "De papa con chorizo, tres piezas",
              price: 70,
            },
            {
              id: "al-d3",
              name: "Chalupas poblanas",
              description: "Salsa verde y roja, cebolla",
              price: 65,
            },
          ],
        },
        {
          id: "al-comida",
          name: "Comida",
          items: [
            {
              id: "al-c1",
              name: "Enchiladas de mole",
              description: "Mole poblano de la casa",
              price: 115,
              imageRef: "enchiladas",
            },
            {
              id: "al-c2",
              name: "Cemita de milanesa",
              description: "Con quesillo, aguacate y pápalo",
              price: 95,
            },
          ],
        },
        {
          id: "al-postres",
          name: "Pan y postres",
          items: [
            {
              id: "al-p1",
              name: "Concha con nata",
              price: 30,
              imageRef: "concha",
            },
            { id: "al-p2", name: "Camote poblano", price: 25 },
          ],
        },
      ],
    },
  },
];
