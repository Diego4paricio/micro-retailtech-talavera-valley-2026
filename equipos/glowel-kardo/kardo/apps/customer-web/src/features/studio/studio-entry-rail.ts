import type { RailSection } from "./StudioContext.js";

/**
 * Opens the Estudio on one rail, once: Primeros pasos' «Pídeselo a la IA»
 * lands on the "IA" rail instead of the templates. Kept for this tab only
 * and cleared by the first Estudio that opens that Experience.
 */
const key = (experienceId: string) => `kardo.estudio.rail.${experienceId}`;

export function requestStudioRail(experienceId: string, rail: RailSection) {
  try {
    window.sessionStorage.setItem(key(experienceId), rail);
  } catch {
    // Blocked storage: the Estudio opens on its usual rail.
  }
}

export function readStudioRail(experienceId: string): RailSection | null {
  try {
    const value = window.sessionStorage.getItem(key(experienceId));
    return value === "ai" || value === "content" || value === "templates"
      ? value
      : null;
  } catch {
    return null;
  }
}

/** After the Estudio opened on it (in an effect: render stays pure). */
export function clearStudioRail(experienceId: string) {
  try {
    window.sessionStorage.removeItem(key(experienceId));
  } catch {
    // Nothing to clear.
  }
}
