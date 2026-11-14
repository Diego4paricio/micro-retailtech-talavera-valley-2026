import Anthropic from "@anthropic-ai/sdk";
import { UnavailableError } from "../errors.js";
import {
  CustomHtmlGenerationAbortedError,
  type CustomHtmlModel,
  type CustomHtmlModelCompleteInput,
  type CustomHtmlModelContentBlock,
  type CustomHtmlModelMessage,
  type CustomHtmlModelResult,
} from "./model.js";

function toAnthropicContent(
  blocks: readonly CustomHtmlModelContentBlock[],
): Anthropic.ContentBlockParam[] {
  return blocks.map((block) =>
    block.type === "text"
      ? { type: "text", text: block.text }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: block.mediaType,
            data: block.base64,
          },
        },
  );
}

function toAnthropicMessages(
  messages: readonly CustomHtmlModelMessage[],
): Anthropic.MessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content: toAnthropicContent(message.content),
  }));
}

/**
 * Thinking and effort per model (`claude-api` skill, 2026-10-02): Sonnet 5
 * and the Opus line take adaptive thinking with an effort level; Haiku 4.5
 * rejects both (`effort` errors and it only knows `budget_tokens` thinking),
 * so it runs without thinking, which this structured, single-answer task
 * does not need. A model this table does not know gets the Sonnet 5 shape.
 */
export function reasoningParamsFor(
  model: string,
): Pick<Anthropic.MessageStreamParams, "thinking" | "output_config"> {
  if (model.startsWith("claude-haiku-")) return {};
  return {
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
  };
}

/**
 * The Claude API-backed provider ("Pídele a la IA de Kardo", ADR 018,
 * extended 2026-09-29). Every turn streams (the SDK's `finalMessage()`
 * helper collects it back into one message — see the `claude-api` skill,
 * `typescript/claude-api/streaming.md`), uses adaptive thinking at medium
 * effort where the model supports it (`reasoningParamsFor`), and caches
 * the static system prompt for 5 minutes so repeated
 * generations of the same Experience type barely spend on it twice.
 */
export function createAnthropicCustomHtmlModel(input: {
  apiKey: string;
  model: string;
  /** Test-only override; production always builds its own SDK client. */
  client?: Anthropic;
  timeoutMs?: number;
}): CustomHtmlModel {
  const client =
    input.client ??
    new Anthropic({ apiKey: input.apiKey, timeout: input.timeoutMs });

  return {
    provider: "anthropic",
    model: input.model,
    async complete(
      completeInput: CustomHtmlModelCompleteInput,
    ): Promise<CustomHtmlModelResult> {
      let finalMessage: Anthropic.Message;
      try {
        const stream = client.messages.stream(
          {
            model: input.model,
            max_tokens: completeInput.maxTokens,
            system: [
              {
                type: "text",
                text: completeInput.system,
                cache_control: { type: "ephemeral" },
              },
            ],
            ...reasoningParamsFor(input.model),
            messages: toAnthropicMessages(completeInput.messages),
          },
          completeInput.signal ? { signal: completeInput.signal } : undefined,
        );
        finalMessage = await stream.finalMessage();
      } catch {
        if (completeInput.signal?.aborted) {
          throw new CustomHtmlGenerationAbortedError(
            "The Kardo AI HTML generation call was aborted.",
          );
        }
        throw new UnavailableError(
          "AI_UNAVAILABLE",
          "Kardo's AI HTML generator is not available right now.",
        );
      }

      const text = finalMessage.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      return {
        text,
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          cacheReadTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
        },
        stopReason: finalMessage.stop_reason ?? "end_turn",
      };
    },
  };
}
