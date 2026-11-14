import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  ConflictError,
  ContentValidationError,
  UnavailableError,
} from "../src/errors.js";
import {
  createAnthropicHelpAssistant,
  type HelpAssistant,
} from "../src/help/assistant.js";
import { helpSystemPrompt } from "../src/help/knowledge.js";
import type { MemberRepository } from "../src/repositories/members.js";
import {
  assertHandleAllowed,
  type TouchpointRepository,
} from "../src/repositories/touchpoints.js";
import {
  normalizeWorkspaceProfile,
  type WorkspaceProfileRepository,
} from "../src/repositories/workspace-profile.js";
import { HELP_QUESTIONS_PER_HOUR } from "../src/routes/help.js";
import {
  normalizeSocialValue,
  validateExperienceContent,
} from "../src/validation/experience-content.js";
import {
  authHeader,
  subjectId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const assetId = "2b3c4d5e-6f70-4819-9b0c-1d2e3f4a5b6c";

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const theme = {
  background: { kind: "solid" as const, color: "#f3f0e8" },
  surface: "light" as const,
  accent: "#0d637d",
  buttonStyle: "pill" as const,
  font: "sans" as const,
};

describe("link page content", () => {
  const base = {
    displayName: "Café Central",
    socials: [
      {
        id: "ig",
        network: "instagram",
        value: "https://www.instagram.com/cafe",
      },
      { id: "mail", network: "email", value: " Hola@CafeCentral.mx " },
      { id: "tel", network: "phone", value: "+52 (55) 1234-5678" },
    ],
    links: [
      {
        id: "menu",
        label: "Menú",
        url: "https://cafe.example/menu",
        highlight: true,
      },
    ],
  };

  it("normalizes socials per network and keeps highlight", () => {
    const { content } = validateExperienceContent("linkpage", base);
    const page = content as typeof base;
    expect(page.socials.map((social) => social.value)).toEqual([
      "https://www.instagram.com/cafe",
      "hola@cafecentral.mx",
      "+525512345678",
    ]);
    expect(page.links[0]).toMatchObject({ highlight: true });
  });

  it("rejects an icon that points to another domain", () => {
    expect(() =>
      validateExperienceContent("linkpage", {
        ...base,
        socials: [
          {
            id: "ig",
            network: "instagram",
            value: "https://evil.example/login",
          },
        ],
      }),
    ).toThrow(ContentValidationError);
    expect(() =>
      normalizeSocialValue("whatsapp", "https://wa.me/5215512345678"),
    ).not.toThrow();
    expect(() =>
      normalizeSocialValue("website", "javascript:alert(1)"),
    ).toThrow();
    expect(() => normalizeSocialValue("phone", "12")).toThrow();
  });

  it("needs at least one button or social network and unique ids", () => {
    expect(() =>
      validateExperienceContent("linkpage", {
        displayName: "Vacío",
        socials: [],
        links: [],
      }),
    ).toThrow(ContentValidationError);
    expect(() =>
      validateExperienceContent("linkpage", {
        ...base,
        links: [
          ...base.links,
          { id: "menu", label: "Otro", url: "https://x.example" },
        ],
      }),
    ).toThrow(ContentValidationError);
  });

  it("references the avatar as an image asset", () => {
    const { assetReferences } = validateExperienceContent("linkpage", {
      ...base,
      avatarAssetId: assetId,
    });
    expect(assetReferences).toEqual([
      { assetId, purpose: "avatar", expectedMediaType: "image/*" },
    ]);
  });
});

describe("experience themes", () => {
  const menu = {
    title: "Carta",
    currency: "MXN",
    sections: [
      { id: "cafe", name: "Café", items: [{ id: "latte", name: "Latte" }] },
    ],
  };

  it("accepts a valid theme and references an image background", () => {
    const { content, assetReferences } = validateExperienceContent("menu", {
      ...menu,
      theme: {
        ...theme,
        background: {
          kind: "image",
          color: "#08293d",
          imageAssetId: assetId,
          overlay: 40,
        },
      },
    });
    expect((content as { theme?: unknown }).theme).toBeDefined();
    expect(assetReferences).toEqual([
      { assetId, purpose: "background", expectedMediaType: "image/*" },
    ]);
  });

  it("rejects free-form CSS, incomplete gradients and images without asset", () => {
    for (const bad of [
      { ...theme, accent: "red; background:url(https://x)" },
      { ...theme, background: { kind: "gradient", color: "#000000" } },
      { ...theme, background: { kind: "image", color: "#000000" } },
      { ...theme, font: "comic" },
    ]) {
      expect(() =>
        validateExperienceContent("menu", { ...menu, theme: bad }),
      ).toThrow(ContentValidationError);
    }
  });

  it("redirects never carry a theme", () => {
    expect(() =>
      validateExperienceContent("redirect", {
        destinationUrl: "https://example.org",
        theme,
      }),
    ).toThrow(ContentValidationError);
  });
});

describe("handles and workspace profile rules", () => {
  it("reserves product and brand handles", () => {
    expect(() => assertHandleAllowed("admin")).toThrow(ContentValidationError);
    expect(() => assertHandleAllowed("kardo-oficial")).toThrow(
      ContentValidationError,
    );
    expect(() => assertHandleAllowed("cafecentral")).not.toThrow();
  });

  it("tidies the business hours and drops them when blank (2026-10-03)", () => {
    expect(
      normalizeWorkspaceProfile({ hours: "  Lun a sáb,\n 8:00 a 17:00 " }),
    ).toEqual({ hours: "Lun a sáb, 8:00 a 17:00" });
    expect(normalizeWorkspaceProfile({ hours: "   " })).toEqual({});
  });

  it("normalizes the website and rejects bad time zones or incomplete themes", () => {
    expect(
      normalizeWorkspaceProfile({
        website: "https://CafeCentral.mx/",
        timezone: "America/Mexico_City",
      }),
    ).toMatchObject({ timezone: "America/Mexico_City" });
    expect(() =>
      normalizeWorkspaceProfile({ timezone: "Marte/Olympus" }),
    ).toThrow(ContentValidationError);
    expect(() =>
      normalizeWorkspaceProfile({
        defaultTheme: {
          ...theme,
          background: { kind: "gradient", color: "#000000" },
        },
      }),
    ).toThrow(ContentValidationError);
  });
});

describe("routes", () => {
  it("validates the handle format before reaching the repository", async () => {
    const createTouchpoint = vi.fn();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: fake<TouchpointRepository>({ createTouchpoint }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints`,
      headers: authHeader,
      payload: {
        operationalName: "Instagram",
        kind: "link",
        handle: "Mayúsculas No",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(createTouchpoint).not.toHaveBeenCalled();
    await app.close();
  });

  it("never creates a Link through the generic Touchpoint route (A9-19)", async () => {
    const createTouchpoint = vi.fn();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: fake<TouchpointRepository>({ createTouchpoint }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints`,
      headers: authHeader,
      payload: { operationalName: "Instagram", kind: "link" },
    });
    // A Link only comes from POST …/links, with its address and its page.
    expect(response.statusCode).toBe(400);
    expect(createTouchpoint).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuses to let an Owner leave without transferring", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: fake<MemberRepository>({
        removeMember: async () => {
          throw new ConflictError(
            "OWNER_MUST_TRANSFER",
            "Transfiere la propiedad a otro miembro antes de salir de la organización.",
          );
        },
      }),
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/members/${subjectId}`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "OWNER_MUST_TRANSFER" });
    await app.close();
  });

  it("reads and writes the organization profile", async () => {
    const updateProfile = vi.fn(async (_i, _w, profile) => profile);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceProfileRepository: fake<WorkspaceProfileRepository>({
        getProfile: async () => ({ industry: "cafeteria" }),
        updateProfile,
      }),
    });
    const read = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/profile`,
      headers: authHeader,
    });
    expect(read.json()).toEqual({ industry: "cafeteria" });
    const bad = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/profile`,
      headers: authHeader,
      payload: { industry: "astronautas" },
    });
    expect(bad.statusCode).toBe(400);
    const saved = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/profile`,
      headers: authHeader,
      payload: {
        industry: "cafeteria",
        city: "CDMX",
        country: "MX",
        brand: { primary: "#08293d", accent: "#8ce0dc" },
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("answers help questions, and reports unavailability without a key", async () => {
    const ask = vi.fn(async () => "Un QR o etiqueta es un objeto físico.");
    const helpAssistant: HelpAssistant = { enabled: true, ask };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      helpAssistant,
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/help/ask",
      headers: authHeader,
      payload: {
        section: "touchpoints",
        question: "¿Qué es un QR o etiqueta?",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      answer: "Un QR o etiqueta es un objeto físico.",
    });
    await app.close();

    const unconfigured = buildCustomerApi({ sessionVerifier: verifierFor() });
    const unavailable = await unconfigured.inject({
      method: "POST",
      url: "/v1/help/ask",
      headers: authHeader,
      payload: { section: "general", question: "¿Qué es Kardo?" },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      code: "HELP_ASSISTANT_UNAVAILABLE",
    });
    await unconfigured.close();
  });
});

describe("help assistant spend (security review 2026-10, V9)", () => {
  it("refuses when Kardo's daily AI budget is spent, and caps each person", async () => {
    const ask = vi.fn(async () => "Respuesta.");
    const spent = buildCustomerApi({
      sessionVerifier: verifierFor(),
      helpAssistant: { enabled: true, ask },
      customHtmlBudget: {
        checkBeforeGeneration: async () => {
          throw new UnavailableError(
            "CUSTOM_HTML_AI_BUDGET",
            "Sin presupuesto.",
          );
        },
        recordSpend: async () => undefined,
      },
    });
    const refused = await spent.inject({
      method: "POST",
      url: "/v1/help/ask",
      headers: authHeader,
      payload: { section: "general", question: "¿Qué es Kardo?" },
    });
    expect(refused.statusCode).toBe(503);
    expect(refused.json()).toMatchObject({ code: "CUSTOM_HTML_AI_BUDGET" });
    expect(ask).not.toHaveBeenCalled();
    await spent.close();

    const capped = buildCustomerApi({
      sessionVerifier: verifierFor(),
      helpAssistant: { enabled: true, ask },
      rateLimit: { sensitive: { limit: 1_000, windowMs: 60_000 } },
    });
    const codes: number[] = [];
    for (let index = 0; index <= HELP_QUESTIONS_PER_HOUR; index += 1) {
      const response = await capped.inject({
        method: "POST",
        url: "/v1/help/ask",
        headers: authHeader,
        payload: { section: "general", question: "¿Qué es Kardo?" },
      });
      codes.push(response.statusCode);
    }
    expect(
      codes.slice(0, HELP_QUESTIONS_PER_HOUR).every((code) => code === 200),
    ).toBe(true);
    expect(codes.at(-1)).toBe(429);
    await capped.close();
  });

  it("reports the real cost of each answer for the daily budget", async () => {
    const spend = vi.fn();
    const assistant = createAnthropicHelpAssistant({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-haiku-4-5",
      onSpend: spend,
      fetchFn: async () =>
        Response.json({
          content: [{ type: "text", text: "Hola" }],
          usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
        }),
    });
    await assistant.ask({ section: "general", question: "¿Qué es Kardo?" });
    // Haiku 4.5: $1 per million input + $5 per million output tokens.
    expect(spend).toHaveBeenCalledWith(1_500_000);
  });
});

describe("help assistant", () => {
  it("sends only the section guide, the question and the history", async () => {
    let sent: Record<string, unknown> | undefined;
    const assistant = createAnthropicHelpAssistant({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-haiku-4-5",
      fetchFn: async (_url, init) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ content: [{ type: "text", text: "Respuesta" }] }),
          { status: 200 },
        );
      },
    });
    await expect(
      assistant.ask({
        section: "links",
        question: "¿Cómo comparto mi página?",
        history: [
          { role: "user", text: "Hola" },
          { role: "assistant", text: "¡Hola!" },
        ],
      }),
    ).resolves.toBe("Respuesta");
    expect(sent?.model).toBe("claude-haiku-4-5");
    expect(String(sent?.system)).toContain("Links");
    expect(sent?.messages).toEqual([
      { role: "user", content: "Hola" },
      { role: "assistant", content: "¡Hola!" },
      { role: "user", content: "¿Cómo comparto mi página?" },
    ]);
    expect(helpSystemPrompt("general")).not.toMatch(/workspace_id|email@/);
  });
});
