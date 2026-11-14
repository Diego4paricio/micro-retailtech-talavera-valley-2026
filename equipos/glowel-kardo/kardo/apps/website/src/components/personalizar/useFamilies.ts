"use client";
import { useEffect, useState } from "react";
import { type FontId, fontById, uiFont } from "./design";
import type { Families } from "./PieceArt";

/*
  The font-family lists behind the CSS variables of src/app/fonts.ts. Until
  the browser resolves them (and the faces load) the drawing uses var() and
  estimated widths; then it measures again with the real fonts.
*/

function fallback(fontId: FontId): Families {
  return {
    brand: `var(${fontById(fontId).variable}), sans-serif`,
    ui: `var(${uiFont.variable}), sans-serif`,
  };
}

export function useFamilies(fontId: FontId): Families {
  const [families, setFamilies] = useState<Families>(() => fallback(fontId));

  useEffect(() => {
    let alive = true;
    const root = getComputedStyle(document.documentElement);
    const resolved: Families = {
      brand:
        root.getPropertyValue(fontById(fontId).variable).trim() || "sans-serif",
      ui: root.getPropertyValue(uiFont.variable).trim() || "sans-serif",
    };
    const loads = [400, 600].flatMap((weight) => [
      document.fonts.load(`${weight} 20px ${resolved.brand}`),
      document.fonts.load(`${weight} 20px ${resolved.ui}`),
    ]);
    Promise.allSettled(loads).then(() => {
      if (alive) setFamilies(resolved);
    });
    return () => {
      alive = false;
    };
  }, [fontId]);

  return families;
}
