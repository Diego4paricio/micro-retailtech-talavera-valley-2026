import { kardoDesignGuide } from "@kardo/contracts";
import { describe, expect, it } from "vitest";

describe("kardoDesignGuide", () => {
  it("is deterministic for the same options", () => {
    expect(kardoDesignGuide({ experienceType: "menu" })).toBe(
      kardoDesignGuide({ experienceType: "menu" }),
    );
  });

  it("never contains an em dash or en dash", () => {
    expect(kardoDesignGuide()).not.toMatch(/[–—]/);
    expect(kardoDesignGuide({ detail: "brief" })).not.toMatch(/[–—]/);
    expect(kardoDesignGuide({ giro: "restaurante" })).not.toMatch(/[–—]/);
  });

  it("covers the universal principles every time", () => {
    const guide = kardoDesignGuide();
    expect(guide).toContain("Jerarquía");
    expect(guide).toContain("Espaciado");
    expect(guide).toContain("Contraste y color");
    expect(guide).toContain("Tipografía");
    expect(guide).toContain("Botones");
    expect(guide).toContain("Qué evitar");
  });

  it("brief detail skips the recipes but keeps what to avoid", () => {
    const brief = kardoDesignGuide({ detail: "brief" });
    expect(brief).toContain("Qué evitar");
    expect(brief).not.toContain("Receta para este tipo de página");
    expect(brief).not.toContain("Recetas por giro");
  });

  it("includes the page-type recipe when given one", () => {
    const guide = kardoDesignGuide({ experienceType: "menu" });
    expect(guide).toContain("Receta para este tipo de página");
    expect(guide.toLowerCase()).toContain("menú");
  });

  it("includes only the named giro's recipe when given one", () => {
    const guide = kardoDesignGuide({ giro: "floreria" });
    expect(guide).toContain("Receta para este giro (florería)");
    expect(guide).not.toContain("Recetas por giro (usa la que mejor");
  });

  it("lists every giro when none is named", () => {
    const guide = kardoDesignGuide();
    for (const giro of [
      "tienda",
      "restaurante",
      "café",
      "florería",
      "inmobiliaria",
      "hotel",
      "escuela",
    ]) {
      expect(guide.toLowerCase()).toContain(giro);
    }
  });

  it("only names real webfonts kardo serves", () => {
    const guide = kardoDesignGuide();
    expect(guide).toContain("Geist");
    expect(guide).toContain("DM Sans");
    expect(guide).toContain("Playfair Display");
  });
});
