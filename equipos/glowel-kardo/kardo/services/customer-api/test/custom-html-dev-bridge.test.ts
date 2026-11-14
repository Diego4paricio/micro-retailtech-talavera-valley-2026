import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDevBridgeAllowed,
  createDevBridgeCustomHtmlModel,
} from "../src/custom-html/dev-bridge-model.js";
import { UnavailableError } from "../src/errors.js";

async function waitForFile(filePath: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await stat(filePath);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${filePath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

const dirs: string[] = [];

async function tempBridgeDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kardo-ai-bridge-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  dirs.length = 0;
});

describe("assertDevBridgeAllowed", () => {
  it("refuses to build in production", () => {
    expect(() =>
      assertDevBridgeAllowed({ dir: "/tmp/whatever", nodeEnv: "production" }),
    ).toThrow(/production/);
  });

  it("refuses a relative KARDO_AI_BRIDGE_DIR", () => {
    expect(() =>
      assertDevBridgeAllowed({ dir: "relative/path", nodeEnv: "development" }),
    ).toThrow(/absolute/);
  });

  it("refuses when no directory is set at all", () => {
    expect(() =>
      assertDevBridgeAllowed({ dir: undefined, nodeEnv: "development" }),
    ).toThrow(/absolute/);
  });

  it("allows a valid absolute directory outside production", () => {
    expect(() =>
      assertDevBridgeAllowed({
        dir: "/tmp/kardo-bridge",
        nodeEnv: "development",
      }),
    ).not.toThrow();
    expect(() =>
      assertDevBridgeAllowed({ dir: "/tmp/kardo-bridge", nodeEnv: undefined }),
    ).not.toThrow();
  });
});

describe("createDevBridgeCustomHtmlModel", () => {
  it("refuses to build at all when NODE_ENV is production", async () => {
    const dir = await tempBridgeDir();
    expect(() =>
      createDevBridgeCustomHtmlModel({ dir, nodeEnv: "production" }),
    ).toThrow();
  });

  it("refuses to build when the directory is not absolute", () => {
    expect(() =>
      createDevBridgeCustomHtmlModel({
        dir: "relative",
        nodeEnv: "development",
      }),
    ).toThrow();
  });

  it("writes the pending turn file atomically, polls for the done file, and cleans up every job file afterward", async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 10,
    });
    const jobId = randomUUID();
    const pendingPath = path.join(dir, "pending", `${jobId}.turn1.json`);
    const donePath = path.join(dir, "done", `${jobId}.turn1.json`);

    const promise = model.complete({
      jobId,
      turn: 1,
      maxTurns: 3,
      system: "SYSTEM",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Diseña la página" }],
        },
      ],
      maxTokens: 16_000,
    });

    await waitForFile(pendingPath);
    const pending = JSON.parse(await readFile(pendingPath, "utf8"));
    expect(pending).toMatchObject({
      jobId,
      turn: 1,
      maxTurns: 3,
      system: "SYSTEM",
    });
    expect(pending.messages[0].content[0]).toEqual({
      type: "text",
      text: "Diseña la página",
    });
    expect(typeof pending.createdAt).toBe("string");
    // No leftover .tmp-* file: the write was rename-atomic.
    expect(
      (
        await import("node:fs/promises").then((fs) =>
          fs.readdir(path.join(dir, "pending")),
        )
      ).some((name) => name.includes(".tmp-")),
    ).toBe(false);

    await mkdir(path.join(dir, "done"), { recursive: true });
    await writeFile(donePath, JSON.stringify({ text: "respuesta del agente" }));

    const result = await promise;
    expect(result).toEqual({
      text: "respuesta del agente",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      stopReason: "end_turn",
    });

    expect(await pathExists(pendingPath)).toBe(false);
    expect(await pathExists(donePath)).toBe(false);
    expect(await pathExists(path.join(dir, "working", `${jobId}.turn1`))).toBe(
      false,
    );
  });

  it("writes each image once on turn 1 and reuses the same path on later turns, replacing image blocks with image_file", async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 10,
    });
    const jobId = randomUUID();

    const turn1Pending = path.join(dir, "pending", `${jobId}.turn1.json`);
    const turn1Promise = model.complete({
      jobId,
      turn: 1,
      maxTurns: 3,
      system: "SYSTEM",
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
    await waitForFile(turn1Pending);
    const turn1Payload = JSON.parse(await readFile(turn1Pending, "utf8"));
    const imageBlock = turn1Payload.messages[0].content[0];
    expect(imageBlock.type).toBe("image_file");
    expect(imageBlock.path).toBe(
      path.join(dir, "pending", `${jobId}.img1.png`),
    );
    expect(await pathExists(imageBlock.path)).toBe(true);
    const imageBytes = await readFile(imageBlock.path);
    expect(imageBytes.equals(Buffer.from("QQ==", "base64"))).toBe(true);

    await writeFile(
      path.join(dir, "done", `${jobId}.turn1.json`),
      JSON.stringify({ text: "primer turno" }),
    );
    await turn1Promise;
    // Turn 1 ends: its image is deleted immediately (never left on disk).
    expect(await pathExists(imageBlock.path)).toBe(false);

    const turn2Pending = path.join(dir, "pending", `${jobId}.turn2.json`);
    const turn2Promise = model.complete({
      jobId,
      turn: 2,
      maxTurns: 3,
      system: "SYSTEM",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mediaType: "image/png", base64: "QQ==" },
            { type: "text", text: "hola" },
          ],
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "primer turno" }],
        },
        { role: "user", content: [{ type: "text", text: "corrige esto" }] },
      ],
      maxTokens: 16_000,
    });
    await waitForFile(turn2Pending);
    const turn2Payload = JSON.parse(await readFile(turn2Pending, "utf8"));
    expect(turn2Payload.messages[0].content[0]).toEqual({
      type: "image_file",
      path: imageBlock.path,
    });
    await writeFile(
      path.join(dir, "done", `${jobId}.turn2.json`),
      JSON.stringify({ text: "segundo turno" }),
    );
    await turn2Promise;
  });

  it('reports "queued" until the working marker appears, then "working" once, and answers', async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 10,
    });
    const jobId = randomUUID();
    const stages: string[] = [];

    const promise = model.complete({
      jobId,
      turn: 1,
      maxTurns: 3,
      system: "s",
      messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
      maxTokens: 16_000,
      onStage: (stage) => stages.push(stage),
    });

    await waitForFile(path.join(dir, "pending", `${jobId}.turn1.json`));
    // Let a few polls happen while still "queued".
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.every((stage) => stage === "queued")).toBe(true);

    await mkdir(path.join(dir, "working"), { recursive: true });
    await writeFile(path.join(dir, "working", `${jobId}.turn1`), "");
    await new Promise((resolve) => setTimeout(resolve, 60));
    // Once a human/agent picks up the job: one "working", then silence.
    expect(stages.filter((stage) => stage === "working")).toHaveLength(1);
    expect(stages.at(-1)).toBe("working");

    await mkdir(path.join(dir, "done"), { recursive: true });
    await writeFile(
      path.join(dir, "done", `${jobId}.turn1.json`),
      JSON.stringify({ text: "listo" }),
    );
    await promise;
  });

  it("times out and cleans up when nothing answers in time", async () => {
    const dir = await tempBridgeDir();
    const model = createDevBridgeCustomHtmlModel({
      dir,
      nodeEnv: "development",
      pollIntervalMs: 5,
      timeoutMs: 30,
    });
    const jobId = randomUUID();
    await expect(
      model.complete({
        jobId,
        turn: 1,
        maxTurns: 3,
        system: "s",
        messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
        maxTokens: 16_000,
      }),
    ).rejects.toThrow(UnavailableError);

    expect(
      await pathExists(path.join(dir, "pending", `${jobId}.turn1.json`)),
    ).toBe(false);
  });
});
