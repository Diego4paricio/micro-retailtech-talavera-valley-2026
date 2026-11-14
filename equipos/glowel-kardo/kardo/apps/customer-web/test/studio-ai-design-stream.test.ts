import type { DesignGeneration, HtmlBlockGeneration } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { readGenerationStream } from "../src/api/custom-html.js";

/** `readGenerationStream`/`parseNdjsonLine` (api/custom-html.ts) were made
 * generic over the generation shape so the AI-in-blocks endpoints
 * (`api/design-ai.ts`'s `designAiApi`/`htmlBlockAiApi`) reuse them instead of
 * a copy. These tests cover that generic path directly, with the two new
 * generation shapes (a full `PageDesign` and one `html` block) instead of
 * modo HTML's `{ html, css }` (already covered by studio-html-stream.test.ts). */

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

describe("readGenerationStream (AI-in-blocks generations)", () => {
  it("resolves a full PageDesign result for the design-generation shape", async () => {
    const generation: DesignGeneration = {
      design: { schema: 1, style: {} as never, sections: [] },
      notes: "listo",
      remainingToday: 4,
    };
    const body = streamOf([
      `${JSON.stringify({ type: "progress", stage: "generating", turn: 1, maxTurns: 1 })}\n`,
      `${JSON.stringify({ type: "result", generation })}\n`,
    ]);
    const events: string[] = [];
    const terminal = await readGenerationStream<DesignGeneration>(
      body,
      (event) => events.push(event.type),
    );
    expect(events).toEqual(["progress"]);
    expect(terminal).toEqual({ type: "result", generation });
  });

  it("resolves an html-block result and stops at an error without calling onEvent", async () => {
    const body = streamOf([
      `${JSON.stringify({ type: "progress", stage: "reviewing", turn: 2, maxTurns: 3 })}\n`,
      `${JSON.stringify({
        type: "error",
        error: { code: "CUSTOM_HTML_LIMIT", message: "sin cupo" },
      })}\n`,
    ]);
    const events: string[] = [];
    const terminal = await readGenerationStream<HtmlBlockGeneration>(
      body,
      (event) => events.push(event.type),
    );
    expect(events).toEqual(["progress"]);
    expect(terminal).toEqual({
      type: "error",
      error: { code: "CUSTOM_HTML_LIMIT", message: "sin cupo" },
    });
  });
});
