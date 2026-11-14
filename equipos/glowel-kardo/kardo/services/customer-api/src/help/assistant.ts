import type { AskHelp } from "@kardo/contracts";
import { usageCostMicroUsd } from "../custom-html/pricing.js";
import { UnavailableError } from "../errors.js";
import { helpSystemPrompt } from "./knowledge.js";

export type HelpAssistant = {
  readonly enabled: boolean;
  ask(input: AskHelp): Promise<string>;
};

export const disabledHelpAssistant: HelpAssistant = {
  enabled: false,
  ask: () =>
    Promise.reject(
      new UnavailableError(
        "HELP_ASSISTANT_UNAVAILABLE",
        "The help assistant is not configured.",
      ),
    ),
};

/**
 * Claude-backed help. Only the section, the question and the short
 * conversation history are sent — never workspace data.
 */
export function createAnthropicHelpAssistant(input: {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Real cost of each answer, for Kardo's global daily AI budget
   * (security review 2026-10, V9). Called even when the answer is empty. */
  onSpend?: (costMicroUsd: number) => Promise<void> | void;
  /** Where Links live here (LINKS_BASE_URL or the Resolver's address). */
  linksBase?: string | null | undefined;
}): HelpAssistant {
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = input.timeoutMs ?? 20_000;
  return {
    enabled: true,
    async ask(question) {
      let response: Response;
      try {
        response = await fetchFn("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": input.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            max_tokens: 600,
            system: helpSystemPrompt(question.section, input.linksBase),
            messages: [
              ...(question.history ?? []).map((turn) => ({
                role: turn.role,
                content: turn.text,
              })),
              { role: "user", content: question.question },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new UnavailableError(
          "HELP_ASSISTANT_UNAVAILABLE",
          "The help assistant is not available right now.",
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new UnavailableError(
          "HELP_ASSISTANT_UNAVAILABLE",
          "The help assistant is not available right now.",
        );
      }
      const body = (await response.json()) as {
        content?: { type: string; text?: string }[];
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
      if (input.onSpend && body.usage) {
        const cost = usageCostMicroUsd(input.model, {
          inputTokens: body.usage.input_tokens ?? 0,
          outputTokens: body.usage.output_tokens ?? 0,
          cacheWriteTokens: body.usage.cache_creation_input_tokens ?? 0,
          cacheReadTokens: body.usage.cache_read_input_tokens ?? 0,
        });
        await Promise.resolve(input.onSpend(cost)).catch(() => undefined);
      }
      const text = (body.content ?? [])
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (!text) {
        throw new UnavailableError(
          "HELP_ASSISTANT_UNAVAILABLE",
          "The help assistant did not return an answer.",
        );
      }
      return text.slice(0, 4000);
    },
  };
}
