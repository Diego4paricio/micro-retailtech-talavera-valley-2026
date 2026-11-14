/**
 * "Forma" (addendum: dónde cambiar la forma de un elemento): quick corner
 * presets for `button` and `brandButton`, as the three shapes already named
 * at the page level (`labels.ts`'s `buttonShapeLabels`) — plus, for a brand
 * button, the fourth "Círculo" look (handled separately, see
 * `model/canvas.ts`'s `setBrandButtonLook`). Pure so the mapping is easy to
 * test on its own.
 */

export type ButtonShapePreset = "pill" | "rounded" | "square";

const presetRadius: Record<ButtonShapePreset, number> = {
  pill: 999,
  rounded: 14,
  square: 0,
};

/** The exact `style.radius` a preset sets — always explicit (999/14/0),
 * never "automatic" (that stays the job of Avanzado's own "Esquinas"
 * slider, for any exact value). */
export function buttonShapeRadius(preset: ButtonShapePreset): number {
  return presetRadius[preset];
}

/** Which preset a button's own `style.radius` reads as. "Píldora" is also
 * the default: no override, or any value that is not exactly the "Redondeado"
 * or "Recto" numbers, reads as "Píldora" (closest to a plain button's own
 * rounded-by-default look, and never leaves a preset control unselected). */
export function buttonShapePreset(
  radius: number | undefined,
): ButtonShapePreset {
  if (radius === 0) return "square";
  if (radius === 14) return "rounded";
  return "pill";
}
