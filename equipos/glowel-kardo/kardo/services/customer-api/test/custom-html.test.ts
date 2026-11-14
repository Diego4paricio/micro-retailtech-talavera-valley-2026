import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository, AssetWorkerClient } from "../src/assets.js";
import { parseCustomHtmlResponse } from "../src/custom-html/assistant.js";
import { createInMemoryCustomHtmlBudget } from "../src/custom-html/budget.js";
import { collectCustomHtmlPromptImages } from "../src/custom-html/images.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import type { CustomHtmlModel } from "../src/custom-html/model.js";
import { usageCostMicroUsd } from "../src/custom-html/pricing.js";
import { createCustomHtmlUserLimits } from "../src/custom-html/user-limits.js";
import {
  ContentValidationError,
  UnavailableError,
  WorkspaceAccessError,
} from "../src/errors.js";
import type { CustomHtmlAssistantRepository } from "../src/repositories/custom-html.js";
import {
  customHtmlChanged,
  designHtmlBlocksChanged,
} from "../src/repositories/experiences.js";
import { validateExperienceContent } from "../src/validation/experience-content.js";
import {
  assetId,
  authHeader,
  experienceId,
  subjectId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const identity = { subject: subjectId, email: "customer@kardo.test" };

/** A minimal `CustomHtmlModel` whose `complete()` always answers the same
 * one-turn JSON draft, unless overridden. */
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

// ---------------------------------------------------------------------------
// customHtmlChanged (packages/domain permission gate)
// ---------------------------------------------------------------------------

describe("customHtmlChanged", () => {
  const active = {
    schema: 1 as const,
    active: true,
    html: "<div></div>",
    css: "",
  };

  it("is false when neither side has custom HTML", () => {
    expect(customHtmlChanged(undefined, undefined)).toBe(false);
  });

  it("is false for the same content with keys in a different order (jsonb round-trip)", () => {
    const reordered = {
      css: active.css,
      html: active.html,
      active: active.active,
      schema: active.schema,
    };
    expect(customHtmlChanged(active, reordered)).toBe(false);
  });

  it("is true when toggling active", () => {
    expect(customHtmlChanged(active, { ...active, active: false })).toBe(true);
  });

  it("is true when the html changes", () => {
    expect(customHtmlChanged(active, { ...active, html: "<p></p>" })).toBe(
      true,
    );
  });

  it("is true going from none to some, and some to none", () => {
    expect(customHtmlChanged(undefined, active)).toBe(true);
    expect(customHtmlChanged(active, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// designHtmlBlocksChanged (a design's own `html` blocks, addendum 3)
// ---------------------------------------------------------------------------

describe("designHtmlBlocksChanged", () => {
  function baseDesignStyle() {
    return {
      palette: {
        background: "#ffffff",
        surface: "#ffffff",
        text: "#111111",
        muted: "#666666",
        accent: "#0a6c78",
      },
      fonts: { heading: "geist", body: "system" },
      radius: 12,
      buttonStyle: "solid" as const,
      buttonShape: "rounded" as const,
      shadow: "none" as const,
      background: { kind: "solid" as const, color: "#ffffff" },
      maxWidth: 640,
    };
  }

  function designWithHtmlBlocks(
    blocks: { id: string; html: string; css: string }[],
  ) {
    return {
      schema: 1 as const,
      style: baseDesignStyle(),
      sections: [
        {
          id: "s1",
          layout: "1" as const,
          columns: [
            [
              {
                id: "cl1",
                kind: "contentLinks" as const,
                layout: "list" as const,
              },
              ...blocks.map((block) => ({ ...block, kind: "html" as const })),
            ],
          ],
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
          align: "start" as const,
        },
      ],
    };
  }

  it("is false when neither side has a design", () => {
    expect(designHtmlBlocksChanged(undefined, undefined)).toBe(false);
  });

  it("is false for a design with no html blocks at all", () => {
    const d = designWithHtmlBlocks([]);
    expect(designHtmlBlocksChanged(d, { ...d })).toBe(false);
  });

  it("is false when only some other part of the design changes (color, a non-html block)", () => {
    const previous = designWithHtmlBlocks([
      { id: "h1", html: "<div></div>", css: "" },
    ]);
    const next = designWithHtmlBlocks([
      { id: "h1", html: "<div></div>", css: "" },
    ]);
    next.style.palette.accent = "#ff0000";
    expect(designHtmlBlocksChanged(previous, next)).toBe(false);
  });

  it("is true when an html block's own html or css changes", () => {
    const previous = designWithHtmlBlocks([
      { id: "h1", html: "<div></div>", css: "" },
    ]);
    const next = designWithHtmlBlocks([{ id: "h1", html: "<p></p>", css: "" }]);
    expect(designHtmlBlocksChanged(previous, next)).toBe(true);
  });

  it("is true going from none to some, and some to none", () => {
    const withBlock = designWithHtmlBlocks([
      { id: "h1", html: "<div></div>", css: "" },
    ]);
    const withoutBlock = designWithHtmlBlocks([]);
    expect(designHtmlBlocksChanged(withoutBlock, withBlock)).toBe(true);
    expect(designHtmlBlocksChanged(withBlock, withoutBlock)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation: customHtml asset references and the kardo-asset token rule
// ---------------------------------------------------------------------------

describe("modo HTML validation", () => {
  const imageRef = "0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a";
  const validCustomHtml = {
    schema: 1 as const,
    active: true,
    html: `<div><img src="kardo-asset:${imageRef}" alt="Fachada"></div>`,
    css: `.x { background: url(kardo-asset:${imageRef}); }`,
    brief: {
      description: "Una cafetería de especialidad.",
      colors: ["#000000"],
      imageRefs: [imageRef],
      fonts: ["geist"],
    },
  };

  it("is rejected on a type that cannot use modo HTML (schema shape)", () => {
    expect(() =>
      validateExperienceContent("menu", {
        title: "Carta",
        currency: "USD",
        sections: [{ id: "s", name: "S", items: [{ id: "i", name: "I" }] }],
        customHtml: validCustomHtml,
      }),
    ).toThrow(ContentValidationError);
  });

  it("collects the brief image and every kardo-asset token as one deduplicated custom-html-image reference", () => {
    const { assetReferences } = validateExperienceContent("links", {
      title: "Enlaces",
      links: [{ id: "a", label: "Sitio", url: "https://example.com" }],
      customHtml: validCustomHtml,
    });
    expect(assetReferences).toEqual([
      {
        assetId: imageRef,
        purpose: "custom-html-image",
        expectedMediaType: "image/*",
      },
    ]);
  });

  it("rejects a kardo-asset token that is not a uuid", () => {
    expect(() =>
      validateExperienceContent("profile", {
        displayName: "Café",
        links: [],
        customHtml: {
          ...validCustomHtml,
          html: '<img src="kardo-asset:not-a-uuid">',
        },
      }),
    ).toThrow(ContentValidationError);
  });

  it("keeps the HTML and CSS source exactly as written (no sanitizing here)", () => {
    const { content } = validateExperienceContent("linkpage", {
      displayName: "Café",
      socials: [],
      links: [{ id: "a", label: "Menú", url: "https://example.com" }],
      customHtml: validCustomHtml,
    });
    expect(
      (content as { customHtml?: { html: string } }).customHtml?.html,
    ).toBe(validCustomHtml.html);
  });

  it("returns no asset references when there is no custom HTML", () => {
    const { assetReferences } = validateExperienceContent("links", {
      title: "Enlaces",
      links: [{ id: "a", label: "Sitio", url: "https://example.com" }],
    });
    expect(assetReferences).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseCustomHtmlResponse: robust JSON / fenced parsing
// ---------------------------------------------------------------------------

describe("parseCustomHtmlResponse", () => {
  it("parses a bare JSON object", () => {
    expect(
      parseCustomHtmlResponse(
        '{"html":"<p>hola</p>","css":".a{}","notes":"listo"}',
      ),
    ).toEqual({ html: "<p>hola</p>", css: ".a{}", notes: "listo" });
  });

  it("parses JSON fenced in a ```json block, ignoring surrounding prose", () => {
    const raw =
      'Aquí tienes tu diseño:\n```json\n{"html":"<p>hola</p>","css":"","notes":""}\n```\nEspero te guste.';
    expect(parseCustomHtmlResponse(raw)).toEqual({
      html: "<p>hola</p>",
      css: "",
      notes: "",
    });
  });

  it("falls back to separate html/css fenced blocks, using the remaining prose as notes", () => {
    const raw =
      "Diseño listo, mobile-first.\n```html\n<p>hola</p>\n```\n```css\n.a{color:red}\n```";
    expect(parseCustomHtmlResponse(raw)).toEqual({
      html: "<p>hola</p>",
      css: ".a{color:red}",
      notes: "Diseño listo, mobile-first.",
    });
  });

  it("throws AI_UNAVAILABLE when nothing usable is found", () => {
    expect(() => parseCustomHtmlResponse("No puedo ayudarte con eso.")).toThrow(
      UnavailableError,
    );
  });
});

// ---------------------------------------------------------------------------
// createCustomHtmlLimiter: per-workspace, UTC-day bucket
// ---------------------------------------------------------------------------

describe("createCustomHtmlLimiter", () => {
  const identity = {
    subject: "e6abf26a-3263-4149-9d75-9b7441165d29",
    email: "a@kardo.test",
  };

  it("reserves until the cap, then refuses", async () => {
    const limiter = createCustomHtmlLimiter(2);
    expect(await limiter.reserve(identity, workspaceId)).toBe(1);
    expect(await limiter.reserve(identity, workspaceId)).toBe(0);
    expect(await limiter.reserve(identity, workspaceId)).toBeNull();
  });

  it("gives a reservation back after a failed generation", async () => {
    const limiter = createCustomHtmlLimiter(1);
    expect(await limiter.reserve(identity, workspaceId)).toBe(0);
    await limiter.release(identity, workspaceId);
    expect(await limiter.reserve(identity, workspaceId)).toBe(0);
  });

  it("keeps independent counts per workspace", async () => {
    const limiter = createCustomHtmlLimiter(1);
    const otherWorkspaceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await limiter.reserve(identity, workspaceId);
    expect(await limiter.reserve(identity, workspaceId)).toBeNull();
    expect(await limiter.reserve(identity, otherWorkspaceId)).toBe(0);
  });

  it("starts a new count on the next UTC day", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T23:30:00.000Z"));
      const limiter = createCustomHtmlLimiter(1);
      await limiter.reserve(identity, workspaceId);
      expect(await limiter.reserve(identity, workspaceId)).toBeNull();
      vi.setSystemTime(new Date("2026-01-02T00:00:01.000Z"));
      expect(await limiter.reserve(identity, workspaceId)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// collectCustomHtmlPromptImages
// ---------------------------------------------------------------------------

describe("collectCustomHtmlPromptImages", () => {
  function worker(): AssetWorkerClient {
    return fake<AssetWorkerClient>({
      readUrl: () => "https://assets.example/read",
    });
  }

  it("returns nothing without an Assets Worker", async () => {
    const images = await collectCustomHtmlPromptImages({
      assetRepository: fake<AssetRepository>({}),
      assetWorker: null,
      identity,
      workspaceId,
      imageRefs: [assetId],
    });
    expect(images).toEqual([]);
  });

  it("reads and base64-encodes a validated image, labeled by its file name", async () => {
    const images = await collectCustomHtmlPromptImages({
      assetRepository: fake<AssetRepository>({
        lookupReadableImage: async () => ({
          derivativeKey: "k",
          mediaType: "image/png",
          filename: "fachada.png",
        }),
      }),
      assetWorker: worker(),
      identity,
      workspaceId,
      imageRefs: [assetId],
      fetchFn: async () =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    });
    expect(images).toEqual([
      {
        ref: assetId,
        label: "fachada.png",
        mediaType: "image/png",
        base64: Buffer.from([1, 2, 3]).toString("base64"),
      },
    ]);
  });

  it("skips an image whose lookup fails (deleted, not validated, ...)", async () => {
    const images = await collectCustomHtmlPromptImages({
      assetRepository: fake<AssetRepository>({
        lookupReadableImage: async () => {
          throw new Error("not found");
        },
      }),
      assetWorker: worker(),
      identity,
      workspaceId,
      imageRefs: [assetId],
      fetchFn: async () => new Response("", { status: 200 }),
    });
    expect(images).toEqual([]);
  });

  it("skips an image whose signed read fails", async () => {
    const images = await collectCustomHtmlPromptImages({
      assetRepository: fake<AssetRepository>({
        lookupReadableImage: async () => ({
          derivativeKey: "k",
          mediaType: "image/png",
          filename: "logo.png",
        }),
      }),
      assetWorker: worker(),
      identity,
      workspaceId,
      imageRefs: [assetId],
      fetchFn: async () => new Response("", { status: 404 }),
    });
    expect(images).toEqual([]);
  });

  it("never reads more than 8 images, even when the brief lists more", async () => {
    const seenRefs: string[] = [];
    const refs = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
      "99999999-9999-4999-8999-999999999999",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ];
    const images = await collectCustomHtmlPromptImages({
      assetRepository: fake<AssetRepository>({
        lookupReadableImage: async (_identity, _workspaceId, ref) => {
          seenRefs.push(ref);
          return {
            derivativeKey: "k",
            mediaType: "image/png",
            filename: `${ref}.png`,
          };
        },
      }),
      assetWorker: worker(),
      identity,
      workspaceId,
      imageRefs: refs,
      fetchFn: async () => new Response(new Uint8Array([1]), { status: 200 }),
    });
    expect(seenRefs).toEqual(refs.slice(0, 8));
    expect(images).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// Route: POST .../custom-html/generations
// ---------------------------------------------------------------------------

describe("custom-html generation route", () => {
  const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/custom-html/generations`;
  const brief = {
    description: "Una cafetería con buen café.",
    colors: ["#000000"],
    imageRefs: [],
    fonts: ["geist"],
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
      ...overrides,
    } as CustomHtmlAssistantRepository;
  }

  it("requires the experiences.custom_html permission", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
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

  it("answers 503 AI_UNAVAILABLE when no Kardo AI provider is configured", async () => {
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

  it("answers 429 CUSTOM_HTML_LIMIT with remainingToday once the daily cap is reached", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
      customHtmlAssistantRepository: repo(),
      customHtmlLimiter: createCustomHtmlLimiter(0),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      code: "CUSTOM_HTML_LIMIT",
      remainingToday: 0,
    });
    await app.close();
  });

  it("rejects an Experience type that cannot use modo HTML", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
      customHtmlAssistantRepository: repo({
        loadDraftForGeneration: async () => ({
          businessName: "Café Central",
          type: "menu",
          content: {
            title: "Carta",
            currency: "USD",
            sections: [],
          },
        }),
      }),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "INVALID_EXPERIENCE_CONTENT",
    });
    await app.close();
  });

  it("answers 503 CUSTOM_HTML_AI_BUDGET before calling the provider once the daily budget is spent", async () => {
    const complete = vi.fn();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel({ complete }),
      customHtmlAssistantRepository: repo(),
      customHtmlBudget: createInMemoryCustomHtmlBudget({ dailyBudgetUsd: 0 }),
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "CUSTOM_HTML_AI_BUDGET" });
    expect(complete).not.toHaveBeenCalled();
    await app.close();
  });

  it("answers 429 when this customer already has a generation running", async () => {
    const userLimits = createCustomHtmlUserLimits();
    userLimits.begin(subjectId); // simulate an already-running generation
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel(),
      customHtmlAssistantRepository: repo(),
      customHtmlUserLimits: userLimits,
    });
    const response = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ code: "RATE_LIMITED" });
    await app.close();
  });

  it("generates, audits the full turn metadata (never content) and returns what remains for today", async () => {
    const html = "<div>hola</div>";
    const css = ".x{}";
    const usage = {
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const complete = vi.fn(async () => ({
      text: JSON.stringify({ html, css, notes: "Listo." }),
      usage,
      stopReason: "end_turn",
    }));
    const recordGeneration = vi.fn(async () => {});
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlModel: fakeModel({ complete }),
      customHtmlAssistantRepository: repo({ recordGeneration }),
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
    expect(response.json()).toEqual({
      html,
      css,
      notes: "Listo.",
      remainingToday: 19,
    });
    expect(recordGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subjectId }),
      workspaceId,
      experienceId,
      {
        htmlLength: html.length,
        cssLength: css.length,
        provider: "anthropic",
        model: "claude-sonnet-5",
        turns: 1,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        costMicroUsd: usageCostMicroUsd("claude-sonnet-5", usage),
        durationMs: expect.any(Number),
        stopReason: "end_turn",
      },
    );

    // The business name, brief and content go in the user message, never
    // the system prompt (prompt injection hardening) — see
    // buildCustomHtmlMessages in @kardo/contracts.
    const [{ system, messages }] = complete.mock.calls[0] as [
      {
        system: string;
        messages: { content: { type: string; text?: string }[] }[];
      },
    ];
    expect(system).not.toContain("Café Central");
    const userText =
      messages[0]?.content.find((block) => block.type === "text")?.text ?? "";
    expect(userText).toContain("Café Central");
    expect(userText).toContain('"Menú"');
    expect(
      messages[0]?.content.filter((block) => block.type === "image"),
    ).toEqual([]);
    await app.close();
  });
});
