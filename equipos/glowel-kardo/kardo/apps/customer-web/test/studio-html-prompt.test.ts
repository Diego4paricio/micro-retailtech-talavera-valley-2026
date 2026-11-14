import {
  buildCustomHtmlPrompt,
  type ConceptBrief,
  type ExperienceContent,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  aiServiceUrl,
  customHtmlPrompt,
  imageLabel,
  maxPrefillUrlLength,
  promptInputFrom,
} from "../src/features/studio/html/prompt.js";

const logo = "0b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";
const photo = "0b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a02";

const brief: ConceptBrief = {
  description: "  Una página cálida con el menú del día arriba.  ",
  tone: " elegante, cálido ",
  colors: ["#5b6b3a", "#f6f1e7"],
  imageRefs: [logo, photo],
  fonts: ["playfair", "dm-sans"],
};

const assets = [
  { id: logo, filename: "logo_cafe-nube.png" },
  { id: photo, filename: "terraza.webp" },
];

describe("promptInputFrom", () => {
  it("assembles a linkpage: name, bio as headline, links and socials", () => {
    const content = {
      displayName: " Café Nube ",
      bio: "Café de especialidad.",
      socials: [
        { id: "s1", network: "instagram", value: "https://instagram.com/x" },
      ],
      links: [
        { id: "l1", label: " Menú ", url: " https://cafe.example/menu " },
        { id: "l2", label: "", url: "https://cafe.example/vacio" },
      ],
    } as unknown as ExperienceContent;
    const input = promptInputFrom({
      type: "linkpage",
      businessName: "Café Nube SA",
      brief,
      content,
      assets,
    });
    expect(input.type).toBe("linkpage");
    expect(input.businessName).toBe("Café Nube SA");
    expect(input.content).toEqual({
      displayName: "Café Nube",
      headline: "Café de especialidad.",
      links: [{ label: "Menú", url: "https://cafe.example/menu" }],
      socials: [{ network: "instagram" }],
    });
    expect(input.brief.description).toBe(
      "Una página cálida con el menú del día arriba.",
    );
    expect(input.brief.tone).toBe("elegante, cálido");
    expect(input.images).toEqual([
      { ref: logo, label: "logo cafe nube" },
      { ref: photo, label: "terraza" },
    ]);
  });

  it("uses the title and description of a links page, without socials", () => {
    const input = promptInputFrom({
      type: "links",
      businessName: "",
      brief: { ...brief, imageRefs: [] },
      content: {
        title: "Terraza",
        description: "Todo a un toque",
        links: [{ id: "a", label: "Reservar", url: "https://x.example" }],
      } as ExperienceContent,
      assets,
    });
    expect(input.businessName).toBe("Terraza");
    expect(input.content).toEqual({
      title: "Terraza",
      headline: "Todo a un toque",
      links: [{ label: "Reservar", url: "https://x.example" }],
    });
    expect(input.images).toEqual([]);
  });

  it("labels an image that is not in the library", () => {
    expect(imageLabel(undefined)).toBe("Imagen de tu marca");
    expect(imageLabel({ filename: "foto-1.JPEG" })).toBe("foto 1");
  });
});

describe("the prompt for the customer's own AI", () => {
  const input = promptInputFrom({
    type: "linkpage",
    businessName: "Café Nube",
    brief,
    content: {
      displayName: "Café Nube",
      socials: [],
      links: [{ id: "l1", label: "Menú", url: "https://cafe.example/menu" }],
    } as unknown as ExperienceContent,
    assets,
  });
  const prompt = customHtmlPrompt(input);

  it("is the contract's builder asking for one code block", () => {
    expect(prompt).toBe(buildCustomHtmlPrompt({ ...input, output: "code" }));
    expect(prompt).not.toBe(buildCustomHtmlPrompt(input));
    expect(prompt).toMatch(/un solo bloque de código HTML/);
  });

  it("carries the concept, the content and the chosen images", () => {
    expect(prompt).toContain("Una página cálida con el menú del día arriba.");
    expect(prompt).toContain("#5b6b3a");
    expect(prompt).toContain("Café Nube");
    expect(prompt).toContain(`kardo-asset:${logo}`);
    expect(prompt).toContain("<kardo-links></kardo-links>");
  });
});

describe("aiServiceUrl", () => {
  it("prefills ChatGPT and Claude with a short prompt", () => {
    expect(aiServiceUrl("chatgpt", "Hola mundo")).toEqual({
      url: "https://chatgpt.com/?q=Hola%20mundo",
      prefilled: true,
    });
    expect(aiServiceUrl("claude", "Hola")).toEqual({
      url: "https://claude.ai/new?q=Hola",
      prefilled: true,
    });
  });

  it("never prefills Gemini", () => {
    expect(aiServiceUrl("gemini", "Hola")).toEqual({
      url: "https://gemini.google.com/app",
      prefilled: false,
    });
  });

  it("opens the home page when the link would be too long", () => {
    const long = "á".repeat(2_000); // 6 encoded characters each
    const result = aiServiceUrl("chatgpt", long);
    expect(result).toEqual({ url: "https://chatgpt.com/", prefilled: false });
  });

  it("measures the encoded link, right at the limit", () => {
    const base = "https://claude.ai/new?q=".length;
    const fits = "a".repeat(maxPrefillUrlLength - base);
    expect(aiServiceUrl("claude", fits).prefilled).toBe(true);
    expect(aiServiceUrl("claude", `${fits}a`).prefilled).toBe(false);
  });
});
