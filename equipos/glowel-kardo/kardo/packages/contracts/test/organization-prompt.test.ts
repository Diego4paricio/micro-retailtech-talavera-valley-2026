import {
  buildCustomHtmlMessages,
  buildDesignMessages,
  buildHtmlBlockMessages,
  giroForIndustry,
  industries,
  kardoDesignGuide,
  organizationPromptSection,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";

const brief = {
  description: "tengo una floreria y quiero que me pidan por whatsapp",
  colors: [],
  imageRefs: [],
  fonts: [],
};

const organization = {
  industry: "cafeteria",
  city: "Guadalajara",
  about: "Cafetería de barrio con pan dulce hecho aquí.",
  brand: { primary: "#4a2c21", accent: "#d98e4a" },
  logoRef: "11111111-1111-4111-8111-111111111111",
  coverRef: "22222222-2222-4222-8222-222222222222",
};

function design(org?: typeof organization | { industry: string }) {
  return buildDesignMessages({
    type: "links",
    businessName: "Café Central",
    brief,
    images: [],
    content: { title: "Café Central", links: [{ label: "Ver menú" }] },
    contentItemIds: [],
    ...(org ? { organization: org } : {}),
  });
}

describe("organizationPromptSection", () => {
  it("states every profile field and the giro's recipe", () => {
    const section = organizationPromptSection(organization);
    expect(section).toContain("Giro: cafetería");
    expect(section).toContain("Ciudad: Guadalajara");
    expect(section).toContain(organization.about);
    expect(section).toContain("#4a2c21");
    expect(section).toContain(organization.logoRef);
    expect(section).toContain(organization.coverRef);
    expect(section).toContain("Receta para este giro (café)");
  });

  it("falls back to the whole recipe table without a known giro", () => {
    expect(organizationPromptSection({ industry: "otro" })).toContain(
      "Recetas por giro",
    );
    expect(organizationPromptSection({})).toContain("todavía no llena su giro");
  });

  it("can leave the recipe out", () => {
    expect(
      organizationPromptSection(organization, { recipe: false }),
    ).not.toContain("Receta");
  });

  it("never contains an em dash or en dash", () => {
    expect(organizationPromptSection(organization)).not.toMatch(/[–—]/);
  });

  it("hands over the business hours, or says not to invent them (2026-10-03)", () => {
    const withHours = organizationPromptSection({
      ...organization,
      hours: "Lun a sáb, 8:00 a 17:00",
    });
    expect(withHours).toContain('Horario: "Lun a sáb, 8:00 a 17:00"');
    expect(withHours).not.toContain("no ha puesto su horario");
    expect(organizationPromptSection(organization)).toContain(
      "no ha puesto su horario en su perfil: no inventes uno",
    );
    // What the owner writes in the request does count (relevo 37, IA1).
    expect(organizationPromptSection(organization)).toContain(
      "Si el dueño escribe su horario en lo que pide, ese sí úsalo tal cual.",
    );
  });

  it("lets the colors the owner asks for win on this page, never on the logo (IA5)", () => {
    const branded = organizationPromptSection({
      ...organization,
      brand: { primary: "#2b2b2b", accent: "#e46a9a" },
    });
    expect(branded).toContain("en esta página mandan los que pide");
    expect(branded).toContain("el logo nunca se recolorea");
  });

  it("says not to invent a WhatsApp when the business has no phone nor site", () => {
    expect(organizationPromptSection(organization)).toContain(
      "no agregues botones de WhatsApp",
    );
    const withPhone = organizationPromptSection({
      ...organization,
      whatsappUrl: "https://wa.me/523312345678",
    });
    expect(withPhone).toContain("WhatsApp https://wa.me/523312345678");
    expect(withPhone).not.toContain("no agregues botones de WhatsApp");
  });

  it("maps every profile industry but otro to a recipe", () => {
    for (const industry of industries) {
      if (industry === "otro")
        expect(giroForIndustry(industry)).toBeUndefined();
      else expect(giroForIndustry(industry)).toBeDefined();
    }
  });
});

describe("whatsappUrlFromPhone", () => {
  it("adds Mexico's code to a 10 digit number and keeps a full one", () => {
    expect(whatsappUrlFromPhone("55 1234 5678")).toBe(
      "https://wa.me/525512345678",
    );
    expect(whatsappUrlFromPhone("+52 (55) 1234-5678")).toBe(
      "https://wa.me/525512345678",
    );
    expect(whatsappUrlFromPhone("12345")).toBeUndefined();
    expect(whatsappUrlFromPhone(undefined)).toBeUndefined();
  });

  it("offers the contact links only when the profile has them", () => {
    expect(
      organizationPromptSection({
        whatsappUrl: "https://wa.me/525512345678",
      }),
    ).toContain("Contacto del negocio: WhatsApp https://wa.me/525512345678");
    expect(organizationPromptSection(organization)).not.toContain(
      "Contacto del negocio",
    );
  });
});

describe("prompts with the organization", () => {
  it("keeps the system prompt identical for every giro, so it stays cached", () => {
    const cafe = design(organization);
    const bar = design({ industry: "bar" });
    expect(cafe.system).toBe(bar.system);
    expect(cafe.system).not.toContain("Recetas por giro");
    expect(cafe.user).toContain("Perfil de la organización");
    expect(cafe.user).toContain("Receta para este giro (café)");
  });

  it("keeps today's prompt when there is no organization", () => {
    const plain = design();
    expect(plain.system).toContain("Recetas por giro");
    expect(plain.user).not.toContain("Perfil de la organización");
  });

  it("reaches modo HTML and the html block too", () => {
    const html = buildCustomHtmlMessages({
      type: "links",
      businessName: "Café Central",
      brief,
      images: [],
      content: { title: "Café Central", links: [] },
      organization,
    });
    expect(html.user).toContain("Perfil de la organización");
    expect(html.system).not.toContain("Recetas por giro");
    const block = buildHtmlBlockMessages({
      businessName: "Café Central",
      brief,
      images: [],
      organization,
    });
    expect(block.user).toContain("Perfil de la organización");
    expect(block.user).not.toContain("Receta para este giro");
  });

  it("lets an Imagen page use its own image even without brand images", () => {
    const { user } = buildDesignMessages({
      type: "image",
      businessName: "Estudio Noa",
      brief,
      images: [],
      content: { imageAlt: "Manicure" },
      contentItemIds: [],
    });
    expect(user).toContain("imageMain");
    expect(user).not.toMatch(/no uses ningún bloque image, imageMain/);
  });

  it("guide can leave the giro part out", () => {
    const guide = kardoDesignGuide({ omitGiro: true });
    expect(guide).not.toContain("Recetas por giro");
    expect(guide).not.toContain("Receta para este giro");
  });
});
