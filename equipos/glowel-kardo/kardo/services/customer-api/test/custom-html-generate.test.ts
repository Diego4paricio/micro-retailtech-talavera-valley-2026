import { describe, expect, it, vi } from "vitest";
import {
  CUSTOM_HTML_MAX_OUTPUT_TOKENS,
  CUSTOM_HTML_MAX_TURNS,
  runCustomHtmlReview,
} from "../src/custom-html/generate.js";
import type {
  CustomHtmlModel,
  CustomHtmlModelCompleteInput,
  CustomHtmlModelResult,
} from "../src/custom-html/model.js";
import { UnavailableError } from "../src/errors.js";

function draftText(html: string, css = ".x{}", notes = "Listo."): string {
  return JSON.stringify({ html, css, notes });
}

function zeroUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/** A scripted `CustomHtmlModel`: each call to `complete()` pops the next
 * answer off `answers`, recording the request it was called with. */
function scriptedModel(
  answers: CustomHtmlModelResult[],
): CustomHtmlModel & { calls: CustomHtmlModelCompleteInput[] } {
  const calls: CustomHtmlModelCompleteInput[] = [];
  let index = 0;
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    calls,
    async complete(input) {
      calls.push(input);
      const answer = answers[index];
      index += 1;
      if (!answer) throw new Error("scriptedModel ran out of answers");
      return answer;
    },
  };
}

const CLEAN_HTML = "<div><p>Bienvenido</p></div>";
const SCRIPT_HTML = "<div><script>alert(1)</script><p>Hola</p></div>";

describe("runCustomHtmlReview", () => {
  it("stops at turn 1 when the sanitizer removes nothing meaningful", async () => {
    const model = scriptedModel([
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "SYSTEM",
      userMessage: "USER",
      images: [],
    });
    expect(result.html).toBe(CLEAN_HTML);
    expect(result.audit.turns).toBe(1);
    expect(model.calls).toHaveLength(1);
  });

  it("keeps the AI's photo placeholders and does not ask to remove them", async () => {
    const html =
      '<div><img src="imagen-1.jpg" alt="Un ramo de rosas"><p>Hola</p></div>';
    const model = scriptedModel([
      {
        text: draftText(html, ".hero{background:url(imagen-2.jpg)}"),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "SYSTEM",
      userMessage: "USER",
      images: [],
    });
    expect(result.audit.turns).toBe(1);
    expect(result.html).toContain('src="imagen-1.jpg"');
    expect(result.css).toContain("imagen-2.jpg");
  });

  it("still asks to remove an external image that is not a placeholder", async () => {
    const model = scriptedModel([
      {
        text: draftText('<img src="https://example.com/rosa.jpg" alt="Rosa">'),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "SYSTEM",
      userMessage: "USER",
      images: [],
    });
    expect(result.audit.turns).toBe(2);
  });

  it("asks for a fix in Spanish, listing what was removed, when the sanitizer takes something out", async () => {
    const model = scriptedModel([
      {
        text: draftText(SCRIPT_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "SYSTEM",
      userMessage: "USER",
      images: [],
    });
    expect(result.html).toBe(CLEAN_HTML);
    expect(result.audit.turns).toBe(2);
    expect(model.calls).toHaveLength(2);

    const secondCallMessages = model.calls[1]?.messages ?? [];
    // [initial user, assistant echo of turn 1, new user follow-up]
    expect(secondCallMessages).toHaveLength(3);
    expect(secondCallMessages[1]?.role).toBe("assistant");
    const followUp = secondCallMessages[2];
    expect(followUp?.role).toBe("user");
    const followUpText = followUp?.content[0];
    expect(followUpText?.type).toBe("text");
    expect((followUpText as { text: string }).text).toContain("script");
    expect((followUpText as { text: string }).text).not.toMatch(/[–—]/);
  });

  it("shares the same jobId, turn and maxTurns across every call", async () => {
    const model = scriptedModel([
      {
        text: draftText(SCRIPT_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
    });
    expect(model.calls[0]?.jobId).toBe(model.calls[1]?.jobId);
    expect(model.calls[0]?.turn).toBe(1);
    expect(model.calls[1]?.turn).toBe(2);
    expect(model.calls[0]?.maxTurns).toBe(CUSTOM_HTML_MAX_TURNS);
  });

  it("never uses more than the configured max turns, even if the sanitizer keeps removing something", async () => {
    const model = scriptedModel(
      Array.from({ length: CUSTOM_HTML_MAX_TURNS }, () => ({
        text: draftText(SCRIPT_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn" as const,
      })),
    );
    const result = await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
    });
    expect(model.calls).toHaveLength(CUSTOM_HTML_MAX_TURNS);
    expect(result.audit.turns).toBe(CUSTOM_HTML_MAX_TURNS);
    // Still returns the best (parsed) draft rather than throwing: the
    // panel's own sanitizer is the real safety net either way.
    expect(result.html).toBe(SCRIPT_HTML);
  });

  it("stops early once the output-token budget is spent, before the turn cap", async () => {
    const bigUsage = {
      inputTokens: 100,
      outputTokens: Math.ceil(CUSTOM_HTML_MAX_OUTPUT_TOKENS / 2) + 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const model = scriptedModel([
      { text: draftText(SCRIPT_HTML), usage: bigUsage, stopReason: "end_turn" },
      { text: draftText(SCRIPT_HTML), usage: bigUsage, stopReason: "end_turn" },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
    });
    // Two turns already cross the 30,000-token budget, so a third (which
    // would have produced the clean draft) never happens.
    expect(model.calls).toHaveLength(2);
    expect(result.audit.turns).toBe(2);
    expect(result.audit.outputTokens).toBeGreaterThanOrEqual(
      CUSTOM_HTML_MAX_OUTPUT_TOKENS,
    );
  });

  it("stops immediately on a refusal, keeping the previous good draft", async () => {
    const model = scriptedModel([
      {
        text: draftText(SCRIPT_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
      { text: "", usage: zeroUsage(), stopReason: "refusal" },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
    });
    expect(model.calls).toHaveLength(2);
    expect(result.html).toBe(SCRIPT_HTML);
    expect(result.audit.stopReason).toBe("refusal");
  });

  it("throws when the very first turn is refused", async () => {
    const model = scriptedModel([
      { text: "", usage: zeroUsage(), stopReason: "refusal" },
    ]);
    await expect(
      runCustomHtmlReview({ model, system: "s", userMessage: "u", images: [] }),
    ).rejects.toThrow(UnavailableError);
  });

  it("asks for something shorter, not just the format, when a truncated max_tokens answer fails to parse", async () => {
    const model = scriptedModel([
      {
        text: '{"html":"<div>incompleto',
        usage: zeroUsage(),
        stopReason: "max_tokens",
      },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
    });
    expect(result.html).toBe(CLEAN_HTML);
    const retryMessage = model.calls[1]?.messages.at(-1);
    const retryText = retryMessage?.content[0];
    expect(retryText?.type).toBe("text");
    expect((retryText as { text: string }).text).toContain("límite de tokens");
  });

  it("asks again in Spanish when the answer is not valid JSON, and recovers", async () => {
    const model = scriptedModel([
      { text: "esto no es JSON", usage: zeroUsage(), stopReason: "end_turn" },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const result = await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
    });
    expect(result.html).toBe(CLEAN_HTML);
    expect(model.calls).toHaveLength(2);
    const retryMessage = model.calls[1]?.messages.at(-1);
    expect(retryMessage?.role).toBe("user");
  });

  it("throws when nothing usable ever comes back", async () => {
    const model = scriptedModel(
      Array.from({ length: CUSTOM_HTML_MAX_TURNS }, () => ({
        text: "no JSON aquí",
        usage: zeroUsage(),
        stopReason: "end_turn" as const,
      })),
    );
    await expect(
      runCustomHtmlReview({ model, system: "s", userMessage: "u", images: [] }),
    ).rejects.toThrow(UnavailableError);
    expect(model.calls).toHaveLength(CUSTOM_HTML_MAX_TURNS);
  });

  it("calls onSpend once per turn, even when the loop later throws", async () => {
    const model = scriptedModel([
      {
        text: "no JSON",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "end_turn",
      },
      {
        text: "",
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        stopReason: "refusal",
      },
    ]);
    const onSpend = vi.fn();
    await expect(
      runCustomHtmlReview({
        model,
        system: "s",
        userMessage: "u",
        images: [],
        onSpend,
      }),
    ).rejects.toThrow(UnavailableError);
    expect(onSpend).toHaveBeenCalledTimes(2);
  });

  it("reports progress stages in order: generating, reviewing, fixing", async () => {
    const model = scriptedModel([
      {
        text: draftText(SCRIPT_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
      {
        text: draftText(CLEAN_HTML),
        usage: zeroUsage(),
        stopReason: "end_turn",
      },
    ]);
    const stages: string[] = [];
    await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
      onProgress: (progress) =>
        stages.push(`${progress.stage}:${progress.turn}`),
    });
    expect(stages).toEqual([
      "generating:1",
      "reviewing:1",
      "fixing:2",
      "reviewing:2",
    ]);
  });

  it('leaves "queued" when the model reports that someone picked the turn up', async () => {
    const model: CustomHtmlModel = {
      provider: "dev-bridge",
      model: "dev-bridge",
      async complete(input) {
        input.onStage?.("queued");
        input.onStage?.("working");
        return {
          text: draftText(CLEAN_HTML),
          usage: zeroUsage(),
          stopReason: "end_turn",
        };
      },
    };
    const stages: string[] = [];
    await runCustomHtmlReview({
      model,
      system: "s",
      userMessage: "u",
      images: [],
      onProgress: (progress) => stages.push(progress.stage),
    });
    expect(stages).toEqual(["generating", "queued", "generating", "reviewing"]);
  });
});
