import {
  buildDesignConceptsMessages,
  buildDesignMessages,
  CUSTOM_HTML_GENERATION_STREAM,
  type DesignConcept,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository } from "../src/assets.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import type { CustomHtmlModel } from "../src/custom-html/model.js";
import {
  normalizeConcept,
  parseDesignConcepts,
  runDesignConcepts,
} from "../src/design-ai/design-concepts.js";
import { contrastRatio } from "../src/design-ai/readable-palette.js";
import type {
  CustomHtmlAssistantRepository,
  DesignConceptsAuditMetadata,
} from "../src/repositories/custom-html.js";
import {
  authHeader,
  experienceId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// "3 ideas, then 1 design" (2026-10-03): POST …/design/concepts.
// ---------------------------------------------------------------------------

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const concept: DesignConcept = {
  name: "Fonda de barrio",
  direction: "mercado",
  pitch:
    "Cálida y con apetito: tus platillos al frente y pedir por WhatsApp a un toque.",
  palette: {
    background: "#fbf5ec",
    surface: "#ffffff",
    text: "#2b1d14",
    muted: "#6e5646",
    accent: "#b4471f",
  },
  fonts: { heading: "bricolage", body: "dm-sans" },
  radius: 16,
  buttonShape: "pill",
  cover: "photo",
  highlights: ["Portada con tu mejor platillo", "Lo más pedido arriba"],
};

const second: DesignConcept = {
  ...concept,
  name: "Noche en la fonda",
  direction: "nocturno",
  fonts: { heading: "cormorant", body: "manrope" },
  cover: "type",
};

function modelAnswering(
  answers: string[],
  calls: { system: string; contract?: string }[] = [],
): CustomHtmlModel {
  let turn = 0;
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    complete: async (input) => {
      calls.push({
        system: input.system,
        ...(input.responseContract ? { contract: input.responseContract } : {}),
      });
      const text = answers[Math.min(turn, answers.length - 1)] ?? "";
      turn += 1;
      return {
        text,
        usage: {
          inputTokens: 100,
          outputTokens: 200,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "end_turn",
      };
    },
  };
}

describe("design ideas: parsing", () => {
  it("keeps valid ideas, at most three, from a bare or fenced answer", () => {
    const answer = JSON.stringify({
      concepts: [concept, second, concept, second],
    });
    expect(parseDesignConcepts(answer)).toHaveLength(3);
    expect(
      parseDesignConcepts(`Aquí van:\n\`\`\`json\n${answer}\n\`\`\``),
    ).toHaveLength(3);
  });

  it("drops an idea with an unknown direction or font", () => {
    const answer = JSON.stringify({
      concepts: [
        concept,
        { ...second, direction: "vaporwave" },
        { ...second, fonts: { heading: "comic-sans", body: "manrope" } },
      ],
    });
    const parsed = parseDesignConcepts(answer);
    expect(parsed.map((item) => item.name)).toEqual(["Fonda de barrio"]);
  });

  it("cuts text that is a bit too long instead of dropping the idea", () => {
    const parsed = normalizeConcept({
      ...concept,
      name: "Una fonda de barrio con mucho sabor y tradición",
      highlights: ["a", "b", "c", "d", "e"],
    });
    expect(parsed?.name).toHaveLength(40);
    expect(parsed?.highlights).toHaveLength(4);
  });

  it("makes the palette readable", () => {
    const parsed = normalizeConcept({
      ...concept,
      palette: { ...concept.palette, muted: "#d9d0c8", accent: "#F5E6C8" },
    });
    expect(parsed).toBeDefined();
    const palette = parsed?.palette ?? concept.palette;
    expect(
      contrastRatio(palette.muted, palette.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(palette.accent, palette.surface),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("design ideas: the AI loop", () => {
  it("asks once more when the first answer has no usable idea", async () => {
    const calls: { system: string; contract?: string }[] = [];
    const result = await runDesignConcepts({
      model: modelAnswering(
        ["no es json", JSON.stringify({ concepts: [concept, second] })],
        calls,
      ),
      system: "sistema",
      userMessage: "datos",
      images: [],
    });
    expect(result.concepts).toHaveLength(2);
    expect(result.audit.turns).toBe(2);
    expect(result.audit.costMicroUsd).toBeGreaterThan(0);
    expect(calls.map((call) => call.contract)).toEqual([
      "design-concepts",
      "design-concepts",
    ]);
  });

  it("fails after two answers without ideas", async () => {
    await expect(
      runDesignConcepts({
        model: modelAnswering(["nada", "{}"]),
        system: "sistema",
        userMessage: "datos",
        images: [],
      }),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});

describe("design ideas: prompt", () => {
  const input = {
    type: "menu" as const,
    businessName: "Fonda Doña Mary",
    brief: {
      description: "comida casera",
      colors: [],
      imageRefs: [],
      fonts: [],
    },
    images: [],
    content: { title: "Fonda Doña Mary" },
    contentItemIds: [],
  };

  it("shares the system prompt with the design request (one cache)", () => {
    const ideas = buildDesignConceptsMessages(input);
    const design = buildDesignMessages({ ...input, concept });
    expect(ideas.system).toBe(design.system);
    expect(ideas.user).toContain("Pedido de ideas");
    expect(design.user).toContain("Pedido de diseño");
    expect(design.user).toContain('"direction":"mercado"');
    expect(ideas.user).not.toContain("Idea elegida");
  });
});

const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/concepts`;
const brief = {
  description: "Fonda de comida casera.",
  colors: [],
  imageRefs: [],
  fonts: [],
};

function repo(
  overrides: Partial<CustomHtmlAssistantRepository> = {},
): CustomHtmlAssistantRepository {
  return {
    loadContentForDesignGeneration: async () => ({
      businessName: "Fonda Doña Mary",
      type: "menu",
      content: {
        title: "Fonda Doña Mary",
        currency: "MXN",
        sections: [
          {
            id: "sec-1",
            name: "Desayunos",
            items: [{ id: "item-1", name: "Chilaquiles", price: 95 }],
          },
        ],
      },
    }),
    requireCustomHtmlBlockPermission: async () => {},
    recordDesignConcepts: async () => {},
    recordFailedGeneration: async () => {},
    ...overrides,
  } as CustomHtmlAssistantRepository;
}

describe("design ideas route", () => {
  it("returns the ideas without taking a generation and audits their cost", async () => {
    const limiter = createCustomHtmlLimiter(2);
    const audits: DesignConceptsAuditMetadata[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: modelAnswering([
        JSON.stringify({ concepts: [concept, second, concept] }),
      ]),
      customHtmlAssistantRepository: repo({
        recordDesignConcepts: async (_identity, _w, _e, metadata) => {
          audits.push(metadata);
        },
      }),
      customHtmlLimiter: limiter,
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().concepts).toHaveLength(3);
    expect(audits[0]).toMatchObject({ stage: "concepts", conceptsCount: 3 });
    expect(audits[0]?.costMicroUsd).toBeGreaterThan(0);
    // Both of today's generations are still there.
    expect(await limiter.check(fake({}), workspaceId)).toBe(2);
    await app.close();
  });

  it("refuses with 429 once today's generations are used up", async () => {
    const limiter = createCustomHtmlLimiter(1);
    await limiter.reserve(fake({}), workspaceId);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: modelAnswering([
        JSON.stringify({ concepts: [concept] }),
      ]),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: limiter,
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(429);
    await app.close();
  });

  it("audits a failed attempt's cost as a failed design", async () => {
    const failed: number[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: modelAnswering(["nada"]),
      customHtmlAssistantRepository: repo({
        recordFailedGeneration: async (_identity, _w, _e, input) => {
          failed.push(input.costMicroUsd);
        },
      }),
      customHtmlLimiter: createCustomHtmlLimiter(5),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(503);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toBeGreaterThan(0);
    await app.close();
  });

  it("streams the ideas over NDJSON", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: modelAnswering([
        JSON.stringify({ concepts: [concept] }),
      ]),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(5),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: { ...authHeader, accept: CUSTOM_HTML_GENERATION_STREAM },
      payload: { brief },
    });
    const events = response.payload
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const result = events.find((event) => event.type === "result");
    expect(result?.generation.concepts[0].name).toBe("Fonda de barrio");
    await app.close();
  });

  it("passes the chosen idea to the design request", async () => {
    const systems: string[] = [];
    const users: string[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: {
        provider: "anthropic",
        model: "claude-sonnet-5",
        complete: async (input) => {
          systems.push(input.system);
          const last = input.messages.at(-1)?.content.at(-1);
          users.push(last?.type === "text" ? last.text : "");
          return {
            text: "{}",
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            stopReason: "end_turn",
          };
        },
      },
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(5),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/generations`,
      headers: authHeader,
      payload: { brief, concept },
    });
    expect(users[0]).toContain("Idea elegida por el dueño");
    expect(users[0]).toContain('"name":"Fonda de barrio"');
    await app.close();
  });
});
