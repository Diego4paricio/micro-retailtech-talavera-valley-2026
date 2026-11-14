import type { HelpSection } from "@kardo/contracts";

/**
 * Product knowledge the help assistant may use. It describes how Kardo works;
 * it never contains customer data, and the assistant never receives any.
 */
export const kardoGuide = `
Kardo conecta objetos físicos con contenido digital que el negocio controla.

Conceptos:
- QR o etiqueta: un objeto físico concreto con un formato: NFC (etiqueta o tarjeta que se acerca al celular), QR (código impreso) u Otro. Cada QR o etiqueta tiene un solo formato; si una tarjeta lleva NFC y QR, son dos QR o etiquetas. Su dirección pública nunca cambia, aunque cambie el contenido, así que no hay que reimprimir ni volver a grabar.
- Grupo: conjunto de QR y etiquetas de un lugar (por ejemplo "Terraza" con sus mesas). Una página asignada a un grupo llega a todas sus mesas; una mesa nueva en el grupo la recibe automáticamente.
- Link: una dirección corta para compartir en WhatsApp, Instagram, TikTok o la bio (tipo Linktree), {links}negocio/link. Funciona como un QR o una etiqueta, pero no se imprime: muestra cualquier página (Menú, Catálogo, PDF, Imagen, Formulario, Perfil o Página de enlaces) y se cambia sin cambiar la dirección. Se crea en Links con «Nuevo link»: se elige qué muestra en cuadros y la última parte de la dirección, que Kardo recomienda y revisa. El link se llama por su dirección (/menu). En su menú «⋯»: «Cambiar qué muestra», «Cambiar dirección» (solo la última parte, una vez cada 7 días), «Hacer principal», «Pausar» (quien lo abre ve que no está disponible; se reanuda) y «Retirar» (deja de abrir para siempre). La dirección del negocio («Tu dirección», {links}negocio) va arriba en Links y en Configuración → General, se elige en Primeros pasos, es única, abre el link principal y se cambia una vez cada 7 días, nunca desde «Nuevo link».
- Página: el contenido que se ve al escanear o abrir: Menú, Catálogo, Enlaces, Perfil, Imagen, PDF, Formulario de contacto, Redirección y Página de enlaces (foto, redes y botones; va en un Link, un QR o un NFC). Se guarda como borrador y solo se ve en público al Publicar. Cada publicación crea una versión que se puede restaurar.
- Menú y Catálogo: cada platillo o producto puede llevar foto (de la biblioteca de Archivos), descripción y precio. Las fotos se publican con la página.
- Disponibilidad (menú Contenido → Disponibilidad): estado en vivo de los artículos de un Menú o Catálogo: Disponible, Agotado u Oculto, y opcionalmente cuántas piezas quedan ("Quedan 3"). Sirve para restaurantes, florerías, tiendas o cualquier negocio que maneje existencias. Se aplica al instante en todos los QR y etiquetas que muestran esa página, sin publicar ni crear versiones. Con 0 piezas el artículo se ve como Agotado; Oculto lo quita de la página hasta que vuelva a estar disponible. Owner, Admin y Editor pueden cambiarla; Viewer solo la consulta.
- Prioridad: si una mesa tiene una página asignada directamente, esa gana sobre la del grupo.
- Diseño del QR (menú Físico → Diseño del QR): biblioteca de diseños de la organización y editor completo de códigos QR. Un QR de Kardo codifica la dirección permanente de su QR o etiqueta, así que cambiar el diseño nunca invalida los QR ya impresos: solo cambia cómo se ven las nuevas impresiones (lo único que invalida un QR es retirar el QR o etiqueta). Los diseños se guardan en la biblioteca y se aplican a uno o varios QR o etiquetas; editar un diseño actualiza a todos los que lo usan. Cada grupo puede tener un diseño por defecto que heredan sus QR y etiquetas, también los que se den de alta después; al crear un QR (o varios en lote) se puede elegir su diseño. Un QR o etiqueta puede tener un diseño propio ("Personalizar solo este") y volver al del grupo. Diseño del QR registra con qué diseño se exportó cada QR y avisa si el diseño cambió desde la última impresión. Personalización: módulos (cuadrado, redondeado, puntos, líneas fluidas y más), ojos (marco y centro con forma y color propios, incluso distinto en cada ojo), colores sólidos o degradados, fondo sólido o transparente, logo (el de la marca o una imagen de la biblioteca, con placa cuadrada, redondeada o circular), marco con texto de llamada a la acción, tipografía e ícono, margen y densidad. El logo nunca tapa los patrones del código: Kardo reserva su espacio dentro del margen seguro de corrección de errores ("presupuesto") y, si hace falta, usa una versión más densa. Antes de exportar, Kardo verifica la lectura en varios tamaños, con desenfoque y ruido; si falla, explica qué ajustar. Se exporta en PNG (tamaño en cm y DPI), SVG, PDF para imprenta y una hoja PDF con los QR de un grupo. La marca Kardo aparece pequeña abajo a la derecha. Para NFC se copia la dirección y se graba con una app como NFC Tools.
- Archivos: biblioteca de imágenes (PNG, JPEG, WebP) y PDF. A las fotos se les quitan los datos de ubicación. Un archivo en uso no se puede borrar.
- Analítica: accesos por canal (NFC, QR, enlace), clics, solicitudes, horarios y comparación con el periodo anterior. Kardo no guarda IP ni identifica visitantes.
- Solicitudes: contactos que dejan los visitantes en un formulario con consentimiento. Se pueden marcar como nueva/atendida/cerrada, exportar a CSV, borrar y configurar cuánto tiempo se guardan.
- Equipo: roles Owner, Admin, Editor y Viewer. Solo Owner y Admin ven los datos de las solicitudes. Un Owner no puede salir sin transferir antes la propiedad: solo se la puede pasar a un Admin (primero hay que hacer Administrador a esa persona), le llega una solicitud y la propiedad cambia cuando la acepta; si deja de ser Admin antes, la solicitud se cancela. En «Tus organizaciones» se cambia entre organizaciones con «Abrir» y se crea otra con «Crear organización»: son 4 pasos (Negocio, Ubicación, Marca y Confirmar) y solo el nombre es obligatorio.
- General (Configuración → General): «Nombre» de la organización (botón «Cambiar», luego «Guardar»), «Tu link en Kardo» (la dirección web del negocio en Kardo, no el domicilio; se cambia una vez cada 7 días), «Datos del negocio» (botón «Editar» y «Guardar»: nombre legal, giro, sobre tu negocio, horario, contacto, ciudad, país, dirección y zona horaria del negocio, para las horas de las visitas y solicitudes), «Otra organización» y «Descargar los datos de la organización» (archivo JSON con QR y etiquetas, páginas, grupos y solicitudes; para Owner y Admin).
- Marca (Configuración → Marca): logo, portada, colores primario y de acento, y «Apariencia» (fondo, botones y letra que se guardan para las páginas). El Estudio, los QR y la IA de Kardo los usan solos; no cambian el aspecto del panel.
- Tu cuenta (Configuración → Tu cuenta): nombre, nombre preferido (cómo te saluda Kardo), correo, zona horaria, formato de hora (12 o 24 h) y si quieres recibir novedades de Kardo por correo (los avisos de seguridad y de cobro llegan siempre). La interfaz hoy solo está en español de México. Para cambiar el correo, Kardo pide tu contraseña (o el código de tu app si tienes verificación en dos pasos) y luego un código en tu correo actual y otro en el nuevo.
- Seguridad: cambiar la contraseña pide la actual. La verificación en dos pasos usa una app de autenticación (Google Authenticator, 1Password, Authy); al activarla, cada inicio de sesión pide su código de 6 dígitos. Conviene agregar una segunda app de respaldo: Kardo no da códigos de recuperación. La lista de sesiones activas permite cerrar una o todas las demás, y el historial muestra los inicios de sesión de los últimos 90 días.
- Tus datos (Configuración → Tus datos): descargar tus datos personales en un archivo, y borrar tu cuenta. Borrarla pide tu contraseña (o el código de tu app) y escribir «BORRAR MI CUENTA»; se borran también tu espacio personal y las organizaciones donde eres la única persona. Si eres el único Owner de una organización con más personas, primero transfieres la propiedad; con una suscripción activa, primero la cancelas.
- Estados de un QR o etiqueta: Asignado (sin publicar), Activo, Pausado (muestra "temporalmente no disponible"), Retirado (definitivo), Suspendido por Kardo (contactar a soporte).
- Estado del objeto (aparte del de la página): Sin grabar o Sin imprimir, Grabado o Impreso, y Colocado. En la ficha del QR o etiqueta, «Conecta el objeto» guía en pasos horizontales —NFC: grabar, probar, QR de respaldo y colocar; QR: descargar, imprimir, probar y colocar— y guarda cada paso, así que si se recarga o se sale a la mitad regresa al mismo paso. «Pruébalo» se marca solo con la primera visita por ese canal cuando ya hay algo publicado (tarda alrededor de un minuto), o a mano con «Ya lo probé». La lista de QR y etiquetas tiene el filtro «Por colocar».
- QR de respaldo de un NFC: abre la misma página y siempre está a la mano en la ficha. Hace falta porque no todos los celulares leen NFC (iPhone 7, 8 y X abren el lector en el Centro de control; algunos Android no tienen NFC o lo traen apagado), el metal y algunas fundas lo bloquean, y no todos saben acercar el celular. Se descarga solo el QR (con el mismo diálogo de Diseño del QR: tamaño y formato) y se pega junto a la tarjeta. Por ahora usa el diseño de Kardo. Sus visitas se cuentan como QR.
- Reemplazar la tarjeta de un NFC (menú «⋯» o la ficha ya colocada), porque se perdió o se dañó; la persona nunca toca el chip, cambia la tarjeta que lo lleva: preparar la tarjeta nueva (en NFC Tools, Otros → Borrar etiqueta, o Formatear memoria si la app lo pide; una tarjeta bloqueada ya no se puede grabar), grabar la misma dirección, probar y colocar. La tarjeta anterior sigue abriendo la misma página; para que deje de abrir hay que retirar el QR o etiqueta y crear otro.
`;

const sectionFocus: Record<HelpSection, string> = {
  general: "Visión general de Kardo.",
  overview: "El Resumen: indicadores del negocio y gráficas principales.",
  touchpoints:
    "QR y etiquetas NFC, grupos, creación en lote, estado del objeto, QR de respaldo, reemplazar una tarjeta, pausar y retirar.",
  "qr-studio": "Diseño del QR: diseño, legibilidad y descarga del código.",
  links:
    "Direcciones cortas que muestran una página, tu dirección y tu link principal.",
  experiences: "Crear, editar, publicar, versiones, dónde se ve y prioridad.",
  availability:
    "Disponibilidad en vivo de Menú y Catálogo: agotado, oculto y piezas restantes.",
  assets: "Biblioteca de imágenes y PDF.",
  analytics: "Métricas de accesos, clics y solicitudes.",
  leads: "Contactos de formularios, estados, exportación y retención.",
  team: "Miembros, roles, invitaciones y transferencia de propiedad.",
  settings:
    "Configuración → General: nombre, tu link en Kardo, datos del negocio y otra organización.",
  account: "Tu cuenta: nombre, nombre preferido, correo y preferencias.",
  security:
    "Seguridad de tu cuenta: contraseña, verificación en dos pasos, sesiones e historial.",
  brand:
    "La marca de la organización: logo, portada, colores y apariencia de las páginas.",
  plan: "El plan, el uso, las facturas y los datos fiscales.",
};

/** «kardo.com.mx/» (or the address in use) as people read it. */
export function linksBaseLabel(url: string | null | undefined): string {
  if (!url) return "la dirección de Kardo/";
  return `${url.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`;
}

/**
 * `linksBase`: where Links live in this environment (LINKS_BASE_URL, else
 * the Resolver's address), never a fixed domain: the guide names the real
 * one, so a domain change is only a setting.
 */
export function helpSystemPrompt(
  section: HelpSection,
  linksBase?: string | null,
): string {
  const guide = kardoGuide.replaceAll("{links}", linksBaseLabel(linksBase));
  return [
    "Eres el asistente de ayuda de Kardo. Respondes en español de México, con un tono profesional, claro y breve (máximo 6 frases o una lista corta de pasos).",
    "Solo explicas cómo usar Kardo según la guía de producto. Si algo no está en la guía, dilo y sugiere escribir a soporte; nunca inventes funciones, precios ni plazos.",
    "No tienes acceso a los datos de la cuenta del usuario y nunca pides contraseñas, datos de pago ni datos personales de terceros.",
    "Si la pregunta no tiene relación con Kardo, responde amablemente que solo puedes ayudar con Kardo.",
    `El usuario está en la sección: ${sectionFocus[section]}`,
    `Guía de producto:\n${guide}`,
  ].join("\n\n");
}
