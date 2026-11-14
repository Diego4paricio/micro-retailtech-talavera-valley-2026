import type { Piece } from "@/content/pieces";
import { EditorialImage, hasMedia } from "../landing/EditorialImage";

/**
 * A piece's photo. On /piezas (`detail`) it shows the close-up
 * `pieza-<id>-detalle` once that photo exists, so the page does not repeat
 * the home; until then, the same render as the home.
 */
export function PieceImage({
  piece,
  detail = false,
  sizes = "(max-width: 1023px) 100vw, 50vw",
  priority = false,
}: {
  piece: Piece;
  detail?: boolean;
  sizes?: string;
  priority?: boolean;
}) {
  const close = `pieza-${piece.id}-detalle`;
  const useDetail = detail && hasMedia(close);
  return (
    <EditorialImage
      name={useDetail ? close : `pieza-${piece.id}`}
      alt={useDetail ? piece.detailAlt : piece.image.alt}
      sizes={sizes}
      priority={priority}
    />
  );
}
