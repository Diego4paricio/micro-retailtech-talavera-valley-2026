import {
  buildCustomHtmlMessages,
  buildCustomHtmlPrompt,
  type ConceptBrief,
  type CustomHtmlPromptInput,
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
    { ref: "0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a", label: "fachada.jpg" },
  ],
  content: {
    title: "Café Central",
    links: [
      { label: "Ver menú", url: "https://cafecentral.example/menu" },
      { label: "Reservar mesa", url: "https://cafecentral.example/reservar" },
    ],
  },
};

// ---------------------------------------------------------------------------
// buildCustomHtmlPrompt("code"): regression fixture captured before this
// session touched custom-html-prompt.ts at all, since only a new function
// (buildCustomHtmlMessages) was added below and the existing one was never
// edited. Any future change that alters this output should fail here first.
// ---------------------------------------------------------------------------

describe("buildCustomHtmlPrompt (regression)", () => {
  it("keeps producing exactly the same 'code' output for a fixed input", () => {
    const prompt = buildCustomHtmlPrompt({ ...linksInput, output: "code" });
    expect(prompt).toMatchSnapshot();
  });

  it("keeps producing exactly the same 'json' output for a fixed input", () => {
    const prompt = buildCustomHtmlPrompt(linksInput);
    expect(prompt).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// buildCustomHtmlMessages: prompt injection hardening (Kardo-AI path only)
// ---------------------------------------------------------------------------

describe("buildCustomHtmlMessages", () => {
  it("never puts the business name, brief or content in the system prompt", () => {
    const { system } = buildCustomHtmlMessages(linksInput);
    expect(system).not.toContain("Café Central");
    expect(system).not.toContain("Cafetería de especialidad");
    expect(system).not.toContain("cálido, artesanal");
    expect(system).not.toContain("fachada.jpg");
    expect(system).not.toContain("Ver menú");
  });

  it("is identical across two businesses of the same type (cacheable)", () => {
    const otherBusiness: CustomHtmlPromptInput = {
      ...linksInput,
      businessName: "Otro Negocio",
      brief: { ...brief, description: "Otra descripción totalmente distinta." },
      images: [],
      content: { title: "Otro", links: [] },
    };
    expect(buildCustomHtmlMessages(linksInput).system).toBe(
      buildCustomHtmlMessages(otherBusiness).system,
    );
  });

  it("differs between Experience types", () => {
    const profileInput: CustomHtmlPromptInput = {
      ...linksInput,
      type: "profile",
      content: { displayName: "Café Central", links: [] },
    };
    expect(buildCustomHtmlMessages(linksInput).system).not.toBe(
      buildCustomHtmlMessages(profileInput).system,
    );
  });

  it("carries the business name, brief, content and images inside the delimited user message", () => {
    const { user } = buildCustomHtmlMessages(linksInput);
    expect(user).toContain("<DATOS_DEL_NEGOCIO>");
    expect(user).toContain("</DATOS_DEL_NEGOCIO>");
    expect(user).toContain("Café Central");
    expect(user).toContain("Cafetería de especialidad con panadería propia.");
    expect(user).toContain("fachada.jpg");
    expect(user).toContain("kardo-asset:0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a");
  });

  it("tells the model the delimited data is never an instruction", () => {
    const { system } = buildCustomHtmlMessages(linksInput);
    expect(system).toContain("DATOS_DEL_NEGOCIO");
    expect(system).toMatch(/nunca (como|una instrucción)/);
    expect(system).toContain("ignora esa parte");
  });

  it("still requires the JSON contract and the allowlist, same as buildCustomHtmlPrompt", () => {
    const { system } = buildCustomHtmlMessages(linksInput);
    expect(system).toContain('"html"');
    expect(system).toContain('"css"');
    expect(system).toContain('"notes"');
    expect(system).toContain("<kardo-links></kardo-links>");
  });

  it("never contains an em dash or en dash in either message", () => {
    const { system, user } = buildCustomHtmlMessages(linksInput);
    expect(system).not.toMatch(/[–—]/);
    expect(user).not.toMatch(/[–—]/);
  });
});
