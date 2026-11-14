// Every line on the landing lives here. Rules: short sentences, "tú",
// Mexican everyday words, no dashes, no "·", and nothing the product does
// not do today (Docs/engineering/11-customer-mvp-capabilities.md;
// test/content.test.ts checks it). Kardo is the platform: QR and NFC are
// two ways in, with the same weight.

// The menu: the page of the platform, the page of the pieces, the pieces
// designer and the questions. "Precios" (/precios/) is added by the header and the footer once
// the billing catalog is approved.
export const navigation = [
  { href: "/plataforma/", label: "Plataforma" },
  { href: "/piezas/", label: "Piezas" },
  { href: "/personalizar/", label: "Personalizar" },
  { href: "#preguntas", label: "Preguntas" },
];

/** Copy aprobado para el hero */
export const hero = {
  /** The h1: the first part in ink, `titleAccent` in Kardo's teal. */
  title: "Cambia lo que ven tus clientes",
  titleAccent: "sin volver a imprimir.",
  lead: "Mantén promociones, información y contacto de tu negocio vigentes desde un solo lugar.",
  ctaPrimary: "Crear mi cuenta",
  ctaSecondary: "Ver precios",
  genericWord: "negocio",
  titleEnd: "en un solo panel.",
};

export interface PageKind {
  id:
    | "menu"
    | "catalog"
    | "profile"
    | "links"
    | "image"
    | "document"
    | "form"
    | "redirect";
  name: string;
  text: string;
}

/** The eight Page types of the MVP, in plain words. */
export const pageKinds: PageKind[] = [
  {
    id: "menu",
    name: "Menú",
    text: "Secciones, platillos con foto y precio. Lo agotado se marca al momento.",
  },
  {
    id: "catalog",
    name: "Catálogo",
    text: "Productos con foto, precio y un botón para ver más.",
  },
  {
    id: "profile",
    name: "Perfil",
    text: "Tu nombre, a qué te dedicas y tus botones de contacto.",
  },
  {
    id: "links",
    name: "Página de enlaces",
    text: "Varios botones en una sola página: WhatsApp, reseñas o ubicación.",
  },
  {
    id: "image",
    name: "Imagen",
    text: "Una promoción o un aviso a lo ancho de la pantalla.",
  },
  {
    id: "document",
    name: "PDF",
    text: "Tu carta, una ficha técnica o un manual para descargar.",
  },
  {
    id: "form",
    name: "Formulario",
    text: "Te dejan sus datos, con su permiso, y te llegan a tu panel.",
  },
  {
    id: "redirect",
    name: "Redirección",
    text: "Manda directo a otra dirección: tu WhatsApp, tus reseñas de Google o tu tienda en línea.",
  },
];

export const pages = {
  title: "Ocho tipos de página, listos para tu negocio.",
  lead: "Eliges uno, lo llenas desde tu panel y lo adaptas a tu marca: fondo sólido, degradado o con imagen, color de acento, estilo de botones y tipo de letra.",
};

export interface Channel {
  id: "qr" | "nfc" | "other";
  name: string;
  line: string;
  text: string;
  points: string[];
}

/** Touchpoint kinds of the panel (apps/customer-web touchpoints/kind.ts). */
export const channels: Channel[] = [
  {
    id: "qr",
    name: "QR",
    line: "Se escanea con la cámara.",
    text: "Lo diseñas en Diseño del QR con tus colores, tu logo y un marco con texto. Antes de descargarlo en PNG, SVG o PDF para imprenta, Kardo revisa que se pueda leer.",
    points: [
      "Biblioteca de diseños para toda tu organización",
      "Hoja lista para imprimir los QR de un grupo",
    ],
  },
  {
    id: "nfc",
    name: "NFC",
    line: "Se acerca el celular.",
    text: "Una placa, una tarjeta o una etiqueta. El panel te da la dirección de cada una y una guía para grabarla en chips NTAG213.",
    points: [
      "Funciona con iPhone y Android",
      "Si un celular no lee NFC, la misma dirección va en un QR",
    ],
  },
  {
    id: "other",
    name: "Otro",
    line: "Solo necesita la dirección.",
    text: "Tu ficha en mapas, una respuesta rápida de WhatsApp Business, un anuncio, tu firma de correo o un botón en tu sitio. Cada uno es un punto propio, con sus visitas por separado.",
    points: [
      "Kardo lo cuenta como URL directa",
      "Mismo panel y mismas estadísticas",
    ],
  },
];

/** "Otro" supports of one business, each its own point with its visits. */
export const otherExamples = {
  business: "Florería Lila",
  items: [
    { id: "mapas", place: "Ficha en mapas", action: "Sitio web", visits: 58 },
    {
      id: "whatsapp",
      place: "WhatsApp Business",
      action: "Respuesta rápida con el catálogo",
      visits: 41,
    },
    {
      id: "anuncio",
      place: "Anuncio en redes",
      action: "Ver catálogo",
      visits: 27,
    },
    {
      id: "correo",
      place: "Firma de correo",
      action: "Ve nuestro catálogo",
      visits: 12,
    },
    {
      id: "sitio",
      place: "Botón en tu sitio",
      action: "Ver catálogo",
      visits: 9,
    },
  ],
  note: "Cada uno es un punto propio con sus visitas",
} as const;

/** Secuencia material de Cómo funciona (3 pasos verificables unidos por una línea) */
export const howItWorks = {
  title: "Cómo funciona Kardo",
  lead: "El soporte físico o enlace permanece; el contenido se actualiza en segundos desde tu panel.",
  steps: [
    {
      number: "1",
      verb: "Elige tu contenido",
      detail:
        "Prepara tu menú, catálogo, perfil, formulario o página de enlaces desde tu panel.",
    },
    {
      number: "2",
      verb: "Conecta tu punto",
      detail:
        "Pon tu pieza Kardo en el mostrador, la mesa o el refri, o graba tu propio NFC e imprime tu QR. Cada punto tiene una dirección fija que no cambia.",
    },
    {
      number: "3",
      verb: "Publica el cambio",
      detail:
        "Tus clientes ven la información actualizada en segundos al tocar o escanear, sin necesidad de reimprimir materiales.",
    },
  ],
};

/** Tres capacidades reales */
export const capabilities = {
  title: "Tres capacidades reales para tu negocio",
  lead: "Una plataforma pensada para resolver el día a día de un negocio local de forma directa.",
  items: [
    {
      id: "publicar",
      eyebrow: "Publicar",
      title: "Publica y actualiza en segundos",
      lead: "Menú, catálogo, perfil, formulario, PDF, imagen, redirección o enlaces.",
      text: "Modifica platillos, precios y avisos del día desde tu celular o computadora. Los cambios quedan publicados en segundos.",
      badge: "8 formatos listos",
    },
    {
      id: "conectar",
      eyebrow: "Conectar",
      title: "Conecta cada punto físico",
      lead: "QR, NFC y URL directa con el mismo peso.",
      text: "Asigna una página a una mesa individual, a un mostrador o a un grupo completo como tus mesas al mismo tiempo.",
      badge: "Gestión por grupos",
    },
    {
      id: "actividad",
      eyebrow: "Medir",
      title: "Entiende la actividad de tus puntos",
      lead: "Accesos, clics y contactos por punto y canal.",
      text: "Revisa qué mesa, mostrador o cartel genera más interacción. Mide accesos sin registrar datos personales ni identificadores del celular.",
      badge: "Métricas claras",
      points: [
        "Métricas por día y por hora",
        "Separación clara entre QR, NFC y enlaces directos",
        "Formularios con consentimiento y exportación a CSV",
      ],
    },
  ],
  // Keep primary and secondary for backwards compatibility with any imports
  primary: [
    {
      id: "publicar",
      eyebrow: "Contenido flexible",
      title: "Publica páginas a la medida",
      lead: "Menú, catálogo, perfil, formulario, PDF, imagen, redirección o enlaces.",
      text: "Modifica platillos, precios y avisos del día desde tu celular o computadora. Los cambios quedan publicados de inmediato.",
      badge: "8 formatos listos",
    },
    {
      id: "conectar",
      eyebrow: "Puntos permanentes",
      title: "Conecta tus puntos físicos y digitales",
      lead: "QR, NFC y URL directa con el mismo peso.",
      text: "Asigna una página a una mesa individual, a un mostrador o a un grupo completo como tus mesas al mismo tiempo.",
      badge: "Gestión por grupos",
    },
  ],
  secondary: {
    id: "actividad",
    eyebrow: "Medición clara",
    title: "Entiende la actividad de tus puntos",
    lead: "Accesos, clics y contactos por punto y canal.",
    text: "Revisa qué mesa, mostrador o cartel genera más interés. Mide accesos sin registrar datos personales ni identificadores del celular.",
    points: [
      "Métricas por día y por hora",
      "Separación clara entre QR, NFC y enlaces directos",
      "Formularios con consentimiento y exportación a CSV",
    ],
  },
};

export interface Business {
  id: string;
  name: string;
  title: string;
  text: string;
  channels: string[];
  pages: string[];
  /** A name in src/content/media.json (scripts/media/landing-images.mjs). */
  image: { name: string; alt: string };
  message: string;
}

/** Tres contextos transversales para demostrar flexibilidad */
export const businesses: Business[] = [
  {
    id: "alimentos",
    name: "Alimentos y bebidas",
    title: "Menú, promociones y lo que se agotó, siempre al día.",
    text: "Tus mesas abren tu menú completo con fotos y precios. Si un platillo se agota, lo marcas en segundos sin reimprimir la carta.",
    channels: ["Sticker en mesa", "Stand en caja"],
    pages: ["Menú", "Imagen para promoción", "Redirección a reseñas"],
    image: {
      name: "negocio-alimentos",
      alt: "Mesa de una cafetería con un capuchino, una concha y un sticker redondo de la mesa 12 para ver el menú; al fondo, un stand de Kardo en la barra",
    },
    message:
      "Hola, tengo un negocio de alimentos o bebidas y quiero solicitar una demo de Kardo",
  },
  {
    id: "tiendas",
    name: "Tiendas y productos",
    title: "Tu catálogo en el mostrador y en tus canales digitales.",
    text: "Muestra tus productos destacados y promociones de temporada. Un solo punto en tu mostrador guía a tus clientes a ver más o escribirte a WhatsApp.",
    channels: ["Stand en mostrador", "Sticker en empaque", "Link en perfil"],
    pages: ["Catálogo", "Redirección a WhatsApp", "Página de enlaces"],
    image: {
      name: "negocio-tiendas",
      alt: "Mostrador de una florería con ramos envueltos en papel kraft, un stand de Florería Lila para ver el catálogo y bolsas con sticker",
    },
    message:
      "Hola, tengo una tienda o venta de productos y quiero solicitar una demo de Kardo",
  },
  {
    id: "servicios",
    name: "Servicios locales",
    title: "Información, ubicación y contacto directo desde recepción.",
    text: "En un consultorio, estudio o taller, un punto de contacto permite consultar servicios, pedir informes o abrir una conversación directa.",
    channels: ["Card", "Stand en recepción"],
    pages: ["Perfil", "Formulario", "Página de enlaces"],
    image: {
      name: "negocio-servicios",
      alt: "En la recepción de un despacho de arquitectura, una mano entrega a otra una card negra de Arista y Asociados",
    },
    message:
      "Hola, ofrezco servicios locales y quiero solicitar una demo de Kardo",
  },
];

export const businessesDisclaimer =
  "Escenas ilustrativas generadas. No son clientes ni instalaciones de Kardo.";

/** Capacidades de confianza integradas */
export const confidence = {
  title: "Diseñado para la operación diaria de tu negocio",
  lead: "Herramientas para mantener tu información al día con seguridad y control de versiones.",
  items: [
    {
      id: "versions",
      title: "Versiones guardadas",
      text: "Cada publicación queda respaldada en tu historial. Puedes volver a una versión anterior cuando lo necesites.",
    },
    {
      id: "safe",
      title: "Continuidad asegurada",
      text: "Si una publicación nueva se interrumpe, se mantiene la versión anterior para que tus puntos nunca queden vacíos.",
    },
    {
      id: "availability",
      title: "Disponibilidad en vivo",
      text: "Marca platillos o productos agotados al momento sin tener que volver a publicar toda la página.",
    },
    {
      id: "qr-print",
      title: "QR listo para imprenta",
      text: "Descarga tus códigos en alta resolución (PNG, SVG o PDF) con revisión de legibilidad antes de imprimir.",
    },
    {
      id: "teams",
      title: "Equipo con roles",
      text: "Asigna permisos a tus colaboradores con roles de Owner, Admin, Editor o Viewer según sus funciones.",
    },
    {
      id: "analytics",
      title: "Medición respetuosa",
      text: "Conoce accesos y clics por punto, canal y horario sin almacenar datos personales ni identificadores del celular.",
    },
  ],
};

/** Página /piezas */
export const piecesPage = {
  metaTitle: "Piezas con QR y NFC",
  metaDescription:
    "Stand, Card, Magnet y Sticker con QR y NFC, impresos con tu marca. Medidas, materiales y kits con 30 días del panel de Kardo.",
  label: "Las piezas",
  title: "Cuatro formatos,",
  titleEm: "impresos con tu marca.",
  lead: "Medidas, materiales y dónde va cada una. Todas llevan QR y NFC con la misma dirección.",
  questions: [
    "¿Mis clientes necesitan instalar alguna aplicación?",
    "¿Cómo conecto las piezas de mi kit a mi panel?",
    "¿Qué pasa cuando terminan los 30 días del kit?",
    "¿Tengo que diseñar algo?",
    "¿Cómo me llegan las piezas?",
    "¿El imán funciona en un refri de metal?",
  ],
};

/** Bloque de compra: los kits de kits-catalog.json (ADR 025) */
export const kitsSection = {
  label: "Kits",
  title: "Empieza con un kit.",
  order: "Pedirlo por WhatsApp",
  basicTitle: "Tus piezas no se quedan en blanco.",
  basicText:
    "Si después de los 30 días no sigues con el panel, tus piezas Kardo siguen abriendo tu WhatsApp o tu ficha de Google Maps. Solo dejas de poder cambiarlas y de ver tus visitas.",
};

/**
 * How a kit reaches the panel (ADR 025 and the activation code built in the
 * Touchpoints section). The wording matches the panel: «Producto de Kardo»
 * and «código de activación».
 */
export const kitActivation = {
  title: "Así llega tu kit a tu panel",
  steps: [
    {
      title: "Lo pides y apruebas el diseño",
      text: "Por WhatsApp eliges tu kit y nos mandas tu logo. Te enseñamos cómo quedan tus piezas antes de imprimir.",
    },
    {
      title: "Te entregamos tus piezas",
      text: "Impresas con tu marca y probadas una por una, con QR y NFC. En la caja va una tarjeta con tu código de activación.",
    },
    {
      title: "Las activas con tu código",
      text: "Escaneas la tarjeta o escribes el código en tu panel. Todas las piezas del kit quedan conectadas a la vez, con su nombre, y empiezan tus 30 días.",
    },
  ],
  link: "¿Ya tienes tu kit? Actívalo",
};

export const faqs = [
  {
    q: "¿Mis clientes necesitan instalar alguna aplicación?",
    a: "No. Acercan su celular a la pieza o escanean el QR con la cámara, y la página se abre en su navegador. Funciona con iPhone y Android; si un celular no lee NFC, el QR de la misma pieza abre lo mismo.",
  },
  {
    q: "¿Cómo conecto las piezas de mi kit a mi panel?",
    a: "Creas tu cuenta y, en tu panel, agregas un Producto de Kardo con el código de activación que viene en la caja. Si escaneas la tarjeta del código, llegas directo a ese paso. Un solo código conecta todas las piezas del kit, aunque sean 25.",
  },
  {
    q: "¿Qué pasa cuando terminan los 30 días del kit?",
    a: "Eliges un plan para seguir cambiando lo que abren tus piezas y ver tus visitas. Si no, tus piezas Kardo siguen abriendo un destino fijo: tu WhatsApp o tu ficha de Google Maps.",
  },
  {
    q: "¿Tengo que diseñar algo?",
    a: "No. Nos mandas tu logo por WhatsApp, armamos el diseño y te lo enseñamos antes de imprimir.",
  },
  {
    q: "¿Cómo me llegan las piezas?",
    a: "Entregamos en Puebla. A otras ciudades las mandamos por paquetería; el costo y el tiempo se acuerdan al ordenar.",
  },
  {
    q: "¿El imán funciona en un refri de metal?",
    a: "Está hecho para eso: lleva una capa de ferrita entre el chip y el imán, que es lo que deja que el celular lo lea sobre metal. Cada pieza se prueba antes de entregarla.",
  },
  {
    q: "¿Qué pasa si cambio mi menú, catálogo o promociones?",
    a: "Entras a tu panel de Kardo, haces los ajustes y publicas. En segundos tus piezas, tus QR y tus NFC muestran lo nuevo, sin reimprimir nada.",
  },
  {
    q: "Tengo varias mesas en mi restaurante. ¿Las tengo que cambiar una por una?",
    a: "No. Puedes crear tus mesas y agruparlas. Al publicar en el grupo, se actualizan todas a la vez; si lo prefieres, una mesa también puede tener su propia página.",
  },
  {
    q: "¿Qué datos se guardan de mis clientes?",
    a: "Contamos visitas y clics por canal, día y hora, sin registrar direcciones IP ni información del dispositivo. Si usas un formulario, solo se guardan los datos con el consentimiento del usuario.",
  },
];

export const closing = {
  label: "Empieza hoy",
  title: "Lo que abre tu QR, tu NFC o tu link, siempre al día.",
  cta: "Crear mi cuenta",
  ctaSecondary: "Escríbenos por WhatsApp",
  whatsappMessage: "Hola, quiero solicitar una demo de Kardo para mi negocio.",
};

/** Mensaje de contacto comercial predeterminado */
export const contactMessage =
  "Hola, quiero solicitar una demo de Kardo para mi negocio.";

// Backwards compatibility with existing imports in tests or components
export const included = confidence;
export const connect = {
  title: "QR, NFC u otro: llegan por donde ya están tus clientes.",
  lead: "Cada punto tiene una dirección que no cambia. La imprimes en un QR, la grabas en un NFC o la pones donde quieras. Lo que abre se cambia en el panel.",
  groups: {
    title: "Veinte mesas, una sola publicación.",
    text: "Creas de una vez de la Mesa 1 a la Mesa 20 y las agrupas. Publicas en el grupo y cambian todas; una mesa también puede tener su propia página.",
  },
  links: {
    title: "Links: tu página para redes.",
    text: "Links es otro producto de Kardo: una página con tu @handle para poner en Instagram, TikTok o WhatsApp, con tus redes y tus botones. Vive aparte de tus QR y tus NFC.",
    handle: "@cafecentral",
  },
};

export const insights = {
  title: "Sabes qué funciona y cuándo.",
  lead: "Tu Resumen junta las visitas de tus QR, tus NFC y tus links: por canal, por día y por hora, contra el periodo anterior. Lo armas con los widgets que te sirven.",
  points: [
    "Accesos, clics y solicitudes de cada punto y de cada página.",
    "Agrega, mueve y cambia de tamaño cada widget.",
    "Contamos visitas, no personas: sin IP ni datos del celular.",
  ],
  leads:
    "Los formularios guardan datos solo con el permiso de quien los deja. Los consultas en tu panel y los exportas a CSV.",
};
