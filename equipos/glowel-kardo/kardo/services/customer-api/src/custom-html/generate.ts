import { randomUUID } from "node:crypto";
import type { CustomHtmlGenerationStage } from "@kardo/contracts";
import { prepareCustomHtml, type SanitizeReport } from "@kardo/page-render";
import { UnavailableError } from "../errors.js";
import {
  type CustomHtmlVisionImage,
  enforceLimits,
  parseCustomHtmlResponse,
} from "./assistant.js";
import type { CustomHtmlModel, CustomHtmlModelMessage } from "./model.js";
import { usageCostMicroUsd } from "./pricing.js";

/**
 * The review loop: turn 1 drafts, then Kardo's own sanitizer
 * (`@kardo/page-render`) checks the draft against the exact same allowlist
 * the prompt promised. If it had to remove anything meaningful (a script,
 * an event handler, an external image or URL, forbidden CSS, an unknown
 * tag) and there is still budget left, the loop tells the model exactly
 * what was removed and why, in Spanish, and asks for the full corrected
 * JSON — never just the changed part, since a partial answer would not be
 * valid JSON on its own. Bounded on two independent axes so a stubborn
 * model can never run away: at most `CUSTOM_HTML_MAX_TURNS` turns, and at
 * most `CUSTOM_HTML_MAX_OUTPUT_TOKENS` output tokens total. Whichever hits
 * first, the loop stops and returns the best (most recently *parsed*, not
 * necessarily spotless) draft — the panel's own preview/publish sanitizer
 * is the real safety net, same as before this change.
 */
export const CUSTOM_HTML_MAX_TURNS = 3;
export const CUSTOM_HTML_MAX_OUTPUT_TOKENS = 30_000;
/** Per-turn cap sent to the provider (the Anthropic one; the dev bridge
 * ignores it). Independent of the total output-token budget above: a
 * single turn could in principle spend its entire per-turn cap and still
 * be within the running total, or not — whichever is smaller wins. */
export const CUSTOM_HTML_MAX_TOKENS_PER_TURN = 16_000;

export type CustomHtmlGenerationAudit = {
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

export type CustomHtmlReviewDraft = {
  html: string;
  css: string;
  notes: string;
};

export type CustomHtmlReviewResult = CustomHtmlReviewDraft & {
  audit: CustomHtmlGenerationAudit;
};

export type CustomHtmlReviewProgress = {
  stage: CustomHtmlGenerationStage;
  turn: number;
  maxTurns: number;
};

/**
 * The prompt asks the model to write a numbered placeholder
 * (`src="imagen-1.jpg"`, `url(imagen-1.jpg)`) for a photo the library does
 * not have yet; the panel lists them under "Imágenes por conectar". The
 * sanitizer drops any image that is not a library token, so, only for the
 * review, each placeholder is read as a library token: a planned
 * placeholder is not a mistake to correct, and asking the model to remove
 * it (as the loop did until 2026-10-02) cost a whole extra turn and lost the
 * photo spot. The draft itself keeps its placeholders.
 */
export function withPlaceholdersAsLibraryImages(source: {
  html: string;
  css: string;
}): { html: string; css: string } {
  const swap = (text: string) =>
    text.replace(
      /(["'(]\s*)imagen-([1-9][0-9]?)\.jpg(?=\s*["')])/g,
      (_match, before: string, number: string) =>
        `${before}kardo-asset:00000000-0000-4000-8000-${number.padStart(12, "0")}`,
    );
  return { html: swap(source.html), css: swap(source.css) };
}

function hasMeaningfulRemovals(report: SanitizeReport): boolean {
  return (
    Object.keys(report.removedTags).length > 0 ||
    Object.keys(report.removedAttributes).length > 0 ||
    report.removedCssRules > 0 ||
    report.blockedLinks > 0 ||
    report.blockedImages > 0
  );
}

/** Lists exactly what the sanitizer removed and why, in Spanish, so the
 * model can fix its own answer instead of guessing. Counts only — never
 * the removed markup itself, same privacy stance as the audit trail. */
function describeRemovals(report: SanitizeReport): string {
  const lines: string[] = [
    "El limpiador de seguridad de Kardo quitó lo siguiente de tu respuesta anterior porque no está permitido en la plataforma:",
  ];
  for (const [tag, count] of Object.entries(report.removedTags)) {
    lines.push(
      `- La etiqueta <${tag}> (${count} vez o veces): no está en la lista de elementos permitidos.`,
    );
  }
  for (const [attribute, count] of Object.entries(report.removedAttributes)) {
    lines.push(
      `- El atributo "${attribute}" (${count} vez o veces): no está permitido ahí, o es un manejador de evento.`,
    );
  }
  if (report.blockedLinks > 0) {
    lines.push(
      `- ${report.blockedLinks} enlace(s): solo se permiten enlaces que empiecen con https://, mailto: o tel:.`,
    );
  }
  if (report.blockedImages > 0) {
    lines.push(
      `- ${report.blockedImages} imagen(es): las imágenes solo pueden usar el identificador kardo-asset:<identificador> exacto de la lista de imágenes, nunca una URL externa.`,
    );
  }
  if (report.removedCssRules > 0) {
    const reasons = Object.entries(report.removedCss)
      .map(([reason, count]) => `${reason} (${count})`)
      .join(", ");
    lines.push(
      `- ${report.removedCssRules} regla(s) o declaración(es) de CSS: ${reasons || "usaban una propiedad prohibida"}.`,
    );
  }
  lines.push(
    "Corrige el diseño para que ya no necesite nada de lo anterior (usa solo lo permitido) y responde de nuevo con el objeto JSON completo, con html, css y notes. No mandes solo la parte que cambió.",
  );
  return lines.join("\n");
}

const RETRY_FORMAT_MESSAGE =
  "Tu respuesta anterior no vino en el formato pedido. Responde de nuevo únicamente con el objeto JSON con las claves html, css y notes, sin texto antes ni después y sin bloques de código.";

/** `stop_reason: "max_tokens"` almost always means the JSON got cut off
 * mid-answer (so it fails to parse below): ask for something shorter
 * instead of just repeating the format instructions. */
const RETRY_TOO_LONG_MESSAGE =
  "Tu respuesta anterior se cortó porque llegó al límite de tokens antes de terminar. Responde de nuevo con el objeto JSON completo (html, css y notes), pero más corto: usa menos HTML y CSS, sin perder lo esencial del diseño.";

function textMessage(
  role: "user" | "assistant",
  text: string,
): CustomHtmlModelMessage {
  return { role, content: [{ type: "text", text }] };
}

export type CustomHtmlReviewInput = {
  model: CustomHtmlModel;
  system: string;
  userMessage: string;
  images: readonly CustomHtmlVisionImage[];
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: CustomHtmlReviewProgress) => void) | undefined;
  /** Called once per turn, right after that turn's usage is known, with its
   * cost in micro-USD — so the caller can debit the daily budget
   * incrementally instead of only after the whole generation finishes. */
  onSpend?: ((costMicroUsd: number) => void | Promise<void>) | undefined;
  /** Which contract the dev bridge should tell its answering agent to use
   * (2026-09-30, AI in blocks). Defaults to "custom-html" (the modo HTML
   * page); a single `html` block generation passes "html-block" so the same
   * `{ html, css, notes }` shape is still answered, just described as a
   * block instead of a whole page. */
  responseContract?: "custom-html" | "html-block" | undefined;
};

export async function runCustomHtmlReview(
  input: CustomHtmlReviewInput,
): Promise<CustomHtmlReviewResult> {
  const startedAt = Date.now();
  const jobId = randomUUID();
  const maxTurns = CUSTOM_HTML_MAX_TURNS;

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

  let turn = 1;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCostMicroUsd = 0;
  let lastStopReason = "end_turn";
  let best: CustomHtmlReviewDraft | undefined;

  for (;;) {
    input.onProgress?.({
      stage: turn === 1 ? "generating" : "fixing",
      turn,
      maxTurns,
    });

    const result = await input.model.complete({
      jobId,
      turn,
      maxTurns,
      system: input.system,
      messages,
      maxTokens: CUSTOM_HTML_MAX_TOKENS_PER_TURN,
      signal: input.signal,
      responseContract: input.responseContract ?? "custom-html",
      onStage: (stage) =>
        input.onProgress?.({
          stage:
            stage === "queued"
              ? "queued"
              : turn === 1
                ? "generating"
                : "fixing",
          turn,
          maxTurns,
        }),
    });

    const turnCostMicroUsd = usageCostMicroUsd(input.model.model, result.usage);
    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;
    totalCacheReadTokens += result.usage.cacheReadTokens;
    totalCacheWriteTokens += result.usage.cacheWriteTokens;
    totalCostMicroUsd += turnCostMicroUsd;
    lastStopReason = result.stopReason;
    // Reported per turn (not only once at the end) so a generation that
    // fails partway through still debits the daily budget for the calls it
    // actually made — "check before, add the real cost after" applies to
    // every turn, not just a generation that ends up succeeding.
    await input.onSpend?.(turnCostMicroUsd);

    const canRetry =
      turn < maxTurns && totalOutputTokens < CUSTOM_HTML_MAX_OUTPUT_TOKENS;

    // A safety refusal is not something a sanitizer-style follow-up can
    // fix: stop immediately, keeping whatever earlier draft exists.
    if (result.stopReason === "refusal") {
      if (best) break;
      throw new UnavailableError(
        "AI_UNAVAILABLE",
        "Kardo's AI HTML generator declined to answer.",
      );
    }

    let parsed: CustomHtmlReviewDraft | undefined;
    try {
      parsed = enforceLimits(parseCustomHtmlResponse(result.text));
    } catch {
      parsed = undefined;
    }

    if (!parsed) {
      if (!canRetry) {
        if (best) break;
        throw new UnavailableError(
          "AI_UNAVAILABLE",
          "Kardo's AI HTML generator did not return a usable design.",
        );
      }
      messages.push(textMessage("assistant", result.text));
      messages.push(
        textMessage(
          "user",
          result.stopReason === "max_tokens"
            ? RETRY_TOO_LONG_MESSAGE
            : RETRY_FORMAT_MESSAGE,
        ),
      );
      turn += 1;
      continue;
    }

    best = parsed;
    input.onProgress?.({ stage: "reviewing", turn, maxTurns });
    const prepared = prepareCustomHtml(
      withPlaceholdersAsLibraryImages({ html: parsed.html, css: parsed.css }),
    );

    if (!hasMeaningfulRemovals(prepared.report) || !canRetry) break;

    messages.push(textMessage("assistant", result.text));
    messages.push(textMessage("user", describeRemovals(prepared.report)));
    turn += 1;
  }

  if (!best) {
    throw new UnavailableError(
      "AI_UNAVAILABLE",
      "Kardo's AI HTML generator did not return a usable design.",
    );
  }

  return {
    ...best,
    audit: {
      provider: input.model.provider,
      model: input.model.model,
      turns: turn,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      costMicroUsd: totalCostMicroUsd,
      durationMs: Date.now() - startedAt,
      stopReason: lastStopReason,
    },
  };
}
