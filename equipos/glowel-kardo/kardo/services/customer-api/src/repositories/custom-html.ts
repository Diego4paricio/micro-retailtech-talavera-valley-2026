import type {
  ConceptBrief,
  DesignAiSession,
  DesignConcept,
  DesignPhotoMode,
  ExperienceContent,
  ExperienceType,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { NotFoundError } from "../errors.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

type JsonValue = Parameters<Sql["json"]>[0];

export type CustomHtmlDraft = {
  businessName: string;
  type: ExperienceType;
  content: ExperienceContent;
};

/** Backs the Kardo AI "Pídele a la IA de Kardo" endpoint, and (2026-09-30,
 * ADR 018 addendum 3) AI in blocks: reading the draft to build a prompt, and
 * recording a successful generation in the audit trail. Saving the drafted
 * HTML or design back onto the Experience still goes through
 * `ExperienceRepository.updateExperience`, same as any other draft edit —
 * nothing here ever writes the Experience's content. */
export type CustomHtmlAssistantRepository = {
  /** Loads the Experience the panel is designing, requiring the
   * `experiences.custom_html` permission (owner, admin). Used by the modo
   * HTML page generation and by a single `html` block generation, which
   * both always need that permission. */
  loadDraftForGeneration(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
  ): Promise<CustomHtmlDraft>;
  /**
   * Same read, requiring only `experiences.edit`: a full block design may or
   * may not end up with an `html` block, so the base permission to ask the
   * AI to design in blocks at all is the ordinary edit permission every
   * editor already has. Callers whose generated design turns out to include
   * an `html` block must additionally call
   * `requireCustomHtmlBlockPermission` before showing or letting the
   * customer keep that result.
   */
  loadContentForDesignGeneration(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
  ): Promise<CustomHtmlDraft>;
  /** Throws `WorkspaceAccessError` unless the caller has
   * `experiences.custom_html` (owner, admin) — the permission a design that
   * includes an `html` block always needs, on top of `experiences.edit`. */
  requireCustomHtmlBlockPermission(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<void>;
  /** Audits a successful Kardo AI generation: output sizes, and (2026-09-29)
   * which provider and model answered, how many review-loop turns it took,
   * token usage, cost and duration, and the final stop reason — never the
   * generated HTML, CSS or the customer's brief. */
  recordGeneration(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    metadata: CustomHtmlGenerationAuditMetadata,
  ): Promise<void>;
  /** Same audit trail, for a full block design generation (its own action
   * name so the audit distinguishes a whole-page design from modo HTML or a
   * single block). */
  recordDesignGeneration(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    metadata: DesignGenerationAuditMetadata,
  ): Promise<void>;
  /** Design ideas (2026-10-03): audited under the design action with
   * `stage: "concepts"`, so `ai.spend_cents_month` counts their cost; they
   * never take a generation (`custom_html_ai_usage`). */
  recordDesignConcepts(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    metadata: DesignConceptsAuditMetadata,
  ): Promise<void>;
  /** A generation that failed after spending: audited as failed with its
   * cost, under the same action, so `ai.spend_cents_month` counts it
   * (security review 2026-10, V9). */
  recordFailedGeneration(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    metadata: { kind: "custom_html" | "design"; costMicroUsd: number },
  ): Promise<void>;
  /** The Experience's last Kardo AI session (2026-10-03), or null when
   * there is none or it expired. A session still "running" with no news
   * for `DESIGN_AI_SESSION_STALE_MS` reads as failed (its instance died).
   * Needs `experiences.edit`, like generating. */
  readDesignAiSession(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
  ): Promise<DesignAiSession | null>;
  /** A generation starts: the session now belongs to `jobId`. The ideas
   * step starts a new session; the design step keeps the ideas it came
   * from. */
  startDesignAiSession(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    start: DesignAiSessionStart,
  ): Promise<void>;
  /** Progress, the result or the failure of `jobId`. Writes nothing when
   * the session no longer belongs to that job (cancelled, cleared or
   * replaced by a newer generation). Returns whether it wrote. */
  updateDesignAiSession(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    jobId: string,
    update: DesignAiSessionUpdate,
  ): Promise<boolean>;
  /** Clears the session (and lets go of its running job). With
   * `keepIdeas`, a session that has ideas goes back to them instead. */
  clearDesignAiSession(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    options: { keepIdeas: boolean },
  ): Promise<void>;
};

export type DesignAiSessionStart = {
  jobId: string;
  step: DesignAiSession["step"];
  brief: ConceptBrief;
  photos: DesignPhotoMode;
  refineCurrent: boolean;
  concept?: DesignConcept | undefined;
};

export type DesignAiSessionUpdate =
  | { kind: "progress"; progress: NonNullable<DesignAiSession["progress"]> }
  | { kind: "concepts"; concepts: DesignConcept[] }
  | {
      kind: "generation";
      generation: NonNullable<DesignAiSession["generation"]>;
    }
  | { kind: "failed"; errorCode: string };

/** How long a running session may go without news before it reads as
 * failed: longer than any real generation (3 turns), short enough that a
 * session whose instance died does not spin forever. */
export const DESIGN_AI_SESSION_STALE_MS = 10 * 60 * 1000;

export type CustomHtmlGenerationAuditMetadata = {
  htmlLength: number;
  cssLength: number;
  provider: string;
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
  durationMs: number;
  stopReason: string;
};

export type DesignGenerationAuditMetadata = {
  sectionsCount: number;
  blocksCount: number;
  hasCanvas: boolean;
  hasHtmlBlocks: boolean;
  /** How many placement fixes the layout review made (relevo 29). */
  layoutFixes?: number;
  /** The customer's photo choice. */
  photos?: DesignPhotoMode;
  provider: string;
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
  durationMs: number;
  stopReason: string;
};

export type DesignConceptsAuditMetadata = {
  stage: "concepts";
  conceptsCount: number;
  provider: string;
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
  durationMs: number;
  stopReason: string;
};

export class CustomHtmlAssistantRepositoryError extends Error {}

export function unavailableCustomHtmlAssistantRepository(): CustomHtmlAssistantRepository {
  const unavailable = () =>
    Promise.reject(
      new CustomHtmlAssistantRepositoryError(
        "Experience storage is not configured.",
      ),
    );
  return {
    loadDraftForGeneration: unavailable,
    loadContentForDesignGeneration: unavailable,
    requireCustomHtmlBlockPermission: unavailable,
    recordGeneration: unavailable,
    recordDesignGeneration: unavailable,
    recordDesignConcepts: unavailable,
    recordFailedGeneration: unavailable,
    readDesignAiSession: unavailable,
    startDesignAiSession: unavailable,
    updateDesignAiSession: unavailable,
    clearDesignAiSession: unavailable,
  };
}

type DesignAiSessionRow = {
  step: DesignAiSession["step"];
  status: DesignAiSession["status"];
  brief: unknown;
  photo_mode: DesignPhotoMode;
  refine_current: boolean;
  progress: unknown;
  concepts: unknown;
  concept: unknown;
  generation: unknown;
  error_code: string | null;
  started_at: Date;
  updated_at: Date;
};

/** A row as the API answers it. Fields that come back null are left out,
 * and a "running" session with no news for too long reads as failed. */
export function designAiSessionFromRow(
  row: DesignAiSessionRow,
  now: number = Date.now(),
): DesignAiSession {
  const stale =
    row.status === "running" &&
    now - row.updated_at.getTime() > DESIGN_AI_SESSION_STALE_MS;
  return {
    step: row.step,
    status: stale ? "failed" : row.status,
    brief: row.brief as ConceptBrief,
    photos: row.photo_mode,
    refineCurrent: row.refine_current,
    ...(row.status === "running" && !stale && row.progress
      ? { progress: row.progress as NonNullable<DesignAiSession["progress"]> }
      : {}),
    ...(row.concepts ? { concepts: row.concepts as DesignConcept[] } : {}),
    ...(row.concept ? { concept: row.concept as DesignConcept } : {}),
    ...(row.generation
      ? {
          generation: row.generation as NonNullable<
            DesignAiSession["generation"]
          >,
        }
      : {}),
    ...(stale
      ? { errorCode: "AI_INTERRUPTED" }
      : row.error_code
        ? { errorCode: row.error_code }
        : {}),
    startedAt: row.started_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function fetchDraftRow(
  tx: Sql,
  workspaceId: string,
  experienceId: string,
): Promise<CustomHtmlDraft> {
  const rows = await tx<
    { name: string; type: ExperienceType; draft_content: unknown }[]
  >`
    select w.name, e.type, e.draft_content
    from kardo_core.experiences e
    join kardo_core.workspaces w on w.id = e.workspace_id
    where e.id = ${experienceId}::uuid
      and e.workspace_id = ${workspaceId}::uuid
      and e.archived_at is null
  `;
  const row = rows[0];
  if (!row) throw new NotFoundError("Experience was not found.");
  return {
    businessName: row.name,
    type: row.type,
    content: row.draft_content as ExperienceContent,
  };
}

export function createPostgresCustomHtmlAssistantRepository(
  sql: Sql,
): CustomHtmlAssistantRepository {
  return {
    async loadDraftForGeneration(identity, workspaceId, experienceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.custom_html",
        );
        return fetchDraftRow(tx, workspaceId, experienceId);
      });
    },
    async loadContentForDesignGeneration(identity, workspaceId, experienceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        return fetchDraftRow(tx, workspaceId, experienceId);
      });
    },
    async requireCustomHtmlBlockPermission(identity, workspaceId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.custom_html",
        );
      });
    },
    async recordGeneration(identity, workspaceId, experienceId, metadata) {
      await withCustomerContext(sql, identity, async (tx) => {
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.custom_html_generated",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata,
        });
      });
    },
    async recordDesignGeneration(
      identity,
      workspaceId,
      experienceId,
      metadata,
    ) {
      await withCustomerContext(sql, identity, async (tx) => {
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.design_generated",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata,
        });
      });
    },
    async recordDesignConcepts(identity, workspaceId, experienceId, metadata) {
      await withCustomerContext(sql, identity, async (tx) => {
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.design_generated",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata,
        });
      });
    },
    async readDesignAiSession(identity, workspaceId, experienceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const rows = await tx<DesignAiSessionRow[]>`
          select step, status, brief, photo_mode, refine_current, progress,
                 concepts, concept, generation, error_code, started_at, updated_at
          from kardo_core.design_ai_sessions
          where experience_id = ${experienceId}::uuid
            and workspace_id = ${workspaceId}::uuid
            and expires_at > now()
        `;
        const row = rows[0];
        return row ? designAiSessionFromRow(row) : null;
      });
    },
    async startDesignAiSession(identity, workspaceId, experienceId, start) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        // Old sessions of this organization go away as new ones start.
        await tx`
          delete from kardo_core.design_ai_sessions
          where workspace_id = ${workspaceId}::uuid and expires_at <= now()
        `;
        const brief = tx.json(start.brief as unknown as JsonValue);
        const concept = start.concept
          ? tx.json(start.concept as unknown as JsonValue)
          : null;
        // The experience must be this organization's (the composite key
        // checks it too); the design step keeps the ideas it came from.
        await tx`
          insert into kardo_core.design_ai_sessions (
            experience_id, workspace_id, started_by, job_id, step, status,
            brief, photo_mode, refine_current, concept
          )
          select e.id, e.workspace_id, ${identity.subject}::uuid, ${start.jobId}::uuid,
                 ${start.step}, 'running', ${brief}, ${start.photos},
                 ${start.refineCurrent}, ${concept}
          from kardo_core.experiences e
          where e.id = ${experienceId}::uuid and e.workspace_id = ${workspaceId}::uuid
          on conflict (experience_id) do update set
            started_by = excluded.started_by,
            job_id = excluded.job_id,
            step = excluded.step,
            status = 'running',
            brief = excluded.brief,
            photo_mode = excluded.photo_mode,
            refine_current = excluded.refine_current,
            progress = null,
            concepts = case
              when excluded.step = 'design' and excluded.concept is not null
                then kardo_core.design_ai_sessions.concepts
              else null
            end,
            concept = excluded.concept,
            generation = null,
            error_code = null,
            started_at = now(),
            updated_at = now(),
            expires_at = now() + interval '7 days'
        `;
      });
    },
    async updateDesignAiSession(
      identity,
      workspaceId,
      experienceId,
      jobId,
      update,
    ) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const where = tx`
          where experience_id = ${experienceId}::uuid
            and workspace_id = ${workspaceId}::uuid
            and job_id = ${jobId}::uuid
        `;
        let rows: readonly unknown[];
        switch (update.kind) {
          case "progress":
            rows = await tx`
              update kardo_core.design_ai_sessions
              set progress = ${tx.json(update.progress as unknown as JsonValue)},
                  updated_at = now()
              ${where} and status = 'running'
              returning 1
            `;
            break;
          case "concepts":
            rows = await tx`
              update kardo_core.design_ai_sessions
              set status = 'ready', progress = null,
                  concepts = ${tx.json(update.concepts as unknown as JsonValue)},
                  updated_at = now()
              ${where}
              returning 1
            `;
            break;
          case "generation":
            rows = await tx`
              update kardo_core.design_ai_sessions
              set status = 'ready', progress = null,
                  generation = ${tx.json(update.generation as unknown as JsonValue)},
                  updated_at = now()
              ${where}
              returning 1
            `;
            break;
          case "failed":
            rows = await tx`
              update kardo_core.design_ai_sessions
              set status = 'failed', progress = null,
                  error_code = ${update.errorCode.slice(0, 64)},
                  updated_at = now()
              ${where}
              returning 1
            `;
            break;
        }
        return rows.length > 0;
      });
    },
    async clearDesignAiSession(identity, workspaceId, experienceId, options) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        // The Experience must belong to this workspace. Without this check
        // the two statements below simply match zero rows and the route then
        // cancels the running AI job by `experienceId` alone — so a member of
        // *any* workspace could abort another organization's in-flight
        // generation just by knowing its Experience UUID (security review
        // 2026-10-12). Fail closed with NotFound, exactly like every other
        // Experience route, before the route reaches `cancelDesignAiJob`.
        const [owned] = await tx<{ id: string }[]>`
          select id from kardo_core.experiences
          where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        if (!owned) throw new NotFoundError("Experience was not found.");
        if (options.keepIdeas) {
          const kept = await tx`
            update kardo_core.design_ai_sessions
            set job_id = null, step = 'ideas', status = 'ready',
                progress = null, concept = null, generation = null,
                error_code = null, refine_current = false, updated_at = now()
            where experience_id = ${experienceId}::uuid
              and workspace_id = ${workspaceId}::uuid
              and concepts is not null
            returning 1
          `;
          if (kept.length > 0) return;
        }
        await tx`
          delete from kardo_core.design_ai_sessions
          where experience_id = ${experienceId}::uuid
            and workspace_id = ${workspaceId}::uuid
        `;
      });
    },
    async recordFailedGeneration(identity, workspaceId, experienceId, input) {
      await withCustomerContext(sql, identity, async (tx) => {
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action:
            input.kind === "design"
              ? "experience.design_generated"
              : "experience.custom_html_generated",
          targetType: "experience",
          targetId: experienceId,
          result: "failed",
          metadata: {
            costMicroUsd: Math.max(0, Math.round(input.costMicroUsd)),
          },
        });
      });
    },
  };
}
