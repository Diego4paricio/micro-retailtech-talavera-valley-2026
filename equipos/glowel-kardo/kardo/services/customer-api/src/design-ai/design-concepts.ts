import { randomUUID } from "node:crypto";
import {
  DESIGN_CONCEPTS_COUNT,
  type DesignConcept,
  DesignConceptSchema,
} from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";
import type { CustomHtmlVisionImage } from "../custom-html/assistant.js";
import { extractFenced, tryParseJsonObject } from "../custom-html/assistant.js";
import type {
  CustomHtmlGenerationAudit,
  CustomHtmlReviewProgress,
} from "../custom-html/generate.js";
import type {
  CustomHtmlModel,
  CustomHtmlModelMessage,
} from "../custom-html/model.js";
import { usageCostMicroUsd } from "../custom-html/pricing.js";
import { UnavailableError } from "../errors.js";
import { isRecord } from "./design-assistant.js";
import { readableOn } from "./readable-palette.js";

// ---------------------------------------------------------------------------
// "3 ideas, then 1 design" (2026-10-03): `POST …/design/concepts`. The AI
// proposes `DESIGN_CONCEPTS_COUNT` ideas, each a direction of
// `design-directions.ts` made specific to the business; the customer picks
// one and the design request carries it. Small answer (no page yet), so at
// most two turns: the second only when the first gave no usable idea.
// ---------------------------------------------------------------------------

const MAX_TURNS = 2;
/** Three short ideas fit easily; thinking shares this budget. */
const MAX_TOKENS_PER_TURN = 8_000;

const RETRY_MESSAGE =
  'Tu respuesta anterior no trajo ideas válidas. Responde de nuevo únicamente con el objeto JSON { "concepts": [...] } siguiendo exactamente el contrato de idea del mensaje del sistema, sin texto antes ni después y sin bloques de código.';

function textMessage(
  role: "user" | "assistant",
  text: string,
): CustomHtmlModelMessage {
  return { role, content: [{ type: "text", text }] };
}

const clip = (value: unknown, max: number): unknown =>
  typeof value === "string" ? value.trim().slice(0, max) : value;

/**
 * Fixes what has one obvious meaning before validating an idea: text a bit
 * too long is cut, extra highlights dropped, and the palette is made
 * readable (same bars as a finished design: text and muted 4.5:1 on
 * background and cards, accent 3:1 on cards). A photo cover without photos
 * is fine: the design leaves a photo space the owner fills later.
 */
export function normalizeConcept(raw: unknown): DesignConcept | undefined {
  if (!isRecord(raw)) return undefined;
  const draft: Record<string, unknown> = {
    ...raw,
    name: clip(raw.name, 40),
    pitch: clip(raw.pitch, 220),
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights
          .map((line) => clip(line, 90))
          .filter((line) => typeof line === "string" && line.length > 0)
          .slice(0, 4)
      : raw.highlights,
  };
  if (typeof draft.radius === "number")
    draft.radius = Math.max(0, Math.min(32, Math.round(draft.radius)));
  if (isRecord(draft.palette)) {
    draft.palette = Object.fromEntries(
      Object.entries(draft.palette).map(([key, value]) => [
        key,
        typeof value === "string" ? value.toLowerCase() : value,
      ]),
    );
  }
  if (!Value.Check(DesignConceptSchema, draft)) return undefined;
  const concept = draft as DesignConcept;
  const { palette } = concept;
  const grounds = [palette.background, palette.surface];
  return {
    ...concept,
    palette: {
      ...palette,
      text: readableOn(palette.text, grounds, 4.5),
      muted: readableOn(palette.muted, grounds, 4.5),
      accent: readableOn(palette.accent, [palette.surface], 3),
    },
  };
}

/** Reads `{ concepts: [...] }` (bare or fenced) and keeps the valid ideas,
 * at most `DESIGN_CONCEPTS_COUNT`. */
export function parseDesignConcepts(raw: string): DesignConcept[] {
  const candidates = [extractFenced(raw, "json"), raw.trim()].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  for (const candidate of candidates) {
    const parsed = tryParseJsonObject(candidate);
    if (!parsed || !Array.isArray(parsed.concepts)) continue;
    return parsed.concepts
      .map((item) => normalizeConcept(item))
      .filter((item): item is DesignConcept => item !== undefined)
      .slice(0, DESIGN_CONCEPTS_COUNT);
  }
  return [];
}

export type DesignConceptsResult = {
  concepts: DesignConcept[];
  audit: CustomHtmlGenerationAudit;
};

export async function runDesignConcepts(input: {
  model: CustomHtmlModel;
  system: string;
  userMessage: string;
  images: readonly CustomHtmlVisionImage[];
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: CustomHtmlReviewProgress) => void) | undefined;
  onSpend?: ((costMicroUsd: number) => void | Promise<void>) | undefined;
}): Promise<DesignConceptsResult> {
  const startedAt = Date.now();
  const jobId = randomUUID();
  const messages: CustomHtmlModelMessage[] = [
    {
      role: "user",
      content: [
        ...input.images.map((image) => ({
          type: "image" as const,
          mediaType: image.mediaType,
          base64: image.base64,
        })),
        { type: "text" as const, text: input.userMessage },
      ],
    },
  ];
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicroUsd: 0,
  };
  let stopReason = "end_turn";

  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    const stage = turn === 1 ? "generating" : "fixing";
    input.onProgress?.({ stage, turn, maxTurns: MAX_TURNS });
    const result = await input.model.complete({
      jobId,
      turn,
      maxTurns: MAX_TURNS,
      system: input.system,
      messages,
      maxTokens: MAX_TOKENS_PER_TURN,
      signal: input.signal,
      responseContract: "design-concepts",
      onStage: (next) =>
        input.onProgress?.({
          stage: next === "queued" ? "queued" : stage,
          turn,
          maxTurns: MAX_TURNS,
        }),
    });
    const cost = usageCostMicroUsd(input.model.model, result.usage);
    totals.inputTokens += result.usage.inputTokens;
    totals.outputTokens += result.usage.outputTokens;
    totals.cacheReadTokens += result.usage.cacheReadTokens;
    totals.cacheWriteTokens += result.usage.cacheWriteTokens;
    totals.costMicroUsd += cost;
    stopReason = result.stopReason;
    await input.onSpend?.(cost);

    if (result.stopReason === "refusal") break;
    const concepts = parseDesignConcepts(result.text);
    if (concepts.length > 0) {
      return {
        concepts,
        audit: {
          provider: input.model.provider,
          model: input.model.model,
          turns: turn,
          ...totals,
          durationMs: Date.now() - startedAt,
          stopReason,
        },
      };
    }
    messages.push(textMessage("assistant", result.text));
    messages.push(textMessage("user", RETRY_MESSAGE));
  }

  throw new UnavailableError(
    "AI_UNAVAILABLE",
    "Kardo's AI did not return usable design ideas.",
  );
}
