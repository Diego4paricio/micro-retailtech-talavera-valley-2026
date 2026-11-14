import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImageMediaType } from "@kardo/contracts";
import { UnavailableError } from "../errors.js";
import {
  CustomHtmlGenerationAbortedError,
  type CustomHtmlModel,
  type CustomHtmlModelCompleteInput,
  type CustomHtmlModelMessage,
  type CustomHtmlModelResult,
} from "./model.js";

/**
 * Local development bridge: instead of an Anthropic API key, a Claude Code
 * session on the owner's own machine answers each turn by hand (or with its
 * own agent loop). See `scripts/dev/ai-bridge/README.md` for the protocol
 * from the answering side.
 *
 * File protocol, per turn `n` of job `jobId`:
 *   1. This model writes `pending/${jobId}.turn${n}.json` (a tmp file then
 *      renamed, so a reader never sees a half-written file) with
 *      `{ jobId, turn, maxTurns, createdAt, system, messages }`. Image
 *      content blocks become `{ type: "image_file", path }`; the images
 *      themselves are written once, on turn 1, as
 *      `pending/${jobId}.img${i}.<ext>`.
 *   2. It polls every second for `done/${jobId}.turn${n}.json`
 *      (`{ "text": "..." }`), up to `KARDO_AI_BRIDGE_TIMEOUT_MS`.
 *   3. While the pending file exists and no `working/${jobId}.turn${n}`
 *      marker exists yet, it reports stage "queued"; once the marker
 *      appears it reports "working" once, so the caller leaves "queued".
 *   4. Once the turn ends (answered, failed or timed out) it deletes that
 *      turn's pending/working/done files, and — only for turn 1 — the
 *      image files, so no customer content is ever left on disk.
 *
 * Refuses to build at all outside development, so a misconfigured
 * production deploy can never end up waiting on a human forever instead of
 * calling the real API.
 */
export const DEFAULT_BRIDGE_TIMEOUT_MS = 240_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

const IMAGE_EXTENSIONS: Record<ImageMediaType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type BridgeContentBlock =
  | { type: "text"; text: string }
  | { type: "image_file"; path: string };

type BridgeMessage = {
  role: "user" | "assistant";
  content: BridgeContentBlock[];
};

type BridgePendingPayload = {
  jobId: string;
  turn: number;
  maxTurns: number;
  createdAt: string;
  /** Which JSON contract to answer with (absent means "custom-html", the
   * original modo HTML shape, for backward compatibility with anything that
   * reads this file without expecting the field). See
   * `CustomHtmlModelCompleteInput.responseContract`. */
  responseContract:
    | "custom-html"
    | "design"
    | "design-concepts"
    | "design-review"
    | "html-block";
  system: string;
  messages: BridgeMessage[];
};

export function assertDevBridgeAllowed(input: {
  dir: string | undefined;
  nodeEnv: string | undefined;
}): asserts input is { dir: string; nodeEnv: string | undefined } {
  if (input.nodeEnv === "production") {
    throw new Error(
      "CUSTOM_HTML_AI_PROVIDER=dev-bridge cannot run with NODE_ENV=production.",
    );
  }
  if (!input.dir || !path.isAbsolute(input.dir)) {
    throw new Error(
      "KARDO_AI_BRIDGE_DIR must be set to an absolute path to use CUSTOM_HTML_AI_PROVIDER=dev-bridge.",
    );
  }
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function writeFileAtomic(
  filePath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${filePath}.tmp-${randomUUID()}`;
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(
  filePath: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Missing, mid-rename or invalid JSON: treat as "not answered yet"
    // rather than failing the whole generation on one unlucky poll.
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeQuietly(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export function createDevBridgeCustomHtmlModel(input: {
  dir: string;
  nodeEnv?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): CustomHtmlModel {
  assertDevBridgeAllowed({
    dir: input.dir,
    nodeEnv: input.nodeEnv ?? process.env.NODE_ENV,
  });

  const dir = input.dir;
  const pendingDir = path.join(dir, "pending");
  const workingDir = path.join(dir, "working");
  const doneDir = path.join(dir, "done");
  const timeoutMs = input.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
  const pollIntervalMs = input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  // Turn 1's image files are written once and referenced (by path) from
  // every later turn's pending file, since the answering agent already saw
  // them and the conversation history is resent as text only.
  const turnOneImagePaths = new Map<string, string[]>();

  async function writeTurnOneImages(
    jobId: string,
    messages: readonly CustomHtmlModelMessage[],
  ): Promise<string[]> {
    const paths: string[] = [];
    let index = 0;
    for (const message of messages) {
      for (const block of message.content) {
        if (block.type !== "image") continue;
        index += 1;
        const ext = IMAGE_EXTENSIONS[block.mediaType];
        const imagePath = path.join(pendingDir, `${jobId}.img${index}.${ext}`);
        await writeFile(imagePath, Buffer.from(block.base64, "base64"));
        paths.push(imagePath);
      }
    }
    return paths;
  }

  function toBridgeMessages(
    messages: readonly CustomHtmlModelMessage[],
    imagePaths: readonly string[],
  ): BridgeMessage[] {
    let imageIndex = 0;
    return messages.map((message) => ({
      role: message.role,
      content: message.content.map((block): BridgeContentBlock => {
        if (block.type === "text") return { type: "text", text: block.text };
        const imagePath = imagePaths[imageIndex];
        imageIndex += 1;
        return { type: "image_file", path: imagePath ?? "" };
      }),
    }));
  }

  return {
    provider: "dev-bridge",
    model: "dev-bridge",
    async complete(
      completeInput: CustomHtmlModelCompleteInput,
    ): Promise<CustomHtmlModelResult> {
      const { jobId, turn, maxTurns, signal } = completeInput;
      await Promise.all([
        ensureDir(pendingDir),
        ensureDir(workingDir),
        ensureDir(doneDir),
      ]);

      const imagePaths =
        turn === 1
          ? await writeTurnOneImages(jobId, completeInput.messages)
          : (turnOneImagePaths.get(jobId) ?? []);
      if (turn === 1) turnOneImagePaths.set(jobId, imagePaths);

      const pendingPath = path.join(pendingDir, `${jobId}.turn${turn}.json`);
      const workingPath = path.join(workingDir, `${jobId}.turn${turn}`);
      const donePath = path.join(doneDir, `${jobId}.turn${turn}.json`);

      const payload: BridgePendingPayload = {
        jobId,
        turn,
        maxTurns,
        createdAt: new Date().toISOString(),
        responseContract: completeInput.responseContract ?? "custom-html",
        system: completeInput.system,
        messages: toBridgeMessages(completeInput.messages, imagePaths),
      };

      try {
        await writeFileAtomic(pendingPath, JSON.stringify(payload, null, 2));

        const deadline = Date.now() + timeoutMs;
        let queued = false;
        for (;;) {
          if (signal?.aborted) {
            throw new CustomHtmlGenerationAbortedError(
              "The Kardo AI HTML generation call was aborted.",
            );
          }
          const done = await readJsonIfPresent(donePath);
          if (done) {
            const text = typeof done.text === "string" ? done.text : "";
            return {
              text,
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              stopReason: "end_turn",
            };
          }
          if (Date.now() >= deadline) {
            throw new UnavailableError(
              "AI_UNAVAILABLE",
              "Kardo's AI HTML generator (dev bridge) did not answer in time.",
            );
          }
          const pendingStillThere = await pathExists(pendingPath);
          const alreadyWorking = await pathExists(workingPath);
          if (pendingStillThere && !alreadyWorking) {
            completeInput.onStage?.("queued");
            queued = true;
          } else if (queued && alreadyWorking) {
            completeInput.onStage?.("working");
            queued = false;
          }
          await sleep(pollIntervalMs);
        }
      } finally {
        await Promise.all([
          removeQuietly(pendingPath),
          removeQuietly(workingPath),
          removeQuietly(donePath),
          ...(turn === 1 ? imagePaths.map((p) => removeQuietly(p)) : []),
        ]);
        // Deliberately NOT deleted from `turnOneImagePaths` here: turn 1's
        // files are gone (above), but later turns still need the same path
        // *strings* to reuse in their own pending JSON (see `imagePaths`
        // above). One small map entry per generation, for a dev-only tool a
        // single developer runs locally, is not worth tracking "was this
        // the job's last turn" just to free it a little earlier.
      }
    },
  };
}
