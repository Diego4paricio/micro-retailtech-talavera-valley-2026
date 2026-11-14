import { CUSTOM_HTML_GENERATION_STREAM } from "@kardo/contracts";
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
// Route: POST .../experiences/:id/design/generations (AI in blocks, full
// page, ADR 018 addendum 3, 2026-09-30).
// ---------------------------------------------------------------------------

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/generations`;
const brief = {
  description: "Una cafetería con buen café.",
  colors: ["#000000"],
  imageRefs: [],
  fonts: ["geist"],
};

const linksDesign = {
  schema: 1,
  style: {
    palette: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#666666",
      accent: "#2563eb",
    },
    fonts: { heading: "system", body: "system" },
    radius: 12,
    buttonStyle: "solid",
    buttonShape: "pill",
    shadow: "none",
    background: { kind: "solid", color: "#ffffff" },
    maxWidth: 480,
  },
  sections: [
    {
      id: "s-1",
      layout: "1",
      columns: [
        [
          { id: "b-1", kind: "contentTitle" },
          { id: "b-2", kind: "contentLinks", layout: "list" },
        ],
      ],
      paddingTop: 32,
      paddingBottom: 16,
      gap: 16,
      align: "center",
    },
  ],
};

const linksDesignWithHtmlBlock = {
  ...linksDesign,
  sections: [
    {
      ...linksDesign.sections[0],
      columns: [
        [
          ...linksDesign.sections[0].columns[0],
          { id: "b-3", kind: "html", html: "<p>hola</p>", css: "" },
        ],
      ],
    },
  ],
};

function fakeModel(
  design: unknown,
  overrides: Partial<CustomHtmlModel> = {},
): CustomHtmlModel {
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    complete: async () => ({
      text: JSON.stringify({ design, notes: "Listo." }),
      usage: {
        inputTokens: 10,
        outputTokens: 20,
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
        links: [{ id: "link-1", label: "Menú", url: "https://example.com" }],
      },
    }),
    loadContentForDesignGeneration: async () => ({
      businessName: "Café Central",
      type: "links",
      content: {
        title: "Café Central",
        links: [{ id: "link-1", label: "Menú", url: "https://example.com" }],
      },
    }),
    requireCustomHtmlBlockPermission: async () => {},
    recordGeneration: async () => {},
    recordDesignGeneration: async () => {},
    ...overrides,
  } as CustomHtmlAssistantRepository;
}

describe("design generation route (block design)", () => {
  it("requires the experiences.edit permission (base gate for any block design)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(linksDesign),
      customHtmlAssistantRepository: repo({
        loadContentForDesignGeneration: async () => {
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
    expect(response.json()).toMatchObject({ code: "AI_UNAVAILABLE" });
    await app.close();
  });

  it("returns the validated design and remainingToday", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(linksDesign),
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
    const body = response.json();
    expect(body.notes).toBe("Listo.");
    expect(typeof body.remainingToday).toBe("number");
    expect(
      body.design.sections[0].columns[0].map((b: { kind: string }) => b.kind),
    ).toEqual(["contentTitle", "contentLinks"]);
    await app.close();
  });

  it("keeps an html block when the caller has experiences.custom_html", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(linksDesignWithHtmlBlock),
      customHtmlAssistantRepository: repo({
        recordDesignGeneration: async (
          _identity,
          _workspaceId,
          _experienceId,
          metadata,
        ) => {
          expect(metadata.hasHtmlBlocks).toBe(true);
        },
      }),
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
    const kinds = response
      .json()
      .design.sections[0].columns[0].map((b: { kind: string }) => b.kind);
    expect(kinds).toContain("html");
    await app.close();
  });

  it("drops an html block instead of returning it when the caller lacks experiences.custom_html", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(linksDesignWithHtmlBlock),
      customHtmlAssistantRepository: repo({
        requireCustomHtmlBlockPermission: async () => {
          throw new WorkspaceAccessError();
        },
        recordDesignGeneration: async (
          _identity,
          _workspaceId,
          _experienceId,
          metadata,
        ) => {
          expect(metadata.hasHtmlBlocks).toBe(false);
        },
      }),
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
    const kinds = response
      .json()
      .design.sections[0].columns[0].map((b: { kind: string }) => b.kind);
    expect(kinds).not.toContain("html");
    expect(kinds).toEqual(["contentTitle", "contentLinks"]);
    await app.close();
  });

  it("streams progress and a final result event over NDJSON", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(linksDesign),
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
    expect(result?.generation.design).toBeTruthy();
    expect(result?.generation.notes).toBe("Listo.");
    await app.close();
  });
});
