import { PassThrough } from "node:stream";
import {
  CUSTOM_HTML_GENERATION_STREAM,
  type CustomHtmlGenerationStage,
} from "@kardo/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AiGenerationKind } from "../custom-html/limiter.js";
import type { CustomerIdentity } from "../customer-session.js";
import { ApiError, CustomHtmlLimitError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import type { WorkspaceExperienceParams } from "../http/schemas.js";

// The machinery every Kardo AI generation route shares (streaming, spend,
// session progress and the fail-fast quota checks), split out of the modo
// HTML routes when the design AI got its own module (domain audit
// 2026-10-13, A2-36).

export function wantsNdjsonStream(request: FastifyRequest): boolean {
  return (request.headers.accept ?? "").includes(CUSTOM_HTML_GENERATION_STREAM);
}

/** Every ~15 s, keeps a proxy or load balancer from closing an otherwise
 * quiet NDJSON connection while the AI is still thinking. */
export const PING_INTERVAL_MS = 15_000;

/** Same shape as `CustomHtmlGenerationEvent`, `DesignGenerationEvent` and
 * `HtmlBlockGenerationEvent` (they are declared as separate named types in
 * `@kardo/contracts` so a client always knows which `generation` shape a
 * `result` event carries, but the plumbing below is identical for all
 * three). */
export type GenerationEvent<TGeneration> =
  | {
      type: "progress";
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }
  | { type: "ping" }
  | { type: "result"; generation: TGeneration }
  | {
      type: "error";
      error: { code: string; message: string; remainingToday?: number };
    };

export function apiErrorEvent<TGeneration>(
  error: unknown,
): GenerationEvent<TGeneration> {
  if (error instanceof ApiError) {
    return {
      type: "error",
      error: { code: error.code, message: error.message },
    };
  }
  return {
    type: "error",
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  };
}

/**
 * What one generation has spent with the provider so far. A generation
 * that fails after spending keeps its daily slot and is audited as failed
 * with its cost, so the monthly dollar cap (`ai.spend_cents_month`) counts
 * it; one that failed before spending anything gives the slot back
 * (security review 2026-10, V9).
 */
export function generationSpend(
  deps: AppDependencies,
  identity: CustomerIdentity,
  params: WorkspaceExperienceParams,
  kind: "custom_html" | "design",
) {
  let spentMicroUsd = 0;
  return {
    add(costMicroUsd: number) {
      spentMicroUsd += Math.max(0, costMicroUsd);
      return deps.customHtmlBudget.recordSpend(costMicroUsd);
    },
    async settleFailure() {
      try {
        if (spentMicroUsd > 0) {
          await deps.customHtmlAssistantRepository.recordFailedGeneration(
            identity,
            params.workspaceId,
            params.experienceId,
            { kind, costMicroUsd: spentMicroUsd },
          );
          return;
        }
        await deps.customHtmlLimiter.release(identity, params.workspaceId);
      } catch {
        // Best effort: the original failure is what the customer sees.
      }
    },
  };
}

/** Drives the NDJSON path shared by all three Kardo AI generation routes:
 * headers commit to 200 immediately (every check that could still fail
 * already ran), then progress/ping/result events are written to the
 * response as they happen. Because the status is already sent, any failure
 * from here on is reported as an `error` event on the stream itself, never
 * as an HTTP error status. */
export async function streamGeneration<TGeneration>(input: {
  reply: FastifyReply;
  remainingToday: number;
  releaseDailyReservation: () => Promise<void>;
  releaseUserSlot: () => void;
  onClose: () => void;
  generate: (
    onProgress: (event: GenerationEvent<TGeneration>) => void,
  ) => Promise<TGeneration>;
}): Promise<FastifyReply> {
  const stream = new PassThrough();
  // A design keeps running after the browser goes away (2026-10-03): the
  // response may be destroyed long before the generation ends. Writing to
  // it then must neither throw nor raise an unhandled "error" event.
  stream.on("error", () => {});
  input.reply.header("content-type", CUSTOM_HTML_GENERATION_STREAM);
  input.reply.status(200);
  input.reply.send(stream);

  function write(event: GenerationEvent<TGeneration>): void {
    if (stream.destroyed || stream.writableEnded) return;
    stream.write(`${JSON.stringify(event)}\n`);
  }

  const pingTimer = setInterval(
    () => write({ type: "ping" }),
    PING_INTERVAL_MS,
  );

  try {
    const generation = await input.generate(write);
    write({
      type: "result",
      generation: { ...generation, remainingToday: input.remainingToday },
    });
  } catch (error) {
    await input.releaseDailyReservation();
    write(apiErrorEvent(error));
  } finally {
    clearInterval(pingTimer);
    input.releaseUserSlot();
    input.onClose();
    if (!stream.destroyed) stream.end();
  }

  return input.reply;
}

/** The API error code a failed generation leaves in its session. */
export function errorCodeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : "INTERNAL_ERROR";
}

/** Writes to the Experience's AI session (2026-10-03) never decide a
 * generation: a failed write is ignored, the generation goes on. */
export async function bestEffort(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch {
    // The session is a convenience; the result still reaches the stream.
  }
}

/** Persists a running generation's stage only when it changes (a handful
 * of writes per generation). */
export function sessionProgressWriter(
  save: (progress: {
    stage: CustomHtmlGenerationStage;
    turn: number;
    maxTurns: number;
  }) => Promise<unknown>,
) {
  let last = "";
  return (progress: {
    stage: CustomHtmlGenerationStage;
    turn: number;
    maxTurns: number;
  }) => {
    const key = `${progress.stage}:${progress.turn}`;
    if (key === last) return;
    last = key;
    void bestEffort(() => save(progress));
  };
}

/**
 * The fail-fast checks every Kardo AI generation runs before calling the
 * model, in one place for the four routes (domain audit A2-36 and A2-43):
 * the global daily budget, this person's concurrency and hourly limit,
 * then the organization's daily cap and plan (`reserve` takes a generation;
 * ideas only `check`). The caller must call `releaseUserSlot` exactly once
 * when the generation ends.
 */
export async function startAiGeneration(
  deps: AppDependencies,
  identity: CustomerIdentity,
  workspaceId: string,
  options: { kind: AiGenerationKind; reserve: boolean },
): Promise<{ releaseUserSlot: () => void; remainingToday: number }> {
  await deps.customHtmlBudget.checkBeforeGeneration();
  const releaseUserSlot = deps.customHtmlUserLimits.begin(identity.subject);
  try {
    const remaining = options.reserve
      ? await deps.customHtmlLimiter.reserve(
          identity,
          workspaceId,
          options.kind,
        )
      : await deps.customHtmlLimiter.check(identity, workspaceId, options.kind);
    if (remaining === null) throw new CustomHtmlLimitError();
    return { releaseUserSlot, remainingToday: remaining };
  } catch (error) {
    releaseUserSlot();
    throw error;
  }
}
