import type { ConceptBrief } from "@kardo/contracts";
import { objectiveActive, objectives } from "./objectives.js";

/**
 * "Ayuda de la IA" as a guided onboarding: 3 short, skippable steps that
 * always end in the editor. Pure step logic (navigation and the recap row),
 * kept separate from the dialog's React so it is easy to test.
 */
export type OnboardStep = 1 | 2 | 3;

export const onboardSteps: readonly OnboardStep[] = [1, 2, 3];

export const onboardStepLabels: Record<OnboardStep, string> = {
  1: "Qué quieres",
  2: "Tu marca",
  3: "Quién la diseña",
};

/** Step 3 ("Quién la diseña") is the last one; going further stays there. */
export function nextOnboardStep(step: OnboardStep): OnboardStep {
  return step === 3 ? 3 : ((step + 1) as OnboardStep);
}

/** Step 1 ("Qué quieres") is the first one; going back stays there. */
export function previousOnboardStep(step: OnboardStep): OnboardStep {
  return step === 1 ? 1 : ((step - 1) as OnboardStep);
}

/**
 * The recap row: what Tu concepto and Tu marca currently hold, as short
 * chips ("Pedidos, Reservas", "cálido", "2 colores", "3 imágenes"). Empty
 * when nothing has been chosen yet.
 */
export function conceptRecap(brief: ConceptBrief): string[] {
  const chips: string[] = [];
  const chosenObjectives = objectives.filter((objective) =>
    objectiveActive(brief, objective),
  );
  if (chosenObjectives.length)
    chips.push(chosenObjectives.map((objective) => objective.label).join(", "));
  if (brief.tone?.trim()) chips.push(brief.tone.trim());
  if (brief.colors.length)
    chips.push(
      `${brief.colors.length} ${brief.colors.length === 1 ? "color" : "colores"}`,
    );
  if (brief.imageRefs.length)
    chips.push(
      `${brief.imageRefs.length} ${brief.imageRefs.length === 1 ? "imagen" : "imágenes"}`,
    );
  return chips;
}
