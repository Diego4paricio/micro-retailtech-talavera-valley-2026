// The four physical pieces Kardo sells (ADR 025). Sizes and materials come
// from Docs/KARDO_PRODUCTOS_FISICOS.md; anything still to be confirmed with
// the workshop sample (card thickness, cleaning, reading on a fridge) is not
// promised here. Images: pieza-<id> (the render in Docs/renders/)
// and, when it exists, pieza-<id>-detalle for /piezas, both made by
// scripts/media/landing-images.mjs.

export type PieceId = "stand" | "card" | "magnet" | "sticker";

export interface Piece {
  id: PieceId;
  name: string;
  /** Plural for kit contents ("2 Stickers"). */
  plural: string;
  /** One line: where it goes. */
  line: string;
  /** Longer line for /piezas. */
  say: string;
  /** Visible measure. */
  measure: string;
  /** Real size in cm, for the strip drawn to scale. */
  size: { width: number; height: number; round?: boolean };
  image: { alt: string };
  /** Alt of the /piezas close-up (pieza-<id>-detalle), used once it exists. */
  detailAlt: string;
  specs: { label: string; value: string }[];
}

export const pieces: Piece[] = [
  {
    id: "stand",
    name: "Stand",
    plural: "Stands",
    line: "Para el mostrador, la caja o la recepción.",
    say: "Para el mostrador, la caja o la recepción. Se ve desde la fila.",
    measure: "10 × 15 cm",
    size: { width: 10, height: 15 },
    image: {
      alt: "Stand de acrílico oscuro de Café Central sobre una base de madera, en la barra de un café",
    },
    detailAlt:
      "Detalle del Stand: la placa de acrílico metida en la ranura de su base de madera",
    specs: [
      { label: "Medida", value: "10 × 15 cm" },
      { label: "Placa", value: "Acrílico cristal de 3 mm, impreso por detrás" },
      { label: "Base", value: "Madera de 10 × 5 × 2 cm, ranura a 75°" },
      { label: "Chip", value: "NFC NTAG215" },
      { label: "Acabado", value: "Mate, para que el QR no refleje" },
    ],
  },
  {
    id: "card",
    name: "Card",
    plural: "Cards",
    line: "Tu tarjeta de presentación, la que se acerca al celular.",
    say: "Tu tarjeta de presentación, la que se acerca al celular. Una sola te dura años.",
    measure: "8.56 × 5.4 cm",
    size: { width: 8.56, height: 5.4 },
    image: {
      alt: "Dos cards negras mate de un despacho de arquitectura, una con el QR, sobre un escritorio de madera",
    },
    detailAlt:
      "Una mano sostiene una card negra con el QR al frente mientras un celular se acerca",
    specs: [
      { label: "Medida", value: "8.56 × 5.4 cm, tamaño de tarjeta bancaria" },
      { label: "Material", value: "PVC negro mate" },
      { label: "Chip", value: "NFC NTAG213, por dentro" },
      { label: "Caras", value: "Tu logo y tu nombre al frente, el QR atrás" },
    ],
  },
  {
    id: "magnet",
    name: "Magnet",
    plural: "Magnets",
    line: "Se queda en el refri de tu cliente.",
    say: "Se queda en el refri de tu cliente. Cuando necesita al plomero o al veterinario, ahí estás.",
    measure: "9 × 5 cm",
    size: { width: 9, height: 5 },
    image: {
      alt: "Imán de una veterinaria en la puerta de un refrigerador y, en primer plano, un celular con la página de la veterinaria abierta",
    },
    detailAlt:
      "Imán de una veterinaria en la puerta de un refrigerador, junto a un calendario y un dibujo",
    specs: [
      { label: "Medida", value: "9 × 5 cm" },
      { label: "Material", value: "Imán flexible con vinil mate impreso" },
      {
        label: "Sobre metal",
        value:
          "Lleva una capa de ferrita para que el celular lo lea en la puerta del refri",
      },
      { label: "Chip", value: "NFC NTAG213" },
    ],
  },
  {
    id: "sticker",
    name: "Sticker",
    plural: "Stickers",
    line: "Para la mesa, la ventanilla o el espejo.",
    say: "Para la mesa, la ventanilla o el espejo. Cada mesa puede abrir algo distinto.",
    measure: "Ø 10 cm",
    size: { width: 10, height: 10, round: true },
    image: {
      alt: "Sticker redondo de la mesa 12 de una terraza sobre una mesa de madera, junto a una taza",
    },
    detailAlt:
      "Sticker redondo de Florería Lila pegado en una bolsa de papel kraft",
    specs: [
      { label: "Medida", value: "10 cm de diámetro" },
      { label: "Material", value: "Vinil adhesivo con laminado mate" },
      { label: "Chip", value: "NFC NTAG213, con ferrita si va sobre metal" },
    ],
  },
];

export function pieceById(id: string): Piece | undefined {
  return pieces.find((piece) => piece.id === id);
}
