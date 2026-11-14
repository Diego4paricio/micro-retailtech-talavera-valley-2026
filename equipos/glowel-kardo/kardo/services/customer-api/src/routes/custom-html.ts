import {
  ApiErrorSchema,
  buildCustomHtmlMessages,
  buildHtmlBlockMessages,
  type CustomHtmlGeneration,
  type CustomHtmlGenerationEvent,
  type CustomHtmlGenerationRequest,
  CustomHtmlGenerationRequestSchema,
  CustomHtmlGenerationSchema,
  type CustomHtmlPromptInput,
  type ExperienceContent,
  type ExperienceContentByType,
  type ExperienceType,
  type HtmlBlockGeneration,
  type HtmlBlockGenerationEvent,
  type HtmlBlockGenerationRequest,
  HtmlBlockGenerationRequestSchema,
  HtmlBlockGenerationSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { runCustomHtmlReview } from "../custom-html/generate.js";
import { collectCustomHtmlPromptImages } from "../custom-html/images.js";
import {
  loadOrganizationProfile,
  organizationImageRefs,
  organizationPromptInput,
} from "../custom-html/organization.js";
import { runHtmlBlockReview } from "../design-ai/design-generate.js";
import { ContentValidationError, UnavailableError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceExperienceParams,
  workspaceExperienceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

import {
  generationSpend,
  startAiGeneration,
  streamGeneration,
  wantsNdjsonStream,
} from "./ai-generation.js";

/** The only Experience types the Estudio's modo HTML applies to (ADR 018).
 * Also derives the `content` the prompt gives the AI for context. */
function promptContentFor(
  type: ExperienceType,
  content: ExperienceContent,
): CustomHtmlPromptInput["content"] {
  switch (type) {
    case "links": {
      const c = content as ExperienceContentByType["links"];
      return {
        title: c.title,
        links: c.links.map((link) => ({ label: link.label, url: link.url })),
      };
    }
    case "profile": {
      const c = content as ExperienceContentByType["profile"];
      return {
        displayName: c.displayName,
        ...(c.headline !== undefined ? { headline: c.headline } : {}),
        links: c.links.map((link) => ({ label: link.label, url: link.url })),
      };
    }
    case "linkpage": {
      const c = content as ExperienceContentByType["linkpage"];
      return {
        displayName: c.displayName,
        links: c.links.map((link) => ({ label: link.label, url: link.url })),
        socials: c.socials.map((social) => ({ network: social.network })),
      };
    }
    default:
      throw new ContentValidationError(
        "INVALID_EXPERIENCE_CONTENT",
        "This type of Experience cannot use modo HTML.",
      );
  }
}

export function registerCustomHtmlRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  // ---------------------------------------------------------------------
  // Modo HTML: "Pídele a la IA de Kardo" (unchanged from ADR 018, extended
  // 2026-09-29).
  // ---------------------------------------------------------------------
  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/custom-html/generations",
    {
      schema: {
        tags: ["experiences"],
        summary:
          "Ask Kardo's own AI to draft this Experience's modo HTML design",
        params: workspaceExperienceParamsSchema,
        body: CustomHtmlGenerationRequestSchema,
        // 403 may be PLAN_LIMIT (key, limit, usage) and 429 is
        // CUSTOM_HTML_LIMIT (remainingToday) or RATE_LIMITED: `ApiErrorSchema`
        // declares both, so serialization keeps them. A request with
        // `Accept: application/x-ndjson` instead gets a 200 NDJSON stream of
        // `CustomHtmlGenerationEvent` lines (undeclared here: Fastify skips
        // schema serialization for a piped stream payload).
        response: {
          200: CustomHtmlGenerationSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);

      if (!deps.customHtmlModel) {
        throw new UnavailableError(
          "AI_UNAVAILABLE",
          "Kardo's AI HTML generator is not configured.",
        );
      }

      const params = request.params as WorkspaceExperienceParams;
      const body = request.body as CustomHtmlGenerationRequest;

      // Every check that can fail fast runs here, before any provider call
      // and before a streaming response commits to its 200 status: session
      // and the sensitive rate limit above, the `experiences.custom_html`
      // permission (loading the draft below), the global daily USD budget,
      // this customer's own concurrency/hourly limit, and finally the
      // per-organization daily generation cap (which also carries the
      // plan's `custom_html.enabled`/`ai.generations_month` checks).
      const draft =
        await deps.customHtmlAssistantRepository.loadDraftForGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
        );
      const promptContent = promptContentFor(draft.type, draft.content);

      const { releaseUserSlot, remainingToday } = await startAiGeneration(
        deps,
        identity,
        params.workspaceId,
        { kind: "html", reserve: true },
      );

      const model = deps.customHtmlModel;
      const controller = new AbortController();
      const spend = generationSpend(deps, identity, params, "custom_html");
      const onDisconnect = () => controller.abort();
      request.raw.on("close", onDisconnect);

      async function generate(
        onProgress?: (event: CustomHtmlGenerationEvent) => void,
      ) {
        const profile = await loadOrganizationProfile(
          deps.workspaceProfileRepository,
          identity,
          params.workspaceId,
        );
        const images = await collectCustomHtmlPromptImages({
          assetRepository: deps.assetRepository,
          assetWorker: deps.assetWorker,
          identity,
          workspaceId: params.workspaceId,
          imageRefs: organizationImageRefs(profile, body.brief.imageRefs),
        });
        const organization = organizationPromptInput(profile, images);

        const { system, user } = buildCustomHtmlMessages({
          type: draft.type as CustomHtmlPromptInput["type"],
          businessName: draft.businessName,
          brief: body.brief,
          images: organization.images,
          organization: organization.organization,
          content: promptContent,
        });

        const review = await runCustomHtmlReview({
          model,
          system,
          userMessage: user,
          images: images.map((image) => ({
            mediaType: image.mediaType,
            base64: image.base64,
          })),
          signal: controller.signal,
          onProgress: onProgress
            ? (progress) =>
                onProgress({
                  type: "progress",
                  stage: progress.stage,
                  turn: progress.turn,
                  maxTurns: progress.maxTurns,
                })
            : undefined,
          onSpend: (costMicroUsd) => spend.add(costMicroUsd),
        });

        await deps.customHtmlAssistantRepository.recordGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
          {
            htmlLength: review.html.length,
            cssLength: review.css.length,
            provider: review.audit.provider,
            model: review.audit.model,
            turns: review.audit.turns,
            inputTokens: review.audit.inputTokens,
            outputTokens: review.audit.outputTokens,
            cacheReadTokens: review.audit.cacheReadTokens,
            cacheWriteTokens: review.audit.cacheWriteTokens,
            costMicroUsd: review.audit.costMicroUsd,
            durationMs: review.audit.durationMs,
            stopReason: review.audit.stopReason,
          },
        );

        return { html: review.html, css: review.css, notes: review.notes };
      }

      if (wantsNdjsonStream(request)) {
        return streamGeneration<Omit<CustomHtmlGeneration, "remainingToday">>({
          reply,
          remainingToday,
          releaseDailyReservation: () => spend.settleFailure(),
          releaseUserSlot,
          onClose: () => request.raw.off("close", onDisconnect),
          generate,
        });
      }

      try {
        const generation = await generate();
        return { ...generation, remainingToday };
      } catch (error) {
        await spend.settleFailure();
        throw error;
      } finally {
        releaseUserSlot();
        request.raw.off("close", onDisconnect);
      }
    },
  );

  // ---------------------------------------------------------------------
  // AI in blocks, one `html` block (2026-09-30): the inspector's "Pedir a
  // la IA" for the `html` block. Always needs `experiences.custom_html`
  // (same permission as modo HTML and a full design's `html` blocks), since
  // its whole output is exactly that: an `html` block's source.
  // ---------------------------------------------------------------------
  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/design/html-blocks/generations",
    {
      schema: {
        tags: ["experiences"],
        summary: "Ask Kardo's own AI to draft or improve one html block",
        params: workspaceExperienceParamsSchema,
        body: HtmlBlockGenerationRequestSchema,
        response: {
          200: HtmlBlockGenerationSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);

      if (!deps.customHtmlModel) {
        throw new UnavailableError(
          "AI_UNAVAILABLE",
          "Kardo's AI HTML generator is not configured.",
        );
      }

      const params = request.params as WorkspaceExperienceParams;
      const body = request.body as HtmlBlockGenerationRequest;

      const draft =
        await deps.customHtmlAssistantRepository.loadDraftForGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
        );

      const { releaseUserSlot, remainingToday } = await startAiGeneration(
        deps,
        identity,
        params.workspaceId,
        { kind: "html", reserve: true },
      );

      const model = deps.customHtmlModel;
      const controller = new AbortController();
      const spend = generationSpend(deps, identity, params, "custom_html");
      const onDisconnect = () => controller.abort();
      request.raw.on("close", onDisconnect);

      async function generate(
        onProgress?: (event: HtmlBlockGenerationEvent) => void,
      ) {
        const profile = await loadOrganizationProfile(
          deps.workspaceProfileRepository,
          identity,
          params.workspaceId,
        );
        const images = await collectCustomHtmlPromptImages({
          assetRepository: deps.assetRepository,
          assetWorker: deps.assetWorker,
          identity,
          workspaceId: params.workspaceId,
          imageRefs: organizationImageRefs(profile, body.brief.imageRefs),
        });
        const organization = organizationPromptInput(profile, images);

        const { system, user } = buildHtmlBlockMessages({
          businessName: draft.businessName,
          brief: body.brief,
          ...(body.instructions !== undefined
            ? { instructions: body.instructions }
            : {}),
          images: organization.images,
          organization: organization.organization,
          ...(body.current !== undefined ? { current: body.current } : {}),
        });

        const review = await runHtmlBlockReview({
          model,
          system,
          userMessage: user,
          images: images.map((image) => ({
            mediaType: image.mediaType,
            base64: image.base64,
          })),
          signal: controller.signal,
          onProgress: onProgress
            ? (progress) =>
                onProgress({
                  type: "progress",
                  stage: progress.stage,
                  turn: progress.turn,
                  maxTurns: progress.maxTurns,
                })
            : undefined,
          onSpend: (costMicroUsd) => spend.add(costMicroUsd),
        });

        await deps.customHtmlAssistantRepository.recordGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
          {
            htmlLength: review.html.length,
            cssLength: review.css.length,
            provider: review.audit.provider,
            model: review.audit.model,
            turns: review.audit.turns,
            inputTokens: review.audit.inputTokens,
            outputTokens: review.audit.outputTokens,
            cacheReadTokens: review.audit.cacheReadTokens,
            cacheWriteTokens: review.audit.cacheWriteTokens,
            costMicroUsd: review.audit.costMicroUsd,
            durationMs: review.audit.durationMs,
            stopReason: review.audit.stopReason,
          },
        );

        return { html: review.html, css: review.css, notes: review.notes };
      }

      if (wantsNdjsonStream(request)) {
        return streamGeneration<Omit<HtmlBlockGeneration, "remainingToday">>({
          reply,
          remainingToday,
          releaseDailyReservation: () => spend.settleFailure(),
          releaseUserSlot,
          onClose: () => request.raw.off("close", onDisconnect),
          generate,
        });
      }

      try {
        const generation = await generate();
        return { ...generation, remainingToday };
      } catch (error) {
        await spend.settleFailure();
        throw error;
      } finally {
        releaseUserSlot();
        request.raw.off("close", onDisconnect);
      }
    },
  );
}
