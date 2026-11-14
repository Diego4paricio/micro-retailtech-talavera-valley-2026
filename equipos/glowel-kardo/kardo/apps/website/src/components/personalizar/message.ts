import type { PieceId } from "@/content/pieces";
import { pieceById } from "@/content/pieces";
import { type Design, fontById } from "./design";

/*
  What Kardo receives: the WhatsApp message (pure, so the tests read it)
  and the rows of the downloaded sheet. Both list the same things.
*/

export interface KitChoice {
  code: string;
  name: string;
  items: { piece: string; quantity: number; label: string }[];
}

/** The pieces the design covers: the kit's, or the one being designed. */
export function piecesFor(design: Design, kit: KitChoice | null): PieceId[] {
  if (!kit) return [design.piece];
  const ids = kit.items
    .map((item) => item.piece)
    .filter((piece): piece is PieceId => Boolean(pieceById(piece)));
  return [...new Set(ids)];
}

export function kitContents(kit: KitChoice): string {
  return kit.items.map((item) => `${item.quantity} ${item.label}`).join(", ");
}

/** The texts of one piece, as written on it. */
export function pieceTexts(design: Design, piece: PieceId): string[] {
  const t = design.texts;
  const quoted = (values: string[]) =>
    values.filter((value) => value.trim()).map((value) => `«${value.trim()}»`);
  switch (piece) {
    case "stand":
      return quoted([t.stand.tagline, t.stand.call]);
    case "card":
      return quoted([t.card.person, t.card.role, t.card.call]);
    case "magnet":
      return quoted([t.magnet.line, t.magnet.contact, t.magnet.call]);
    case "sticker":
      return quoted([
        t.sticker.layout === "ring" ? t.sticker.ring : "",
        t.sticker.call,
      ]);
  }
}

export function detailRows(
  design: Design,
  kit: KitChoice | null,
): [string, string][] {
  const { brand } = design;
  const font = fontById(brand.font);
  const rows: [string, string][] = [
    ["Negocio", brand.name.trim() || "Sin nombre"],
    kit
      ? ["Kit", `${kit.name} (${kitContents(kit)})`]
      : ["Pieza", pieceById(design.piece)?.name ?? design.piece],
    [
      "Colores",
      `Fondo ${brand.background.toUpperCase()}, acento ${brand.accent.toUpperCase()}`,
    ],
    ["Letra", `${font.name}${brand.upper ? ", nombre en mayúsculas" : ""}`],
  ];
  for (const piece of piecesFor(design, kit)) {
    const texts = pieceTexts(design, piece);
    rows.push([
      pieceById(piece)?.name ?? piece,
      texts.length ? texts.join(", ") : "Sin textos",
    ]);
  }
  rows.push(["Logo", brand.logo ? "En la imagen" : "Sin logo"]);
  return rows;
}

/** The first message to Kardo's WhatsApp, already written. */
export function whatsappMessage(
  design: Design,
  kit: KitChoice | null,
  link: string,
): string {
  const rows = detailRows(design, kit).filter(([label]) => label !== "Logo");
  return [
    "Hola, armé el diseño de mis piezas en el sitio de Kardo.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Mi diseño: ${link}`,
    design.brand.logo
      ? "Te mando la imagen del diseño y mi logo."
      : "Te mando la imagen del diseño.",
  ].join("\n");
}
