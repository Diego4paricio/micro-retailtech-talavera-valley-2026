import type { PieceModel } from "@kardo/contracts";
import { pieceViews } from "./pieces.js";

/**
 * «Tu pieza» on a Kardo piece's page (ADR 026): its picture, what it is,
 * and why its visits split by channel although it has one address.
 */
export function PieceCard({ model }: { model: PieceModel }) {
  const view = pieceViews[model];
  return (
    <section
      aria-labelledby="tp-piece-title"
      className="panel tp-side-card piece-card"
    >
      <div className="tp-card-head">
        <h2 id="tp-piece-title">Tu pieza</h2>
      </div>
      <div className="piece-card-body">
        <img
          alt={`Diseño de ejemplo del ${view.name}`}
          className={`piece-card-art${view.round ? " piece-thumb-round" : ""}`}
          height={120}
          src={view.art}
          width={120}
        />
        <div>
          <strong>{view.name} de Kardo</strong>
          <small>{view.measure}</small>
          <p>
            Su QR y su NFC abren la misma dirección. En Analítica ves por cuál
            entró cada visita.
          </p>
        </div>
      </div>
    </section>
  );
}
