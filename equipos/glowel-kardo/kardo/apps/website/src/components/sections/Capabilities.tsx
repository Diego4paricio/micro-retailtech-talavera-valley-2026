"use client";
import { useState } from "react";
import { capabilities } from "@/content/landing";
import { EditorialImage } from "../landing/EditorialImage";

/*
  Real screens of the customer panel in demo mode (Café Nube), one per
  capability, so this section shows the product instead of repeating the
  business photos below. Sources: Docs/renders/sitio/panel-*.png, taken with
  Playwright; landing-images.mjs makes the WebP.
*/
const visuals = [
  {
    name: "panel-publicar",
    alt: "Panel de Kardo, Disponibilidad: el Menú Terraza con cada platillo marcado como disponible, agotado u oculto",
    caption: "Disponibilidad: lo agotado se marca sin volver a publicar.",
  },
  {
    name: "panel-conectar",
    alt: "Panel de Kardo, Touchpoints: el grupo Local Centro con la terraza y sus mesas, cada una con su QR o NFC",
    caption: "Touchpoints: tus piezas por local, zona y mesa.",
  },
  {
    name: "panel-medir",
    alt: "Panel de Kardo, Resumen: accesos, clics, leads, accesos por día y reparto entre NFC y QR",
    caption: "Resumen: accesos por día, por pieza y por canal.",
  },
];
export function Capabilities() {
  const [active, setActive] = useState(0);
  return (
    <section
      id="capacidades"
      className="editorial-section capabilities-editorial"
      aria-labelledby="capabilities-title"
    >
      <div>
        <p className="editorial-label">03 / Desde un solo lugar</p>
        <h2 id="capabilities-title">
          Tu información cambia.
          <br />
          Tus puntos permanecen.
        </h2>
        <div className="capability-list">
          {capabilities.items.map((item, index) => (
            <div key={item.id} className="capability-item">
              <h3>
                <button
                  type="button"
                  aria-expanded={active === index}
                  aria-controls={`capability-${item.id}`}
                  onClick={() => setActive(index)}
                >
                  <span>{item.eyebrow}</span>
                  <span aria-hidden="true">{active === index ? "−" : "+"}</span>
                </button>
              </h3>
              <div
                id={`capability-${item.id}`}
                className="capability-answer"
                data-open={active === index}
                inert={active !== index}
                aria-hidden={active !== index}
              >
                <div>
                  <p>{item.text}</p>
                  <p className="capability-detail">{item.lead}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <figure className="capability-visual">
        {visuals.map((visual, index) => (
          <div
            key={visual.name}
            className="capability-slide"
            data-active={index === (active ?? 0)}
            aria-hidden={index !== (active ?? 0)}
          >
            <div className="capability-screen">
              <EditorialImage
                name={visual.name}
                alt={visual.alt}
                sizes="(max-width: 1023px) 100vw, 46vw"
              />
            </div>
            <p>{visual.caption}</p>
          </div>
        ))}
        <figcaption>
          Pantallas reales del panel con datos de ejemplo.
        </figcaption>
      </figure>
    </section>
  );
}
