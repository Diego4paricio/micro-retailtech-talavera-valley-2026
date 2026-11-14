import type { HelpSection } from "@kardo/contracts";
import { linksBaseLabel } from "../../lib/business-address.js";

/**
 * Curated, versioned help — written by hand, no AI involved. It mirrors the
 * product rules the help assistant uses on the server
 * (services/customer-api/src/help/knowledge.ts), so the guide and the
 * assistant never contradict each other.
 */
export type HelpConcept = { term: string; detail: string };
export type HelpTask = { title: string; steps: string[] };
export type HelpGuide = {
  section: HelpSection;
  /** Navigation group the section lives in (sidebar label). */
  group: string;
  title: string;
  /** What it is. */
  summary: string;
  /** When to use it. */
  whenToUse: string;
  /** 3–5 key concepts. */
  concepts: HelpConcept[];
  /** Common tasks as short, numbered steps. */
  tasks: HelpTask[];
  /** Suggested questions for "Pregúntale a Kardo". */
  questions: string[];
};

export const helpGuides: Record<HelpSection, HelpGuide> = {
  general: {
    section: "general",
    group: "Kardo",
    title: "Cómo funciona Kardo",
    summary:
      "Kardo conecta objetos físicos con contenido digital que tú controlas. Una persona acerca su celular a una etiqueta NFC, escanea un QR o abre tu Link, y ve la página que publicaste.",
    whenToUse:
      "Si es tu primera vez en el panel o quieres entender cómo se relacionan QR y etiquetas, Links y páginas antes de empezar.",
    concepts: [
      {
        term: "QR o etiqueta",
        detail:
          "Un objeto físico con un solo formato: NFC, QR u Otro. Su dirección pública nunca cambia, así que puedes cambiar el contenido sin reimprimir.",
      },
      {
        term: "Link",
        detail:
          "Una dirección para compartir en WhatsApp, Instagram o tu bio. Como un QR, muestra una de tus páginas, pero no se imprime.",
      },
      {
        term: "Página",
        detail:
          "Lo que la persona ve: menú, catálogo, perfil, enlaces, imagen, PDF, formulario o redirección.",
      },
      {
        term: "Publicar",
        detail:
          "Los cambios se guardan como borrador y solo se ven en público cuando publicas. Cada publicación crea una versión.",
      },
      {
        term: "Grupos",
        detail:
          "Reúnen QR y etiquetas de un lugar. Lo que publicas en un grupo llega a todos sus QR y etiquetas.",
      },
    ],
    tasks: [
      {
        title: "Empezar en cuatro pasos",
        steps: [
          "Crea un QR o etiqueta en Físico → QR y etiquetas (o un Link en Digital → Links).",
          "Diseña una página en Contenido → Páginas.",
          "Publícala y elige a qué QR y etiquetas, grupos o Links llega.",
          "Graba la etiqueta NFC o descarga el QR, y pruébalo con tu celular.",
        ],
      },
      {
        title: "Encontrar ayuda en cada sección",
        steps: [
          "Pulsa «Ayuda» en la barra superior o «¿Cómo funciona?» junto al título.",
          "Lee la guía de la sección o cambia de tema con el selector.",
          "Escribe tu duda en «Pregúntale a Kardo».",
        ],
      },
    ],
    questions: [
      "¿Qué diferencia hay entre un QR o etiqueta y un Link?",
      "¿Qué pasa si cambio el contenido después de imprimir?",
      "¿Por dónde empiezo?",
    ],
  },

  overview: {
    section: "overview",
    group: "Resultados",
    title: "Resumen",
    summary:
      "El tablero de tu espacio: cuántas veces se abrieron tus QR y etiquetas, qué hicieron las personas después y cómo va contra el periodo anterior.",
    whenToUse:
      "Al empezar el día o después de lanzar una campaña, para saber si algo cambió y dónde conviene mirar con más detalle.",
    concepts: [
      {
        term: "Accesos",
        detail:
          "Aperturas por NFC, QR o URL directa. Si alguien abre dos veces, cuenta dos accesos.",
      },
      {
        term: "Clics en acciones",
        detail: "Toques a botones o enlaces dentro de una página publicada.",
      },
      {
        term: "Solicitudes y conversión",
        detail:
          "Formularios enviados con consentimiento. La tasa de conversión es solicitudes ÷ accesos.",
      },
      {
        term: "Periodo anterior",
        detail:
          "Los mismos días justo antes del rango elegido. El porcentaje de cada indicador y la línea punteada de la gráfica se comparan contra él.",
      },
    ],
    tasks: [
      {
        title: "Comparar periodos",
        steps: [
          "Elige 7, 30 o 90 días en el selector.",
          "Lee el porcentaje de cada indicador: compara contra el periodo anterior de igual duración.",
          "Pasa el cursor (o usa las flechas) sobre la gráfica para ver cada día.",
        ],
      },
      {
        title: "Ver una sola sucursal o zona",
        steps: [
          "Usa el selector de grupos junto al rango de días.",
          "Todos los indicadores y gráficas se recalculan para ese grupo.",
        ],
      },
      {
        title: "Completar los primeros pasos",
        steps: [
          "Crea un QR o etiqueta.",
          "Diseña una página y publícala.",
          "Conecta el objeto físico: graba la etiqueta NFC o imprime el QR.",
        ],
      },
    ],
    questions: [
      "¿Qué cuenta como un acceso?",
      "¿Por qué pudo bajar mi tasa de conversión?",
      "¿Qué significa la línea punteada de la gráfica?",
    ],
  },

  touchpoints: {
    section: "touchpoints",
    group: "Físico",
    title: "QR y etiquetas",
    summary:
      "Cada QR o etiqueta es un objeto físico con un solo formato: una etiqueta o tarjeta NFC, un código QR impreso u otro soporte. Su dirección pública nunca cambia, así que puedes cambiar el contenido sin reimprimir ni volver a grabar.",
    whenToUse:
      "Cuando vas a colocar algo en el mundo real —mesas, mostradores, empaques, tarjetas— y quieres controlar qué se abre al acercar el celular o escanear.",
    concepts: [
      {
        term: "Un formato por QR o etiqueta",
        detail:
          "Si una tarjeta lleva NFC y QR, son dos QR y etiquetas. Pueden mostrar la misma página, y la analítica distingue cada canal.",
      },
      {
        term: "Grupos",
        detail:
          "Reúnen los QR y etiquetas de un lugar, como «Terraza». Lo que publicas en el grupo llega a todos, incluso a los que agregues después.",
      },
      {
        term: "La asignación directa gana",
        detail:
          "Si un QR o etiqueta tiene una página asignada directamente, esa se muestra aunque su grupo tenga otra.",
      },
      {
        term: "Estado de la página",
        detail:
          "Sin publicar, Activo, Pausado (muestra «temporalmente no disponible»), Retirado (definitivo) y Suspendido por Kardo (contacta a soporte).",
      },
      {
        term: "Estado del objeto",
        detail:
          "Va aparte: Sin grabar o Sin imprimir, Grabado o Impreso, y Colocado. «Conecta el objeto» guarda cada paso, así que si recargas o sales a la mitad regresas al mismo paso.",
      },
      {
        term: "QR de respaldo",
        detail:
          "Cada NFC tiene uno que abre la misma página. Hace falta porque no todos los celulares leen NFC (o lo traen apagado), el metal y algunas fundas lo bloquean, y no todos saben acercar el celular. Sus visitas se cuentan como QR.",
      },
    ],
    tasks: [
      {
        title: "Crear uno o varios QR y etiquetas",
        steps: [
          "Pulsa «Nuevo QR o etiqueta» y elige el formato: NFC, QR u Otro.",
          "Ponle un nombre operativo que reconozcas, como «Mesa 4».",
          "Para varios a la vez usa la creación en lote (Mesa 1 … Mesa 12).",
          "Opcional: agrégalos a un grupo para publicar en todos juntos.",
        ],
      },
      {
        title: "Grabar una etiqueta NFC",
        steps: [
          "Abre el QR o etiqueta: «Conecta el objeto» te lleva por grabar la tarjeta, probarla, imprimir el QR de respaldo y colocarla.",
          "Copia la dirección y grábala con NFC Tools o NFC TagWriter (Escribir → Agregar registro → URL).",
          "Acerca tu celular: si ya hay algo publicado, «Pruébalo» se marca solo con la primera visita.",
          "Pega la tarjeta a la vista, nunca directo sobre metal, con su QR de respaldo al lado.",
        ],
      },
      {
        title: "Reemplazar una tarjeta perdida o dañada",
        steps: [
          "En el QR o etiqueta, pulsa «Reemplazar la tarjeta».",
          "Si la tarjeta nueva ya tenía algo, bórrala en NFC Tools (Otros → Borrar etiqueta) o formatéala si la app lo pide (Otros → Formatear memoria).",
          "Graba la misma dirección, pruébala y colócala. La anterior sigue abriendo la misma página.",
        ],
      },
      {
        title: "Pausar o retirar",
        steps: [
          "Pausar bloquea el acceso de forma temporal y se puede revertir.",
          "Retirar es definitivo: el código deja de activar contenido y su dirección no se reutiliza.",
        ],
      },
    ],
    questions: [
      "¿Qué diferencia hay entre pausar y retirar?",
      "¿Cómo grabo una etiqueta NFC?",
      "¿Para qué sirve el QR de respaldo?",
      "¿Qué pasa si una mesa tiene su propia página y además está en un grupo?",
    ],
  },

  "qr-studio": {
    section: "qr-studio",
    group: "Físico",
    title: "Diseño del QR",
    summary:
      "Diseña cómo se ven tus códigos QR y aplícalo a tus QR y etiquetas: una biblioteca de diseños de tu organización, un diseño por defecto para cada grupo y el diseño propio de cualquier QR o etiqueta. Kardo lee cada código como una cámara antes de dejarte descargarlo.",
    whenToUse:
      "Antes de imprimir menús, mesas, carteles o tarjetas, y cada vez que quieras que tus QR luzcan con tu marca.",
    concepts: [
      {
        term: "Regla de oro",
        detail:
          "Cada QR guarda la dirección permanente de su QR o etiqueta. Cambiar el diseño nunca rompe los QR ya impresos: solo cambia cómo se verán las próximas impresiones. Lo único que desactiva un QR es retirar su QR o etiqueta.",
      },
      {
        term: "De dónde sale el diseño",
        detail:
          "En orden: el diseño propio del QR o etiqueta; un diseño de la biblioteca aplicado a él; el diseño por defecto de su grupo (también para los QR y etiquetas que agregues después); y si no hay nada, el diseño Kardo.",
      },
      {
        term: "Biblioteca",
        detail:
          "Hasta 50 diseños compartidos por la organización. Se aplican por referencia: si editas uno, se actualiza en todos los QR y etiquetas y grupos que lo usan. Desde un QR o etiqueta puedes actualizar el diseño compartido o guardar los cambios solo para él.",
      },
      {
        term: "Control de impresión",
        detail:
          "Kardo recuerda con qué diseño exportaste cada QR. «El diseño cambió desde la última impresión» no es un error: vuelve a imprimir solo si quieres que se vean iguales.",
      },
      {
        term: "Legibilidad y tamaño",
        detail:
          "El indicador del escenario lee el código a varios tamaños, con desenfoque y con ruido; si algo obligatorio falla, no se puede descargar. Con logo, la corrección sube a nivel H y el código puede crecer para seguir leyéndose. Se lee bien hasta unas 10 veces su ancho.",
      },
    ],
    tasks: [
      {
        title: "Crear un diseño y usarlo en varias mesas",
        steps: [
          "En Diseño del QR, pulsa «Nuevo diseño» y parte del diseño Kardo o de una plantilla.",
          "Ajusta módulos, ojos, colores, logo y marco, y guarda.",
          "Usa «Aplicar a…» para elegir QR y etiquetas o grupos; en un grupo lo heredan también los QR y etiquetas nuevos.",
        ],
      },
      {
        title: "Personalizar un solo QR o etiqueta",
        steps: [
          "Abre el diseño del QR desde su ficha o desde «Tus QR».",
          "Edita el diseño y guarda. Si usaba un diseño compartido, elige «Guardar solo para este QR».",
          "Para volver al diseño del grupo o de la biblioteca, usa las acciones del recuadro «Origen del diseño».",
        ],
      },
      {
        title: "Imprimir los QR de un grupo",
        steps: [
          "Escribe {nombre} en el texto del marco para que cada código muestre su nombre.",
          "En «Tus QR», selecciona los QR y etiquetas y pulsa «Descargar hoja», o usa «Hoja con varios QR» al descargar.",
          "Elige papel Carta o A4 y el ancho de cada código: Kardo verifica cada uno y arma el PDF con marcas de corte.",
        ],
      },
    ],
    questions: [
      "¿Si cambio el diseño, tengo que reimprimir mis QR?",
      "¿Qué pasa si edito un diseño que usan varios QR y etiquetas?",
      "¿Por qué mi diseño no pasa la verificación de lectura?",
      "¿Qué tamaño y resolución uso para imprimir?",
    ],
  },

  links: {
    section: "links",
    group: "Digital",
    title: "Links",
    summary: `Un link es una dirección corta, como ${linksBaseLabel}tu-negocio/menu, que muestra una de tus páginas. Cambias lo que muestra cuando quieras y la dirección sigue igual.`,
    whenToUse:
      "Para tu bio de Instagram o TikTok, WhatsApp o tu firma de correo: donde compartes una dirección en vez de un código impreso.",
    concepts: [
      {
        term: "Tu dirección",
        detail: `${linksBaseLabel}tu-negocio. Es única y tus links van dentro de ella. La cambias en Links o en Configuración, una vez cada 7 días.`,
      },
      {
        term: "Link principal",
        detail:
          "El que abre tu dirección sola. Al principio es el primero que creas; lo cambias con «Hacer principal».",
      },
      {
        term: "Qué muestra",
        detail:
          "Cualquier página: menú, catálogo, PDF, imagen, formulario, perfil o página de enlaces.",
      },
      {
        term: "Pausar y retirar",
        detail:
          "Pausado, quien lo abra ve que no está disponible y lo reanudas cuando quieras. Retirado, deja de abrir para siempre.",
      },
    ],
    tasks: [
      {
        title: "Crear un link",
        steps: [
          "Pulsa «Nuevo link».",
          "Elige qué muestra.",
          "Revisa la última parte de la dirección y pulsa «Crear link».",
          "Cópialo o mándalo por WhatsApp.",
        ],
      },
      {
        title: "Cambiar lo que muestra",
        steps: [
          "En el link, abre «⋯» y elige «Cambiar qué muestra».",
          "Elige otra página. La dirección no cambia.",
        ],
      },
      {
        title: "Cambiar la dirección de un link",
        steps: [
          "Abre «⋯» y elige «Cambiar dirección».",
          "Escribe la última parte. Se puede una vez cada 7 días.",
        ],
      },
    ],
    questions: [
      "¿En qué se diferencia un link de un QR?",
      "¿Cómo pongo mi link en Instagram?",
      "¿Puedo pausar un link?",
    ],
  },

  experiences: {
    section: "experiences",
    group: "Contenido",
    title: "Páginas",
    summary:
      "Una página es lo que ve la persona al acercar el celular, escanear o abrir tu Link: menú, catálogo, perfil, enlaces, imagen, PDF, formulario de contacto o redirección.",
    whenToUse:
      "Cada vez que quieras cambiar lo que muestran tus QR y etiquetas o Links, sin tocar el objeto físico.",
    concepts: [
      {
        term: "Borrador y publicación",
        detail:
          "Guardar no cambia nada en público. Solo al publicar la página llega a dónde se ve.",
      },
      {
        term: "Versiones",
        detail:
          "Cada publicación crea una versión. Puedes restaurar una anterior desde el historial.",
      },
      {
        term: "Dónde se ve",
        detail:
          "Al publicar eliges QR y etiquetas, grupos o Links. Cualquier página, también la Página de enlaces, va en un QR, un NFC o un Link.",
      },
      {
        term: "Grupos y prioridad",
        detail:
          "Publicar en un grupo llega a todos sus QR y etiquetas, pero una página asignada directamente a un QR o etiqueta gana sobre la del grupo.",
      },
    ],
    tasks: [
      {
        title: "Crear y publicar",
        steps: [
          "Pulsa «Nueva página» y elige el tipo.",
          "Llena el contenido y revisa la vista previa.",
          "Guarda el borrador.",
          "Publica y elige dónde se ve: QR y etiquetas o grupos.",
        ],
      },
      {
        title: "Volver a una versión anterior",
        steps: [
          "Abre la página y ve a su historial.",
          "Elige la versión y restáurala.",
        ],
      },
    ],
    questions: [
      "¿Por qué una mesa no muestra lo que publiqué en su grupo?",
      "¿Cómo regreso a una versión anterior?",
      "¿Qué tipo de página me conviene para un menú?",
    ],
  },

  availability: {
    section: "availability",
    group: "Contenido",
    title: "Disponibilidad",
    summary:
      "Aquí marcas en vivo qué artículos de tus Menús y Catálogos están disponibles, agotados u ocultos, y cuántas piezas quedan. Sirve igual para un restaurante, una florería o una tienda.",
    whenToUse:
      "Durante el día, cada vez que algo se acaba, vuelve a estar listo o quieres avisar que quedan pocas piezas. No necesitas editar ni publicar la página.",
    concepts: [
      {
        term: "En vivo, sin publicar",
        detail:
          "Los cambios se ven al instante en todos los QR y etiquetas que muestran esa página. No crean versiones.",
      },
      {
        term: "Agotado",
        detail:
          "El artículo sigue en la página con la marca «Agotado» para que tus clientes sepan que existe.",
      },
      {
        term: "Oculto",
        detail:
          "El artículo desaparece de la página hasta que lo vuelvas a marcar como disponible.",
      },
      {
        term: "Piezas restantes",
        detail:
          "Si cuentas piezas, la página muestra «Quedan 3». Con 0 piezas el artículo se ve como agotado.",
      },
    ],
    tasks: [
      {
        title: "Marcar algo como agotado",
        steps: [
          "Elige el Menú o Catálogo.",
          "Busca el artículo.",
          "Pulsa «Agotado». El cambio se guarda solo.",
        ],
      },
      {
        title: "Mostrar cuántas piezas quedan",
        steps: [
          "Activa «Contar piezas» en el artículo.",
          "Ajusta la cantidad con los botones o escríbela.",
        ],
      },
      {
        title: "Empezar el día con todo disponible",
        steps: [
          "Pulsa «Todo disponible».",
          "Confirma. Todos los artículos quedan disponibles y sin conteo de piezas.",
        ],
      },
    ],
    questions: [
      "¿Mis clientes ven al instante un platillo agotado?",
      "¿Qué diferencia hay entre agotado y oculto?",
      "¿Cómo agrego fotos a los platillos de mi menú?",
    ],
  },

  assets: {
    section: "assets",
    group: "Contenido",
    title: "Archivos",
    summary:
      "Tu biblioteca de imágenes (PNG, JPEG y WebP) y documentos PDF para usar en tus páginas.",
    whenToUse:
      "Antes de armar un menú, catálogo o perfil: sube aquí tus fotos, logos y PDF para reutilizarlos.",
    concepts: [
      {
        term: "Validación",
        detail:
          "Kardo revisa cada archivo antes de que puedas usarlo en una página.",
      },
      {
        term: "Privacidad",
        detail: "A las fotos se les quitan los datos de ubicación al subirlas.",
      },
      {
        term: "Archivos en uso",
        detail:
          "Un archivo que usa alguna página no se puede borrar hasta que lo quites de ahí.",
      },
    ],
    tasks: [
      {
        title: "Subir archivos",
        steps: [
          "Arrastra los archivos a la zona de carga o elígelos.",
          "Espera a que termine la validación.",
          "Úsalos desde el editor de cualquier página.",
        ],
      },
      {
        title: "Borrar un archivo",
        steps: [
          "Quítalo primero de las páginas que lo usan.",
          "Después bórralo desde la biblioteca.",
        ],
      },
    ],
    questions: [
      "¿Qué formatos puedo subir?",
      "¿Por qué no puedo borrar un archivo?",
      "¿Kardo guarda la ubicación de mis fotos?",
    ],
  },

  analytics: {
    section: "analytics",
    group: "Resultados",
    title: "Analítica",
    summary:
      "El detalle de tus accesos por canal (NFC, QR y URL directa), por día, por hora y por QR o etiqueta, junto con clics y solicitudes.",
    whenToUse:
      "Para decidir dónde colocar más QR y etiquetas, en qué horario reforzar o qué contenido funciona mejor.",
    concepts: [
      {
        term: "Canales",
        detail:
          "NFC es acercar el celular; QR es escanear; URL directa es abrir el enlace compartido.",
      },
      {
        term: "Comparación",
        detail:
          "Los porcentajes y la línea punteada comparan contra el periodo anterior de la misma duración.",
      },
      {
        term: "Privacidad",
        detail:
          "Kardo no guarda IP ni identifica a los visitantes: solo cuenta totales agregados.",
      },
      {
        term: "Horarios",
        detail:
          "La gráfica de 24 horas y el mapa por día y hora muestran cuándo hay más actividad.",
      },
    ],
    tasks: [
      {
        title: "Comparar QR y etiquetas",
        steps: [
          "Baja a la tabla «Por QR o etiqueta»: está ordenada por accesos.",
          "Compara canales, clics y solicitudes de cada uno.",
        ],
      },
      {
        title: "Analizar un solo QR o etiqueta",
        steps: [
          "Elige el QR o etiqueta en el filtro superior.",
          "Todas las gráficas se recalculan para él.",
        ],
      },
      {
        title: "Leer los datos sin gráfica",
        steps: [
          "Pulsa «Ver como tabla» en cualquier gráfica.",
          "Los lectores de pantalla también reciben la tabla completa.",
        ],
      },
    ],
    questions: [
      "¿Por qué NFC y QR se cuentan por separado?",
      "¿Kardo sabe quién abrió mi QR o etiqueta?",
      "¿Cómo encuentro el horario con más actividad?",
    ],
  },

  leads: {
    section: "leads",
    group: "Resultados",
    title: "Solicitudes",
    summary:
      "Los contactos que dejan tus visitantes en un formulario de contacto, siempre con su consentimiento.",
    whenToUse:
      "Para dar seguimiento a interesados: marcar a quién ya contactaste, exportarlos o recibir avisos cuando llega uno nuevo.",
    concepts: [
      {
        term: "Estados",
        detail: "Nueva, Atendida y Cerrada te ayudan a llevar el seguimiento.",
      },
      {
        term: "Acceso restringido",
        detail:
          "Solo los roles Owner y Admin ven los datos de las solicitudes.",
      },
      {
        term: "Retención",
        detail:
          "Tú decides cuánto tiempo se guardan; después se borran automáticamente.",
      },
      {
        term: "Consentimiento",
        detail:
          "Quien envía una solicitud acepta compartir sus datos contigo en el formulario.",
      },
    ],
    tasks: [
      {
        title: "Dar seguimiento",
        steps: [
          "Filtra por «Nuevas».",
          "Contacta a la persona y cambia su estado a «Atendida».",
          "Márcala como «Cerrada» al terminar.",
        ],
      },
      {
        title: "Exportar",
        steps: [
          "Pulsa «Exportar CSV».",
          "Ábrelo en tu hoja de cálculo o impórtalo en tu CRM.",
        ],
      },
      {
        title: "Configurar la retención",
        steps: [
          "Elige cuántos días se conservan las solicitudes.",
          "Guarda: los más antiguos se borran automáticamente.",
        ],
      },
    ],
    questions: [
      "¿Quién puede ver mis solicitudes?",
      "¿Cómo exporto mis contactos?",
      "¿Cuánto tiempo se guardan las solicitudes?",
    ],
  },

  team: {
    section: "team",
    group: "Organización",
    title: "Equipo",
    summary:
      "Las personas que trabajan en tu organización, las invitaciones pendientes y lo que cada rol puede hacer. Aquí también ves y creas tus organizaciones.",
    whenToUse:
      "Cuando se suma o se va alguien (la florista nueva, el mecánico de medio tiempo, la recepcionista del consultorio) o cuando quieres ajustar qué puede ver o cambiar cada persona.",
    concepts: [
      {
        term: "Miembros e invitaciones",
        detail:
          "Van juntos en una sola lista: quienes ya están dentro y quienes aún no aceptan su invitación.",
      },
      {
        term: "Owner",
        detail:
          "Control total de la organización. Contrata el plan y es el único que puede pasar la propiedad. No puede salir sin transferirla antes.",
      },
      {
        term: "Admin",
        detail:
          "Administra al equipo, la configuración y las solicitudes. No puede modificar al Owner.",
      },
      {
        term: "Editor",
        detail: "Crea y publica QR y etiquetas, páginas y archivos.",
      },
      {
        term: "Viewer",
        detail: "Consulta el espacio y su analítica sin modificar nada.",
      },
      {
        term: "Qué puede hacer cada rol",
        detail:
          "Un grupo de esta pantalla lo explica en una o dos frases por rol. Solo Owner y Admin ven los datos de solicitudes.",
      },
      {
        term: "Tus organizaciones",
        detail:
          "Puedes pertenecer a varias y crear otra con «Crear organización». Cambias entre ellas con «Abrir» o con el selector del menú lateral.",
      },
    ],
    tasks: [
      {
        title: "Invitar a alguien",
        steps: [
          "Pulsa «Invitar».",
          "En el diálogo escribe su correo y elige el rol; cada rol trae su explicación.",
          "La persona acepta la invitación desde su correo. Si no le llegó, en su fila elige «Reenviar invitación»: el enlace anterior deja de servir.",
        ],
      },
      {
        title: "Transferir la propiedad y salir",
        steps: [
          "Si eres Owner, primero haz Administrador a la persona que la recibirá: solo se la puedes pasar a un Admin.",
          "En tu fila elige «Transferir propiedad…» y escoge a esa persona. Le llega una solicitud.",
          "La propiedad cambia cuando ella la acepta. Si deja de ser Admin antes, la solicitud se cancela.",
          "Después ya puedes salir de la organización; pierdes el acceso al instante.",
        ],
      },
      {
        title: "Crear otra organización",
        steps: [
          "En el grupo «Tus organizaciones» elige «Crear organización».",
          "Son 4 pasos: Negocio, Ubicación, Marca y Confirmar. Solo el nombre es obligatorio; lo demás lo completas después.",
          "Si tu plan ya no tiene lugar, el diálogo te lo dice y te lleva a elegir un plan o agregar una organización.",
        ],
      },
    ],
    questions: [
      "¿Qué rol le doy a quien solo publica contenido?",
      "¿Cómo transfiero la propiedad?",
      "¿Qué puede hacer un Viewer?",
    ],
  },

  settings: {
    section: "settings",
    group: "Organización",
    title: "General",
    summary:
      "El nombre de tu organización, tu link en Kardo y los datos de tu negocio. Lo que cambies aquí afecta a todo el equipo.",
    whenToUse:
      "Al abrir tu florería, taller, consultorio o tienda en Kardo, o cuando cambian tus datos de contacto o tu giro.",
    concepts: [
      {
        term: "Nombre",
        detail:
          "El nombre de la organización dentro de Kardo. Solo lo cambian los roles con permiso, con el botón «Cambiar».",
      },
      {
        term: "Tu link en Kardo",
        detail:
          "La dirección web de tu negocio en Kardo; tus links van dentro de ella. No es tu domicilio. Se cambia una vez cada 7 días.",
      },
      {
        term: "Datos del negocio",
        detail:
          "Nombre legal, giro, sobre tu negocio, horario, sitio web, correo de contacto, teléfono, ciudad, país, dirección y zona horaria del negocio (para las horas de tus visitas y solicitudes). Se editan con «Editar».",
      },
      {
        term: "Otra organización",
        detail:
          "Para otra sucursal u otro negocio, con sus propios datos y equipo. Si entraste por invitación, empiezas con «Crear mi propio negocio».",
      },
      {
        term: "Descargar los datos de la organización",
        detail:
          "Un archivo JSON con QR y etiquetas, páginas, grupos y solicitudes. Lo descargan los roles que ven las solicitudes (Owner y Admin).",
      },
      {
        term: "Sobre tu negocio",
        detail:
          "Una descripción breve de a qué te dedicas. La IA de Kardo la usa sola al diseñar tus páginas.",
      },
    ],
    tasks: [
      {
        title: "Cambiar el nombre de la organización",
        steps: [
          "Ve a Configuración → General.",
          "En «Nombre» pulsa «Cambiar» y escribe el nombre nuevo.",
          "Pulsa «Guardar».",
        ],
      },
      {
        title: "Elegir o cambiar tu link en Kardo",
        steps: [
          "En «Tu link en Kardo» pulsa «Elegir» (o «Cambiar» si ya tienes uno).",
          "Escribe la parte final de tu dirección web; Kardo revisa que esté libre.",
          "Si ya tenías uno, revisa el cambio antes de confirmarlo: tus links cambian con él.",
        ],
      },
      {
        title: "Completar los datos del negocio",
        steps: [
          "En «Datos del negocio» pulsa «Editar».",
          "Elige tu giro y escribe «Sobre tu negocio».",
          "Agrega sitio web, correo de contacto, teléfono, ciudad y país si quieres.",
          "Pulsa «Guardar».",
        ],
      },
    ],
    questions: [
      "¿Qué diferencia hay entre mi cuenta y la organización?",
      "¿Cómo cambio de organización?",
    ],
  },

  account: {
    section: "account",
    group: "Configuración",
    title: "Tu cuenta",
    summary:
      "Tus datos personales y cómo ves Kardo: nombre, nombre preferido, correo, idioma, zona horaria y formato de hora.",
    whenToUse:
      "Para cambiar cómo te saluda Kardo, tu correo, tu zona horaria o si prefieres ver la hora en 12 o 24 horas.",
    concepts: [
      {
        term: "Solo te afecta a ti",
        detail:
          "Lo de tu cuenta te sigue en cualquier organización y en cualquier dispositivo.",
      },
      {
        term: "Perfil",
        detail:
          "Tres filas, cada una con su botón «Cambiar»: Nombre, Nombre preferido (cómo te saluda Kardo) y Correo.",
      },
      {
        term: "Cambiar el correo",
        detail:
          "Kardo pide tu contraseña (o el código de tu app si tienes verificación en dos pasos). Después manda un código a tu correo actual y otro al nuevo.",
      },
      {
        term: "Preferencias",
        detail:
          "Idioma (por ahora solo Español de México), Zona horaria, Formato de hora (12 h o 24 h) y Novedades de Kardo.",
      },
      {
        term: "Novedades de Kardo",
        detail:
          "Es tu permiso para recibir novedades por correo. Los avisos de seguridad y de cobro te llegan siempre.",
      },
    ],
    tasks: [
      {
        title: "Cambiar tu nombre preferido",
        steps: [
          "Ve a Configuración → Perfil.",
          "En la fila «Nombre preferido», pulsa «Cambiar».",
          "Escribe el nombre y guarda.",
        ],
      },
      {
        title: "Cambiar tu correo",
        steps: [
          "En la fila «Correo», pulsa «Cambiar».",
          "Confirma que eres tú con tu contraseña (o el código de tu app).",
          "Escribe el código que llega a tu correo actual y el que llega al nuevo.",
        ],
      },
      {
        title: "Ajustar zona horaria y formato de hora",
        steps: [
          "Ve a Configuración → Preferencias.",
          "En «Zona horaria» pulsa «Cambiar» y elige la tuya.",
          "En «Formato de hora» elige 12 h o 24 h.",
        ],
      },
      {
        title: "Descargar tus datos o borrar tu cuenta",
        steps: [
          "Ve a Configuración → Tus datos.",
          "«Descargar» baja tu información personal en un archivo.",
          "«Borrar mi cuenta» te dice qué se borra contigo y qué hay que resolver antes; confirma con tu contraseña (o el código de tu app) y escribe «BORRAR MI CUENTA».",
        ],
      },
    ],
    questions: [
      "¿Qué se borra si borro mi cuenta?",
      "¿Cómo cambio mi correo?",
      "¿Para qué sirve el nombre preferido?",
      "¿Qué avisos me llegan aunque no quiera novedades?",
    ],
  },

  security: {
    section: "security",
    group: "Configuración",
    title: "Seguridad",
    summary:
      "Tu contraseña, la verificación en dos pasos, las sesiones abiertas y el historial de inicios de sesión.",
    whenToUse:
      "Para proteger tu cuenta, revisar dónde tienes sesión abierta (en la computadora del taller, por ejemplo) o cerrar una que no reconozcas.",
    concepts: [
      {
        term: "Contraseña",
        detail: "Se cambia con «Cambiar» y Kardo te pide la contraseña actual.",
      },
      {
        term: "Verificación en dos pasos",
        detail:
          "Usa una app de autenticación (Google Authenticator, 1Password, Authy). Al activarla, cada inicio de sesión pide su código de 6 dígitos. El botón es «Activar» y, una vez activa, «Administrar».",
      },
      {
        term: "App de respaldo",
        detail:
          "Kardo no da códigos de recuperación: se recomienda agregar una segunda app por si pierdes tu teléfono.",
      },
      {
        term: "Sesiones activas",
        detail:
          "Cada sesión tiene su botón «Cerrar», y «Cerrar las demás» deja abierta solo la que usas ahora.",
      },
      {
        term: "Historial de inicios de sesión",
        detail: "Muestra los inicios de sesión de los últimos 90 días.",
      },
    ],
    tasks: [
      {
        title: "Activar la verificación en dos pasos",
        steps: [
          "Ve a Configuración → Seguridad.",
          "En «Verificación en dos pasos» pulsa «Activar» y escanea el código con tu app.",
          "Escribe el código de 6 dígitos que muestra la app.",
          "Agrega una segunda app de respaldo.",
        ],
      },
      {
        title: "Cambiar tu contraseña",
        steps: [
          "En la fila «Contraseña» pulsa «Cambiar».",
          "Escribe tu contraseña actual y la nueva.",
        ],
      },
      {
        title: "Cerrar una sesión que no reconoces",
        steps: [
          "Mira el grupo «Sesiones activas».",
          "Pulsa «Cerrar» en la sesión sospechosa, o «Cerrar las demás» para dejar solo la actual.",
          "Cambia tu contraseña si crees que alguien más la conoce.",
        ],
      },
    ],
    questions: [
      "¿Cómo activo la verificación en dos pasos?",
      "¿Qué hago si pierdo mi teléfono con la app?",
      "¿Cuánto tiempo guarda Kardo el historial de inicios de sesión?",
    ],
  },

  brand: {
    section: "brand",
    group: "Configuración",
    title: "Marca",
    summary:
      "El logo, la portada y los colores de tu organización. El Estudio, tus QR y la IA de Kardo los usan solos en tus páginas públicas.",
    whenToUse:
      "Para que tus páginas, tus códigos QR y los diseños de la IA se vean como tu florería, tu taller, tu consultorio o tu tienda.",
    concepts: [
      {
        term: "Logo y portada",
        detail:
          "El logo se recomienda cuadrado o redondo (PNG con fondo transparente si lo tienes). La portada, una foto horizontal de tu lugar o de lo que vendes.",
      },
      {
        term: "Colores de marca",
        detail: "Color primario y Color de acento.",
      },
      {
        term: "Apariencia",
        detail:
          "Fondo, botones y letra que guardas para tus páginas. Se cambia con «Cambiar apariencia de las páginas».",
      },
      {
        term: "Dónde se usa",
        detail:
          "En tus páginas públicas, en el Estudio y en el logo de tus QR. No cambia el aspecto de este panel.",
      },
      {
        term: "Permisos",
        detail:
          "Si tu rol no permite editar la marca, la ves pero no puedes cambiarla.",
      },
    ],
    tasks: [
      {
        title: "Subir o cambiar tu logo",
        steps: [
          "Ve a Configuración → Marca.",
          "En «Logo» pulsa «Subir» (o «Cambiar» si ya hay uno) y elige el archivo.",
          "Pulsa «Quitar» si prefieres no mostrar logo.",
        ],
      },
      {
        title: "Elegir tus colores",
        steps: [
          "En «Colores de marca» elige el Color primario y el Color de acento.",
          "Revisa la vista previa y guarda.",
        ],
      },
    ],
    questions: ["¿Dónde se ve el logo de mi marca?"],
  },

  plan: {
    section: "plan",
    group: "Configuración",
    title: "Plan y facturación",
    summary:
      "Tu plan, cuánto llevas usado de cada límite, tus facturas y tus datos de facturación.",
    whenToUse:
      "Para cambiar de plan o de tarjeta, revisar cuánto te queda de cada límite, descargar una factura o pedir tu CFDI.",
    concepts: [
      {
        term: "Consumo y límites",
        detail:
          "Muestra cuánto usas de lo que permite tu plan. Los planes y sus precios están en la página de precios de Kardo («Ver planes y precios»).",
      },
      {
        term: "Quién puede cambiarlo",
        detail:
          "Solo la persona propietaria cambia el plan o la forma de pago.",
      },
      {
        term: "Factura (CFDI)",
        detail:
          "Si marcas «Necesito factura (CFDI)», se emite con tus datos fiscales después de cada pago. Si no la necesitas, tu pago entra en la factura global del mes.",
      },
      {
        term: "Cancelar",
        detail:
          "Tu plan sigue activo hasta el final del periodo pagado, no se hace otro cobro y tu contenido se conserva.",
      },
    ],
    tasks: [
      {
        title: "Cambiar de plan o de tarjeta",
        steps: [
          "Ve a Configuración → Plan y facturación.",
          "Elige «Cambiar de plan» o «Cambiar tarjeta». También está «Administrar suscripción».",
          "Sigue los pasos en la página segura de pago.",
        ],
      },
      {
        title: "Cancelar el plan",
        steps: [
          "Pulsa «Cancelar plan».",
          "Lee el aviso con la fecha en que termina tu periodo pagado.",
          "Confirma con «Continuar para cancelar», o elige «Mantener mi plan».",
        ],
      },
      {
        title: "Revisar tus facturas",
        steps: [
          "Baja a «Historial de facturas».",
          "Descarga el documento que necesites.",
          "Tus datos fiscales (RFC, razón social y régimen) están en «Datos de facturación».",
        ],
      },
    ],
    questions: [],
  },
};

export function getHelpGuide(section: HelpSection): HelpGuide {
  return helpGuides[section];
}
