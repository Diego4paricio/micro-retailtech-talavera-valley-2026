import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import {
  createAnthropicCustomHtmlModel,
  reasoningParamsFor,
} from "../src/custom-html/anthropic-model.js";
import { CustomHtmlGenerationAbortedError } from "../src/custom-html/model.js";
import { UnavailableError } from "../src/errors.js";

type StreamParams = Record<string, unknown>;
type StreamOptions = { signal?: AbortSignal } | undefined;

/** A minimal fake of the one Anthropic SDK surface this provider uses:
 * `client.messages.stream(params, options).finalMessage()`. */
function fakeClient(
  respond: (
    params: StreamParams,
    options: StreamOptions,
  ) => Promise<Partial<Anthropic.Message>> | Partial<Anthropic.Message>,
): Anthropic {
  return {
    messages: {
      stream: (params: StreamParams, options: StreamOptions) => ({
        finalMessage: async () => respond(params, options),
      }),
    },
  } as unknown as Anthropic;
}

describe("reasoningParamsFor", () => {
  it("never sends adaptive thinking or effort to Haiku 4.5, which rejects them", () => {
    expect(reasoningParamsFor("claude-haiku-4-5")).toEqual({});
  });

  it("keeps adaptive thinking at medium effort for Sonnet 5 and Opus", () => {
    for (const model of ["claude-sonnet-5", "claude-opus-5-5"]) {
      expect(reasoningParamsFor(model)).toEqual({
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
      });
    }
  });
});

describe("createAnthropicCustomHtmlModel", () => {
  it("sends the model, cached system prompt, adaptive thinking, medium effort and mapped messages", async () => {
    let sentParams: StreamParams | undefined;
    const client = fakeClient((params) => {
      sentParams = params;
      return {
        content: [{ type: "text", text: "hola" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 2 },
      };
    });
    const model = createAnthropicCustomHtmlModel({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-sonnet-5",
      client,
    });

    await model.complete({
      jobId: "job-1",
      turn: 1,
      maxTurns: 3,
      system: "SYSTEM PROMPT",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mediaType: "image/png", base64: "QQ==" },
            { type: "text", text: "hola" },
          ],
        },
      ],
      maxTokens: 16_000,
    });

    expect(sentParams?.model).toBe("claude-sonnet-5");
    expect(sentParams?.max_tokens).toBe(16_000);
    expect(sentParams?.thinking).toEqual({ type: "adaptive" });
    expect(sentParams?.output_config).toEqual({ effort: "medium" });
    expect(sentParams?.system).toEqual([
      {
        type: "text",
        text: "SYSTEM PROMPT",
        cache_control: { type: "ephemeral" },
      },
    ]);
    const messages = sentParams?.messages as {
      role: string;
      content: unknown[];
    }[];
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "QQ==" },
    });
    expect(messages[0]?.content[1]).toEqual({ type: "text", text: "hola" });
  });

  it("maps usage and stop reason, defaulting cache tokens to 0 when absent", async () => {
    const client = fakeClient(() => ({
      content: [{ type: "text", text: "listo" }],
      stop_reason: "max_tokens",
      usage: { input_tokens: 5, output_tokens: 7 },
    }));
    const model = createAnthropicCustomHtmlModel({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-sonnet-5",
      client,
    });
    const result = await model.complete({
      jobId: "job-1",
      turn: 1,
      maxTurns: 3,
      system: "s",
      messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
      maxTokens: 16_000,
    });
    expect(result).toEqual({
      text: "listo",
      usage: {
        inputTokens: 5,
        outputTokens: 7,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      stopReason: "max_tokens",
    });
  });

  it("joins multiple text blocks and reports cache usage when present", async () => {
    const client = fakeClient(() => ({
      content: [
        { type: "text", text: "primero" },
        { type: "text", text: "segundo" },
      ],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 50,
      },
    }));
    const model = createAnthropicCustomHtmlModel({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-sonnet-5",
      client,
    });
    const result = await model.complete({
      jobId: "job-1",
      turn: 1,
      maxTurns: 3,
      system: "s",
      messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
      maxTokens: 16_000,
    });
    expect(result.text).toBe("primero\nsegundo");
    expect(result.usage.cacheReadTokens).toBe(100);
    expect(result.usage.cacheWriteTokens).toBe(50);
  });

  it("raises CustomHtmlGenerationAbortedError when the caller's signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = fakeClient(() => {
      throw new Error("aborted by caller");
    });
    const model = createAnthropicCustomHtmlModel({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-sonnet-5",
      client,
    });
    await expect(
      model.complete({
        jobId: "job-1",
        turn: 1,
        maxTurns: 3,
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
        maxTokens: 16_000,
        signal: controller.signal,
      }),
    ).rejects.toThrow(CustomHtmlGenerationAbortedError);
  });

  it("answers AI_UNAVAILABLE on any other provider failure", async () => {
    const client = fakeClient(() => {
      throw new Error("network down");
    });
    const model = createAnthropicCustomHtmlModel({
      apiKey: "sk-ant-test-key-1234567890",
      model: "claude-sonnet-5",
      client,
    });
    await expect(
      model.complete({
        jobId: "job-1",
        turn: 1,
        maxTurns: 3,
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
        maxTokens: 16_000,
      }),
    ).rejects.toThrow(UnavailableError);
  });
});
