import type { DesignableExperienceType, PageDesign } from "@kardo/contracts";

/**
 * Kardo's starter templates for the Estudio de Experiences (ADR 018, phase
 * 2 base). Each template is a ready made `PageDesign` for one of the giros
 * the owner approved, tagged with the designable Experience types it fits.
 *
 * A template's `design` must include the bound blocks allowed for *every*
 * type it lists (see `boundBlocksByType` in `@kardo/contracts`), and must
 * keep each listed type's required bound block. Templates that would need
 * a bound block one of their types forbids are split into per type
 * variants instead of being merged into one.
 */
export type StudioTemplate = {
  id: string;
  name: string;
  giro: string;
  types: DesignableExperienceType[];
  design: PageDesign;
  description: string;
};
