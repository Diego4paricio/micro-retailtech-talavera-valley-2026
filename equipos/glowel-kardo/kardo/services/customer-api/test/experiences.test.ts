import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  ConflictError,
  ContentValidationError,
  WorkspaceAccessError,
} from "../src/errors.js";
import {
  authHeader,
  experienceId,
  touchpointId,
  verifierFor,
  versionId,
  workspaceId,
} from "./helpers.js";

const idempotencyKey = "5f6e7d8c-9b0a-4c1d-8e2f-3a4b5c6d7e8f";

const experienceSummary = {
  id: experienceId,
  touchpointId,
  name: "Menú",
  type: "menu" as const,
  content: {
    title: "Menú",
    currency: "USD",
    sections: [
      { id: "s1", name: "Entradas", items: [{ id: "i1", name: "Sopa" }] },
    ],
  },
  publicationStatus: "draft" as const,
  hasUnpublishedChanges: true,
  liveRevision: null,
  updatedAt: "2026-09-24T00:00:00.000Z",
};

describe("experience routes", () => {
  it("rejects creating an Experience for a role without experiences.edit", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new WorkspaceAccessError();
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences`,
      headers: authHeader,
      payload: {
        touchpointId,
        name: "Menú",
        type: "menu",
        content: {
          title: "Menú",
          currency: "USD",
          sections: [
            {
              id: "s1",
              name: "Entradas",
              items: [{ id: "i1", name: "Sopa" }],
            },
          ],
        },
      },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("lists Experiences with hasUnpublishedChanges/liveRevision/publicationStatus", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => [experienceSummary],
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/experiences`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      hasUnpublishedChanges: true,
      publicationStatus: "draft",
      liveRevision: null,
    });
    await app.close();
  });

  it("returns an Experience detail with translated failure reasons", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => ({
          experience: experienceSummary,
          versions: [
            {
              id: versionId,
              revision: 1,
              createdAt: "2026-09-20T00:00:00.000Z",
              content: {},
              publication: {
                id: "6a7b8c9d-0e1f-4203-8b4c-5d6e7f8a9b0c",
                revision: 1,
                status: "failed",
                createdAt: "2026-09-20T00:01:00.000Z",
                publishedAt: null,
                failureReason:
                  "El contenido no pasó la validación de publicación.",
              },
            },
          ],
        }),
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().versions[0].publication.failureReason).toBe(
      "El contenido no pasó la validación de publicación.",
    );
    await app.close();
  });

  it("returns 409 CONFLICT when an idempotency key was used in a different context", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new ConflictError(
            "CONFLICT",
            "This idempotency key was already used in a different context.",
          );
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/publication-intents`,
      headers: { ...authHeader, "idempotency-key": idempotencyKey },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("CONFLICT");
    await app.close();
  });

  it("creates a rollback publication intent to a prior version", async () => {
    const rollbackOptions: unknown[] = [];
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async (
          _identity,
          _wsId,
          expId,
          verId,
          _key,
          options,
        ) => {
          expect(expId).toBe(experienceId);
          expect(verId).toBe(versionId);
          rollbackOptions.push(options);
          return {
            versionId: verId,
            versionRevision: 3,
            publications: [
              {
                touchpointId,
                publicationId: "6a7b8c9d-0e1f-4203-8b4c-5d6e7f8a9b0c",
                revision: 4,
                status: "pending" as const,
              },
            ],
          };
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/versions/${versionId}/publication-intents`,
      headers: { ...authHeader, "idempotency-key": idempotencyKey },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      versionRevision: 3,
      publications: [{ revision: 4, status: "pending" }],
    });
    // Domain audit A9-5: a rollback takes the same replace guard as a publish.
    const guarded = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/versions/${versionId}/publication-intents`,
      headers: {
        ...authHeader,
        "idempotency-key": "7e1d2c3b-4a59-4687-9a8b-7c6d5e4f3a21",
      },
      payload: { replaceTargets: [touchpointId] },
    });
    expect(guarded.statusCode).toBe(201);
    expect(rollbackOptions).toEqual([
      undefined,
      { replaceTargets: [touchpointId] },
    ]);
    await app.close();
  });

  it("restores a version's content back into the draft", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async (_identity, _wsId, _expId, _verId) => ({
          experience: experienceSummary,
          versions: [],
        }),
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/versions/${versionId}/restore`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().experience).toMatchObject({ id: experienceId });
    await app.close();
  });

  it("enforces the sensitive rate limit on publication intents", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      rateLimit: { sensitive: { limit: 1, windowMs: 60_000 } },
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new Error("not used");
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => ({
          versionId,
          versionRevision: 1,
          publications: [
            {
              touchpointId,
              publicationId: "6a7b8c9d-0e1f-4203-8b4c-5d6e7f8a9b0c",
              revision: 1,
              status: "pending" as const,
            },
          ],
        }),
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/publication-intents`;
    const first = await app.inject({
      method: "POST",
      url,
      headers: { ...authHeader, "idempotency-key": idempotencyKey },
    });
    const second = await app.inject({
      method: "POST",
      url,
      headers: {
        ...authHeader,
        "idempotency-key": "6f7e8d9c-0b1a-4d2e-9f3a-4b5c6d7e8f90",
      },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(429);
    expect(second.json().code).toBe("RATE_LIMITED");
    await app.close();
  });

  it("replaces an Experience's targets via PUT .../targets", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async (_identity, _wsId, expId, targets) => {
          expect(expId).toBe(experienceId);
          expect(targets).toEqual({
            touchpointIds: [touchpointId],
            groupIds: [],
          });
          return { ...experienceSummary, touchpointId };
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/targets`,
      headers: authHeader,
      payload: { touchpointIds: [touchpointId], groupIds: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ touchpointId });
    await app.close();
  });

  it("returns 400 TARGETS_REQUIRED when no Touchpoint resolves from the targets", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: {
        listExperiences: async () => {
          throw new Error("not used");
        },
        getExperienceDetail: async () => {
          throw new Error("not used");
        },
        createExperience: async () => {
          throw new Error("not used");
        },
        updateExperience: async () => {
          throw new Error("not used");
        },
        setExperienceTargets: async () => {
          throw new ContentValidationError(
            "TARGETS_REQUIRED",
            "Choose at least one Touchpoint or group to publish this Experience to.",
          );
        },
        restoreExperienceVersion: async () => {
          throw new Error("not used");
        },
        createPublicationIntent: async () => {
          throw new Error("not used");
        },
        createRollbackPublicationIntent: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/targets`,
      headers: authHeader,
      payload: { touchpointIds: [], groupIds: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("TARGETS_REQUIRED");
    await app.close();
  });
});
