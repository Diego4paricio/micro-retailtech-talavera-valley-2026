import {
  ApiErrorSchema,
  ArchiveExperienceResultSchema,
  type CreateExperience,
  CreateExperienceSchema,
  type DuplicateExperience,
  DuplicateExperienceSchema,
  ExperienceDetailSchema,
  ExperienceListSchema,
  ExperiencePublicationStateListSchema,
  ExperienceSchema,
  type ExperienceTargets,
  ExperienceTargetsSchema,
  ExperienceVersionSchema,
  PublicationBatchSchema,
  type PublishIntentOptions,
  type UpdateExperience,
  UpdateExperienceSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import {
  type ExtractableExperienceType,
  extractExperienceFromImage,
} from "../design-ai/extract-from-image.js";
import { ContentValidationError, UnavailableError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import { stripNestedSchemaIds } from "../http/schema-utils.js";
import {
  idempotencyHeadersSchema,
  type WorkspaceExperienceParams,
  type WorkspaceExperienceVersionParams,
  type WorkspaceParams,
  workspaceExperienceParamsSchema,
  workspaceExperienceVersionParamsSchema,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

// `@kardo/contracts` nests the same `$id`-bearing `ExperienceTargetsSchema`
// inside `Type.Optional(...)` at several call sites (once per Experience
// type variant, plus the summary/detail shapes); TypeBox's `Type.Optional`
// clones its argument, so each of those ends up as a distinct object that
// still claims the same `$id` — which makes Fastify refuse to boot this
// route ("reference 'ExperienceTargets' resolves to more than one schema").
// See `stripNestedSchemaIds` for the full explanation of this workaround.
const SafeCreateExperienceSchema = stripNestedSchemaIds(CreateExperienceSchema);
const SafeExperienceSchema = stripNestedSchemaIds(ExperienceSchema);
const SafeExperienceListSchema = stripNestedSchemaIds(ExperienceListSchema);
const SafeExperienceDetailSchema = stripNestedSchemaIds(ExperienceDetailSchema);
const SafeExperienceVersionSchema = stripNestedSchemaIds(
  ExperienceVersionSchema,
);

/**
 * Opt-in replace guard (round 4, B1; rollback too since the domain audit,
 * A9-5): NO body keeps the old behavior (replace every target); any JSON
 * body means "only replace the listed Touchpoints; keep the rest that show
 * another page". No body schema is declared so callers that publish without
 * a body still work.
 */
function publishOptionsFrom(raw: unknown): PublishIntentOptions | undefined {
  const body = raw as { replaceTargets?: unknown } | null | undefined;
  if (body == null) return undefined;
  return {
    replaceTargets: Array.isArray(body.replaceTargets)
      ? body.replaceTargets.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export function registerExperienceRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/experiences",
    {
      schema: {
        tags: ["experiences"],
        summary: "List Experiences in a customer workspace",
        params: workspaceParamsSchema,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { archived: { type: "boolean" } },
        },
        response: {
          200: SafeExperienceListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const query = request.query as { archived?: boolean };
      return deps.experienceRepository.listExperiences(
        identity,
        params.workspaceId,
        { archived: query.archived === true },
      );
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/experiences/:experienceId",
    {
      schema: {
        tags: ["experiences"],
        summary: "Read an Experience with its version and publication history",
        params: workspaceExperienceParamsSchema,
        response: {
          200: SafeExperienceDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      return deps.experienceRepository.getExperienceDetail(
        identity,
        params.workspaceId,
        params.experienceId,
      );
    },
  );

  // Domain audit A2-30: one version with its content, for Historial (the
  // detail lists most versions without it).
  app.get(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/versions/:versionId",
    {
      schema: {
        tags: ["experiences"],
        summary: "One version of an Experience, with its content",
        params: workspaceExperienceVersionParamsSchema,
        response: {
          200: SafeExperienceVersionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceVersionParams;
      return deps.experienceRepository.getExperienceVersion(
        identity,
        params.workspaceId,
        params.experienceId,
        params.versionId,
      );
    },
  );

  // Domain audit A2-30: while something publishes, the panel polls only
  // these fields instead of every page's whole design.
  app.get(
    "/v1/workspaces/:workspaceId/experiences/publication-states",
    {
      schema: {
        tags: ["experiences"],
        summary: "Publication state of each active Experience (no content)",
        params: workspaceParamsSchema,
        response: {
          200: ExperiencePublicationStateListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.experienceRepository.listPublicationStates(
        identity,
        params.workspaceId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences",
    {
      schema: {
        tags: ["experiences"],
        summary: "Create a bounded Experience draft",
        params: workspaceParamsSchema,
        body: SafeCreateExperienceSchema,
        response: {
          201: SafeExperienceSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const experience = await deps.experienceRepository.createExperience(
        identity,
        params.workspaceId,
        request.body as CreateExperience,
      );
      return reply.code(201).send(experience);
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/experiences/:experienceId",
    {
      schema: {
        tags: ["experiences"],
        summary: "Update an Experience draft's name and content",
        params: workspaceExperienceParamsSchema,
        body: UpdateExperienceSchema,
        response: {
          200: SafeExperienceSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      return deps.experienceRepository.updateExperience(
        identity,
        params.workspaceId,
        params.experienceId,
        request.body as UpdateExperience,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/targets",
    {
      schema: {
        tags: ["experiences"],
        summary:
          "Replace where an Experience is published (Touchpoints and/or Groups)",
        params: workspaceExperienceParamsSchema,
        body: ExperienceTargetsSchema,
        response: {
          200: SafeExperienceSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      const experience = await deps.experienceRepository.setExperienceTargets(
        identity,
        params.workspaceId,
        params.experienceId,
        request.body as ExperienceTargets,
      );
      // Touchpoints dropped from the targets may have fallen back to their
      // group's Experience.
      deps.publisherKick();
      return experience;
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/archive",
    {
      schema: {
        tags: ["experiences"],
        summary:
          "Archive an Experience; live Touchpoints fall back to their group Experience",
        params: workspaceExperienceParamsSchema,
        response: {
          200: ArchiveExperienceResultSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      const result = await deps.experienceRepository.archiveExperience(
        identity,
        params.workspaceId,
        params.experienceId,
      );
      if (result.fallbackPublications > 0) deps.publisherKick();
      return result;
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/unarchive",
    {
      schema: {
        tags: ["experiences"],
        summary: "Restore an archived Experience",
        params: workspaceExperienceParamsSchema,
        response: {
          200: SafeExperienceSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      return deps.experienceRepository.unarchiveExperience(
        identity,
        params.workspaceId,
        params.experienceId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/duplicate",
    {
      schema: {
        tags: ["experiences"],
        summary: "Duplicate an Experience's draft and targets (unpublished)",
        params: workspaceExperienceParamsSchema,
        body: DuplicateExperienceSchema,
        response: {
          201: SafeExperienceSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceParams;
      const body = (request.body ?? {}) as DuplicateExperience;
      const experience = await deps.experienceRepository.duplicateExperience(
        identity,
        params.workspaceId,
        params.experienceId,
        body.name,
      );
      return reply.code(201).send(experience);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/versions/:versionId/restore",
    {
      schema: {
        tags: ["experiences"],
        summary: "Restore an immutable version's content back into the draft",
        params: workspaceExperienceVersionParamsSchema,
        response: {
          200: SafeExperienceDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceExperienceVersionParams;
      return deps.experienceRepository.restoreExperienceVersion(
        identity,
        params.workspaceId,
        params.experienceId,
        params.versionId,
      );
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/versions/:versionId/publication-intents",
    {
      schema: {
        tags: ["publications"],
        summary: "Roll back a Touchpoint to a previously published version",
        params: workspaceExperienceVersionParamsSchema,
        headers: idempotencyHeadersSchema,
        response: {
          201: PublicationBatchSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceExperienceVersionParams;
      const idempotencyKey = request.headers["idempotency-key"] as string;
      const publication =
        await deps.experienceRepository.createRollbackPublicationIntent(
          identity,
          params.workspaceId,
          params.experienceId,
          params.versionId,
          idempotencyKey,
          publishOptionsFrom(request.body),
        );
      deps.publisherKick();
      return reply.code(201).send(publication);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/publication-intents",
    {
      schema: {
        tags: ["publications"],
        summary: "Prepare an immutable publication for any bounded Experience",
        params: workspaceExperienceParamsSchema,
        headers: idempotencyHeadersSchema,
        response: {
          201: PublicationBatchSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceExperienceParams;
      const publication =
        await deps.experienceRepository.createPublicationIntent(
          identity,
          params.workspaceId,
          params.experienceId,
          request.headers["idempotency-key"] as string,
          publishOptionsFrom(request.body),
        );
      deps.publisherKick();
      return reply.code(201).send(publication);
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/experiences/extract-from-image",
    {
      bodyLimit: 6 * 1024 * 1024,
      schema: {
        tags: ["experiences"],
        summary: "Extract a structured menu or catalog from a photo using Gemini",
        params: workspaceParamsSchema,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["type", "imageBase64", "mimeType"],
          properties: {
            type: { type: "string", enum: ["menu", "catalog"] },
            imageBase64: { type: "string", minLength: 32 },
            mimeType: { type: "string", minLength: 3, maxLength: 64 },
          },
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      await deps.experienceRepository.listExperiences(
        identity,
        params.workspaceId,
      );

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new UnavailableError(
          "AI_UNAVAILABLE",
          "Falta configurar GEMINI_API_KEY en el servidor.",
        );
      }

      const body = request.body as {
        type: ExtractableExperienceType;
        imageBase64: string;
        mimeType: string;
      };
      const base64 = body.imageBase64.replace(/^data:[^;]+;base64,/, "");

      try {
        return await extractExperienceFromImage({
          apiKey,
          model:
            process.env.GEMINI_SCAN_MODEL?.trim() || "gemini-3.5-flash-lite",
          imageBase64: base64,
          mimeType: body.mimeType,
          type: body.type,
        });
      } catch (error) {
        throw new ContentValidationError(
          "INVALID_EXPERIENCE_CONTENT",
          error instanceof Error
            ? error.message
            : "No se pudo leer el contenido de la imagen.",
        );
      }
    },
  );
}
