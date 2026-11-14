import type {
  ArchiveExperienceResult,
  CreateExperience,
  DuplicateExperience,
  ExperienceContentByType,
  ExperienceDetail,
  ExperiencePublicationState,
  ExperienceSummary,
  ExperienceTargets,
  ExperienceVersion,
  PublicationBatch,
  PublishIntentOptions,
  UpdateExperience,
} from "@kardo/contracts";
import { apiRequest, idempotencyHeaders } from "../lib/api.js";

const base = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/experiences`;

export const experiencesApi = {
  list: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ExperienceSummary[]>(base(workspaceId), { signal }),
  /** One version with its content: the detail lists most versions without
   * it (domain audit A2-30). */
  version: (
    workspaceId: string,
    experienceId: string,
    versionId: string,
    signal?: AbortSignal,
  ) =>
    apiRequest<ExperienceVersion>(
      `${base(workspaceId)}/${experienceId}/versions/${versionId}`,
      { signal },
    ),
  /** Only the publication-derived fields (no content), for polling while
   * something publishes (domain audit A2-30). */
  publicationStates: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ExperiencePublicationState[]>(
      `${base(workspaceId)}/publication-states`,
      { signal },
    ),
  listArchived: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ExperienceSummary[]>(`${base(workspaceId)}?archived=true`, {
      signal,
    }),
  get: (workspaceId: string, experienceId: string, signal?: AbortSignal) =>
    apiRequest<ExperienceDetail>(`${base(workspaceId)}/${experienceId}`, {
      signal,
    }),
  create: (workspaceId: string, body: CreateExperience) =>
    apiRequest<ExperienceSummary>(base(workspaceId), { method: "POST", body }),
  /**
   * Saves the draft. Without `content` only the name changes; with
   * `expectedDraftRevision` the server refuses (409 `EXPERIENCE_CHANGED`)
   * when someone saved in between (domain audit A2-22).
   */
  update: (workspaceId: string, experienceId: string, body: UpdateExperience) =>
    apiRequest<ExperienceSummary>(`${base(workspaceId)}/${experienceId}`, {
      method: "PATCH",
      body,
    }),
  /**
   * Freezes the current draft as an immutable version and queues it. Pass the
   * same `idempotencyKey` when retrying one publish attempt, so a request that
   * reached the server but lost its response is never published twice.
   *
   * Publishes the draft to its destinations. Without `options` it replaces
   * whatever each destination shows; with them, only `replaceTargets` are
   * taken over and any other destination showing another page is kept and
   * reported in `skipped` (round 4, B1). The publish dialog always sends
   * them.
   */
  publish: (
    workspaceId: string,
    experienceId: string,
    idempotencyKey?: string,
    options?: PublishIntentOptions,
  ) =>
    apiRequest<PublicationBatch>(
      `${base(workspaceId)}/${experienceId}/publication-intents`,
      {
        method: "POST",
        headers: idempotencyKey
          ? { "Idempotency-Key": idempotencyKey }
          : idempotencyHeaders(),
        ...(options ? { body: options } : {}),
      },
    ),
  /** Replaces where the Experience is published (Touchpoints and/or groups). */
  setTargets: (
    workspaceId: string,
    experienceId: string,
    body: ExperienceTargets,
  ) =>
    apiRequest<ExperienceSummary>(
      `${base(workspaceId)}/${experienceId}/targets`,
      {
        method: "PUT",
        body,
      },
    ),
  /** Copies an immutable version back into the editable draft. */
  restoreVersion: (
    workspaceId: string,
    experienceId: string,
    versionId: string,
  ) =>
    apiRequest<ExperienceDetail>(
      `${base(workspaceId)}/${experienceId}/versions/${versionId}/restore`,
      { method: "POST" },
    ),
  /** Rollback: publishes an existing immutable version again. */
  publishVersion: (
    workspaceId: string,
    experienceId: string,
    versionId: string,
    options?: PublishIntentOptions,
  ) =>
    apiRequest<PublicationBatch>(
      `${base(workspaceId)}/${experienceId}/versions/${versionId}/publication-intents`,
      {
        method: "POST",
        headers: idempotencyHeaders(),
        ...(options ? { body: options } : {}),
      },
    ),
  /**
   * Hides the Experience from the workspace. Touchpoints still serving it
   * fall back to their group's Experience; refused with `EXPERIENCE_LIVE`
   * when a Touchpoint would be left with nothing to fall back to.
   */
  archive: (workspaceId: string, experienceId: string) =>
    apiRequest<ArchiveExperienceResult>(
      `${base(workspaceId)}/${experienceId}/archive`,
      { method: "POST" },
    ),
  unarchive: (workspaceId: string, experienceId: string) =>
    apiRequest<ExperienceSummary>(
      `${base(workspaceId)}/${experienceId}/unarchive`,
      { method: "POST" },
    ),
  /** Copies the draft, unpublished and without destinations (the copy is born
   * with no QR, tag or link), under a new Experience. */
  duplicate: (
    workspaceId: string,
    experienceId: string,
    body: DuplicateExperience = {},
  ) =>
    apiRequest<ExperienceSummary>(
      `${base(workspaceId)}/${experienceId}/duplicate`,
      { method: "POST", body },
    ),
  extractFromImage: (
    workspaceId: string,
    body: {
      type: "menu" | "catalog";
      imageBase64: string;
      mimeType: string;
    },
  ) =>
    apiRequest<
      | { type: "menu"; content: ExperienceContentByType["menu"] }
      | { type: "catalog"; content: ExperienceContentByType["catalog"] }
    >(`${base(workspaceId)}/extract-from-image`, {
      method: "POST",
      body,
    }),
};
