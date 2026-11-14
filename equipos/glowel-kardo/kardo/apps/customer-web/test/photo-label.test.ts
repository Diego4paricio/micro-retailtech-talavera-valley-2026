import { describe, expect, it } from "vitest";
import { photoLabel } from "../src/features/experiences/editors/fields.js";

describe("every photo field says whose it is (relevo 37, round 3)", () => {
  it("names the product, keeping its capitals", () => {
    expect(photoLabel("Pan de muerto chico")).toBe(
      "Foto de «Pan de muerto chico»",
    );
    expect(photoLabel(" Concha ", "Subir")).toBe("Subir foto de «Concha»");
    expect(photoLabel("Bolillo", "Añadir")).toBe("Añadir foto de «Bolillo»");
  });

  it("says just «Foto» while the product has no name", () => {
    expect(photoLabel("")).toBe("Foto");
    expect(photoLabel("  ", "Subir")).toBe("Subir foto");
  });
});
