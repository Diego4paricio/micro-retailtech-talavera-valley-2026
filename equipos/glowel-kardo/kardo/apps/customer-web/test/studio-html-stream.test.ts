import type { CustomHtmlGenerationEvent } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  generationErrorFromBody,
  isGenerationStream,
  parseNdjsonLine,
  readGenerationStream,
  splitNdjsonLines,
} from "../src/api/custom-html.js";
import { ApiRequestError } from "../src/lib/api.js";

/** A readable stream that yields each string as its own chunk (or, when a
 * chunk is split across two array entries, as two reads). */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

const progress = (stage: string, turn = 1, maxTurns = 1) =>
  JSON.stringify({ type: "progress", stage, turn, maxTurns });

describe("isGenerationStream", () => {
  it("recognizes the NDJSON content type, with or without a charset", () => {
    expect(isGenerationStream("application/x-ndjson")).toBe(true);
    expect(isGenerationStream("application/x-ndjson; charset=utf-8")).toBe(
      true,
    );
    expect(isGenerationStream("application/json")).toBe(false);
    expect(isGenerationStream(null)).toBe(false);
  });
});

describe("splitNdjsonLines", () => {
  it("splits complete lines from the remainder, across chunk boundaries", () => {
    const first = splitNdjsonLines("", "abc\nde");
    expect(first.lines).toEqual(["abc"]);
    expect(first.rest).toBe("de");

    // A line split across two chunks ("de" + "f") joins back into one line.
    const second = splitNdjsonLines(first.rest, "f\nghi\n");
    expect(second.lines).toEqual(["def", "ghi"]);
    expect(second.rest).toBe("");
  });

  it("keeps a partial line with no newline yet as the remainder", () => {
    const result = splitNdjsonLines("", "no newline here");
    expect(result.lines).toEqual([]);
    expect(result.rest).toBe("no newline here");
  });
});

describe("parseNdjsonLine", () => {
  it("parses a JSON line and ignores blank or malformed ones", () => {
    expect(parseNdjsonLine(progress("generating"))).toEqual({
      type: "progress",
      stage: "generating",
      turn: 1,
      maxTurns: 1,
    });
    expect(parseNdjsonLine("")).toBeNull();
    expect(parseNdjsonLine("   ")).toBeNull();
    expect(parseNdjsonLine("{not json")).toBeNull();
  });
});

describe("generationErrorFromBody (the JSON fallback for a plain error)", () => {
  it("builds the same ApiRequestError the rest of the app throws", () => {
    const error = generationErrorFromBody(429, {
      code: "CUSTOM_HTML_LIMIT",
      message: "Daily limit reached.",
      requestId: "req_1",
    });
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error.status).toBe(429);
    expect(error.code).toBe("CUSTOM_HTML_LIMIT");
    expect(error.requestId).toBe("req_1");
  });

  it("copes with a missing or malformed body", () => {
    const error = generationErrorFromBody(500, null);
    expect(error.code).toBeNull();
    expect(error.message).toMatch(/No pudimos/);
  });
});

describe("readGenerationStream", () => {
  it("forwards progress events and resolves on the result event", async () => {
    const events: CustomHtmlGenerationEvent[] = [];
    const body = streamOf([
      `${progress("queued")}\n`,
      `${progress("generating")}\n`,
      `${JSON.stringify({
        type: "result",
        generation: {
          html: "<p>hi</p>",
          css: "",
          notes: "n",
          remainingToday: 5,
        },
      })}\n`,
    ]);
    const terminal = await readGenerationStream(body, (event) =>
      events.push(event),
    );
    expect(events).toEqual([
      { type: "progress", stage: "queued", turn: 1, maxTurns: 1 },
      { type: "progress", stage: "generating", turn: 1, maxTurns: 1 },
    ]);
    expect(terminal).toEqual({
      type: "result",
      generation: { html: "<p>hi</p>", css: "", notes: "n", remainingToday: 5 },
    });
  });

  it("joins a line split across two chunk boundaries", async () => {
    const line = progress("reviewing", 1, 2);
    const splitAt = Math.floor(line.length / 2);
    const body = streamOf([
      line.slice(0, splitAt),
      `${line.slice(splitAt)}\n`,
      `${JSON.stringify({ type: "result", generation: { html: "", css: "", notes: "", remainingToday: 0 } })}\n`,
    ]);
    const events: CustomHtmlGenerationEvent[] = [];
    await readGenerationStream(body, (event) => events.push(event));
    expect(events).toEqual([
      { type: "progress", stage: "reviewing", turn: 1, maxTurns: 2 },
    ]);
  });

  it("reads a trailing line with no final newline", async () => {
    const result = JSON.stringify({
      type: "result",
      generation: { html: "x", css: "y", notes: "z", remainingToday: 3 },
    });
    // No trailing "\n": the stream simply ends after this line.
    const body = streamOf([`${progress("queued")}\n${result}`]);
    const terminal = await readGenerationStream(body, () => {});
    expect(terminal).toEqual({
      type: "result",
      generation: { html: "x", css: "y", notes: "z", remainingToday: 3 },
    });
  });

  it("skips a malformed line instead of failing the whole stream", async () => {
    const body = streamOf([
      `${progress("queued")}\n`,
      "not json at all\n",
      `${JSON.stringify({ type: "result", generation: { html: "", css: "", notes: "", remainingToday: 1 } })}\n`,
    ]);
    const events: CustomHtmlGenerationEvent[] = [];
    const terminal = await readGenerationStream(body, (event) =>
      events.push(event),
    );
    expect(events).toHaveLength(1);
    expect(terminal?.type).toBe("result");
  });

  it("stops at the error event and never reports it through onEvent", async () => {
    const body = streamOf([
      `${progress("fixing", 1, 2)}\n`,
      `${JSON.stringify({
        type: "error",
        error: { code: "CUSTOM_HTML_AI_BUDGET", message: "resting" },
      })}\n`,
    ]);
    const events: CustomHtmlGenerationEvent[] = [];
    const terminal = await readGenerationStream(body, (event) =>
      events.push(event),
    );
    expect(events).toHaveLength(1);
    expect(terminal).toEqual({
      type: "error",
      error: { code: "CUSTOM_HTML_AI_BUDGET", message: "resting" },
    });
  });

  it("resolves null when the body ends without a terminal event", async () => {
    const body = streamOf([`${progress("queued")}\n`]);
    const terminal = await readGenerationStream(body, () => {});
    expect(terminal).toBeNull();
  });

  it("forwards ping events like progress (kept alive, never terminal)", async () => {
    const body = streamOf([
      `${JSON.stringify({ type: "ping" })}\n`,
      `${JSON.stringify({ type: "result", generation: { html: "", css: "", notes: "", remainingToday: 0 } })}\n`,
    ]);
    const events: CustomHtmlGenerationEvent[] = [];
    await readGenerationStream(body, (event) => events.push(event));
    expect(events).toEqual([{ type: "ping" }]);
  });
});
