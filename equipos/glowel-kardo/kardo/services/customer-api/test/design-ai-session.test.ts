import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  CUSTOM_HTML_GENERATION_STREAM,
  type DesignAiSession,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository } from "../src/assets.js";
import { createCustomHtmlLimiter } from "../src/custom-html/limiter.js";
import {
  CustomHtmlGenerationAbortedError,
  type CustomHtmlModel,
} from "../src/custom-html/model.js";
import { NotFoundError } from "../src/errors.js";
import {
  type CustomHtmlAssistantRepository,
  DESIGN_AI_SESSION_STALE_MS,
  type DesignAiSessionStart,
  type DesignAiSessionUpdate,
  designAiSessionFromRow,
} from "../src/repositories/custom-html.js";
import {
  authHeader,
  experienceId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// The Experience's AI session (2026-10-03, owner's decision): a design or
// the ideas keep running when the browser goes away, their result waits in
// the session, and only Cancelar (DELETE …/design/ai-session) stops them.
// ---------------------------------------------------------------------------

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const base = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design`;
const brief = {
  description: "Una cafetería con buen café.",
  colors: [],
  imageRefs: [],
  fonts: [],
};

const linksDesign = {
  schema: 1,
  style: {
    palette: {
      background: "#ffffff",
      surface: "#ffffff",
      text: "#111111",
      muted: "#555555",
      accent: "#1d4ed8",
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

const usage = {
  inputTokens: 10,
  outputTokens: 20,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** A model whose answer waits for `release()`, and that fails like the
 * real provider when its signal aborts. */
function heldModel(answer: string) {
  let release = () => {};
  let calledResolve = () => {};
  const called = new Promise<void>((resolve) => {
    calledResolve = resolve;
  });
  const signals: AbortSignal[] = [];
  const model: CustomHtmlModel = {
    provider: "anthropic",
    model: "claude-sonnet-5",
    complete: (input) =>
      new Promise((resolve, reject) => {
        if (input.signal) signals.push(input.signal);
        input.signal?.addEventListener("abort", () =>
          reject(new CustomHtmlGenerationAbortedError("aborted")),
        );
        release = () =>
          resolve({ text: answer, usage, stopReason: "end_turn" });
        calledResolve();
      }),
  };
  return { model, called, release: () => release(), signals };
}

function sessionRepo(overrides: Partial<CustomHtmlAssistantRepository> = {}) {
  const starts: DesignAiSessionStart[] = [];
  const updates: { jobId: string; update: DesignAiSessionUpdate }[] = [];
  const clears: { keepIdeas: boolean }[] = [];
  const repository = {
    loadContentForDesignGeneration: async () => ({
      businessName: "Café Central",
      type: "links",
      content: {
        title: "Café Central",
        links: [{ id: "link-1", label: "Menú", url: "https://example.com" }],
      },
    }),
    requireCustomHtmlBlockPermission: async () => {},
    recordDesignGeneration: async () => {},
    recordDesignConcepts: async () => {},
    recordFailedGeneration: async () => {},
    startDesignAiSession: async (_i, _w, _e, start) => {
      starts.push(start);
    },
    updateDesignAiSession: async (_i, _w, _e, jobId, update) => {
      updates.push({ jobId, update });
      return true;
    },
    clearDesignAiSession: async (_i, _w, _e, options) => {
      clears.push(options);
    },
    ...overrides,
  } as CustomHtmlAssistantRepository;
  return { repository, starts, updates, clears };
}

function appWith(
  model: CustomHtmlModel,
  repository: CustomHtmlAssistantRepository,
) {
  return buildCustomerApi({
    sessionVerifier: verifierFor(),
    customHtmlModel: model,
    customHtmlAssistantRepository: repository,
    customHtmlLimiter: createCustomHtmlLimiter(20),
    assetRepository: fake<AssetRepository>({}),
    assetWorker: null,
  });
}

describe("design AI session: a design", () => {
  it("records the session's start, stages and finished design", async () => {
    const { repository, starts, updates } = sessionRepo();
    const held = heldModel(
      JSON.stringify({ design: linksDesign, notes: "Listo." }),
    );
    const app = appWith(held.model, repository);
    const pending = app.inject({
      method: "POST",
      url: `${base}/generations`,
      headers: authHeader,
      payload: { brief, photos: "without" },
    });
    await held.called;
    held.release();
    const response = await pending;
    expect(response.statusCode).toBe(200);
    expect(starts).toEqual([
      expect.objectContaining({
        step: "design",
        photos: "without",
        refineCurrent: false,
      }),
    ]);
    const kinds = updates.map((entry) => entry.update.kind);
    expect(kinds).toContain("progress");
    expect(kinds.at(-1)).toBe("generation");
    // Every write belongs to the job that started the session.
    expect(new Set(updates.map((entry) => entry.jobId)).size).toBe(1);
    const last = updates.at(-1)?.update;
    expect(last?.kind === "generation" && last.generation.notes).toBe("Listo.");
    await app.close();
  });

  it("marks the session failed with the error code", async () => {
    const { repository, updates } = sessionRepo();
    const app = appWith(
      {
        provider: "anthropic",
        model: "claude-sonnet-5",
        complete: async () => ({
          text: "no es json",
          usage,
          stopReason: "end_turn",
        }),
      },
      repository,
    );
    const response = await app.inject({
      method: "POST",
      url: `${base}/generations`,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(503);
    expect(updates.at(-1)?.update).toEqual({
      kind: "failed",
      errorCode: "AI_UNAVAILABLE",
    });
    await app.close();
  });

  it("still answers when the session cannot be written", async () => {
    const { repository } = sessionRepo({
      startDesignAiSession: async () => {
        throw new Error("no table");
      },
      updateDesignAiSession: async () => {
        throw new Error("no table");
      },
    });
    const app = appWith(
      {
        provider: "anthropic",
        model: "claude-sonnet-5",
        complete: async () => ({
          text: JSON.stringify({ design: linksDesign, notes: "Listo." }),
          usage,
          stopReason: "end_turn",
        }),
      },
      repository,
    );
    const response = await app.inject({
      method: "POST",
      url: `${base}/generations`,
      headers: authHeader,
      payload: { brief },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("keeps running after the browser goes away and saves the result", async () => {
    const { repository, updates } = sessionRepo();
    const held = heldModel(
      JSON.stringify({ design: linksDesign, notes: "Listo." }),
    );
    const app = appWith(held.model, repository);
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;
    const finished = new Promise<void>((resolve) => {
      const request = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: `${base}/generations`,
          headers: {
            ...authHeader,
            "content-type": "application/json",
            accept: CUSTOM_HTML_GENERATION_STREAM,
          },
        },
        (response) => {
          // The browser reloads as soon as the stream starts.
          response.destroy();
          request.destroy();
          resolve();
        },
      );
      request.on("error", () => resolve());
      request.end(JSON.stringify({ brief }));
    });
    await held.called;
    await finished;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(held.signals[0]?.aborted).toBe(false);
    held.release();
    for (let tries = 0; tries < 50; tries += 1) {
      if (updates.at(-1)?.update.kind === "generation") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(updates.at(-1)?.update.kind).toBe("generation");
    await app.close();
  });

  it("Cancelar stops the running design and clears the session", async () => {
    const { repository, clears } = sessionRepo();
    const held = heldModel(
      JSON.stringify({ design: linksDesign, notes: "Listo." }),
    );
    const app = appWith(held.model, repository);
    const pending = app.inject({
      method: "POST",
      url: `${base}/generations`,
      headers: authHeader,
      payload: { brief },
    });
    await held.called;
    const cancel = await app.inject({
      method: "DELETE",
      url: `${base}/ai-session?keep=ideas`,
      headers: authHeader,
    });
    expect(cancel.statusCode).toBe(204);
    expect(clears).toEqual([{ keepIdeas: true }]);
    expect(held.signals[0]?.aborted).toBe(true);
    const response = await pending;
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    await app.close();
  });

  it("a cancel for an Experience of another workspace is a 404 (security review 2026-10-12)", async () => {
    // The real repository throws NotFound when the Experience does not belong
    // to the workspace; the route must surface that as 404 and never reach the
    // in-process job cancellation, so no one can abort another organization's
    // generation by knowing its Experience UUID.
    const { repository } = sessionRepo({
      clearDesignAiSession: async () => {
        throw new NotFoundError("Experience was not found.");
      },
    });
    const app = appWith(heldModel("{}").model, repository);
    const cancel = await app.inject({
      method: "DELETE",
      url: `${base}/ai-session`,
      headers: authHeader,
    });
    expect(cancel.statusCode).toBe(404);
    await app.close();
  });
});

describe("design AI session: ideas", () => {
  it("records the ideas in the session", async () => {
    const { repository, starts, updates } = sessionRepo();
    const concept = {
      name: "Café de barrio",
      direction: "artesanal",
      pitch: "Cálido.",
      palette: {
        background: "#f3eadb",
        surface: "#fbf7f0",
        text: "#3a2a1e",
        muted: "#6f5b4b",
        accent: "#8a4b2a",
      },
      fonts: { heading: "lora", body: "dm-sans" },
      radius: 12,
      buttonShape: "rounded",
      cover: "photo",
      highlights: ["Uno", "Dos"],
    };
    const app = appWith(
      {
        provider: "anthropic",
        model: "claude-sonnet-5",
        complete: async () => ({
          text: JSON.stringify({ concepts: [concept] }),
          usage,
          stopReason: "end_turn",
        }),
      },
      repository,
    );
    const response = await app.inject({
      method: "POST",
      url: `${base}/concepts`,
      headers: authHeader,
      payload: { brief, photos: "with" },
    });
    expect(response.statusCode).toBe(200);
    expect(starts[0]).toMatchObject({ step: "ideas", photos: "with" });
    const last = updates.at(-1)?.update;
    expect(last?.kind).toBe("concepts");
    expect(last?.kind === "concepts" && last.concepts[0]?.name).toBe(
      "Café de barrio",
    );
    await app.close();
  });
});

describe("design AI session: read and usage", () => {
  it("returns the session, or null", async () => {
    const session: DesignAiSession = {
      step: "ideas",
      status: "running",
      brief,
      photos: "auto",
      refineCurrent: false,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    let stored: DesignAiSession | null = session;
    const { repository } = sessionRepo({
      readDesignAiSession: async () => stored,
    });
    const app = appWith(
      fake<CustomHtmlModel>({ provider: "anthropic" }),
      repository,
    );
    const first = await app.inject({
      method: "GET",
      url: `${base}/ai-session`,
      headers: authHeader,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().session).toMatchObject({ step: "ideas" });
    stored = null;
    const second = await app.inject({
      method: "GET",
      url: `${base}/ai-session`,
      headers: authHeader,
    });
    expect(second.json()).toEqual({ session: null });
    await app.close();
  });

  it("says what is left today and this month", async () => {
    const limiter = createCustomHtmlLimiter(20);
    await limiter.reserve(fake({}), workspaceId);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      customHtmlLimiter: limiter,
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/design/ai-usage`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      enabled: true,
      day: { used: 1, limit: 20, remaining: 19 },
      spendCapReached: false,
    });
    await app.close();
  });

  it("a running session with no news reads as failed", () => {
    const now = Date.now();
    const row = {
      step: "design" as const,
      status: "running" as const,
      brief,
      photo_mode: "auto" as const,
      refine_current: false,
      progress: { stage: "generating", turn: 1, maxTurns: 3 },
      concepts: null,
      concept: null,
      generation: null,
      error_code: null,
      started_at: new Date(now - DESIGN_AI_SESSION_STALE_MS - 60_000),
      updated_at: new Date(now - DESIGN_AI_SESSION_STALE_MS - 1_000),
    };
    expect(designAiSessionFromRow(row, now)).toMatchObject({
      status: "failed",
      errorCode: "AI_INTERRUPTED",
    });
    expect(designAiSessionFromRow(row, now).progress).toBeUndefined();
    const fresh = designAiSessionFromRow(
      { ...row, updated_at: new Date(now - 1_000) },
      now,
    );
    expect(fresh).toMatchObject({
      status: "running",
      progress: { stage: "generating" },
    });
    expect(fresh).not.toHaveProperty("concepts");
  });
});
