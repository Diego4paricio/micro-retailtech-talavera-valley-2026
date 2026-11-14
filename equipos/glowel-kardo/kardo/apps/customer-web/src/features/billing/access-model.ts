import type { WorkspaceAccess } from "@kardo/contracts";
import { pluralWord } from "../../lib/text.js";
import { websiteBase } from "../legal/legal-links.js";
import { zoneOption } from "./format.js";

/**
 * Pure copy and links for the access strip and the plan-required dialog
 * (ADR 020). No React and no I/O.
 */

const locale = "es-MX";

/** "7 de octubre de 2026", in the person's zone. Empty for missing dates. */
export function accessDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    ...zoneOption(),
    dateStyle: "long",
  }).format(date);
}

type PricingEnv = { configured?: string | undefined; location: URL };

/** Pricing page of the Website, opened from the panel of one organization. */
export function pricingUrl(workspaceId: string, env?: PricingEnv): string {
  const base = websiteBase(
    env ?? {
      configured: import.meta.env.VITE_WEBSITE_URL,
      location: new URL(window.location.href),
    },
  );
  return `${base}/precios/?desde=panel&organizacion=${encodeURIComponent(workspaceId)}`;
}

export const askOwnerText = "Pídele al propietario que elija un plan";

export type AccessBanner = {
  tone: "info" | "warning";
  text: string;
  /** Owner: "Elegir plan". Everyone else reads `askOwnerText`. */
  choosePlan: boolean;
  /** "Descargar" (data export), only where the person may export. */
  download: boolean;
  /** «Ver planes» for every role: the public pricing page (trial). */
  viewPlans?: boolean;
  /** «Elegir» (opens the downgrade selection), for who manages billing. */
  chooseExcluded?: boolean;
};

/**
 * The «Qué sigue activo» strip says nearly the same as a warning strip of the
 * access (limited, paused, out of the plan): only one shows, so they never
 * stack (A2-70). The access strip wins.
 */
export function selectionBannerHidden(banner: AccessBanner | null): boolean {
  return banner?.tone === "warning";
}

/** What a trial strip promises: the 15 days end without a charge. */
export const trialNoChargeText =
  "Al terminar no se cobra nada si no eliges un plan.";

const plural = pluralWord;

function offerText(access: WorkspaceAccess): string {
  const { offer } = access;
  const until = accessDate(offer?.validUntil);
  if (!offer || !until) return "";
  const months =
    offer.months === 1 ? "tu primer mes" : `tus ${offer.months} primeros meses`;
  return ` ${offer.percentOff} % en ${months} si contratas antes del ${until}.`;
}

function graceClause(access: WorkspaceAccess): string {
  const date = accessDate(access.graceEndsAt);
  return date ? `; tus páginas se pausan el ${date}` : "";
}

/** The strip for this access, or null when the panel shows none. */
export function bannerFor(
  access: WorkspaceAccess | null,
  options: { canExport: boolean },
): AccessBanner | null {
  if (!access) return null;
  const choosePlan = true;

  if (access.deletionSoon && access.state !== "active") {
    const date = accessDate(access.deleteAt);
    return {
      tone: "warning",
      text: date
        ? `Borraremos esta organización el ${date}. Descarga tu información o contrata`
        : "Borraremos esta organización pronto. Descarga tu información o contrata",
      choosePlan,
      download: options.canExport,
    };
  }

  // ADR 024: the account is fine, but this organization is out of its plan.
  if (access.source === "excluded")
    return {
      tone: "warning",
      text: "Esta organización quedó fuera de tu plan: sus páginas están en pausa. Nada se borra.",
      choosePlan: false,
      download: false,
      chooseExcluded: access.canManage,
    };

  const plan = access.planName;
  switch (access.state) {
    case "trial": {
      const days = access.daysLeft;
      const of = plan ? ` de ${plan}` : "";
      const head =
        days === null
          ? plan
            ? `Estás en la prueba de ${plan}.`
            : "Estás en tu periodo de prueba."
          : days <= 0
            ? `Tu prueba${of} termina hoy.`
            : `${plural(days, "Te queda", "Te quedan")} ${days} ${plural(days, "día", "días")} de prueba${of}.`;
      return {
        tone: "info",
        text: `${head} ${trialNoChargeText}`,
        choosePlan: false,
        viewPlans: true,
        download: false,
      };
    }
    case "limited": {
      let text: string;
      if (access.source === "none")
        text =
          "Esta organización no tiene plan. Elige uno para empezar a crear";
      else if (access.source === "trial")
        text = `Tu prueba terminó. Elige un plan para seguir editando${graceClause(access)}.${offerText(access)}`;
      else
        text = `Tu plan terminó. Elige un plan para seguir editando${graceClause(access)}.`;
      return {
        tone: "warning",
        text: text.trim(),
        choosePlan,
        download: false,
      };
    }
    case "paused":
      return {
        tone: "warning",
        text: "Tus páginas están en pausa. Elige un plan y vuelven al instante",
        choosePlan,
        download: false,
      };
    case "active": {
      if (
        access.source !== "manual" ||
        access.daysLeft === null ||
        access.daysLeft > 7
      )
        return null;
      const date = accessDate(access.endsAt);
      if (!date) return null;
      return {
        tone: "info",
        text: `Tu plan ${plan ?? ""} de cortesía termina el ${date}`
          .replace("plan  de", "plan de")
          .trim(),
        choosePlan,
        download: false,
      };
    }
    default:
      return null;
  }
}
