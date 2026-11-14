import { pieces } from "@/content/pieces";
import { piecesShowcase } from "@/content/zonas";
import { Reveal } from "../landing/Reveal";
import { PieceImage } from "../pieces/PieceImage";
import { PiecesShowcase } from "../pieces/PiecesShowcase";
import "@/app/landing-zonas.css";

/*
  The pieces (ADR 025). First the designs at real size, next to a phone
  that shows what each one opens, and the way into /personalizar/; then the
  photos of the pieces in their place. The kits come right after.
*/

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Pieces() {
  return (
    <section
      id="piezas"
      className="editorial-section pz-section"
      aria-labelledby="pieces-title"
    >
      <Reveal>
        <div className="zone-heading">
          <div>
            <h2 id="pieces-title">{piecesShowcase.title}</h2>
          </div>
          <div className="zone-heading-side">
            <p>{piecesShowcase.lead}</p>
            <div className="zone-actions">
              <a className="zone-button" href="/personalizar/">
                {piecesShowcase.customize}
              </a>
              <a className="editorial-link group" href="/piezas/">
                <span>{piecesShowcase.more}</span>
                <Arrow />
              </a>
            </div>
          </div>
        </div>
      </Reveal>

      <PiecesShowcase />

      <div className="pz-photos">
        <h3>{piecesShowcase.photosTitle}</h3>
        <ul>
          {pieces.map((piece) => (
            <li key={piece.id}>
              <div className="pz-photo">
                <PieceImage
                  piece={piece}
                  sizes="(max-width: 719px) 78vw, (max-width: 1023px) 40vw, 22vw"
                />
              </div>
              <p className="pz-photo-name">
                <span>{piece.name}</span>
                <span>{piece.measure}</span>
              </p>
              <p className="pz-photo-line">{piece.line}</p>
            </li>
          ))}
        </ul>
        <p className="editorial-note">{piecesShowcase.photosNote}</p>
      </div>
    </section>
  );
}
