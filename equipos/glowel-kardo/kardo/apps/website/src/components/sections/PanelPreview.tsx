"use client";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { panelPreview, platformParts } from "@/content/zonas";
import { PanelShot } from "../platform/PanelShot";
import "@/app/landing-zonas.css";

/*
  «Tu panel por dentro»: the panel shown by its parts, each with a real
  screen (demo mode, 2026-10-13). The first six parts; /plataforma/ has
  all of them, the page types and the live demo.
*/

const parts = platformParts.slice(0, 6);

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

export function PanelPreview() {
  const [active, setActive] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = parts.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <section
      aria-labelledby="panel-title"
      className="editorial-section panel-section"
      id="plataforma"
    >
      <div className="zone-heading">
        <h2 id="panel-title">{panelPreview.title}</h2>
        <div className="zone-heading-side">
          <p>{panelPreview.lead}</p>
          <div className="zone-actions">
            <a className="editorial-link group" href="/plataforma/">
              <span>{panelPreview.more}</span>
              <Arrow />
            </a>
          </div>
        </div>
      </div>

      <div className="parts-tabs" role="tablist" aria-label="Partes del panel">
        {parts.map((part, index) => (
          <button
            aria-controls={`${id}-${part.id}`}
            aria-selected={active === index}
            id={`${id}-tab-${part.id}`}
            key={part.id}
            onClick={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            role="tab"
            tabIndex={active === index ? 0 : -1}
            type="button"
          >
            {part.name}
          </button>
        ))}
      </div>

      {parts.map((part, index) => (
        <div
          aria-labelledby={`${id}-tab-${part.id}`}
          className="part-panel"
          hidden={active !== index}
          id={`${id}-${part.id}`}
          key={part.id}
          role="tabpanel"
        >
          <div className="part-copy">
            <h3>{part.title}</h3>
            <p>{part.text}</p>
            <ul>
              {part.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="part-count">
              {index + 1} de {parts.length}
            </p>
          </div>
          <PanelShot alt={part.alt} name={part.image} />
        </div>
      ))}
      <p className="panel-note">{panelPreview.note}</p>
    </section>
  );
}
