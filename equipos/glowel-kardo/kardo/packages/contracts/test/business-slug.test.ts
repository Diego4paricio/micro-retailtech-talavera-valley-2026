import {
  businessSlugCandidates,
  businessSlugFormatError,
  businessSlugKey,
  isReservedBusinessSlug,
  linkSlugCandidates,
  slugifyBusinessName,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";

describe("business address (Links redesign, 2026-10-04)", () => {
  it("turns a business name into an address without accents or symbols", () => {
    expect(slugifyBusinessName("Café Nube")).toBe("cafe-nube");
    expect(slugifyBusinessName("  Tacos «Don Beto» & Co. ")).toBe(
      "tacos-don-beto-y-co",
    );
    expect(slugifyBusinessName("Ñandú Niño")).toBe("nandu-nino");
  });

  it("counts cafe-nube and cafenube as the same address", () => {
    expect(businessSlugKey("cafe-nube")).toBe(businessSlugKey("cafenube"));
  });

  it("reserves the website's pages, the product's words and anything kardo", () => {
    for (const slug of ["precios", "terminos", "app", "t", "ayuda"])
      expect(isReservedBusinessSlug(slug)).toBe(true);
    expect(isReservedBusinessSlug("kardo-oficial")).toBe(true);
    expect(isReservedBusinessSlug("kar-do")).toBe(true);
    expect(isReservedBusinessSlug("cafe-nube")).toBe(false);
  });

  it("says in Spanish what is wrong with an address", () => {
    expect(businessSlugFormatError("cafe-nube")).toBeNull();
    expect(businessSlugFormatError("ab")).toContain("de 3 a 30");
    expect(businessSlugFormatError("café")).toContain("sin acentos");
    expect(businessSlugFormatError("-cafe")).not.toBeNull();
    expect(businessSlugFormatError("cafe--nube")).not.toBeNull();
  });

  it("recommends the name, then with the city, then with the giro; never a number", () => {
    const candidates = businessSlugCandidates({
      name: "Nube",
      city: "Coyoacán",
      industry: "cafeteria",
    });
    expect(candidates).toEqual([
      "nube",
      "nube-coyoacan",
      "nube-cafe",
      "cafe-nube",
      "nube-cafe-coyoacan",
    ]);
    for (const slug of candidates) expect(slug).not.toMatch(/\d/);
    // «Café Nube» already says café: only the city tells it apart.
    expect(
      businessSlugCandidates({
        name: "Café Nube",
        city: "Coyoacán",
        industry: "cafeteria",
      }),
    ).toEqual(["cafe-nube", "cafe-nube-coyoacan"]);
  });

  it("does not repeat the giro already in the name and keeps every one within 30", () => {
    const candidates = businessSlugCandidates({
      name: "Restaurante La Esquina del Sabor Tradicional",
      city: "San Pedro Garza García",
      industry: "restaurante",
    });
    expect(candidates.every((slug) => slug.length <= 30)).toBe(true);
    expect(
      candidates.some((slug) => slug.includes("restaurante-restaurante")),
    ).toBe(false);
    expect(candidates[0]).toBe("restaurante-la-esquina-del");
  });

  it("skips reserved addresses and gives nothing for an empty name", () => {
    expect(businessSlugCandidates({ name: "Precios" })).toEqual([]);
    expect(businessSlugCandidates({ name: "Precios", city: "Puebla" })).toEqual(
      ["precios-puebla"],
    );
    expect(businessSlugCandidates({ name: "!!!" })).toEqual([]);
  });
});

describe("link address, kardo.com.mx/<negocio>/<link>", () => {
  it("recommends what the Experience is called, then its type; never adds a number", () => {
    expect(linkSlugCandidates({ name: "Menú Terraza", type: "menu" })).toEqual([
      "menu-terraza",
      "menu",
    ]);
    expect(
      linkSlugCandidates({ name: "Temporada de otoño", type: "catalog" }),
    ).toEqual([
      "temporada",
      "temporada-de-otono",
      "catalogo",
      "catalogo-temporada-de-otono",
    ]);
    // Short and easy to dictate first (the approved prototype): linking
    // words left out, never a number.
    expect(
      linkSlugCandidates({
        name: "Tarjeta de presentación",
        type: "profile",
      })[0],
    ).toBe("tarjeta");
    expect(
      linkSlugCandidates({ name: "Lista de precios", type: "document" })[0],
    ).toBe("lista-precios");
    for (const slug of linkSlugCandidates({ name: "Promo 2x1", type: "pdf" }))
      expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("falls back to the type when the name gives nothing", () => {
    expect(linkSlugCandidates({ name: "¡!", type: "form" })).toEqual([
      "formulario",
    ]);
    expect(linkSlugCandidates({ name: "ok" })).toEqual([]);
  });
});

describe("linkSlugCandidates: a PDF page (relevo 37, C9c)", () => {
  it("offers the type word for the document type", () => {
    const candidates = linkSlugCandidates({ name: "Paquetes", type: "document" });
    expect(candidates[0]).toBe("paquetes");
    expect(candidates.some((slug) => slug.includes("pdf"))).toBe(true);
  });
});
