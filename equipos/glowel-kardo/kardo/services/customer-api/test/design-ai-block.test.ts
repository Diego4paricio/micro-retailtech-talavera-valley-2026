import { CUSTOM_HTML_GENERATION_STREAM, DESIGN_LIMITS } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository } from "../src/assets.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import type { CustomHtmlModel } from "../src/custom-html/model.js";
import { WorkspaceAccessError } from "../src/errors.js";
import type { CustomHtmlAssistantRepository } from "../src/repositories/custom-html.js";
import {
  authHeader,
  experienceId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Route: POST .../experiences/:id/design/html-blocks/generations (the
// inspector's "Pedir a la IA" for one html block, ADR 018 addendum 3,
// 2026-09-30). Always requires experiences.custom_html, same as modo HTML.
// ---------------------------------------------------------------------------

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/html-blocks/generations`;
const brief = {
  description: "Una cafetería con buen café.",
  colors: ["#000000"],
  imageRefs: [],
  fonts: ["geist"],
};

function fakeModel(
  text: string,
  overrides: Partial<CustomHtmlModel> = {},
): CustomHtmlModel {
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    complete: async () => ({
      text,
      usage: {
        inputTokens: 5,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      stopReason: "end_turn",
    }),
    ...overrides,
  };
}

function repo(
  overrides: Partial<CustomHtmlAssistantRepository> = {},
): CustomHtmlAssistantRepository {
  return {
    loadDraftForGeneration: async () => ({
      businessName: "Café Central",
      type: "links",
      content: {
        title: "Café Central",
        links: [{ id: "a", label: "Menú", url: "https://example.com" }],
      },
    }),
    loadContentForDesignGeneration: async () => {
      throw new Error("not used by this route");
    },
    requireCustomHtmlBlockPermission: async () => {},
    recordGeneration: async () => {},
    recordDesignGeneration: async () => {},
    ...overrides,
  } as CustomHtmlAssistantRepository;
}

const cleanAnswer = JSON.stringify({
  html: '<div class="horario">Lun a vie, 9 a 18</div>',
  css: ".horario{font-weight:600}",
  notes: "Tarjeta de horario.",
});

describe("html block generation route", () => {
  it("requires the experiences.custom_html permission, same as modo HTML", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(cleanAnswer),
      customHtmlAssistantRepository: repo({
        loadDraftForGeneration: async () => {
          throw new WorkspaceAccessError();
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("answers 503 when no Kardo AI provider is configured", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: null,
      customHtmlAssistantRepository: repo(),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("returns the drafted html/css/notes and remainingToday", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(cleanAnswer),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief, instructions: "una tarjeta con el horario" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.html).toContain("horario");
    expect(body.css).toContain("font-weight");
    expect(body.notes).toBe("Tarjeta de horario.");
    expect(typeof body.remainingToday).toBe("number");
    await app.close();
  });

  it("accepts current html/css to improve", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(cleanAnswer),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: {
        brief,
        current: { html: "<div>viejo</div>", css: "" },
      },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("truncates an oversized answer to the block's own size limit, not the whole page's", async () => {
    const longHtml = `<p>${"a".repeat(DESIGN_LIMITS.htmlBlockHtml + 500)}</p>`;
    const answer = JSON.stringify({ html: longHtml, css: "", notes: "" });
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(answer),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
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
    expect(response.json().html.length).toBe(DESIGN_LIMITS.htmlBlockHtml);
    await app.close();
  });

  it("streams progress and a final result event over NDJSON", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(cleanAnswer),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: { ...authHeader, accept: CUSTOM_HTML_GENERATION_STREAM },
      payload: { brief },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain(
      CUSTOM_HTML_GENERATION_STREAM,
    );
    const events = response.payload
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(events.some((event) => event.type === "progress")).toBe(true);
    const result = events.find((event) => event.type === "result");
    expect(result?.generation.html).toContain("horario");
    await app.close();
  });
});
