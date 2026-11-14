import type { BillingExtra, BillingMyAccount } from "@kardo/contracts";
import { extraPriceText } from "./extras-model.js";

/**
 * What to offer when a write hits a plan limit (A2-60): QR y etiquetas and
 * Links have an extra that fits; the other limits only move up a plan. Pure:
 * the dialog and the tests share it.
 */

const extraByLimit: Record<string, BillingExtra["code"]> = {
  "touchpoints.max": "touchpoints",
  "links.max": "links",
};

const limitWords: Record<string, string> = {
  "touchpoints.max": "QR y etiquetas",
  "links.max": "links",
};

export type LimitOffer = {
  title: string;
  /** «Agregar 10 QR y etiquetas más ($49 al mes · $490 al año)». */
  extraLabel: string;
  extra: BillingExtra;
};

/**
 * The offer for a limit key, or null when no extra fits: the key has none,
 * the account has no paid plan, or the catalog did not come.
 */
export function limitOffer(
  key: string,
  account: BillingMyAccount | null,
): LimitOffer | null {
  const code = extraByLimit[key];
  const words = limitWords[key];
  if (!code || !words || !account?.canAddExtras) return null;
  const extra = account.extras.find((item) => item.code === code);
  if (!extra) return null;
  const price = extraPriceText(extra, null);
  return {
    title: `Llegaste al límite de ${words} de tu plan`,
    extraLabel: `Agregar ${extra.unitsPerQuantity} ${words} más${price ? ` (${price})` : ""}`,
    extra,
  };
}
