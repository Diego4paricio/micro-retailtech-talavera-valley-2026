import type { ExperienceSummary } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { latestExperience } from "../src/features/experiences/quick-qr.js";
import {
  suggestedDestinationNameChips,
  suggestedQrName,
} from "../src/features/touchpoints/naming.js";

const experience = (
  id: string,
  patch: Partial<ExperienceSummary> = {},
): ExperienceSummary => ({
  id,
  touchpointId: null,
  name: id,
  type: "menu",
  content: {},
  publicationStatus: "draft",
  ...patch,
});

describe("suggestedQrName (relevo 31, finding 1; relevo 37, C9b)", () => {
  it("names the first QR after where it will be stuck", () => {
    // Without a giro, "menu" alone no longer assumes a sit-down restaurant
    // (relevo 37, C9b): a food truck or a tianguis stall has no giro of
    // its own, so the neutral "Mi QR" leads instead of "Mesas".
    expect(suggestedQrName("menu")).toBe("Mi QR");
    expect(suggestedQrName("catalog")).toBe("Mostrador");
    expect(suggestedQrName("form")).toBe("Tarjetas");
    expect(suggestedQrName("links")).toBe("Mi QR");
  });

  it("follows the giro when Kardo knows it", () => {
    expect(suggestedQrName("catalog", "belleza")).toBe("Espejo");
    expect(suggestedQrName("catalog", "servicios")).toBe("Tarjetas");
    expect(suggestedQrName("menu", "restaurante")).toBe("Mesas");
    expect(suggestedQrName("catalog", "floreria")).toBe("Mostrador");
    expect(suggestedQrName("catalog", "panaderia")).toBe("Mostrador");
    expect(suggestedQrName("form", "agencia")).toBe("Tarjetas");
    expect(suggestedQrName("catalog", "papeleria")).toBe("Mostrador");
  });

  it("never suggests «Mesas» for a food truck or a tianguis stall", () => {
    // No giro fits either (relevo 37, C9b — Paty, Chema): the business's
    // own name is the only confident signal.
    expect(suggestedQrName("menu", null, "Food Truck La Güera Paty")).toBe(
      "Camión",
    );
    expect(suggestedQrName("menu", null, "El Camión de Lalo")).toBe("Camión");
    expect(suggestedQrName("menu", "otro", "Tacos Don Chema (tianguis)")).toBe(
      "Puesto",
    );
    expect(suggestedQrName("menu", "restaurante", "Food Truck")).not.toBe(
      "Mesas",
    );
  });
});

describe("suggestedDestinationNameChips (relevo 37, C9b)", () => {
  it("offers choices before a free name, the confident guess first", () => {
    const chips = suggestedDestinationNameChips("qr", "menu", "restaurante");
    expect(chips[0]).toBe("Mesas");
    expect(chips.length).toBeGreaterThan(1);
  });

  it("stays neutral, with several options, when the giro is not confident", () => {
    const chips = suggestedDestinationNameChips("qr", "menu", null);
    expect(chips[0]).toBe("Mi QR");
    expect(chips).toContain("Camión");
    expect(chips).toContain("Puesto");
    expect(chips).not.toContain("Mesas");
  });

  it("an NFC tag keeps its own names regardless of giro", () => {
    expect(suggestedDestinationNameChips("nfc", "menu", "restaurante")).toEqual(
      expect.arrayContaining(["Tarjeta de presentación"]),
    );
  });
});

describe("latestExperience", () => {
  it("picks the Experience edited last, archived ones aside", () => {
    const items = [
      experience("vieja", { updatedAt: "2026-10-01T10:00:00Z" }),
      experience("archivada", {
        archivedAt: "2026-10-02T00:00:00Z",
        updatedAt: "2026-10-03T09:00:00Z",
      }),
      experience("menu", { updatedAt: "2026-10-02T12:00:00Z" }),
    ];
    expect(latestExperience(items)?.id).toBe("menu");
  });

  it("offers a Página de enlaces too, a normal type since Links phase 1", () => {
    const items = [
      experience("menu", { updatedAt: "2026-10-02T12:00:00Z" }),
      experience("enlaces", {
        type: "linkpage",
        updatedAt: "2026-10-03T10:00:00Z",
      }),
    ];
    expect(latestExperience(items)?.id).toBe("enlaces");
  });

  it("is null without candidates", () => {
    expect(latestExperience([])).toBeNull();
  });
});

describe("QR names in round 3 (relevo 37)", () => {
  it("a café or a bar with a menu gets «Mesas»", () => {
    expect(suggestedQrName("menu", "cafeteria")).toBe("Mesas");
    expect(suggestedQrName("menu", "bar")).toBe("Mesas");
    expect(suggestedQrName("menu", "cafeteria", "Food Truck La Güera")).toBe(
      "Camión",
    );
  });

  it("never offers a name the business already uses; the page's name takes its place", () => {
    const chips = suggestedDestinationNameChips(
      "qr",
      "menu",
      "cafeteria",
      "Café Grano Fino",
      ["Mesas"],
      "Bebidas de otoño",
    );
    expect(chips).not.toContain("Mesas");
    expect(chips[0]).toBe("Bebidas de otoño");
  });

  it("a copy's name is offered without «(copia)» (round 4, Ana)", () => {
    const chips = suggestedDestinationNameChips(
      "qr",
      "catalog",
      null,
      "Salón de Fiestas Los Arcos",
      ["Mostrador"],
      "Nuestros Paquetes (copia)",
    );
    expect(chips[0]).toBe("Nuestros Paquetes");
  });
});
