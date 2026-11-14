import { describe, expect, it } from "vitest";
import { suggestedName } from "../src/features/experiences/new-experience-model.js";
import {
  creationTypesFor,
  defaultPageName,
  pageChoices,
  pageNameFor,
} from "../src/features/experiences/page-types.js";
import { firstStepsPlan } from "../src/features/onboarding/first-steps-model.js";

// The one catalog «Nueva página» and the page step of Primeros pasos share
// (domain audit A2-28).

describe("creationTypesFor: the recommended order per giro", () => {
  it("puts the giro's own page first and still offers every type once", () => {
    const restaurant = creationTypesFor(firstStepsPlan("restaurante"));
    expect(restaurant[0]).toBe("menu");
    const shop = creationTypesFor(firstStepsPlan("retail"));
    expect(shop[0]).toBe("catalog");
    for (const order of [restaurant, shop]) {
      expect(new Set(order).size).toBe(order.length);
      expect(order).toContain("links");
      expect(order).toContain("redirect");
    }
  });

  it("a consultorio starts with the form", () => {
    expect(creationTypesFor(firstStepsPlan("salud"))[0]).toBe("form");
  });

  it("is the same order Primeros pasos shows, then the rest", () => {
    const plan = firstStepsPlan("restaurante");
    const shown = pageChoices(plan).map((choice) => choice.type);
    expect(creationTypesFor(plan).slice(0, shown.length)).toEqual(shown);
  });

  it("without a giro keeps the plain order", () => {
    expect(creationTypesFor(null)).toContain("menu");
  });
});

describe("default names are the same in both places", () => {
  it("gives Primeros pasos' names to «Nueva página» when the giro is known", () => {
    const plan = firstStepsPlan("restaurante");
    expect(defaultPageName("image", plan)).toBe(pageNameFor("image", plan));
    expect(defaultPageName("image", plan)).toBe("Foto del menú");
    expect(defaultPageName("profile", plan)).toBe("Perfil");
  });

  it("falls back to the type's label without one", () => {
    expect(defaultPageName("menu", null)).toBe("Menú");
    expect(defaultPageName("document", null)).toBe("Documento PDF");
  });

  it("suggestedName follows the pick without overwriting the person's own text", () => {
    const plan = firstStepsPlan("restaurante");
    expect(suggestedName("image", "", plan)).toBe("Foto del menú");
    expect(suggestedName("profile", "Foto del menú", plan)).toBe("Perfil");
    expect(suggestedName("menu", "Carta de temporada", plan)).toBe(
      "Carta de temporada",
    );
  });
});
