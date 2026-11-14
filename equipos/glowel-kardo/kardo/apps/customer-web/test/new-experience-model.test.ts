import { describe, expect, it } from "vitest";
import { experienceTypeLabels } from "../src/features/experiences/labels.js";
import {
  canCreateFromStep2,
  creationStepOf,
  creationTypeOrder,
  newExperienceRoute,
  suggestedName,
} from "../src/features/experiences/new-experience-model.js";

describe("creationStepOf: Nueva Experience, two steps", () => {
  it("is step 1 with no type chosen yet", () => {
    expect(creationStepOf(null)).toBe(1);
  });

  it("is step 2 once a type is chosen", () => {
    for (const type of creationTypeOrder) expect(creationStepOf(type)).toBe(2);
  });
});

describe("suggestedName", () => {
  it("fills in the type's label when the name is still empty", () => {
    expect(suggestedName("menu", "")).toBe("Menú");
    expect(suggestedName("menu", "   ")).toBe("Menú");
  });

  it("replaces a previous type's placeholder label", () => {
    expect(suggestedName("document", "Imagen")).toBe("Documento PDF");
  });

  it("never overwrites text the person actually typed", () => {
    expect(suggestedName("menu", "Carta de temporada")).toBe(
      "Carta de temporada",
    );
  });
});

describe("canCreateFromStep2", () => {
  const base = {
    name: "",
    assetId: "",
    alt: "",
    pdfPages: null,
    destinationUrl: "",
  };

  it("always requires the internal name", () => {
    expect(canCreateFromStep2("links", { ...base, name: "" })).toBe(false);
    expect(canCreateFromStep2("links", { ...base, name: "Mi página" })).toBe(
      true,
    );
  });

  it("requires a validated image and its alt text for Imagen", () => {
    expect(canCreateFromStep2("image", { ...base, name: "Foto" })).toBe(false);
    expect(
      canCreateFromStep2("image", { ...base, name: "Foto", assetId: "a1" }),
    ).toBe(false);
    expect(
      canCreateFromStep2("image", {
        ...base,
        name: "Foto",
        assetId: "a1",
        alt: "Fachada del local",
      }),
    ).toBe(true);
  });

  it("requires prepared pages for Documento PDF, but not the PDF itself", () => {
    expect(canCreateFromStep2("document", { ...base, name: "Carta" })).toBe(
      false,
    );
    expect(
      canCreateFromStep2("document", {
        ...base,
        name: "Carta",
        assetId: "pdf-1",
      }),
    ).toBe(false);
    expect(
      canCreateFromStep2("document", {
        ...base,
        name: "Carta",
        assetId: "pdf-1",
        pdfPages: [{ assetId: "page-1", width: 1240, height: 1754 }],
      }),
    ).toBe(true);
    // The Assets Worker may reject the PDF (active content) or it may be over
    // the 5 MB download limit: the viewer only needs the pages either way.
    expect(
      canCreateFromStep2("document", {
        ...base,
        name: "Carta",
        assetId: "",
        pdfPages: [{ assetId: "page-1", width: 1240, height: 1754 }],
      }),
    ).toBe(true);
  });

  it("requires a valid HTTPS URL for Redirección", () => {
    expect(canCreateFromStep2("redirect", { ...base, name: "Sitio" })).toBe(
      false,
    );
    expect(
      canCreateFromStep2("redirect", {
        ...base,
        name: "Sitio",
        destinationUrl: "not a url",
      }),
    ).toBe(false);
    expect(
      canCreateFromStep2("redirect", {
        ...base,
        name: "Sitio",
        destinationUrl: "https://ejemplo.com",
      }),
    ).toBe(true);
  });

  it("needs only the name for every other type", () => {
    for (const type of ["links", "profile", "menu", "catalog", "form"] as const)
      expect(canCreateFromStep2(type, { ...base, name: "Algo" })).toBe(true);
  });
});

describe("newExperienceRoute", () => {
  it("omits the type for step 1", () => {
    expect(newExperienceRoute(null, null, null)).toEqual({
      name: "experience-new",
      touchpointId: null,
    });
  });

  it("carries the type for step 2, with the touchpoint or group kept", () => {
    expect(newExperienceRoute("tp-1", null, "menu")).toEqual({
      name: "experience-new",
      touchpointId: "tp-1",
      type: "menu",
    });
    expect(newExperienceRoute(null, "group-1", "document")).toEqual({
      name: "experience-new",
      touchpointId: null,
      groupId: "group-1",
      type: "document",
    });
  });
});

describe("Documento PDF: one type, one icon and label (ADR 018, addendum 3)", () => {
  it("always shows the Documento PDF label", () => {
    expect(experienceTypeLabels.document).toBe("Documento PDF");
  });
});

describe("a PDF chosen in Archivos (domain audit A2-47)", () => {
  const fields = {
    name: "Carta",
    assetId: "a",
    alt: "",
    pdfPages: null,
    destinationUrl: "",
  };

  it("can create the page without prepared pages: it is offered as a download", () => {
    expect(canCreateFromStep2("document", fields)).toBe(false);
    expect(
      canCreateFromStep2("document", { ...fields, fromLibrary: true }),
    ).toBe(true);
    expect(
      canCreateFromStep2("document", {
        ...fields,
        assetId: "",
        fromLibrary: true,
      }),
    ).toBe(false);
  });

  it("an image from Archivos still needs its alt text", () => {
    expect(canCreateFromStep2("image", fields)).toBe(false);
    expect(canCreateFromStep2("image", { ...fields, alt: "Carta" })).toBe(true);
  });
});
