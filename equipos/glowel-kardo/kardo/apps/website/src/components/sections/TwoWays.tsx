import { Check } from "lucide-react";
import { type CSSProperties, Fragment } from "react";
import { twoWays } from "@/content/zonas";
import { loadKits, lowestMonthlyPrice } from "@/lib/kits";
import { formatPesos, loadPricing, pricingPublished } from "@/lib/pricing";
import { ResumenBoard } from "../insights/ResumenBoard";
import { Reveal } from "../landing/Reveal";
import { PiecesMini } from "../pieces/PiecesMini";
import { lowestKitPrice } from "../pricing/start-copy";
import "@/app/landing-zonas.css";

/*
  Right after the hero: Kardo sells two things that work together, the
  panel (each month) and the pieces (once). Each side leads to its zone
  of the page. Prices come from the catalogs, never written by hand.
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

export function TwoWays() {
  const published = pricingPublished();
  const pricing = loadPricing();
  const kits = loadKits();
  const monthly = lowestMonthlyPrice();
  const kitFrom = lowestKitPrice(kits);
  const platformPrice =
    published && monthly !== null
      ? `Desde ${formatPesos(monthly)} al mes. Lo pruebas ${pricing.trialDays} días sin tarjeta.`
      : null;
  const piecesPrice =
    published && kitFrom !== null
      ? `Kits desde ${formatPesos(kitFrom)}, con ${kits.panelDays} días del panel.`
      : null;
  const sides = [
    {
      key: "platform",
      side: twoWays.platform,
      href: "/plataforma/",
      price: platformPrice,
      visual: (
        <div aria-hidden="true" className="way-resumen" inert>
          <div className="way-resumen-board">
            <ResumenBoard />
          </div>
        </div>
      ),
    },
    {
      key: "pieces",
      side: twoWays.pieces,
      href: "/piezas/",
      price: piecesPrice,
      visual: <PiecesMini />,
    },
  ];
  return (
    <section
      aria-labelledby="ways-title"
      className="editorial-section ways-section"
    >
      <Reveal className="ways-intro">
        <h2 id="ways-title" aria-label={twoWays.title}>
          {twoWays.title.split(" ").map((word, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: words can repeat.
            <Fragment key={index}>
              {index > 0 ? " " : null}
              <span
                aria-hidden="true"
                className="ways-word"
                style={{ "--i": index } as CSSProperties}
              >
                <span>{word}</span>
              </span>
            </Fragment>
          ))}
        </h2>
        <p className="ways-lead">{twoWays.lead}</p>
      </Reveal>
      <Reveal className="ways-grid">
        {sides.map(({ key, side, href, price, visual }) => (
          <article className="way" key={key}>
            <div className="way-visual">{visual}</div>
            <p className="way-name">{side.name}</p>
            <div>
              <h3>{side.title}</h3>
              <p>{side.text}</p>
              <ul>
                {side.points.map((point) => (
                  <li key={point}>
                    <Check aria-hidden="true" size={16} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              {price ? <p className="way-price">{price}</p> : null}
            </div>
            <a className="editorial-link group" href={href}>
              <span>{side.link}</span>
              <Arrow />
            </a>
          </article>
        ))}
      </Reveal>
    </section>
  );
}
