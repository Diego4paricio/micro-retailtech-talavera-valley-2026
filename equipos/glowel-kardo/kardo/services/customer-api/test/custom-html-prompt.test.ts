import {
  buildCustomHtmlPrompt,
  type ConceptBrief,
  type CustomHtmlPromptInput,
  customCssForbidden,
  customHtmlAllowedTags,
  customHtmlFontFamilies,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";

const brief: ConceptBrief = {
  description: "Cafetería de especialidad con panadería propia.",
  tone: "cálido, artesanal",
  colors: ["#5b3a29", "#f2e5d5"],
  imageRefs: ["0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a"],
  fonts: ["geist", "serif"],
};

const linksInput: CustomHtmlPromptInput = {
  type: "links",
  businessName: "Café Central",
  brief,
  images: [
    {
      ref: "0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a",
      label: "fachada.jpg",
    },
  ],
  content: {
    title: "Café Central",
    links: [
      { label: "Ver menú", url: "https://cafecentral.example/menu" },
      { label: "Reservar mesa", url: "https://cafecentral.example/reservar" },
    ],
  },
};

describe("buildCustomHtmlPrompt", () => {
  it("is deterministic for the same input", () => {
    const first = buildCustomHtmlPrompt(linksInput);
    const second = buildCustomHtmlPrompt(
      JSON.parse(JSON.stringify(linksInput)),
    );
    expect(first).toBe(second);
  });

  it("never contains an em dash or en dash", () => {
    const prompt = buildCustomHtmlPrompt(linksInput);
    expect(prompt).not.toMatch(/[–—]/);
  });

  it("names the business, the brief and the JSON response contract", () => {
    const prompt = buildCustomHtmlPrompt(linksInput);
    expect(prompt).toContain("Café Central");
    expect(prompt).toContain("Cafetería de especialidad con panadería propia.");
    expect(prompt).toContain('"html"');
    expect(prompt).toContain('"css"');
    expect(prompt).toContain('"notes"');
  });

  it("lists the chosen images with their kardo-asset token and forbids external images when there are none", () => {
    const withImages = buildCustomHtmlPrompt(linksInput);
    expect(withImages).toContain(
      'fachada.jpg" -> kardo-asset:0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a',
    );

    const withoutImages = buildCustomHtmlPrompt({ ...linksInput, images: [] });
    expect(withoutImages).toContain("Todavía no hay imágenes de marca");
    expect(withoutImages).not.toContain("-> kardo-asset:");
    expect(withoutImages).not.toContain("fachada.jpg");
    // Missing photos come back as numbered placeholders to connect later.
    for (const prompt of [withImages, withoutImages]) {
      expect(prompt).toContain('src="imagen-1.jpg"');
      expect(prompt).toContain("no la busques en internet");
    }
  });

  it("always requires the kardo-links widget and never asks for hand-written duplicate buttons", () => {
    const prompt = buildCustomHtmlPrompt(linksInput);
    expect(prompt).toContain("<kardo-links></kardo-links>");
    expect(prompt).toContain(".k-links");
    expect(prompt).toContain(".k-link");
    // The real destinations are never leaked into the prompt: the widget
    // injects them, so only the button labels are listed for context.
    expect(prompt).not.toContain("cafecentral.example");
  });

  it("only offers kardo-socials and kardo-profile for a linkpage", () => {
    const linksPrompt = buildCustomHtmlPrompt(linksInput);
    expect(linksPrompt).not.toContain("<kardo-socials>");
    expect(linksPrompt).not.toContain("<kardo-profile>");

    const linkPageInput: CustomHtmlPromptInput = {
      type: "linkpage",
      businessName: "Café Central",
      brief,
      images: [],
      content: {
        displayName: "Café Central",
        headline: "Tueste propio desde 1998",
        links: [{ label: "Ver menú", url: "https://cafecentral.example/menu" }],
        socials: [{ network: "instagram" }, { network: "whatsapp" }],
      },
    };
    const linkPagePrompt = buildCustomHtmlPrompt(linkPageInput);
    expect(linkPagePrompt).toContain("<kardo-socials></kardo-socials>");
    expect(linkPagePrompt).toContain("<kardo-profile></kardo-profile>");
    expect(linkPagePrompt).toContain(".k-socials");
    expect(linkPagePrompt).toContain(".k-profile");
    expect(linkPagePrompt).toContain("instagram, whatsapp");
  });

  it("generates the allowed-tag and forbidden-CSS lists from the contract constants", () => {
    const prompt = buildCustomHtmlPrompt(linksInput);
    for (const tag of customHtmlAllowedTags) {
      expect(prompt).toContain(tag);
    }
    for (const forbidden of customCssForbidden) {
      expect(prompt).toContain(forbidden);
    }
    for (const family of Object.values(customHtmlFontFamilies)) {
      expect(prompt).toContain(family);
    }
  });

  it("states the mobile-first, no-script and https-only rules", () => {
    const prompt = buildCustomHtmlPrompt(linksInput);
    expect(prompt).toContain("360 a 430 píxeles");
    expect(prompt).toContain("960 píxeles");
    expect(prompt).toContain("No uses JavaScript");
    expect(prompt).toContain("https://, mailto: o tel:");
  });

  it("asks for one copyable HTML code block when the customer takes it to another AI", () => {
    const prompt = buildCustomHtmlPrompt({ ...linksInput, output: "code" });
    expect(prompt).toContain("un solo bloque de código HTML");
    expect(prompt).toContain("Empieza con una etiqueta <style>");
    expect(prompt).not.toContain('"notes"');
    expect(prompt).not.toContain("objeto JSON");
    expect(prompt).not.toMatch(/[–—]/);
    // Brand images attached in that chat are a reference, never the source.
    expect(prompt).toContain("te adjunto imágenes");
    expect(prompt).toContain(
      "kardo-asset:0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a",
    );
    const noImages = buildCustomHtmlPrompt({
      ...linksInput,
      images: [],
      output: "code",
    });
    expect(noImages).toContain("ponle un marcador");
  });

  it("keeps the JSON contract for Kardo's own AI by default", () => {
    expect(buildCustomHtmlPrompt(linksInput)).toBe(
      buildCustomHtmlPrompt({ ...linksInput, output: "json" }),
    );
    expect(buildCustomHtmlPrompt(linksInput)).not.toContain(
      "te adjunto imágenes",
    );
  });
});
