import { CUSTOM_HTML_GENERATION_STREAM } from "@kardo/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository } from "../src/assets.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import type { CustomHtmlModel } from "../src/custom-html/model.js";
import { UnavailableError } from "../src/errors.js";
import type { CustomHtmlAssistantRepository } from "../src/repositories/custom-html.js";
import {
  authHeader,
  experienceId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/custom-html/generations`;
const brief = {
  description: "Una cafetería con buen café.",
  colors: ["#000000"],
  imageRefs: [],
  fonts: ["geist"],
};
const streamHeaders = { ...authHeader, accept: CUSTOM_HTML_GENERATION_STREAM };

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
    recordGeneration: async () => {},
    ...overrides,
  } as CustomHtmlAssistantRepository;
}

function parseNdjson(payload: string): Record<string, unknown>[] {
  return payload
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function fakeModel(overrides: Partial<CustomHtmlModel> = {}): CustomHtmlModel {
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    complete: async () => ({
      text: JSON.stringify({
        html: "<div>hola</div>",
        css: ".x{}",
        notes: "Listo.",
      }),
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      stopReason: "end_turn",
    }),
    ...overrides,
  };
}

describe("custom-html generation route (NDJSON stream)", () => {
  it("answers a normal JSON error, not a stream, when a fail-fast check fails", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(0),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: streamHeaders,
      payload: { brief },
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers["content-type"]).not.toContain(
      CUSTOM_HTML_GENERATION_STREAM,
    );
    expect(response.json()).toMatchObject({ code: "CUSTOM_HTML_LIMIT" });
    await app.close();
  });

  it("streams progress, then a final result event, with the ndjson content type", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: streamHeaders,
      payload: { brief },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain(
      CUSTOM_HTML_GENERATION_STREAM,
    );

    const events = parseNdjson(response.payload);
    expect(events[0]).toEqual({
      type: "progress",
      stage: "generating",
      turn: 1,
      maxTurns: 3,
    });
    expect(
      events.some(
        (event) => event.type === "progress" && event.stage === "reviewing",
      ),
    ).toBe(true);
    const last = events.at(-1);
    expect(last).toMatchObject({
      type: "result",
      generation: {
        html: "<div>hola</div>",
        css: ".x{}",
        notes: "Listo.",
        remainingToday: 19,
      },
    });
    await app.close();
  });

  it("ends the stream with an error event (not an HTTP error status) when the provider fails mid-generation", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel({
        complete: async () => {
          throw new UnavailableError(
            "AI_UNAVAILABLE",
            "Kardo's AI HTML generator is not available right now.",
          );
        },
      }),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: streamHeaders,
      payload: { brief },
    });
    // Headers already committed to 200 before the provider call happens.
    expect(response.statusCode).toBe(200);
    const events = parseNdjson(response.payload);
    const last = events.at(-1);
    expect(last?.type).toBe("error");
    expect((last as { error: { code: string } }).error.code).toBe(
      "AI_UNAVAILABLE",
    );
    await app.close();
  });

  it("releases the daily reservation when the stream ends in an error", async () => {
    const release = vi.fn(async () => {});
    const limiter = createCustomHtmlLimiter(20);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel({
        complete: async () => {
          throw new Error("boom");
        },
      }),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: { ...limiter, release },
    });
    await app.inject({
      method: "POST",
      url,
      headers: streamHeaders,
      payload: { brief },
    });
    expect(release).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("sends a ping roughly every 15 seconds while the generation is still running", async () => {
    vi.useFakeTimers();
    try {
      let resolveComplete!: (value: {
        text: string;
        usage: {
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          cacheWriteTokens: number;
        };
        stopReason: string;
      }) => void;
      const pending = new Promise<Parameters<typeof resolveComplete>[0]>(
        (resolve) => {
          resolveComplete = resolve;
        },
      );
      const app = buildCustomerApi({
        sessionVerifier: verifierFor(),
        customHtmlModel: fakeModel({ complete: () => pending }),
        customHtmlAssistantRepository: repo(),
        customHtmlLimiter: createCustomHtmlLimiter(20),
      });

      const injected = app.inject({
        method: "POST",
        url,
        headers: streamHeaders,
        payload: { brief },
      });

      await vi.advanceTimersByTimeAsync(15_000);
      await vi.advanceTimersByTimeAsync(15_000);
      resolveComplete({
        text: JSON.stringify({ html: "<div></div>", css: "", notes: "" }),
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "end_turn",
      });

      const response = await injected;
      const events = parseNdjson(response.payload);
      const pings = events.filter((event) => event.type === "ping");
      expect(pings.length).toBeGreaterThanOrEqual(2);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the single-JSON response when the Accept header does not ask for the stream", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(20),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).not.toContain(
      CUSTOM_HTML_GENERATION_STREAM,
    );
    expect(response.json()).toEqual({
      html: "<div>hola</div>",
      css: ".x{}",
      notes: "Listo.",
      remainingToday: 19,
    });
    await app.close();
  });
});
