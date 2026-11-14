import { Check } from "lucide-react";
import { kitActivation, kitsSection } from "@/content/landing";
import type { PieceId } from "@/content/pieces";
import { loadKits } from "@/lib/kits";
import { formatPesos } from "@/lib/pricing";
import { whatsappLink } from "@/lib/site";
import { Reveal } from "../landing/Reveal";
import { PieceMini } from "../pieces/PieceGlyphs";
import { WhatsAppIcon } from "../ui";

/**
 * The buying block: the four kits from kits-catalog.json, each ordered by
 * WhatsApp, and how a kit reaches the panel with its activation code
 * (ADR 025). The panel alone is offered next to it, in the prices block.
 */
export function Kits({
  id = "kits",
  label = true,
}: {
  id?: string;
  label?: boolean;
}) {
  const { kits, shipping, panelDays } = loadKits();
  return (
    <section
      id={id}
      className="editorial-section kits-editorial"
      aria-labelledby={`${id}-title`}
    >
      <Reveal>
        {label ? <p className="editorial-label">{kitsSection.label}</p> : null}
        <h2 id={`${id}-title`}>
          {kitsSection.title}
          <br />
          <em>Tus piezas listas y {panelDays} días de tu panel.</em>
        </h2>
      </Reveal>

      <ul className="kits-grid">
        {kits.map((kit) => (
          <li key={kit.code} className="kit-column">
            <h3>{kit.name}</h3>
            <p className="kit-price">
              {formatPesos(kit.price)}
              <span>MXN, IVA incluido</span>
            </p>
            <ul className="kit-items">
              {kit.items.map((item) => (
                <li key={item.piece}>
                  <PieceMini id={item.piece as PieceId} />
                  <span>
                    <b>{item.quantity}</b> {item.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="kit-includes">
              Incluye {kit.panelDays} días del panel en el plan{" "}
              {kit.panelPlanName}.
            </p>
            <a
              className="kit-button"
              href={whatsappLink(kit.message)}
              rel="noopener"
            >
              <WhatsAppIcon className="size-[18px]" />
              <span>{kitsSection.order}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="kit-activation">
        <h3>{kitActivation.title}</h3>
        <ol>
          {kitActivation.steps.map((step, index) => (
            <li key={step.title}>
              <span className="editorial-label">0{index + 1}</span>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <a className="editorial-link group" href="/activar/">
          <span>{kitActivation.link}</span>
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
      </div>

      <div className="kits-notes">
        <p>
          <Check aria-hidden="true" className="size-4 shrink-0" />
          <span>
            <b>{kitsSection.basicTitle}</b> {kitsSection.basicText}
          </span>
        </p>
        <p>
          <Check aria-hidden="true" className="size-4 shrink-0" />
          <span>{shipping}</span>
        </p>
      </div>
    </section>
  );
}
