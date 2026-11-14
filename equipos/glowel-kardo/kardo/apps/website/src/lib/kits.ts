import fs from "node:fs";
import path from "node:path";
import { pieceById } from "@/content/pieces";
import { loadPricing } from "./pricing";

// The kits are built from Docs/engineering/config/kits-catalog.json, approved
// by the owner (ADR 025), so the site never shows a kit price by hand. The
// panel plan each kit includes must exist in billing-catalog.json.

type CatalogKit = {
  code: string;
  name: string;
  price: number;
  panelPlan: string;
  items: { piece: string; quantity: number }[];
};

type Catalog = {
  approved: boolean;
  currency: string;
  taxIncluded: boolean;
  panelDays: number;
  shipping: string;
  kits: CatalogKit[];
};

export type KitItem = { piece: string; quantity: number; label: string };

export type Kit = {
  code: string;
  name: string;
  /** Pesos with IVA. */
  price: number;
  panelDays: number;
  panelPlanName: string;
  items: KitItem[];
  /** First WhatsApp message, already written. */
  message: string;
};

export type Kits = {
  approved: boolean;
  shipping: string;
  panelDays: number;
  kits: Kit[];
};

function catalogPath(): string {
  // `next build` and vitest run from apps/website.
  return path.resolve(
    process.cwd(),
    "..",
    "..",
    "Docs",
    "engineering",
    "config",
    "kits-catalog.json",
  );
}

export function kitMessage(name: string): string {
  return `Hola, me interesa el ${name} para mi negocio`;
}

export function loadKits(catalog?: Catalog): Kits {
  const data: Catalog =
    catalog ?? JSON.parse(fs.readFileSync(catalogPath(), "utf8"));
  const plans = new Map(
    loadPricing().plans.map((plan) => [plan.code, plan.name]),
  );
  const kits = data.kits.map((kit) => {
    const panelPlanName = plans.get(kit.panelPlan);
    if (!panelPlanName)
      throw new Error(`Kit ${kit.code}: plan ${kit.panelPlan} not in catalog`);
    const items = kit.items.map(({ piece, quantity }) => {
      const found = pieceById(piece);
      if (!found) throw new Error(`Kit ${kit.code}: unknown piece ${piece}`);
      return {
        piece,
        quantity,
        label: quantity === 1 ? found.name : found.plural,
      };
    });
    return {
      code: kit.code,
      name: kit.name,
      price: kit.price,
      panelDays: data.panelDays,
      panelPlanName,
      items,
      message: kitMessage(kit.name),
    };
  });
  return {
    approved: data.approved,
    shipping: data.shipping,
    panelDays: data.panelDays,
    kits,
  };
}

/** The lowest monthly price of a public plan, for "solo el panel". */
export function lowestMonthlyPrice(): number | null {
  const prices = loadPricing()
    .plans.filter((plan) => !plan.contactOnly && plan.monthly !== null)
    .map((plan) => plan.monthly as number);
  return prices.length ? Math.min(...prices) : null;
}
