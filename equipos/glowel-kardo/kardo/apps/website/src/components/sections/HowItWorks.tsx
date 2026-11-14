"use client";
import { useEffect, useRef, useState } from "react";
import { howItWorks } from "@/content/landing";
import { EditorialImage } from "../landing/EditorialImage";
import "@/app/landing-zonas.css";
export function HowItWorks() {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const query = matchMedia(
      "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
    );
    let observer: IntersectionObserver | undefined;
    const setup = () => {
      observer?.disconnect();
      if (!query.matches) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting)
              setActive(Number((entry.target as HTMLElement).dataset.step));
        },
        { rootMargin: "-35% 0px -35% 0px", threshold: 0 },
      );
      root.current?.querySelectorAll("[data-step]").forEach((step) => {
        observer?.observe(step);
      });
    };
    setup();
    query.addEventListener("change", setup);
    return () => {
      observer?.disconnect();
      query.removeEventListener("change", setup);
    };
  }, []);
  return (
    <section
      ref={root}
      id="como-funciona"
      className="editorial-section journey"
      aria-labelledby="how-it-works-title"
    >
      <div className="journey-visual">
        <h2 id="how-it-works-title">
          Un mismo punto.
          <br />
          Nuevas posibilidades.
        </h2>
        <figure>
          <EditorialImage
            name="como-funciona"
            alt="Una mano acerca un celular a un sticker redondo de la mesa 12 sobre una mesa de madera; la pantalla ya muestra una página"
            sizes="(max-width: 1023px) 100vw, 55vw"
          />
          <figcaption>
            Acerca el celular para NFC. Usa la cámara para QR.
          </figcaption>
        </figure>
        <div className="journey-progress" aria-hidden="true">
          {howItWorks.steps.map((step, index) => (
            <span key={step.number} data-active={index === active} />
          ))}
        </div>
      </div>
      <ol className="journey-steps">
        {howItWorks.steps.map((step, index) => (
          <li
            key={step.number}
            data-step={index}
            data-active={index === active}
          >
            <span className="editorial-label">0{step.number}</span>
            <h3>{step.verb}</h3>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
