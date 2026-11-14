import type { PieceModel, Touchpoint } from "@kardo/contracts";
import { isPieceModel } from "@kardo/contracts";
import { pieceViews } from "./pieces.js";

/**
 * A Kardo piece's picture (its printed face), wherever the panel names one:
 * the list, its page, Resumen and Analítica (ADR 026). Decorative next to
 * its name, so the name carries the meaning.
 */
export function PieceThumb({
  model,
  size = 28,
  label,
}: {
  model: PieceModel;
  size?: number;
  /** When the picture stands alone, what it shows. */
  label?: string;
}) {
  const view = pieceViews[model];
  return (
    <img
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={`piece-thumb${view.round ? " piece-thumb-round" : ""}`}
      decoding="async"
      height={size}
      src={view.art}
      width={size}
    />
  );
}

/** The model of a Touchpoint that is a Kardo piece, or null. */
export function pieceModelOf(
  touchpoint: Pick<Touchpoint, "kind" | "pieceModel">,
): PieceModel | null {
  return touchpoint.kind === "kardo" && isPieceModel(touchpoint.pieceModel)
    ? touchpoint.pieceModel
    : null;
}

/** «Card de Kardo». */
export function pieceKindLabel(model: PieceModel): string {
  return `${pieceViews[model].name} de Kardo`;
}
