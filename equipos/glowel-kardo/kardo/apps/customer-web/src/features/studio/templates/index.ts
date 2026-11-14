import type { DesignableExperienceType } from "@kardo/contracts";
import { cafeTemplates } from "./giros/cafe.js";
import { escuelaTemplates } from "./giros/escuela.js";
import { eventosTemplates } from "./giros/eventos.js";
import { floreriaTemplates } from "./giros/floreria.js";
import { hotelTemplates } from "./giros/hotel.js";
import { inmobiliariaTemplates } from "./giros/inmobiliaria.js";
import { profesionalTemplates } from "./giros/profesional.js";
import { restauranteTemplates } from "./giros/restaurante.js";
import { salonTemplates } from "./giros/salon.js";
import { tiendaTemplates } from "./giros/tienda.js";
import type { StudioTemplate } from "./types.js";

export type { StudioTemplate } from "./types.js";

/**
 * Kardo's starter templates for the Estudio de Experiences (ADR 018), one
 * or more per approved giro (restaurante, café, florería, tienda, salón,
 * inmobiliaria, profesional, hotel, eventos, escuela). Every template's
 * `design` passes `PageDesignSchema` and `checkDesign` for each type it
 * declares, see `test/studio-templates.test.ts`.
 */
export const kardoTemplates: StudioTemplate[] = [
  ...restauranteTemplates,
  ...cafeTemplates,
  ...floreriaTemplates,
  ...tiendaTemplates,
  ...salonTemplates,
  ...inmobiliariaTemplates,
  ...profesionalTemplates,
  ...hotelTemplates,
  ...eventosTemplates,
  ...escuelaTemplates,
];

/** Templates that fit a given designable Experience type. */
export function templatesFor(type: DesignableExperienceType): StudioTemplate[] {
  return kardoTemplates.filter((template) => template.types.includes(type));
}
