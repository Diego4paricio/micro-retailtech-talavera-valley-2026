"use client";

import { demoBusinessName, useDemoBusiness } from "@/lib/demo-business";

/** Names the business whose example data the Resumen shows. */
export function ResumenCaption() {
  const business = useDemoBusiness();
  return (
    <span>
      Así se ve el Resumen de tu panel, con datos de ejemplo de{" "}
      {demoBusinessName(business)}.{" "}
      <a
        className="font-semibold text-ink-text underline decoration-ink-soft/60 underline-offset-4 transition-colors hover:text-white"
        href="#demo"
      >
        Cambia de negocio en la demo
      </a>
    </span>
  );
}
