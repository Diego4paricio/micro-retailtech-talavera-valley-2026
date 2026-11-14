import { type Industry, industryCatalog } from "@kardo/contracts";

/**
 * Short Spanish names of the giros, shown once one is chosen. Derived from
 * the one catalog in `@kardo/contracts` (domain audit 2026-10-13, A2-5).
 */
export const industryLabels = Object.fromEntries(
  industryCatalog.map((industry) => [industry.value, industry.label]),
) as Record<Industry, string>;

/**
 * The giro choices as an owner would say them, most common first, for every
 * giro selector (Configuración, Crear organización, Primeros pasos, alta).
 */
export const industryOptions: { value: Industry; label: string }[] =
  industryCatalog.map((industry) => ({
    value: industry.value,
    label: industry.option,
  }));

/**
 * ISO-3166-1 alpha-2 codes with Spanish display names, curated to the markets
 * Kardo customers operate in today. Extend as new markets come online.
 */
export const countries: readonly { code: string; label: string }[] = [
  { code: "MX", label: "México" },
  { code: "US", label: "Estados Unidos" },
  { code: "CA", label: "Canadá" },
  { code: "ES", label: "España" },
  { code: "AR", label: "Argentina" },
  { code: "BO", label: "Bolivia" },
  { code: "BR", label: "Brasil" },
  { code: "CL", label: "Chile" },
  { code: "CO", label: "Colombia" },
  { code: "CR", label: "Costa Rica" },
  { code: "CU", label: "Cuba" },
  { code: "DO", label: "República Dominicana" },
  { code: "EC", label: "Ecuador" },
  { code: "SV", label: "El Salvador" },
  { code: "GT", label: "Guatemala" },
  { code: "HN", label: "Honduras" },
  { code: "NI", label: "Nicaragua" },
  { code: "PA", label: "Panamá" },
  { code: "PY", label: "Paraguay" },
  { code: "PE", label: "Perú" },
  { code: "PR", label: "Puerto Rico" },
  { code: "UY", label: "Uruguay" },
  { code: "VE", label: "Venezuela" },
];

export function countryLabel(code: string | undefined): string | null {
  if (!code) return null;
  return countries.find((country) => country.code === code)?.label ?? code;
}

/** Used only when the runtime has no `Intl.supportedValuesOf` (older engines). */
const fallbackTimeZones: readonly string[] = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Cancun",
  "America/Monterrey",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Guatemala",
  "America/El_Salvador",
  "America/Managua",
  "America/Costa_Rica",
  "America/Panama",
  "America/Santo_Domingo",
  "America/Havana",
  "America/Caracas",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "UTC",
];

/**
 * The full IANA time zone database when the runtime supports
 * `Intl.supportedValuesOf` (every modern browser and Node ≥ 18); a curated
 * list otherwise so the picker still works everywhere.
 */
export function listTimeZones(): readonly string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function")
      return Intl.supportedValuesOf("timeZone");
  } catch {
    // Fall through to the static list below.
  }
  return fallbackTimeZones;
}
