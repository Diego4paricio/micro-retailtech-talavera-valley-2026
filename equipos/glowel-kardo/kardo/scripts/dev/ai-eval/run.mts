// Kardo AI test bench (scripts/dev/ai-eval, 2026-10-02): runs every case
// through the exact review loops production uses (`runDesignReview` for a
// block design, `runCustomHtmlReview` for modo HTML), with the exact prompt
// builders, `checkDesign` and the sanitizer, but with a file-backed model
// instead of the Claude API: each turn the loop asks for becomes a pending
// file an agent answers (as Sonnet 5 or Haiku 4.5, answering ONLY from what
// the turn shows, like the API model would). Run it again after the agent
// answers and the loop replays the recorded answers and moves one turn on;
// when a case finishes, its tokens are estimated, priced with the
// production table (`custom-html/pricing.ts`) and its preview is drawn with
// scripts/dev/ai-bridge/preview.mjs.
//
// Usage (from the repo root):
//   pnpm exec tsx scripts/dev/ai-eval/run.mts --round=<name> \
//     [--model=sonnet|haiku] [--mode=base|perfil] [--only=id,id] \
//     [--paths=design,html] [--no-shots]
// `--model` and `--mode` are fixed the first time a round runs (saved in
// out/<round>/round.json); later runs of the same round reuse them and the
// prompts frozen on the first run, so editing the prompt code in between
// never mixes two prompt versions inside one round.
//
// Tokens are an estimate (there is no API key in development, see the
// README): text = characters / CHARS_PER_TOKEN, images = width x height /
// 750 after the API's own downscale, the static system prompt written to
// the cache on turn 1 (cold cache) and read from it on turns 2 and 3,
// exactly how `anthropic-model.ts` marks it.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildCustomHtmlMessages } from "../../../packages/contracts/src/custom-html-prompt.ts";
import type { DesignConcept } from "../../../packages/contracts/src/design-directions.ts";
import {
  buildDesignConceptsMessages,
  buildDesignMessages,
  type DesignPromptContent,
} from "../../../packages/contracts/src/design-prompt.ts";
import { prepareCustomHtml } from "../../../packages/page-render/src/index.ts";
import type { DesignableContent } from "../../../packages/page-render/src/types.ts";
import { runDesignConcepts } from "../../../services/customer-api/src/design-ai/design-concepts.ts";
import { runDesignReview } from "../../../services/customer-api/src/design-ai/design-generate.ts";
import type { DesignVisualReviewer } from "../../../services/customer-api/src/design-ai/design-visual-review.ts";
import { runCustomHtmlReview } from "../../../services/customer-api/src/custom-html/generate.ts";
import type {
  CustomHtmlModel,
  CustomHtmlModelCompleteInput,
  CustomHtmlModelUsage,
} from "../../../services/customer-api/src/custom-html/model.ts";
import { usageCostMicroUsd } from "../../../services/customer-api/src/custom-html/pricing.ts";
import { ensureAssets, repoRoot } from "./assets.mts";
import { type EvalCase, evalCases } from "./cases.mts";
import { buildOrganizationPromptInput } from "./organization.mts";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Characters per token for Spanish prose mixed with JSON, HTML and CSS.
 * Deliberately on the low side (more tokens, higher cost): Claude's
 * tokenizer gives English prose about 4, Spanish and markup closer to 3. */
export const CHARS_PER_TOKEN = 3;
/** FIX Banxico, 2026-09-29 (Docs/engineering/research/
 * 2026-09-29-billing-benchmark-precios.md). Override with KARDO_EVAL_MXN. */
export const MXN_PER_USD = Number(process.env.KARDO_EVAL_MXN ?? "17.84");

const models = {
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5",
} as const;

/** Shortest prompt prefix each model caches (`claude-api` skill, prompt
 * caching reference): a shorter system prompt is billed as plain input on
 * every turn, with no error. */
const minCacheableTokens: Record<string, number> = {
  "claude-sonnet-5": 1024,
  "claude-haiku-4-5": 4096,
};

type RoundMeta = {
  model: (typeof models)[keyof typeof models];
  /** "--visual" (relevo 29, 2026-10-03): after the design validates, the
   * AI sees its page (screenshots) and answers "ok" or a few changes. */
  visual?: boolean;
  /** "ideas" (2026-10-03): the profile, plus three ideas before the
   * design; the bench designs with the first idea. */
  mode: "base" | "perfil" | "ideas";
  createdAt: string;
};

type PathKind = "design" | "html";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

const round = arg("round");
if (!round || !/^[a-z0-9-]+$/.test(round)) {
  console.error(
    "usage: pnpm exec tsx scripts/dev/ai-eval/run.mts --round=<name> [--model=sonnet|haiku] [--mode=base|perfil] [--only=id,id] [--paths=design,html] [--no-shots]",
  );
  process.exit(1);
}

const evalDir = path.join(repoRoot, "scripts/dev/ai-eval");
const roundDir = path.join(evalDir, "out", round);
const dirs = {
  prompts: path.join(roundDir, "prompts"),
  systems: path.join(roundDir, "systems"),
  pending: path.join(roundDir, "pending"),
  answers: path.join(roundDir, "answers"),
  results: path.join(roundDir, "results"),
  drafts: path.join(roundDir, "drafts"),
  shots: path.join(roundDir, "shots"),
  review: path.join(roundDir, "review"),
};
for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

const metaPath = path.join(roundDir, "round.json");
let meta: RoundMeta;
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
} else {
  const modelArg = arg("model") as keyof typeof models | undefined;
  const modeArg = arg("mode") ?? "base";
  if (
    !modelArg ||
    !(modelArg in models) ||
    !["base", "perfil", "ideas"].includes(modeArg)
  ) {
    console.error(
      "a new round needs --model=sonnet|haiku and --mode=base|perfil|ideas",
    );
    process.exit(1);
  }
  meta = {
    model: models[modelArg],
    mode: modeArg as RoundMeta["mode"],
    ...(process.argv.includes("--visual") ? { visual: true } : {}),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

const only = arg("only")?.split(",").filter(Boolean);
const paths = (arg("paths")?.split(",") ?? ["design", "html"]) as PathKind[];
const takeShots = !process.argv.includes("--no-shots");

// ---------------------------------------------------------------------------
// Images: dimensions (for the token estimate) and deterministic ids
// ---------------------------------------------------------------------------

type ImageInfo = {
  width: number;
  height: number;
  mediaType: "image/png" | "image/webp" | "image/jpeg";
};

function imageInfo(file: string): ImageInfo {
  const bytes = fs.readFileSync(file);
  if (bytes.toString("ascii", 1, 4) === "PNG") {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      mediaType: "image/png",
    };
  }
  if (bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
        mediaType: "image/webp",
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
        mediaType: "image/webp",
      };
    }
    const bits = bytes.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      mediaType: "image/webp",
    };
  }
  throw new Error(`unsupported image: ${file}`);
}

/** Vision tokens per the API's documented rule: the image is first scaled
 * down so its long edge is at most 1568 px and it has at most about 1.15
 * megapixels, then costs width x height / 750 tokens. */
export function imageTokens(width: number, height: number): number {
  const scale = Math.min(
    1,
    1568 / Math.max(width, height),
    Math.sqrt(1_150_000 / (width * height)),
  );
  return Math.ceil((width * scale * (height * scale)) / 750);
}

/** A stable, valid UUID for a local file, standing in for its asset id. */
function fileUuid(file: string): string {
  const hex = createHash("sha256")
    .update(path.relative(repoRoot, file))
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Prompt content: the same summaries the API route builds
// (`designPromptContentFor` / `promptContentFor` in routes/custom-html.ts),
// written against page-render's `DesignableContent` instead of the stored
// Experience content.
// ---------------------------------------------------------------------------

function designPromptContent(content: DesignableContent): DesignPromptContent {
  switch (content.type) {
    case "links":
      return {
        title: content.title,
        links: content.links.map((link) => ({ label: link.label })),
      };
    case "profile":
      return {
        displayName: content.displayName,
        ...(content.headline !== undefined
          ? { headline: content.headline }
          : {}),
        links: content.links.map((link) => ({ label: link.label })),
      };
    case "linkpage":
      return {
        displayName: content.displayName,
        links: content.links.map((link) => ({ label: link.label })),
        socials: content.socials.map((social) => ({ network: social.network })),
      };
    case "menu":
      return {
        title: content.title,
        menuSections: content.sections.map((section) => ({
          id: section.id,
          name: section.name,
          itemCount: section.items.length,
          photoCount: section.items.filter((item) => item.imageRef).length,
        })),
        featurableItems: content.sections.flatMap((section) =>
          section.items.map((item) => ({
            id: item.id,
            name: item.name,
            section: section.name,
            hasPhoto: Boolean(item.imageRef),
          })),
        ),
      };
    case "catalog":
      return {
        title: content.title,
        catalogItemCount: content.items.length,
        catalogPhotoCount: content.items.filter((item) => item.imageRef).length,
        featurableItems: content.items.map((item) => ({
          id: item.id,
          name: item.name,
          hasPhoto: Boolean(item.imageRef),
        })),
      };
    case "form":
      return { title: content.title };
    case "document":
      return {
        documentTitle: content.title,
        documentPageCount: content.pages.length,
        documentDisplay: content.display,
      };
    case "image":
      return { imageAlt: content.alt };
  }
}

function htmlPromptContent(content: DesignableContent) {
  switch (content.type) {
    case "links":
      return {
        title: content.title,
        links: content.links.map((link) => ({
          label: link.label,
          url: link.url,
        })),
      };
    case "profile":
      return {
        displayName: content.displayName,
        ...(content.headline !== undefined
          ? { headline: content.headline }
          : {}),
        links: content.links.map((link) => ({
          label: link.label,
          url: link.url,
        })),
      };
    case "linkpage":
      return {
        displayName: content.displayName,
        links: content.links.map((link) => ({
          label: link.label,
          url: link.url,
        })),
        socials: content.socials.map((social) => ({ network: social.network })),
      };
    default:
      throw new Error(`modo HTML does not exist for ${content.type}`);
  }
}

function contentItemIds(content: DesignableContent): string[] {
  const value = content as {
    links?: { id: string }[];
    socials?: { id: string }[];
  };
  return [
    ...(value.links ?? []).map((link) => link.id),
    ...(value.socials ?? []).map((social) => social.id),
  ];
}

// ---------------------------------------------------------------------------
// Frozen prompts
// ---------------------------------------------------------------------------

type PromptImage = { ref: string; label: string; file: string } & ImageInfo;

type FrozenPrompt = {
  key: string;
  caseId: string;
  path: PathKind;
  contract: "design" | "custom-html" | "design-concepts";
  system: string;
  user: string;
  images: PromptImage[];
  contentItemIds: string[];
  menuSectionIds?: string[];
};

function promptImagesFor(
  item: EvalCase,
  assets: Record<string, string>,
): PromptImage[] {
  if (meta.mode === "base") return [];
  const files: { file: string; label: string }[] = [
    { file: assets[`logo-${item.id}`] as string, label: "Logo del negocio" },
  ];
  if (item.business.cover) {
    files.push({
      file: path.join(repoRoot, item.business.cover),
      label: "Portada del negocio",
    });
  }
  return files.map(({ file, label }) => ({
    ref: fileUuid(file),
    label,
    file,
    ...imageInfo(file),
  }));
}

function freezePrompt(
  item: EvalCase,
  kind: PathKind,
  assets: Record<string, string>,
  /** Ideas mode: the ideas request, or the design made from `concept`. */
  step?: { ideas: true } | { concept: DesignConcept },
): FrozenPrompt {
  const key =
    step && "ideas" in step ? `${item.id}.ideas` : `${item.id}.${kind}`;
  const file = path.join(dirs.prompts, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));

  const images = promptImagesFor(item, assets);
  const organization =
    meta.mode !== "base"
      ? buildOrganizationPromptInput(
          item,
          images.map((image) => image.ref),
        )
      : undefined;
  const brandColors = [item.business.brand.primary, item.business.brand.accent];
  const ids = contentItemIds(item.content);

  let built: { system: string; user: string };
  if (kind === "design") {
    const build =
      step && "ideas" in step
        ? buildDesignConceptsMessages
        : buildDesignMessages;
    built = build({
      type: item.type,
      businessName: item.business.name,
      // What the blocks AI panel sends today: only the description (no
      // colors, no images). With the profile, the organization block fills
      // in the rest.
      brief: {
        description: item.request,
        colors: [],
        imageRefs: [],
        fonts: [],
      },
      images: images.map((image) => ({ ref: image.ref, label: image.label })),
      content: designPromptContent(item.content),
      contentItemIds: ids,
      ...(organization ? { organization } : {}),
      ...(step && "concept" in step ? { concept: step.concept } : {}),
      ...(item.photoMode ? { photos: item.photoMode } : {}),
    } as Parameters<typeof buildDesignMessages>[0]);
  } else {
    built = buildCustomHtmlMessages({
      type: item.type as "links" | "profile" | "linkpage",
      businessName: item.business.name,
      // Modo HTML's BrandForm pre-fills the brand colors today.
      brief: {
        description: item.request,
        colors: brandColors,
        imageRefs: [],
        fonts: [],
      },
      images: images.map((image) => ({ ref: image.ref, label: image.label })),
      content: htmlPromptContent(item.content),
      ...(organization ? { organization } : {}),
    } as Parameters<typeof buildCustomHtmlMessages>[0]);
  }

  const frozen: FrozenPrompt = {
    key,
    caseId: item.id,
    path: kind,
    contract:
      step && "ideas" in step
        ? "design-concepts"
        : kind === "design"
          ? "design"
          : "custom-html",
    system: built.system,
    user: built.user,
    images,
    contentItemIds: ids,
    ...(item.content.type === "menu"
      ? { menuSectionIds: item.content.sections.map((section) => section.id) }
      : {}),
  };
  fs.writeFileSync(file, `${JSON.stringify(frozen, null, 2)}\n`);
  return frozen;
}

// ---------------------------------------------------------------------------
// The file-backed model
// ---------------------------------------------------------------------------

class PendingTurn extends Error {
  constructor(readonly turn: number) {
    super(`waiting for turn ${turn}`);
  }
}

type TurnRecord = {
  turn: number;
  usage: CustomHtmlModelUsage;
  costMicroUsd: number;
  /** What the loop told the model before this turn (turns 2 and 3). */
  feedback?: string;
  outputChars: number;
};

const textTokens = (text: string) => Math.ceil(text.length / CHARS_PER_TOKEN);

function systemFileFor(system: string): string {
  const hash = createHash("sha256").update(system).digest("hex").slice(0, 12);
  const file = path.join(dirs.systems, `system-${hash}.txt`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, system);
  return file;
}

function benchModel(
  prompt: FrozenPrompt,
  record: TurnRecord[],
  /** The system prompt is already cached (the ideas request wrote it):
   * turn 1 reads it instead of writing it. */
  warm = false,
): CustomHtmlModel {
  return {
    provider: "anthropic",
    model: meta.model,
    async complete(input: CustomHtmlModelCompleteInput) {
      const answerFile = path.join(
        dirs.answers,
        `${prompt.key}.turn${input.turn}.txt`,
      );
      if (!fs.existsSync(answerFile)) {
        writePending(prompt, input, answerFile);
        throw new PendingTurn(input.turn);
      }
      const text = fs.readFileSync(answerFile, "utf8").trim();
      fs.rmSync(
        path.join(dirs.pending, `${prompt.key}.turn${input.turn}.json`),
        { force: true },
      );

      let messageTokens = 0;
      for (const message of input.messages) {
        let imageIndex = 0;
        for (const block of message.content) {
          if (block.type === "text") messageTokens += textTokens(block.text);
          else if (block.sourcePath) {
            const info = imageInfo(block.sourcePath);
            messageTokens += imageTokens(info.width, info.height);
          } else {
            const image = prompt.images[imageIndex++];
            messageTokens += image
              ? imageTokens(image.width, image.height)
              : 1_600;
          }
        }
      }
      const systemTokens = textTokens(input.system);
      const cached = systemTokens >= (minCacheableTokens[meta.model] ?? 1024);
      const usage: CustomHtmlModelUsage = {
        inputTokens: messageTokens + (cached ? 0 : systemTokens),
        outputTokens: textTokens(text),
        cacheWriteTokens:
          cached && input.turn === 1 && !warm ? systemTokens : 0,
        cacheReadTokens: cached && (input.turn > 1 || warm) ? systemTokens : 0,
      };
      const last = input.messages.at(-1);
      const lastText = last?.content.find((block) => block.type === "text");
      record.push({
        turn: input.turn,
        usage,
        costMicroUsd: usageCostMicroUsd(meta.model, usage),
        ...(input.turn > 1 && lastText?.type === "text"
          ? { feedback: lastText.text }
          : {}),
        outputChars: text.length,
      });
      return { text, usage, stopReason: "end_turn" };
    },
  };
}

function writePending(
  prompt: FrozenPrompt,
  input: CustomHtmlModelCompleteInput,
  answerFile: string,
) {
  const file = path.join(dirs.pending, `${prompt.key}.turn${input.turn}.json`);
  const messages = input.messages.map((message) => {
    let imageIndex = 0;
    return {
      role: message.role,
      content: message.content.map((block) => {
        if (block.type === "text") return { type: "text", text: block.text };
        if (block.sourcePath)
          return { type: "image_file", path: block.sourcePath };
        const image = prompt.images[imageIndex++];
        return { type: "image_file", path: image?.file ?? "(missing)" };
      }),
    };
  });
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        key: prompt.key,
        turn: input.turn,
        maxTurns: input.maxTurns,
        responseContract: input.responseContract ?? "custom-html",
        systemFile: systemFileFor(input.system),
        answerFile,
        messages,
      },
      null,
      2,
    )}\n`,
  );
}

// ---------------------------------------------------------------------------
// One case, one path
// ---------------------------------------------------------------------------

type CaseResult = {
  key: string;
  caseId: string;
  path: PathKind;
  type: string;
  industry: string;
  model: string;
  mode: string;
  status: "ok" | "failed" | "pending";
  pendingTurn?: number;
  error?: string;
  turns: number;
  perTurn: TurnRecord[];
  totals: CustomHtmlModelUsage & { costMicroUsd: number };
  costUsd: number;
  costMxn: number;
  /** Same generation if another one of the same type had just warmed the
   * system prompt's cache (turn 1 reads it instead of writing it). */
  warmCostUsd: number;
  /** Modo HTML only: what the sanitizer still removes from the final draft. */
  residualRemovals?: Record<string, unknown>;
  notes?: string;
  /** Ideas mode: the idea the design followed (the first one). */
  concept?: DesignConcept;
  /** What the layout review fixed (relevo 29). */
  layoutFixes?: { path: string; what: string }[];
  /** "--visual" rounds: the AI's look at its own page. */
  visualReview?: { ok: boolean; applied: number; notes: string };
  request: string;
  business: EvalCase["business"];
};

function totalsOf(record: TurnRecord[]) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    costMicroUsd: 0,
  };
  for (const turn of record) {
    totals.inputTokens += turn.usage.inputTokens;
    totals.outputTokens += turn.usage.outputTokens;
    totals.cacheWriteTokens += turn.usage.cacheWriteTokens;
    totals.cacheReadTokens += turn.usage.cacheReadTokens;
    totals.costMicroUsd += turn.costMicroUsd;
  }
  return totals;
}

function warmCost(record: TurnRecord[]): number {
  return record.reduce((sum, turn) => {
    const usage =
      turn.turn === 1
        ? {
            ...turn.usage,
            cacheWriteTokens: 0,
            cacheReadTokens: turn.usage.cacheWriteTokens,
          }
        : turn.usage;
    return sum + usageCostMicroUsd(meta.model, usage);
  }, 0);
}

function contentImages(
  item: EvalCase,
  assets: Record<string, string>,
): Record<string, string> {
  const images: Record<string, string> = {};
  for (const [ref, file] of Object.entries(item.photos ?? {}))
    images[ref] = path.join(repoRoot, file);
  for (const [key, file] of Object.entries(assets)) images[key] = file;
  return images;
}

/** The real dishes or products a featuredItems block may name. */
function featurableIds(content: DesignableContent): string[] {
  if (content.type === "menu")
    return content.sections.flatMap((section) =>
      section.items.map((entry) => entry.id),
    );
  if (content.type === "catalog") return content.items.map((entry) => entry.id);
  return [];
}

/** What the bound title blocks draw (the API's `boundTextsFor`). */
function boundTexts(content: DesignableContent) {
  const c = content as {
    title?: string;
    description?: string;
    displayName?: string;
  };
  if (content.type === "profile" || content.type === "linkpage")
    return {
      ...(c.displayName ? { displayName: c.displayName } : {}),
      hasAvatar: Boolean((content as { avatarRef?: string }).avatarRef),
    };
  if (content.type === "image") return {};
  return {
    ...(c.title ? { title: c.title } : {}),
    ...(c.description ? { titleDescription: c.description } : {}),
  };
}

/** "--visual": draws the validated draft the way the bench's shots do and
 * hands the AI two images, the first screen and the whole page. Cached by
 * key: a replay draws the same design. */
function screenshotReviewer(
  key: string,
  item: EvalCase,
  images: Record<string, string>,
): DesignVisualReviewer {
  return {
    async render(design) {
      const prefix = path.join(dirs.review, key);
      const first = `${prefix}-first.png`;
      const full = `${prefix}-phone.png`;
      if (!fs.existsSync(first)) {
        const draft = `${prefix}.json`;
        fs.writeFileSync(
          draft,
          `${JSON.stringify({ type: item.type, design, content: item.content, images }, null, 2)}\n`,
        );
        const run = spawnSync(
          "pnpm",
          ["exec", "tsx", "scripts/dev/ai-bridge/preview.mjs", draft, prefix],
          { cwd: repoRoot, encoding: "utf8" },
        );
        if (run.status !== 0) return [];
        spawnSync(
          "ffmpeg",
          [
            "-loglevel",
            "error",
            "-y",
            "-i",
            full,
            "-vf",
            "crop=390:min(844\\,ih):0:0",
            first,
          ],
          { encoding: "utf8" },
        );
      }
      if (!fs.existsSync(first) || !fs.existsSync(full)) return [];
      return [first, full].map((file) => ({
        mediaType: "image/png" as const,
        base64: fs.readFileSync(file).toString("base64"),
        sourcePath: file,
      }));
    },
  };
}

function drawPreview(key: string, draft: Record<string, unknown>) {
  const draftFile = path.join(dirs.drafts, `${key}.json`);
  fs.writeFileSync(draftFile, `${JSON.stringify(draft, null, 2)}\n`);
  if (!takeShots) return;
  const run = spawnSync(
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/dev/ai-bridge/preview.mjs",
      draftFile,
      path.join(dirs.shots, key),
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (run.status !== 0)
    console.error(`  preview failed for ${key}: ${run.stderr.trim()}`);
}

async function runOne(
  item: EvalCase,
  kind: PathKind,
  assets: Record<string, string>,
): Promise<CaseResult> {
  const imagesOf = (frozen: FrozenPrompt) =>
    frozen.images.map((image) => ({
      mediaType: image.mediaType,
      base64: fs.readFileSync(image.file).toString("base64"),
    }));

  // Ideas mode: three ideas first (same system prompt, so the design that
  // follows reads its cache), then the design with the first idea.
  let ideasRecord: TurnRecord[] = [];
  let concept: DesignConcept | undefined;
  let ideasPending: number | undefined;
  let ideasError: string | undefined;
  if (kind === "design" && meta.mode === "ideas") {
    const ideasFile = path.join(dirs.results, `${item.id}.ideas.json`);
    if (fs.existsSync(ideasFile)) {
      const saved = JSON.parse(fs.readFileSync(ideasFile, "utf8"));
      ideasRecord = saved.perTurn;
      concept = saved.concepts[0];
    } else {
      const ideasPrompt = freezePrompt(item, kind, assets, { ideas: true });
      const rec: TurnRecord[] = [];
      try {
        const result = await runDesignConcepts({
          model: benchModel(ideasPrompt, rec),
          system: ideasPrompt.system,
          userMessage: ideasPrompt.user,
          images: imagesOf(ideasPrompt),
        });
        fs.writeFileSync(
          ideasFile,
          `${JSON.stringify({ concepts: result.concepts, perTurn: rec }, null, 2)}\n`,
        );
        ideasRecord = rec;
        concept = result.concepts[0];
      } catch (error) {
        ideasRecord = rec;
        if (error instanceof PendingTurn) ideasPending = error.turn;
        else
          ideasError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  // The design prompt carries the chosen idea: never freeze it while the
  // ideas are still pending (until 2026-10-03 it was frozen on the first
  // run, without the idea, so `ideas-sonnet` and `antes-ideas` designed
  // without it).
  if (ideasPending !== undefined || ideasError !== undefined) {
    const all = ideasRecord;
    const totals = totalsOf(all);
    return {
      key: `${item.id}.${kind}`,
      caseId: item.id,
      path: kind,
      type: item.type,
      industry: item.business.industry,
      model: meta.model,
      mode: meta.mode,
      request: item.request,
      business: item.business,
      turns: all.length,
      perTurn: all,
      totals,
      costUsd: totals.costMicroUsd / 1_000_000,
      costMxn: (totals.costMicroUsd / 1_000_000) * MXN_PER_USD,
      warmCostUsd: warmCost(all) / 1_000_000,
      ...(ideasPending !== undefined
        ? { status: "pending" as const, pendingTurn: ideasPending }
        : { status: "failed" as const, error: `ideas: ${ideasError}` }),
    };
  }

  const prompt = freezePrompt(
    item,
    kind,
    assets,
    concept ? { concept } : undefined,
  );
  const record: TurnRecord[] = [];
  const model = benchModel(prompt, record, concept !== undefined);
  const images = imagesOf(prompt);
  const base = {
    key: prompt.key,
    caseId: item.id,
    path: kind,
    type: item.type,
    industry: item.business.industry,
    model: meta.model,
    mode: meta.mode,
    request: item.request,
    business: item.business,
  };
  const finish = (
    rest: Partial<CaseResult> & Pick<CaseResult, "status">,
  ): CaseResult => {
    const all = [...ideasRecord, ...record];
    const totals = totalsOf(all);
    return {
      ...base,
      turns: all.length,
      perTurn: all,
      totals,
      costUsd: totals.costMicroUsd / 1_000_000,
      costMxn: (totals.costMicroUsd / 1_000_000) * MXN_PER_USD,
      warmCostUsd: warmCost(all) / 1_000_000,
      ...(concept ? { concept } : {}),
      ...rest,
    };
  };

  const previewImages = {
    ...contentImages(item, assets),
    ...Object.fromEntries(
      prompt.images.map((image) => [image.ref, image.file]),
    ),
  };

  try {
    if (kind === "design") {
      const featurable = featurableIds(item.content);
      const review = await runDesignReview({
        model,
        type: item.type,
        system: prompt.system,
        userMessage: prompt.user,
        images,
        contentItemIds: prompt.contentItemIds,
        checkContext: {
          ...(prompt.menuSectionIds
            ? { menuSectionIds: prompt.menuSectionIds }
            : {}),
          ...(featurable.length ? { featurableItemIds: featurable } : {}),
        },
        allowedImageRefs: new Set(prompt.images.map((image) => image.ref)),
        allowHtmlBlocks: true,
        // Same layout context as the API route (relevo 29).
        layout: {
          ...boundTexts(item.content),
          ...(item.photoMode ? { photos: item.photoMode } : {}),
          ...(prompt.images[0]?.label === "Logo del negocio"
            ? { logoRef: prompt.images[0].ref }
            : {}),
        },
        ...(meta.visual
          ? {
              visualReviewer: screenshotReviewer(
                prompt.key,
                item,
                previewImages,
              ),
            }
          : {}),
      });
      drawPreview(prompt.key, {
        type: item.type,
        design: review.design,
        content: item.content,
        images: previewImages,
      });
      return finish({
        status: "ok",
        notes: review.notes,
        layoutFixes: review.layoutFixes,
        ...(review.visualReview ? { visualReview: review.visualReview } : {}),
      });
    }
    const review = await runCustomHtmlReview({
      model,
      system: prompt.system,
      userMessage: prompt.user,
      images,
    });
    const residual = prepareCustomHtml({
      html: review.html,
      css: review.css,
    }).report;
    drawPreview(prompt.key, {
      type: item.type,
      html: review.html,
      css: review.css,
      content: item.content,
      images: previewImages,
    });
    return finish({
      status: "ok",
      notes: review.notes,
      residualRemovals: residual as unknown as Record<string, unknown>,
    });
  } catch (error) {
    if (error instanceof PendingTurn)
      return finish({ status: "pending", pendingTurn: error.turn });
    return finish({
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const assets = await ensureAssets();
const selected = evalCases.filter((item) => !only || only.includes(item.id));
const summary: {
  key: string;
  status: string;
  turns: number;
  costUsd: number;
  pendingTurn?: number;
}[] = [];

for (const item of selected) {
  for (const kind of paths) {
    if (kind === "html" && !item.html) continue;
    const resultFile = path.join(dirs.results, `${item.id}.${kind}.json`);
    if (fs.existsSync(resultFile)) {
      const done = JSON.parse(
        fs.readFileSync(resultFile, "utf8"),
      ) as CaseResult;
      if (done.status !== "pending") {
        summary.push({
          key: done.key,
          status: done.status,
          turns: done.turns,
          costUsd: done.costUsd,
        });
        continue;
      }
    }
    const result = await runOne(item, kind, assets);
    fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
    summary.push({
      key: result.key,
      status: result.status,
      turns: result.turns,
      costUsd: result.costUsd,
      ...(result.pendingTurn ? { pendingTurn: result.pendingTurn } : {}),
    });
  }
}

const pending = summary.filter((row) => row.status === "pending");
console.log(`round ${round} (${meta.model}, ${meta.mode})`);
for (const row of summary) {
  console.log(
    `  ${row.key.padEnd(28)} ${row.status.padEnd(8)} turns=${row.turns}${row.pendingTurn ? ` waiting turn ${row.pendingTurn}` : ""} US$${row.costUsd.toFixed(4)}`,
  );
}
console.log(
  `${pending.length} pending, ${summary.length - pending.length} finished`,
);
