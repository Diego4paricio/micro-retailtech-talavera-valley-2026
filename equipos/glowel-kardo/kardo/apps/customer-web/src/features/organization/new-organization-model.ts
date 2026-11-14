import {
  type BillingInterval,
  type BillingMyAccount,
  type BillingPlanList,
  type Industry,
  industryCatalog,
  type WorkspaceProfile,
} from "@kardo/contracts";
import type { IconName } from "../../components/Icon.js";
import { countLabel } from "../../lib/text.js";
import {
  defaultBrand,
  paletteChoices,
} from "../business-profile/BrandPicker.js";
import { mxCities } from "../profile-fields/mx-cities.js";
import { phoneDigits, phoneForProfile } from "../profile-fields/phone.js";

/**
 * «Crear organización» in four steps (relevo 36, approved 2026-10-07):
 * Negocio, Ubicación, Marca and Confirmar. Only the name is required.
 */
export const newOrganizationSteps = [
  "Negocio",
  "Ubicación",
  "Marca",
  "Confirmar",
] as const;

export const initialWizardState = {
  name: "",
  industry: "",
  about: "",
  country: "MX",
  city: "",
  /** `null` follows the city; a value is one the person chose. */
  timezone: null as string | null,
  address: "",
  hours: "",
  whatsapp: "",
  email: "",
  /** Kardo's own colors until the person picks others. */
  primary: defaultBrand.primary,
  accent: defaultBrand.accent,
  customColors: false,
};

export type WizardState = typeof initialWizardState;

/**
 * The icon of each giro's tile. A `Record` over the catalog's `Industry`, so
 * a giro added to `@kardo/contracts` fails to compile here until it has one
 * (domain audit 2026-10-13, A2-5).
 */
export const industryIcons: Record<Industry, IconName> = {
  restaurante: "utensils",
  cafeteria: "utensils",
  panaderia: "utensils",
  bar: "utensils",
  belleza: "star",
  retail: "cart",
  floreria: "star",
  papeleria: "cart",
  servicios: "document",
  agencia: "document",
  salud: "heart",
  educacion: "guide",
  eventos: "calendar",
  inmobiliaria: "location",
  hotel: "organization",
  otro: "more",
};

/** The giro tiles: the one catalog, with each one's icon. */
export const industryTiles: readonly {
  value: Industry;
  label: string;
  icon: IconName;
}[] = industryCatalog.map((industry) => ({
  value: industry.value,
  label: industry.label,
  icon: industryIcons[industry.value],
}));

export { industryLabel } from "@kardo/contracts";
export { paletteChoices };

/** Mexico's time zones by state; everything else is Central time. */
const stateZones: Record<string, { zone: string; label: string }> = {
  "Quintana Roo": { zone: "America/Cancun", label: "Sureste (Quintana Roo)" },
  "Baja California": {
    zone: "America/Tijuana",
    label: "Noroeste (Baja California)",
  },
  "Baja California Sur": {
    zone: "America/Mazatlan",
    label: "Pacífico (Baja California Sur, Sinaloa y Nayarit)",
  },
  Sinaloa: {
    zone: "America/Mazatlan",
    label: "Pacífico (Baja California Sur, Sinaloa y Nayarit)",
  },
  Nayarit: {
    zone: "America/Mazatlan",
    label: "Pacífico (Baja California Sur, Sinaloa y Nayarit)",
  },
  Sonora: { zone: "America/Hermosillo", label: "Sonora" },
  Chihuahua: { zone: "America/Chihuahua", label: "Chihuahua" },
};
const central = { zone: "America/Mexico_City", label: "Centro de México" };

/**
 * The time zone a Mexican city implies (Ciudad Juárez and Bahía de
 * Banderas follow their neighbors, not their state). Outside Mexico, or a
 * town not on the list, it stays on Central time until the person changes it.
 */
export function zoneForCity(
  city: string,
  country: string,
): { zone: string; label: string } {
  if (country !== "MX") return central;
  const name = city.split(",")[0]?.trim().toLowerCase() ?? "";
  if (name === "ciudad juárez" || name === "ciudad juarez")
    return { zone: "America/Ciudad_Juarez", label: "Ciudad Juárez" };
  if (name === "bahía de banderas" || name === "bahia de banderas")
    return central;
  const known = mxCities.find((item) => item.value === city.trim());
  return (known && stateZones[known.state]) || central;
}

export function effectiveZone(state: WizardState): string {
  return state.timezone ?? zoneForCity(state.city, state.country).zone;
}

/** Exported for tests: only the fields the person filled in are saved. */
export function buildProfile(
  state: WizardState,
  logoAssetId?: string,
): WorkspaceProfile {
  const profile: WorkspaceProfile = {
    country: state.country,
    timezone: effectiveZone(state),
  };
  if (state.industry)
    profile.industry = state.industry as NonNullable<
      WorkspaceProfile["industry"]
    >;
  const about = state.about.trim();
  if (about) profile.about = about;
  const city = state.city.trim();
  if (city) profile.city = city;
  const address = state.address.trim();
  if (address) profile.address = address;
  const hours = state.hours.trim();
  if (hours) profile.hours = hours;
  const digits = phoneDigits(state.whatsapp, state.country);
  if (digits) profile.phone = phoneForProfile(digits, state.country);
  const email = state.email.trim();
  if (email) profile.email = email;
  if (state.customColors || logoAssetId)
    profile.brand = { primary: state.primary, accent: state.accent };
  if (logoAssetId) profile.logoAssetId = logoAssetId;
  return profile;
}

/** The plan line when there is no account to read (no plan, or it failed). */
export const newOrganizationPlanNote =
  "Empieza sin plan. Para publicar, elige uno en Plan y facturación.";

const plural = countLabel;

/**
 * The cap is the plan's (ADR 024): at the cap when the limit is used up.
 * Without a plan the server still applies a limit (A2-13), so the cap
 * counts too and the dialog says «Elige un plan».
 */
export function atOrganizationCap(
  account: BillingMyAccount | null | undefined,
): boolean {
  return Boolean(
    account &&
      account.organizationsLimit !== null &&
      account.organizationsUsed >= account.organizationsLimit,
  );
}

/**
 * Where reading the person's account is (A2-8): «loading» keeps the
 * dialog on «Un momento…»; «failed» shows the normal form with a retry,
 * since the server applies the cap anyway; «ready» has the account.
 */
export function accountPhase(
  account: BillingMyAccount | null | undefined,
  failed: boolean,
): "loading" | "failed" | "ready" {
  if (account) return "ready";
  return failed ? "failed" : "loading";
}

/** Used up with no plan at all: the only way on is to pick one. */
export function needsPlanForOrganization(
  account: BillingMyAccount | null | undefined,
): boolean {
  return Boolean(account && !account.plan && atOrganizationCap(account));
}

/** «Elige un plan para crear otra organización.» */
export const choosePlanForOrganizationLine =
  "Elige un plan para crear otra organización.";

/** «Tu plan Profesional incluye 3: usas 2. Esta será la 3.» and its kin. */
export function organizationPlanLine(
  account: BillingMyAccount | null | undefined,
): string {
  const plan = account?.plan;
  if (!account || !plan) return newOrganizationPlanNote;
  const { organizationsLimit: limit, organizationsUsed: used } = account;
  if (limit === null)
    return `Tu plan ${plan.name} incluye las organizaciones que necesites.`;
  if (plan.source === "trial")
    return `Tu prueba de ${plan.name} incluye ${limit}: usas ${used}.`;
  return `Tu plan ${plan.name} incluye ${limit}: usas ${used}. Esta será la ${used + 1}.`;
}

/** «Tu plan incluye 3: usas 2», or nothing when the account is unknown. */
export function organizationsFooter(
  account: BillingMyAccount | null | undefined,
): string | null {
  if (!account?.plan) return null;
  return account.organizationsLimit === null
    ? `Tu plan incluye las organizaciones que necesites: usas ${account.organizationsUsed}.`
    : `Tu plan incluye ${account.organizationsLimit}: usas ${account.organizationsUsed}.`;
}

/** «Tu plan Esencial incluye 1 organización y ya la usas.» */
export function organizationCapLine(account: BillingMyAccount): string {
  const name = account.plan?.name ?? "";
  const limit = account.organizationsLimit ?? 0;
  const whose =
    account.plan?.source === "trial"
      ? `Tu prueba de ${name}`
      : `Tu plan ${name}`;
  return limit === 1
    ? `${whose} incluye 1 organización y ya la usas.`
    : `${whose} incluye ${plural(limit, "organización", "organizaciones")} y ya las usas.`;
}

const pesos = (cents: number) =>
  `$${(cents / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })}`;

/** The interval the account pays (its extras carry one price per interval). */
function accountInterval(account: BillingMyAccount): BillingInterval {
  const prices =
    account.extras.find((extra) => extra.code === "organization")?.prices ?? [];
  return prices.length === 1 && prices[0] ? prices[0].interval : "month";
}

/** «$99 al mes» / «$990 al año» for one extra organization, or null. */
export function extraOrganizationPrice(
  account: BillingMyAccount,
): string | null {
  const extra = account.extras.find((item) => item.code === "organization");
  const interval = accountInterval(account);
  const price = extra?.prices.find((item) => item.interval === interval);
  return price
    ? `${pesos(price.unitAmount)} ${interval === "year" ? "al año" : "al mes"}`
    : null;
}

/** The next plan up by organizations, with its one-line summary. */
export function nextPlanUp(
  account: BillingMyAccount,
  catalog: BillingPlanList | null | undefined,
): { code: string; name: string; line: string } | null {
  const limit = account.organizationsLimit;
  if (limit === null || !catalog) return null;
  const interval = accountInterval(account);
  const next = catalog.plans
    .map((plan) => ({
      plan,
      orgs: plan.entitlements["organizations.max"],
      price: plan.prices.find((item) => item.interval === interval),
    }))
    .filter(
      (item): item is typeof item & { orgs: number } =>
        typeof item.orgs === "number" && item.orgs > limit && !!item.price,
    )
    .sort((a, b) => a.orgs - b.orgs)[0];
  if (!next?.price) return null;
  const parts = [plural(next.orgs, "organización", "organizaciones")];
  const qr = next.plan.entitlements["touchpoints.max"];
  const links = next.plan.entitlements["links.max"];
  if (typeof qr === "number") parts.push(`${qr} QR y etiquetas`);
  if (typeof links === "number") parts.push(`${links} links`);
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`
      : (parts[0] ?? "");
  return {
    code: next.plan.code,
    name: next.plan.name,
    line: `${list}. ${pesos(next.price.unitAmount)} ${interval === "year" ? "al año" : "al mes"}.`,
  };
}

/** «Hoy pagas $X por lo que falta del mes.» */
export function extraChargeLine(
  amountDueToday: number,
  interval: BillingInterval,
): string {
  return `Hoy pagas ${pesos(amountDueToday)} por lo que falta del ${interval === "year" ? "año" : "mes"}.`;
}
export { accountInterval };

const DRAFT_KEY = "kardo-new-organization-draft";

/** The text typed so far, kept for this tab (a reload does not lose it). */
export function readDraft(): WizardState | null {
  try {
    const stored = sessionStorage.getItem(DRAFT_KEY);
    return stored
      ? {
          ...initialWizardState,
          ...(JSON.parse(stored) as Partial<WizardState>),
        }
      : null;
  } catch {
    return null;
  }
}

export function saveDraft(state: WizardState | null): void {
  try {
    if (state && state !== initialWizardState)
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode: the draft lives only while the dialog is open.
  }
}
