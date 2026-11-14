"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { type PieceId, pieces } from "@/content/pieces";
import { pieceSamples, piecesShowcase } from "@/content/zonas";
import { absoluteUrl } from "@/lib/site";
import { KardoPage } from "../kardo-page/KardoPage";
import { PieceArt } from "../personalizar/PieceArt";
import { useFamilies } from "../personalizar/useFamilies";
import { sampleDesigns, samplePages } from "./samples";
import "@/app/kardo-page.css";

/*
  The four pieces at their real size next to a phone, and the phone shows
  the page the chosen piece opens. Each piece is drawn with the templates
  of /personalizar/, so what you see here is what you can make yours. On a
  phone screen only the chosen piece stays next to the phone; the others
  are picked from the row under it.
*/

/** A common phone, 7.15 × 14.67 cm, as the size reference. */
const phone = { width: 7.15, height: 14.67 };
const cm = (value: number) => `calc(${value} * var(--cm))`;

/** Pixel size of each arte-<id>.webp (scripts/media/landing-images.mjs). */
const artSize: Record<
  Exclude<PieceId, "stand">,
  { width: number; height: number }
> = {
  card: { width: 900, height: 571 },
  magnet: { width: 900, height: 494 },
  sticker: { width: 899, height: 900 },
};

/**
 * A sample piece. The Stand is drawn with the templates of /personalizar/;
 * the Card, the Magnet and the Sticker keep the print artwork approved
 * before (Docs/renders/DiseñosImprimir, cropped to arte-<id>.webp), as the
 * owner asked on 2026-10-13.
 */
export function SampleArt({
  id,
  small = false,
}: {
  id: PieceId;
  small?: boolean;
}) {
  const design = sampleDesigns.stand;
  const families = useFamilies(design.brand.font);
  const name = pieces.find((piece) => piece.id === id)?.name ?? "";
  const title = small
    ? undefined
    : `${name} de ejemplo de ${pieceSamples[id].business}`;
  if (id !== "stand") {
    const size = artSize[id];
    return (
      // biome-ignore lint/performance/noImgElement: Small local WebP sized in cm by CSS for the static export.
      <img
        alt={title ?? ""}
        className={`pz-art pz-art-img pz-art-${id}`}
        height={size.height}
        loading="lazy"
        src={`/media/landing/arte-${id}.webp`}
        width={size.width}
      />
    );
  }
  return (
    <PieceArt
      className="pz-art"
      design={design}
      families={families}
      id={`pz-${id}${small ? "-mini" : ""}`}
      piece={id}
      qrText={absoluteUrl(`/piezas/#${id}`)}
      title={title}
    />
  );
}

/** The screen's width over 375 px, the width the page is laid out at. */
function useScreenScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / 375);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

export function PiecesShowcase() {
  const [active, setActive] = useState<PieceId>("stand");
  const screen = useScreenScale();
  const sample = pieceSamples[active];
  const page = samplePages[active];
  const activePiece = pieces.find((piece) => piece.id === active);

  return (
    <figure className="pz-showcase">
      <div className="pz-strip">
        <div className="pz-phone-cell">
          <div
            className="pz-phone"
            style={{ width: cm(phone.width), height: cm(phone.height) }}
          >
            <div className="pz-screen" ref={screen.ref}>
              <div
                className="pz-page"
                key={active}
                style={{ transform: `scale(${screen.scale})` }}
              >
                <KardoPage
                  content={page.content}
                  insetTop={18}
                  theme={page.theme}
                />
              </div>
            </div>
          </div>
          <span className="pz-name">Tu cliente</span>
          <span className="pz-measure">lo abre en su celular</span>
        </div>
        {pieces.map((piece) => (
          <button
            aria-pressed={active === piece.id}
            className={`pz-piece pz-piece-${piece.id}`}
            key={piece.id}
            onClick={() => setActive(piece.id)}
            onMouseEnter={() => setActive(piece.id)}
            type="button"
          >
            <span
              className="pz-draw"
              style={{
                width: cm(piece.size.width),
                height: cm(piece.size.height),
              }}
            >
              <SampleArt id={piece.id} />
              {piece.id === "stand" ? (
                <span aria-hidden="true" className="pz-base" />
              ) : null}
            </span>
            <span className="pz-name">{piece.name}</span>
            <span className="pz-measure">{piece.measure}</span>
          </button>
        ))}
      </div>

      <fieldset className="pz-picker">
        <legend className="sr-only">Elige una pieza</legend>
        {pieces.map((piece) => (
          <button
            aria-pressed={active === piece.id}
            key={piece.id}
            onClick={() => setActive(piece.id)}
            type="button"
          >
            <span className={`pz-picker-art pz-picker-${piece.id}`}>
              <SampleArt id={piece.id} small />
            </span>
            <span>{piece.name}</span>
          </button>
        ))}
      </fieldset>

      <figcaption className="pz-caption">
        <p aria-live="polite">
          <b>{sample.business}.</b> {sample.opens}
        </p>
        <a
          className="editorial-link group"
          href={`/personalizar/?pieza=${active}`}
        >
          <span>
            {piecesShowcase.customizeThis} el {activePiece?.name}
          </span>
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
        </a>
      </figcaption>
      <p className="pz-scale-note">{piecesShowcase.scaleNote}</p>
    </figure>
  );
}
