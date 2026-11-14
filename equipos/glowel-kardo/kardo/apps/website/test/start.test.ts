import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withPricing } from "@/components/Header";
import {
  closingLead,
  lowestKitPrice,
  startFaqs,
} from "@/components/pricing/start-copy";
import { navigation } from "@/content/landing";
import { loadKits } from "@/lib/kits";
import { loadPricing } from "@/lib/pricing";
import { panel, shortcuts } from "@/lib/site";
import {
  panelActivationPath,
  redirectsFile,
  siteRedirects,
} from "../config/redirects.mjs";

// The two ways in (panel alone with the trial, or a kit) and the short
// addresses that send to the panel. Every number comes from the catalogs.

const root = path.resolve(import.meta.dirname, "..");

describe("two ways in", () => {
  const pricing = loadPricing();
  const kits = loadKits();

  it("quotes the trial and the kit days from the catalogs", () => {
    expect(closingLead(pricing, kits)).toBe(
      `Prueba el panel ${pricing.trialDays} días sin tarjeta, o empieza con un kit que ya trae ${kits.panelDays} días.`,
    );
    const [start, plan] = startFaqs(pricing, kits);
    expect(start?.a).toContain(`${pricing.trialDays} días gratis`);
    expect(start?.a).toContain(`${kits.panelDays} días del panel`);
    expect(plan?.q).toBe("¿Qué plan me conviene?");
    expect(plan?.a).toContain(`Tu prueba usa ${pricing.trialPlanName}`);
  });

  it("starts the kits at the cheapest kit of the catalog", () => {
    expect(lowestKitPrice(kits)).toBe(
      Math.min(...kits.kits.map((kit) => kit.price)),
    );
  });

  it("writes no trial length by hand outside the catalog", () => {
    const landing = fs.readFileSync(
      path.join(root, "src/content/landing.ts"),
      "utf8",
    );
    expect(landing).not.toMatch(/\b15 d[ií]as\b/);
  });

  it("puts Precios right before Preguntas in the menu", () => {
    expect(withPricing(navigation, true).map((link) => link.label)).toEqual([
      "Plataforma",
      "Piezas",
      "Personalizar",
      "Precios",
      "Preguntas",
    ]);
    expect(withPricing(navigation, false)).toEqual(navigation);
  });
});

describe("short addresses", () => {
  it("send to the panel or to a section, never anywhere else", () => {
    const app = "https://app.kardo.example";
    const table = siteRedirects(app);
    expect(table.map((item) => item.slug)).toEqual([
      "registro",
      "entrar",
      "activar",
      "planes",
      "kits",
    ]);
    for (const item of table)
      expect(item.to.startsWith(app) || item.to.startsWith("/")).toBe(true);
    expect(table.find((item) => item.slug === "activar")?.to).toBe(
      `${app}${panelActivationPath}`,
    );
  });

  it("keep the query only where the panel reads it", () => {
    const keep = siteRedirects("https://app.kardo.example")
      .filter((item) => item.keepQuery)
      .map((item) => item.slug);
    expect(keep).toEqual(["registro", "activar"]);
  });

  it("write a forced 302 for Netlify, with and without the slash", () => {
    const file = redirectsFile("https://app.kardo.example");
    expect(file).toContain("/activar  https://app.kardo.example/activar  302!");
    expect(file).toContain(
      "/activar/  https://app.kardo.example/activar  302!",
    );
    expect(file.trim().split("\n")).toHaveLength(10);
  });

  it("match the panel links the pages use", () => {
    expect(shortcuts.find((item) => item.slug === "registro")?.to).toBe(
      panel.signUp,
    );
    expect(shortcuts.find((item) => item.slug === "activar")?.to).toBe(
      panel.activate,
    );
  });
});
