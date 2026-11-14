import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository } from "../src/assets.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import type { CustomHtmlModel } from "../src/custom-html/model.js";
import { usageCostMicroUsd } from "../src/custom-html/pricing.js";
import { UnavailableError } from "../src/errors.js";
import type { CustomHtmlAssistantRepository } from "../src/repositories/custom-html.js";
import {
  authHeader,
  experienceId,
  subjectId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

// Security review 2026-10, V9: a generation that fails after spending
// keeps its daily slot and is audited as failed with its cost, so the
// monthly dollar cap counts it; one that fails before spending gives the
// slot back.

const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/custom-html/generations`;
const brief = {
  description: "Una cafetería con buen café.",
  colors: ["#000000"],
  imageRefs: [],
  fonts: ["geist"],
};
const usage = {
  inputTokens: 1_000,
  outputTokens: 2_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

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
    recordFailedGeneration: async () => {},
    ...overrides,
  } as CustomHtmlAssistantRepository;
}

function model(complete: CustomHtmlModel["complete"]): CustomHtmlModel {
  return { provider: "anthropic", model: "claude-sonnet-5", complete };
}

async function ask(app: ReturnType<typeof buildCustomerApi>) {
  return app.inject({
    method: "POST",
    url,
    headers: authHeader,
    payload: { brief },
  });
}

describe("Kardo AI: a generation that fails after spending", () => {
  it("keeps its daily slot and is audited as failed with what it cost", async () => {
    // Every turn answers something unusable: the review spends all its
    // turns, then gives up.
    const complete = vi.fn(async () => ({
      text: "no es JSON",
      usage,
      stopReason: "end_turn",
    }));
    const recordFailedGeneration = vi.fn(async () => {});
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: model(complete),
      customHtmlAssistantRepository: repo({ recordFailedGeneration }),
      customHtmlLimiter: createCustomHtmlLimiter(1),
      assetRepository: {} as AssetRepository,
      assetWorker: null,
    });
    const failed = await ask(app);
    expect(failed.statusCode).toBe(503);
    const turns = complete.mock.calls.length;
    expect(turns).toBeGreaterThan(0);
    expect(recordFailedGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subjectId }),
      workspaceId,
      experienceId,
      {
        kind: "custom_html",
        costMicroUsd: turns * usageCostMicroUsd("claude-sonnet-5", usage),
      },
    );
    // The slot was not given back: the organization's only one is used.
    const next = await ask(app);
    expect(next.statusCode).toBe(429);
    expect(next.json()).toMatchObject({ code: "CUSTOM_HTML_LIMIT" });
    await app.close();
  });

  it("gives the slot back when it failed before spending anything", async () => {
    const complete = vi.fn(async () => {
      throw new UnavailableError("AI_UNAVAILABLE", "Proveedor caído.");
    });
    const recordFailedGeneration = vi.fn(async () => {});
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: model(complete),
      customHtmlAssistantRepository: repo({ recordFailedGeneration }),
      customHtmlLimiter: createCustomHtmlLimiter(1),
      assetRepository: {} as AssetRepository,
      assetWorker: null,
    });
    expect((await ask(app)).statusCode).toBe(503);
    expect(recordFailedGeneration).not.toHaveBeenCalled();
    // Same organization, same (only) slot: it is available again.
    expect((await ask(app)).statusCode).toBe(503);
    expect(complete).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
