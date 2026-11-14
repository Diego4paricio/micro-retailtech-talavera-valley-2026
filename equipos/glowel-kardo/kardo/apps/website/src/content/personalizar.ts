// Copy of /personalizar/, the small designer for the pieces. Same rules as
// landing.ts: "tú", short sentences, no dashes, no "·", and nothing the
// workshop has not confirmed (no print times, no print specs beyond the
// sizes in content/pieces.ts). It is not the panel's Estudio (ADR 018).

export const personalizarPage = {
  metaTitle: "Personaliza tu pieza",
  metaDescription:
    "Elige tu Stand, Card, Magnet o Sticker, ponle tus colores, tu logo y tus textos, y mándanos el diseño por WhatsApp.",
  title: "Personaliza tu pieza",
  lead: "Ponle tus colores, tu logo y tus textos. Cuando te guste, nos lo mandas por WhatsApp y te enseñamos cómo queda antes de imprimir.",
  steps: ["Pieza", "Colores", "Logo y textos", "Mándalo"],
  sampleQr:
    "El QR es de muestra. El QR y el NFC de tu pieza se graban al hacerla.",
  saved: "Tu diseño se guarda en este navegador.",
  fromLink: "Abriste un diseño desde un enlace. Sube tu logo para completarlo.",
  reset: "Empezar de nuevo",
  resetConfirm: "Sí, borrar mi diseño",
  next: "Siguiente",
  back: "Atrás",
};

export const pieceStep = {
  title: "¿Qué pieza quieres?",
  layout: "Acomodo",
  layouts: {
    stand: { tiles: "Dos cuadros", pill: "Centrado" },
    card: { left: "A la izquierda", center: "Centrado" },
    magnet: { split: "Dividido", full: "Un color" },
    sticker: { ring: "Texto en el borde", logo: "Con tu logo" },
  },
};

export const colorStep = {
  title: "Tus colores y tu letra",
  palettes: "Combinaciones",
  background: "Fondo",
  accent: "Acento",
  accentHint: "Se usa en el símbolo para acercar el celular.",
  textTone: "Color del texto",
  tones: { auto: "Automático", light: "Claro", dark: "Oscuro" },
  font: "Letra del nombre",
  upper: "Nombre en mayúsculas",
};

export const logoStep = {
  title: "Tu logo y tus textos",
  logo: "Logo",
  upload: "Subir mi logo",
  replace: "Cambiar logo",
  remove: "Quitar logo",
  formats: "PNG, JPG o SVG, hasta 5 MB.",
  tooBig: "Ese archivo pesa más de 5 MB. Prueba con uno más ligero.",
  notImage: "No pudimos leer ese archivo. Sube una imagen PNG, JPG o SVG.",
  noSource: "Vuelve a subir tu logo para usar esta opción.",
  size: "Tamaño",
  removeWhite: "Quitar el fondo blanco",
  plate: "Fondo claro detrás del logo",
  plateHint: "Tu logo es oscuro: con este fondo se lee mejor.",
  name: "Nombre del negocio",
  textsFor: "Textos del",
  callHint:
    "Deja «Acerca tu celular» en el texto: así nadie confunde tu pieza con una terminal de pago.",
  callSuggestions: [
    "Acerca tu celular o escanea",
    "Acerca tu celular o escanea el menú",
    "Acerca tu celular para ver el catálogo",
    "Acerca tu celular para escribirnos",
  ],
  fields: {
    tagline: "Frase",
    call: "Texto para acercar el celular",
    person: "Tu nombre",
    role: "A qué te dedicas",
    line: "Frase",
    contact: "WhatsApp o teléfono",
    ring: "Texto del borde",
  },
  ringHidden: "Con tu logo arriba, el borde va sin texto.",
};

export const sendStep = {
  title: "Mándanos tu diseño",
  kit: "¿Para qué kit es?",
  noKit: "Todavía no sé",
  noKitText: "Mandamos solo esta pieza y te ayudamos a elegir.",
  preview: "Así se verían tus piezas",
  editTexts: "Editar textos",
  whatsapp: "Mandar por WhatsApp",
  download: "Descargar imagen",
  share: "Compartir imagen",
  working: "Preparando la imagen…",
  how: [
    "Se descarga la imagen de tu diseño.",
    "Se abre WhatsApp con tu mensaje ya escrito.",
    "Adjunta la imagen en el chat. Si tienes tu logo en mejor calidad, mándalo también.",
  ],
  after:
    "Con tu diseño armamos tus piezas y te enseñamos cómo quedan antes de imprimir.",
  failed:
    "No pudimos preparar la imagen en este navegador. Te abrimos WhatsApp con tu mensaje.",
};
