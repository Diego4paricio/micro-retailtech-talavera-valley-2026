import { helpSections } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { helpGuides } from "../src/features/help/guides.js";
import { helpSectionForRoute } from "../src/features/help/sections.js";
import { settingsSections } from "../src/lib/router.js";

describe("helpSectionForRoute", () => {
  it("gives every Configuración sub-section its own guide", () => {
    const expected = {
      cuenta: "account",
      preferencias: "account",
      seguridad: "security",
      datos: "account",
      organizacion: "settings",
      marca: "brand",
      equipo: "team",
      plan: "plan",
    } as const;
    for (const section of settingsSections) {
      expect(helpSectionForRoute({ name: "settings", section })).toBe(
        expected[section],
      );
    }
    expect(helpSectionForRoute({ name: "settings" })).toBe("account");
  });

  it("maps Equipo (the organization route) to the team guide", () => {
    expect(helpSectionForRoute({ name: "organization" })).toBe("team");
  });

  it("sends the page Studio to Páginas and creating a business to Configuración (A2-21)", () => {
    expect(helpSectionForRoute({ name: "experience-studio", id: "x" })).toBe(
      "experiences",
    );
    expect(helpSectionForRoute({ name: "link", id: "x" })).toBe("links");
    expect(helpSectionForRoute({ name: "create-business" })).toBe("settings");
  });

  it("calls the Configuración tab «General», as the screen does (A2-19)", () => {
    expect(helpGuides.settings.title).toBe("General");
  });

  it("has a complete guide for every section", () => {
    for (const section of helpSections) {
      const guide = helpGuides[section];
      expect(guide.section).toBe(section);
      expect(guide.tasks.length).toBeGreaterThan(0);
      expect(guide.concepts.length).toBeGreaterThan(0);
    }
  });
});
