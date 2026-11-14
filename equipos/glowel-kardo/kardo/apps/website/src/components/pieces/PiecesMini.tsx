"use client";
import type { CSSProperties } from "react";
import { pieces } from "@/content/pieces";
import { SampleArt } from "./PiecesShowcase";

/** The four sample pieces, small and at the same scale, for the bridge. */
export function PiecesMini() {
  return (
    <div aria-hidden="true" className="way-pieces">
      {pieces.map((piece, index) => (
        <span
          key={piece.id}
          style={
            {
              "--i": index,
              width: `calc(${piece.size.width} * var(--cm))`,
              height: `calc(${piece.size.height} * var(--cm))`,
            } as CSSProperties
          }
        >
          <SampleArt id={piece.id} small />
        </span>
      ))}
    </div>
  );
}
