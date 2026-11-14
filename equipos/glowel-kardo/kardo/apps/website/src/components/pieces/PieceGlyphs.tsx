import type { PieceId } from "@/content/pieces";

/** Tiny silhouette of a piece, for kit contents. */
export function PieceMini({ id }: { id: PieceId }) {
  return (
    <span aria-hidden="true" className="piece-mini">
      <i className={`piece-mini-${id}`} />
    </span>
  );
}
