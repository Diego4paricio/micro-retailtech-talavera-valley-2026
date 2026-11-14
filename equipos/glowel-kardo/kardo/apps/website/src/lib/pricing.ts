import fs from "node:fs";
import path from "node:path";

// The /precios/ page is built from Docs/engineering/config/billing-catalog.json,
// the same file scripts/stripe/setup-billing.mts applies to Stripe and the
// database (ADR 020), so the site never shows a price Stripe does not charge.
// While the owner has not approved it (`approved: false`) the page is a
// draft: marked, not indexed, and not published in production.

type Entitlements = Record<string, number | boolean | null>;

type CatalogPlan = {
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublic: boolean;
  contactOnly?: boolean;
  entitlements: Entitlements;
  prices: { interval: "month" | "year"; amount: number }[];
};

/** Extras for a paid plan (ADR 024): lines of the same subscription. */
type CatalogExtra = {
  code: string;
  name: string;
  description: string;
  prices: { interval: "month" | "year"; amount: number }[];
};

type Catalog = {
  approved: boolean;
  currency: string;
  trial: { days: number; defaultPlan: string };
  access: { graceDays: number; deleteAfterDays: number };
  retired?: string[];
  plans: CatalogPlan[];
  extras?: CatalogExtra[];
};

export type PricingPlan = {
  code: string;
  name: string;
  description: string;
  /** The trial plan: highlighted as the recommended one. */
  recommended: boolean;
  /** Sold by contact (Corporativo): no price, no sign up button. */
  contactOnly: boolean;
  /** Pesos with IVA, or null when the plan has no such price. */
  monthly: number | null;
  yearly: number | null;
  /** What the yearly price saves against 12 monthly charges, or null. */
  yearlySavings: number | null;
  entitlements: Entitlements;
};

export type PricingExtra = {
  code: string;
  name: string;
  description: string;
  /** Pesos with IVA, or null when the extra has no such price. */
  monthly: number | null;
  yearly: number | null;
};

export type Pricing = {
  approved: boolean;
  trialDays: number;
  trialPlanName: string;
  graceDays: number;
  deleteAfterDays: number;
  /** The most whole months the yearly price saves on any plan (the saving
   * differs by plan: each card says its own). */
  annualMaxFreeMonths: number;
  plans: PricingPlan[];
  extras: PricingExtra[];
};

export type LimitRow = {
  key: string;
  label: string;
  format: (value: number | boolean | null | undefined) => string;
};

const count = (value: number | boolean | null | undefined) =>
  value === null || value === undefined
    ? "Sin límite"
    : typeof value === "number"
      ? value.toLocaleString("es-MX")
      : "";

const storage = (value: number | boolean | null | undefined) => {
  if (value === null || value === undefined) return "Sin límite";
  if (typeof value !== "number") return "";
  return value >= 1024
    ? `${(value / 1024).toLocaleString("es-MX", { maximumFractionDigits: 1 })} GB`
    : `${value} MB`;
};

const included = (value: number | boolean | null | undefined) =>
  value === true ? "Incluido" : "No";

/**
 * Only limits of features customers can use today. Left out on purpose:
 * `ai.generations_month` and `custom_html.enabled` belong to the Estudio
 * (ADR 018), not deployed yet, and `analytics.history_days`, because the
 * analytics store keeps three months (ADR 006), so a longer history cannot
 * be promised.
 */
export const limitRows: LimitRow[] = [
  // The plan is the person's (ADR 024): it covers her organizations and
  // every other limit is shared among them.
  { key: "organizations.max", label: "Organizaciones", format: count },
  {
    key: "touchpoints.max",
    // The panel calls these «QR y etiquetas» (D2); the site uses the same
    // words so a visitor reads one name everywhere (round 4, Fernanda).
    label: "QR y etiquetas",
    format: count,
  },
  { key: "links.max", label: "Páginas de Link", format: count },
  { key: "members.max", label: "Personas en tu equipo", format: count },
  {
    key: "qr_designs.max",
    label: "Diseños guardados en Diseño del QR",
    format: count,
  },
  {
    key: "assets.storage_mb",
    label: "Espacio para fotos y archivos",
    format: storage,
  },
  {
    key: "leads.export",
    label: "Descarga de contactos en CSV",
    format: included,
  },
  {
    key: "leads.webhook",
    label: "Contactos enviados a tu sistema (webhook)",
    format: included,
  },
];

function catalogPath(): string {
  // `next build` and vitest run from apps/website.
  return path.resolve(
    process.cwd(),
    "..",
    "..",
    "Docs",
    "engineering",
    "config",
    "billing-catalog.json",
  );
}

function priceOf(
  item: { prices: CatalogPlan["prices"] },
  interval: "month" | "year",
) {
  return (
    item.prices.find((price) => price.interval === interval)?.amount ?? null
  );
}

function yearlySavings(plan: CatalogPlan): number | null {
  const monthly = priceOf(plan, "month");
  const yearly = priceOf(plan, "year");
  return monthly !== null && yearly !== null && yearly < monthly * 12
    ? monthly * 12 - yearly
    : null;
}

export function loadPricing(): Pricing {
  const catalog: Catalog = JSON.parse(fs.readFileSync(catalogPath(), "utf8"));
  const retired = new Set(catalog.retired ?? []);
  const plans = catalog.plans
    .filter(
      (plan) =>
        !retired.has(plan.code) &&
        (plan.contactOnly || (plan.isPublic && plan.prices.length > 0)),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? "",
      recommended: plan.code === catalog.trial.defaultPlan,
      contactOnly: plan.contactOnly === true,
      monthly: plan.contactOnly ? null : priceOf(plan, "month"),
      yearly: plan.contactOnly ? null : priceOf(plan, "year"),
      yearlySavings: plan.contactOnly ? null : yearlySavings(plan),
      entitlements: plan.entitlements,
    }));
  const trialPlan = plans.find((plan) => plan.recommended);
  if (!trialPlan) {
    throw new Error(
      `billing-catalog.json: el plan de la prueba (${catalog.trial.defaultPlan}) no está en venta.`,
    );
  }
  return {
    approved: catalog.approved === true,
    trialDays: catalog.trial.days,
    trialPlanName: trialPlan.name,
    graceDays: catalog.access.graceDays,
    deleteAfterDays: catalog.access.deleteAfterDays,
    annualMaxFreeMonths: Math.max(
      0,
      ...plans.map((plan) =>
        plan.monthly && plan.yearlySavings
          ? Math.floor(plan.yearlySavings / plan.monthly)
          : 0,
      ),
    ),
    plans,
    extras: (catalog.extras ?? []).map((extra) => ({
      code: extra.code,
      name: extra.name,
      description: extra.description,
      monthly: priceOf(extra, "month"),
      yearly: priceOf(extra, "year"),
    })),
  };
}

/** «1 en Esencial, 3 en Profesional y 5 en Negocio», from the catalog. */
export function organizationsByPlan(pricing: Pricing): string {
  const parts = pricing.plans
    .filter((plan) => !plan.contactOnly)
    .map((plan) => {
      const value = plan.entitlements["organizations.max"];
      return typeof value === "number" ? `${value} en ${plan.name}` : null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 1
    ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`
    : (parts[0] ?? "");
}

/** The lines on a plan card, from its limits. */
export function planHighlights(plan: PricingPlan): string[] {
  const e = plan.entitlements;
  const amount = (
    key: string,
    one: string,
    many: string,
    unlimited: string,
  ) => {
    const value = e[key];
    if (value === null || value === undefined) return unlimited;
    if (typeof value !== "number") return null;
    return `${value.toLocaleString("es-MX")} ${value === 1 ? one : many}`;
  };
  const leads =
    e["leads.webhook"] === true
      ? "Contactos en CSV y por webhook"
      : e["leads.export"] === true
        ? "Descarga de contactos en CSV"
        : null;
  return [
    amount(
      "organizations.max",
      "organización",
      "organizaciones",
      "Organizaciones a la medida",
    ),
    amount(
      "touchpoints.max",
      "QR o etiqueta",
      "QR y etiquetas",
      "QR y etiquetas sin límite",
    ),
    amount(
      "links.max",
      "página de Link",
      "páginas de Link",
      "Páginas de Link sin límite",
    ),
    amount(
      "members.max",
      "persona en tu equipo",
      "personas en tu equipo",
      "Tu equipo completo",
    ),
    amount(
      "qr_designs.max",
      "diseño guardado en Diseño del QR",
      "diseños guardados en Diseño del QR",
      "Diseños sin límite en Diseño del QR",
    ),
    `${storage(e["assets.storage_mb"])} para fotos y archivos`,
    leads,
  ].filter((line): line is string => Boolean(line));
}

/** Production shows /precios/ only once the owner approved the catalog. */
export function pricingPublished(pricing: Pricing = loadPricing()): boolean {
  return pricing.approved || process.env.KARDO_ENV !== "production";
}

export function formatPesos(amount: number): string {
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Where "Empieza" sends a visitor: sign up with the chosen plan. */
export function signUpHref(
  signUpUrl: string,
  plan: string,
  interval: "month" | "year",
): string {
  const url = new URL(signUpUrl);
  url.searchParams.set("plan", plan);
  url.searchParams.set("periodo", interval === "month" ? "mensual" : "anual");
  return url.toString();
}
