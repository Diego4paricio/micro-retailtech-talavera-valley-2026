import { randomUUID } from "node:crypto";
import {
  ApiErrorSchema,
  buildDesignConceptsMessages,
  buildDesignMessages,
  DesignAiSessionEnvelopeSchema,
  DesignAiUsageSchema,
  type DesignableExperienceType,
  type DesignConcepts,
  type DesignConceptsEvent,
  type DesignConceptsRequest,
  DesignConceptsRequestSchema,
  DesignConceptsSchema,
  type DesignGeneration,
  type DesignGenerationEvent,
  type DesignGenerationRequest,
  DesignGenerationRequestSchema,
  DesignGenerationSchema,
  type DesignPromptContent,
  designableExperienceTypes,
  designHtmlBlocks,
  type ExperienceContent,
  type ExperienceContentByType,
  type ExperienceType,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { collectCustomHtmlPromptImages } from "../custom-html/images.js";
import {
  loadOrganizationProfile,
  organizationImageRefs,
  organizationPromptInput,
} from "../custom-html/organization.js";
import {
  cancelDesignAiJob,
  trackDesignAiJob,
} from "../design-ai/design-ai-jobs.js";
import { runDesignConcepts } from "../design-ai/design-concepts.js";
import { runDesignReview } from "../design-ai/design-generate.js";
import {
  ContentValidationError,
  UnavailableError,
  WorkspaceAccessError,
} from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceExperienceParams,
  type WorkspaceParams,
  workspaceExperienceParamsSchema,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";
import type { DesignAiSessionUpdate } from "../repositories/custom-html.js";

import {
  bestEffort,
  errorCodeOf,
  generationSpend,
  sessionProgressWriter,
  startAiGeneration,
  streamGeneration,
  wantsNdjsonStream,
} from "./ai-generation.js";

// ---------------------------------------------------------------------------
// Kardo's AI for the Estudio's block designs (ADR 018, addenda 3 to 5): a
// whole design, ideas first, what is left of the AI and the Experience's AI
// session. Its own module since the domain audit of 2026-10-13 (A2-36): it
// is not the modo HTML, and a plan without modo HTML keeps it.
// ---------------------------------------------------------------------------

/** What the layout review needs from the content (relevo 29): the texts
 * the bound title blocks draw. */
function boundTextsFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): {
  title?: string;
  titleDescription?: string;
  displayName?: string;
  hasAvatar?: boolean;
} {
  const c = content as {
    title?: string;
    description?: string;
    displayName?: string;
    avatarAssetId?: string;
  };
  if (type === "profile" || type === "linkpage")
    return {
      ...(c.displayName ? { displayName: c.displayName } : {}),
      hasAvatar: Boolean(c.avatarAssetId),
    };
  if (type === "image") return {};
  return {
    ...(c.title ? { title: c.title } : {}),
    ...(c.description ? { titleDescription: c.description } : {}),
  };
}

/** Every Experience type the Estudio can design (ADR 018 addendum 3). */
function isDesignable(type: ExperienceType): type is DesignableExperienceType {
  return (designableExperienceTypes as readonly string[]).includes(type);
}

/** The AI-in-blocks counterpart of `promptContentFor`, covering all eight
 * designable types instead of only modo HTML's three: a summary of the
 * Experience's real content, never the whole thing (a Menú's dishes stay
 * dishes; the AI only needs their count to choose a sensible layout). */
function designPromptContentFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): DesignPromptContent {
  switch (type) {
    case "links": {
      const c = content as ExperienceContentByType["links"];
      return {
        title: c.title,
        ...(c.description ? { description: c.description } : {}),
        links: c.links.map((link) => ({ label: link.label })),
      };
    }
    case "profile": {
      const c = content as ExperienceContentByType["profile"];
      return {
        displayName: c.displayName,
        ...(c.headline !== undefined ? { headline: c.headline } : {}),
        links: c.links.map((link) => ({ label: link.label })),
      };
    }
    case "linkpage": {
      const c = content as ExperienceContentByType["linkpage"];
      return {
        displayName: c.displayName,
        links: c.links.map((link) => ({ label: link.label })),
        socials: c.socials.map((social) => ({ network: social.network })),
      };
    }
    case "menu": {
      const c = content as ExperienceContentByType["menu"];
      return {
        title: c.title,
        ...(c.description ? { description: c.description } : {}),
        menuSections: c.sections.map((section) => ({
          id: section.id,
          name: section.name,
          itemCount: section.items.length,
          photoCount: section.items.filter((item) => item.imageAssetId).length,
        })),
        featurableItems: featurableItemsFor(type, content) ?? [],
      };
    }
    case "catalog": {
      const c = content as ExperienceContentByType["catalog"];
      return {
        title: c.title,
        ...(c.description ? { description: c.description } : {}),
        catalogItemCount: c.items.length,
        catalogPhotoCount: c.items.filter((item) => item.imageAssetId).length,
        featurableItems: featurableItemsFor(type, content) ?? [],
      };
    }
    case "form": {
      const c = content as ExperienceContentByType["form"];
      return {
        title: c.title,
        ...(c.description ? { description: c.description } : {}),
      };
    }
    case "document": {
      const c = content as ExperienceContentByType["document"];
      return {
        documentTitle: c.title,
        documentPageCount: c.pages?.length ?? 0,
        documentDisplay: c.display ?? "download",
      };
    }
    case "image": {
      const c = content as ExperienceContentByType["image"];
      return { imageAlt: c.alt };
    }
  }
}

/** Ids a design must never reuse (links and socials, the only content item
 * lists any designable type keeps) — the exact same rule
 * `validation/experience-content.ts` applies when the design is later saved,
 * so a design the AI drafts here never fails that check for an id reason. */
function contentItemIdsFor(content: ExperienceContent): string[] {
  const value = content as {
    links?: readonly { id: string }[];
    socials?: readonly { id: string }[];
  };
  return [
    ...(value.links ?? []).map((link) => link.id),
    ...(value.socials ?? []).map((social) => social.id),
  ];
}

/** Dishes or products without a photo (Menú, Catálogo): where the AI may
 * put a photo the owner gave it (2026-10-03). */
function itemsWithoutPhotoFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): string[] {
  if (type === "menu")
    return (content as ExperienceContentByType["menu"]).sections.flatMap(
      (section) =>
        section.items
          .filter((item) => !item.imageAssetId)
          .map((item) => item.id),
    );
  if (type === "catalog")
    return (content as ExperienceContentByType["catalog"]).items
      .filter((item) => !item.imageAssetId)
      .map((item) => item.id);
  return [];
}

/** The real Menú section ids, when designing a Menú, so `checkDesign` can
 * catch a `menu` block naming a section that does not exist. */
function menuSectionIdsFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): readonly string[] | undefined {
  if (type !== "menu") return undefined;
  return (content as ExperienceContentByType["menu"]).sections.map(
    (section) => section.id,
  );
}

/** The real dish/product ids a Menú or a Catálogo may name in a
 * `featuredItems` block (motor de 3 bloques, 2026-10-03), so `checkDesign`
 * can catch one naming an id the content does not have. */
function featurableItemIdsFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): readonly string[] | undefined {
  if (type === "menu")
    return (content as ExperienceContentByType["menu"]).sections.flatMap(
      (section) => section.items.map((item) => item.id),
    );
  if (type === "catalog")
    return (content as ExperienceContentByType["catalog"]).items.map(
      (item) => item.id,
    );
  return undefined;
}

/** The real dishes/products a Menú or a Catálogo may highlight in a
 * `featuredItems` block, for the prompt's own `featurableItems` field (up to
 * 40, mirrors `contentSection`'s own cap in `@kardo/contracts`). */
function featurableItemsFor(
  type: DesignableExperienceType,
  content: ExperienceContent,
): DesignPromptContent["featurableItems"] {
  if (type === "menu") {
    const c = content as ExperienceContentByType["menu"];
    return c.sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.id,
        name: item.name,
        section: section.name,
        hasPhoto: Boolean(item.imageAssetId),
      })),
    );
  }
  if (type === "catalog") {
    const c = content as ExperienceContentByType["catalog"];
    return c.items.map((item) => ({
      id: item.id,
      name: item.name,
      hasPhoto: Boolean(item.imageAssetId),
    }));
  }
  return undefined;
}

export function registerDesignAiRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  // ---------------------------------------------------------------------
  // AI in blocks, full page (ADR 018 addendum 3, 2026-09-30): drafts a
  // complete `PageDesign` for the Experience's own type, bound to its real
  // content. Same protections as modo HTML above (one shared daily budget,
  // organization quota and per-user limits: every kind of Kardo AI
  // generation draws from the same pools). Base permission is
  // `experiences.edit` (any editor may ask the AI to design in blocks); an
  // `html` block the model drafts anyway is kept only when the caller also
  // has `experiences.custom_html` (owner, admin) — otherwise it is dropped
  // before the design is validated, never handed back.
  // ---------------------------------------------------------------------
  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/design/generations",
    {
      schema: {
        tags: ["experiences"],
        summary: "Ask Kardo's own AI to draft this Experience's block design",
        params: workspaceExperienceParamsSchema,
        body: DesignGenerationRequestSchema,
        response: {
          200: DesignGenerationSchema,
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
          "Kardo's AI design generator is not configured.",
        );
      }

      const params = request.params as WorkspaceExperienceParams;
      const body = request.body as DesignGenerationRequest;

      const draft =
        await deps.customHtmlAssistantRepository.loadContentForDesignGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
        );
      if (!isDesignable(draft.type)) {
        throw new ContentValidationError(
          "INVALID_EXPERIENCE_CONTENT",
          "This type of Experience cannot be designed in the Estudio yet.",
        );
      }
      const type = draft.type;
      const promptContent = designPromptContentFor(type, draft.content);
      const contentItemIds = contentItemIdsFor(draft.content);
      const menuSectionIds = menuSectionIdsFor(type, draft.content);
      const featurableItemIds = featurableItemIdsFor(type, draft.content);

      let allowHtmlBlocks = false;
      try {
        await deps.customHtmlAssistantRepository.requireCustomHtmlBlockPermission(
          identity,
          params.workspaceId,
        );
        allowHtmlBlocks = true;
      } catch (error) {
        if (!(error instanceof WorkspaceAccessError)) throw error;
      }

      const { releaseUserSlot, remainingToday } = await startAiGeneration(
        deps,
        identity,
        params.workspaceId,
        { kind: "design", reserve: true },
      );

      const model = deps.customHtmlModel;
      const controller = new AbortController();
      const spend = generationSpend(deps, identity, params, "design");
      // Keeps running when the browser goes away (2026-10-03): only
      // Cancelar (DELETE …/design/ai-session) aborts it, and its result
      // waits in the Experience's AI session.
      const jobId = randomUUID();
      const untrack = trackDesignAiJob(
        params.workspaceId,
        params.experienceId,
        jobId,
        controller,
      );
      const sessions = deps.customHtmlAssistantRepository;
      await bestEffort(() =>
        sessions.startDesignAiSession(
          identity,
          params.workspaceId,
          params.experienceId,
          {
            jobId,
            step: "design",
            brief: body.brief,
            photos: body.photos ?? "auto",
            refineCurrent: body.current !== undefined,
            concept: body.concept,
          },
        ),
      );
      const session = (update: DesignAiSessionUpdate) =>
        bestEffort(() =>
          sessions.updateDesignAiSession(
            identity,
            params.workspaceId,
            params.experienceId,
            jobId,
            update,
          ),
        );
      const saveProgress = sessionProgressWriter((progress) =>
        session({ kind: "progress", progress }),
      );

      async function generate(
        onProgress?: (event: DesignGenerationEvent) => void,
      ) {
        try {
          const generation = await draftDesign(onProgress);
          await session({ kind: "generation", generation });
          return generation;
        } catch (error) {
          await session({ kind: "failed", errorCode: errorCodeOf(error) });
          throw error;
        }
      }

      async function draftDesign(
        onProgress?: (event: DesignGenerationEvent) => void,
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
        const allowedImageRefs = new Set(images.map((image) => image.ref));

        const { system, user } = buildDesignMessages({
          type,
          businessName: draft.businessName,
          brief: body.brief,
          images: organization.images,
          organization: organization.organization,
          content: promptContent,
          contentItemIds,
          ...(body.current !== undefined ? { current: body.current } : {}),
          ...(body.concept !== undefined ? { concept: body.concept } : {}),
          ...(body.photos !== undefined ? { photos: body.photos } : {}),
        });

        const review = await runDesignReview({
          model,
          type,
          system,
          userMessage: user,
          images: images.map((image) => ({
            mediaType: image.mediaType,
            base64: image.base64,
          })),
          contentItemIds,
          ...(menuSectionIds || featurableItemIds
            ? {
                checkContext: {
                  ...(menuSectionIds ? { menuSectionIds } : {}),
                  ...(featurableItemIds ? { featurableItemIds } : {}),
                },
              }
            : {}),
          allowedImageRefs,
          itemPhotoTargets: {
            itemIds: new Set(itemsWithoutPhotoFor(type, draft.content)),
            // The owner's photos for this page: never the logo or the cover.
            imageRefs: new Set(
              images
                .map((image) => image.ref)
                .filter(
                  (ref) =>
                    ref !== profile?.logoAssetId &&
                    ref !== profile?.coverAssetId,
                ),
            ),
          },
          allowHtmlBlocks,
          whatsappUrl: organization.organization.whatsappUrl,
          layout: {
            ...boundTextsFor(type, draft.content),
            ...(body.photos !== undefined ? { photos: body.photos } : {}),
            ...(profile?.logoAssetId ? { logoRef: profile.logoAssetId } : {}),
          },
          signal: controller.signal,
          onProgress: (progress) => {
            saveProgress(progress);
            onProgress?.({
              type: "progress",
              stage: progress.stage,
              turn: progress.turn,
              maxTurns: progress.maxTurns,
            });
          },
          onSpend: (costMicroUsd) => spend.add(costMicroUsd),
        });

        await deps.customHtmlAssistantRepository.recordDesignGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
          {
            sectionsCount: review.design.sections.length,
            blocksCount: review.design.sections.reduce(
              (sum, section) =>
                sum +
                ("items" in section
                  ? section.items.length
                  : section.columns.reduce((n, col) => n + col.length, 0)),
              0,
            ),
            hasCanvas: review.design.schema === 2,
            hasHtmlBlocks: designHtmlBlocks(review.design).length > 0,
            layoutFixes: review.layoutFixes.length,
            photos: body.photos ?? "auto",
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

        return {
          design: review.design,
          notes: review.notes,
          ...(review.itemPhotos.length > 0
            ? { itemPhotos: review.itemPhotos }
            : {}),
        };
      }

      if (wantsNdjsonStream(request)) {
        return streamGeneration<Omit<DesignGeneration, "remainingToday">>({
          reply,
          remainingToday,
          releaseDailyReservation: () => spend.settleFailure(),
          releaseUserSlot,
          onClose: untrack,
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
        untrack();
      }
    },
  );

  // ---------------------------------------------------------------------
  // "3 ideas, then 1 design" (2026-10-03): the AI proposes design ideas
  // before designing. Same permission as a design (`experiences.edit`) and
  // the same plan checks, but no generation is taken: only the design made
  // from the chosen idea takes one. The ideas' cost is audited under the
  // design action (`stage: "concepts"`), so the month's dollar cap counts
  // it. Same system prompt as the design itself, which then reads this
  // request's cache.
  // ---------------------------------------------------------------------
  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/design/concepts",
    {
      schema: {
        tags: ["experiences"],
        summary: "Ask Kardo's own AI for design ideas before designing",
        params: workspaceExperienceParamsSchema,
        body: DesignConceptsRequestSchema,
        response: {
          200: DesignConceptsSchema,
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
          "Kardo's AI design generator is not configured.",
        );
      }

      const params = request.params as WorkspaceExperienceParams;
      const body = request.body as DesignConceptsRequest;

      const draft =
        await deps.customHtmlAssistantRepository.loadContentForDesignGeneration(
          identity,
          params.workspaceId,
          params.experienceId,
        );
      if (!isDesignable(draft.type)) {
        throw new ContentValidationError(
          "INVALID_EXPERIENCE_CONTENT",
          "This type of Experience cannot be designed in the Estudio yet.",
        );
      }
      const type = draft.type;

      const { releaseUserSlot, remainingToday } = await startAiGeneration(
        deps,
        identity,
        params.workspaceId,
        { kind: "design", reserve: false },
      );

      const model = deps.customHtmlModel;
      const controller = new AbortController();
      let spentMicroUsd = 0;
      // Keeps running when the browser goes away (2026-10-03), like a
      // design: the ideas wait in the Experience's AI session.
      const jobId = randomUUID();
      const untrack = trackDesignAiJob(
        params.workspaceId,
        params.experienceId,
        jobId,
        controller,
      );
      const sessions = deps.customHtmlAssistantRepository;
      await bestEffort(() =>
        sessions.startDesignAiSession(
          identity,
          params.workspaceId,
          params.experienceId,
          {
            jobId,
            step: "ideas",
            brief: body.brief,
            photos: body.photos ?? "auto",
            refineCurrent: false,
          },
        ),
      );
      const session = (update: DesignAiSessionUpdate) =>
        bestEffort(() =>
          sessions.updateDesignAiSession(
            identity,
            params.workspaceId,
            params.experienceId,
            jobId,
            update,
          ),
        );
      const saveProgress = sessionProgressWriter((progress) =>
        session({ kind: "progress", progress }),
      );

      async function generate(
        onProgress?: (event: DesignConceptsEvent) => void,
      ): Promise<DesignConcepts> {
        try {
          const drafted = await draftIdeas(onProgress);
          // "Sin fotos": an idea never opens with a photo (relevo 29).
          const ideas =
            body.photos === "without"
              ? {
                  concepts: drafted.concepts.map((concept) =>
                    concept.cover === "type"
                      ? concept
                      : { ...concept, cover: "type" as const },
                  ),
                }
              : drafted;
          await session({ kind: "concepts", concepts: ideas.concepts });
          return ideas;
        } catch (error) {
          await session({ kind: "failed", errorCode: errorCodeOf(error) });
          throw error;
        }
      }

      async function draftIdeas(
        onProgress?: (event: DesignConceptsEvent) => void,
      ): Promise<DesignConcepts> {
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
        const { system, user } = buildDesignConceptsMessages({
          type,
          businessName: draft.businessName,
          brief: body.brief,
          images: organization.images,
          organization: organization.organization,
          content: designPromptContentFor(type, draft.content),
          contentItemIds: contentItemIdsFor(draft.content),
          ...(body.photos !== undefined ? { photos: body.photos } : {}),
        });
        const result = await runDesignConcepts({
          model,
          system,
          userMessage: user,
          images: images.map((image) => ({
            mediaType: image.mediaType,
            base64: image.base64,
          })),
          signal: controller.signal,
          onProgress: (progress) => {
            saveProgress(progress);
            onProgress?.({
              type: "progress",
              stage: progress.stage,
              turn: progress.turn,
              maxTurns: progress.maxTurns,
            });
          },
          onSpend: (costMicroUsd) => {
            spentMicroUsd += Math.max(0, costMicroUsd);
            return deps.customHtmlBudget.recordSpend(costMicroUsd);
          },
        });
        await deps.customHtmlAssistantRepository.recordDesignConcepts(
          identity,
          params.workspaceId,
          params.experienceId,
          {
            stage: "concepts",
            conceptsCount: result.concepts.length,
            ...result.audit,
          },
        );
        return { concepts: result.concepts };
      }

      /** Ideas that failed after spending are audited as a failed design,
       * so the month's dollar cap still counts them; no generation to give
       * back. */
      const settleFailure = async () => {
        if (spentMicroUsd <= 0) return;
        try {
          await deps.customHtmlAssistantRepository.recordFailedGeneration(
            identity,
            params.workspaceId,
            params.experienceId,
            { kind: "design", costMicroUsd: spentMicroUsd },
          );
        } catch {
          // Best effort: the original failure is what the customer sees.
        }
      };

      if (wantsNdjsonStream(request)) {
        return streamGeneration<DesignConcepts>({
          reply,
          remainingToday,
          releaseDailyReservation: settleFailure,
          releaseUserSlot,
          onClose: untrack,
          generate,
        });
      }

      try {
        return await generate();
      } catch (error) {
        await settleFailure();
        throw error;
      } finally {
        releaseUserSlot();
        untrack();
      }
    },
  );

  // ---------------------------------------------------------------------
  // What is left of the organization's Kardo AI (2026-10-03): the Estudio
  // shows it before generating. Any member may read it.
  // ---------------------------------------------------------------------
  app.get(
    "/v1/workspaces/:workspaceId/design/ai-usage",
    {
      schema: {
        tags: ["experiences"],
        summary: "Kardo AI generations left today and this month",
        params: workspaceParamsSchema,
        response: {
          200: DesignAiUsageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const usage = await deps.customHtmlLimiter.usage(
        identity,
        params.workspaceId,
      );
      // One counter for every AI surface (domain audit A2-37): the
      // organization's day and month, and this person's hour.
      const { running, ...hour } = deps.customHtmlUserLimits.peek(
        identity.subject,
      );
      return { ...usage, hour, running };
    },
  );

  // ---------------------------------------------------------------------
  // The Experience's last AI session (2026-10-03, owner's decision): what a
  // generation left (ideas or a design), or that it is still running, so
  // the Estudio shows it again after a reload. DELETE is Cancelar and
  // "empezar de nuevo": it stops the running job (when it runs in this
  // instance) and clears the session; `keep=ideas` goes back to the ideas
  // instead when there are some.
  // ---------------------------------------------------------------------
  app.get(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/design/ai-session",
    {
      schema: {
        tags: ["experiences"],
        summary: "Read the Experience's last Kardo AI session",
        params: workspaceExperienceParamsSchema,
        response: {
          200: DesignAiSessionEnvelopeSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      const session =
        await deps.customHtmlAssistantRepository.readDesignAiSession(
          identity,
          params.workspaceId,
          params.experienceId,
        );
      return { session };
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/design/ai-session",
    {
      schema: {
        tags: ["experiences"],
        summary: "Cancel or clear the Experience's Kardo AI session",
        params: workspaceExperienceParamsSchema,
        querystring: {
          type: "object",
          properties: { keep: { type: "string", enum: ["ideas"] } },
          additionalProperties: false,
        },
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      const query = request.query as { keep?: "ideas" };
      // Permission and ownership first: `clearDesignAiSession` throws
      // NotFound unless the Experience belongs to this workspace, so the
      // cancel below is never reached for another organization's Experience
      // (security review 2026-10-12). The cancel is also keyed by workspace.
      await deps.customHtmlAssistantRepository.clearDesignAiSession(
        identity,
        params.workspaceId,
        params.experienceId,
        { keepIdeas: query.keep === "ideas" },
      );
      cancelDesignAiJob(params.workspaceId, params.experienceId);
      return reply.code(204).send();
    },
  );
}
