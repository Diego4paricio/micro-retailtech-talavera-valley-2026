import type { PieceModel } from "@kardo/contracts";
import cardArt from "./media/arte-card.webp";
import magnetArt from "./media/arte-magnet.webp";
import standArt from "./media/arte-stand.webp";
import stickerArt from "./media/arte-sticker.webp";
import cardPhoto from "./media/pieza-card.webp";
import magnetPhoto from "./media/pieza-magnet.webp";
import standPhoto from "./media/pieza-stand.webp";
import stickerPhoto from "./media/pieza-sticker.webp";

/*
 * The four pieces Kardo sells (ADR 025 §1), as the panel shows them. Names,
 * measures and lines are the site's (apps/website/src/content/pieces.ts);
 * the images are copies of its print artwork (arte-*) and photos (pieza-*),
 * never imported from the site.
 */
export type PieceView = {
  name: string;
  /** For counts: «25 Magnets». */
  plural: string;
  measure: string;
  /** Where it goes, in one line. */
  line: string;
  /** The printed face, the same artwork the site draws to scale. */
  art: string;
  photo: string;
  /** Round piece: its artwork is a circle. */
  round?: boolean;
};

export const pieceViews: Record<PieceModel, PieceView> = {
  stand: {
    name: "Stand",
    plural: "Stands",
    measure: "10 × 15 cm",
    line: "Para el mostrador, la caja o la recepción.",
    art: standArt,
    photo: standPhoto,
  },
  card: {
    name: "Card",
    plural: "Cards",
    measure: "8.56 × 5.4 cm",
    line: "Tu tarjeta de presentación, la que se acerca al celular.",
    art: cardArt,
    photo: cardPhoto,
  },
  magnet: {
    name: "Magnet",
    plural: "Magnets",
    measure: "9 × 5 cm",
    line: "Se queda en el refri de tu cliente.",
    art: magnetArt,
    photo: magnetPhoto,
  },
  sticker: {
    name: "Sticker",
    plural: "Stickers",
    measure: "Ø 10 cm",
    line: "Para la mesa, la ventanilla o el espejo.",
    art: stickerArt,
    photo: stickerPhoto,
    round: true,
  },
};

/** «1 Stand, 2 Cards»: what an order brings, in the order pieces are shown. */
export function piecesSummary(models: readonly PieceModel[]): string {
  const counts = new Map<PieceModel, number>();
  for (const model of models) counts.set(model, (counts.get(model) ?? 0) + 1);
  return (["stand", "card", "magnet", "sticker"] as const)
    .filter((model) => counts.has(model))
    .map((model) => {
      const count = counts.get(model) ?? 0;
      const view = pieceViews[model];
      return `${count} ${count === 1 ? view.name : view.plural}`;
    })
    .join(", ");
}
