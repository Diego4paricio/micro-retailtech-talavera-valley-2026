import { type Kits, lowestMonthlyPrice } from "@/lib/kits";
import { formatPesos, type Pricing } from "@/lib/pricing";

// The lines about the trial, the plans and the kits that the home page shows
// outside /precios/. Every number comes from billing-catalog.json and
// kits-catalog.json, so nothing here is written by hand.

/** The cheapest kit, for "Kits desde". */
export function lowestKitPrice(kits: Kits): number | null {
  const prices = kits.kits.map((kit) => kit.price);
  return prices.length ? Math.min(...prices) : null;
}

/** Under the hero's buttons: the two ways in, in one line. */
export function heroOffer(pricing: Pricing, kits: Kits): string {
  const kitFrom = lowestKitPrice(kits);
  return kitFrom === null
    ? `Prueba el panel ${pricing.trialDays} días sin tarjeta.`
    : `Prueba el panel ${pricing.trialDays} días sin tarjeta, o empieza con un kit desde ${formatPesos(kitFrom)}.`;
}

/** Under the closing title: the two ways in, with the catalog's numbers. */
export function closingLead(pricing: Pricing, kits: Kits): string {
  return `Prueba el panel ${pricing.trialDays} días sin tarjeta, o empieza con un kit que ya trae ${kits.panelDays} días.`;
}

/** Questions of the home page that talk about the trial and the plans. */
export function startFaqs(
  pricing: Pricing,
  kits: Kits,
): { q: string; a: string }[] {
  const byName = (code: string) =>
    pricing.plans.find((plan) => plan.code === code);
  const esencial = byName("esencial");
  const profesional = byName("profesional");
  const negocio = byName("negocio");
  const organizations = (code: string) => {
    const value = byName(code)?.entitlements["organizations.max"];
    return typeof value === "number" ? value : null;
  };
  const touchpoints = (code: string) => {
    const value = byName(code)?.entitlements["touchpoints.max"];
    return typeof value === "number" ? value : null;
  };
  const from = lowestMonthlyPrice();
  const questions = [
    {
      q: "¿Cómo empiezo a usar Kardo?",
      a: `De dos formas. Creas tu cuenta y pruebas el panel ${pricing.trialDays} días gratis, sin tarjeta, con los QR que imprimas desde el panel o los NFC que ya tengas. O pides un kit por WhatsApp: tus piezas llegan impresas con tu marca y con ${kits.panelDays} días del panel.`,
    },
  ];
  if (esencial && profesional && negocio) {
    questions.push({
      q: "¿Qué plan me conviene?",
      a: `${esencial.name} si tienes un negocio y hasta ${touchpoints("esencial")} QR y etiquetas. ${profesional.name} si tienes equipo o hasta ${organizations("profesional")} organizaciones. ${negocio.name} si tienes varias sucursales o mucho volumen. Tu prueba usa ${pricing.trialPlanName} y puedes cambiar de plan cuando quieras${from === null ? "" : `; el más chico cuesta ${formatPesos(from)} al mes con IVA`}.`,
    });
  }
  return questions;
}
